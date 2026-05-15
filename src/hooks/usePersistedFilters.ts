"use client";

/**
 * 페이지별 필터/검색/페이지/정렬 상태 영속화 훅.
 * useUrlParams 위에 localStorage 백업을 얹어, 다음 동작을 보장한다.
 *
 * 1. 페이지 내 라우팅 (상세 → 뒤로가기): URL search params로 복원
 * 2. 새로고침 / 탭 닫고 다시 열기: URL search params로 복원
 * 3. 로그아웃 후 다시 로그인 / 새 세션: localStorage에서 복원
 * 4. 다른 디바이스 동기화: 추후 백엔드 user_preferences API로 확장 (현재 미구현)
 *
 * Persists per-page filter/sort/pagination state across navigation, refresh,
 * and re-login. URL search params are the source of truth during a session,
 * with a localStorage backup that re-hydrates the URL on next visit when no
 * params are present.
 */

import { useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useUrlParams } from "./useUrlParams";
import { useAuthStore } from "@/stores/authStore";
import { scheduleSync } from "@/lib/consoleFiltersSync";

const STORAGE_PREFIX = "htm:filters:";

/**
 * 일회성 공유 링크 마커. URL 에 `?_ext=1` 가 붙어있으면 그 진입은 외부 공유로 간주되어
 * localStorage/서버 에 저장되지 않는다 (본인의 저장된 필터를 덮어쓰지 않음).
 *
 * - 사용자가 본인 즐겨찾기 / 직접 입력한 URL → 마커 없음 → 정상 영속화
 * - 누군가 공유한 일회성 링크 → 마커 있음 → 일회성, 페이지 떠나면 잊혀짐
 * - 사용자가 페이지 안에서 필터를 직접 변경 → 그 시점부터 정상 저장 재개
 */
const EXT_MARKER = "_ext";

function makeStorageKey(userId: string | null, key: string): string {
  // user별 격리 — 같은 머신을 다른 admin이 써도 필터가 누출되지 않도록
  return `${STORAGE_PREFIX}${userId ?? "anon"}:${key}`;
}

function readStorage<K extends string>(
  fullKey: string,
  defaults: Record<K, string>,
): Partial<Record<K, string>> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(fullKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const result: Partial<Record<K, string>> = {};
    for (const k of Object.keys(defaults) as K[]) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v === "string") result[k] = v;
    }
    return result;
  } catch {
    return null;
  }
}

function writeStorage<K extends string>(
  fullKey: string,
  defaults: Record<K, string>,
  values: Record<K, string>,
  transient: Set<string>,
): void {
  if (typeof window === "undefined") return;
  try {
    const toSave: Partial<Record<K, string>> = {};
    let hasAny = false;
    for (const k of Object.keys(defaults) as K[]) {
      if (transient.has(k)) continue;
      const v = values[k];
      if (v && v !== defaults[k]) {
        toSave[k] = v;
        hasAny = true;
      }
    }
    if (hasAny) {
      window.localStorage.setItem(fullKey, JSON.stringify(toSave));
    } else {
      window.localStorage.removeItem(fullKey);
    }
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.) — fall back silently
  }
}

/**
 * Clear stored filters for one (userId, storageKey) pair.
 * Pass null userId to clear the anon bucket.
 */
export function clearPersistedFilters(userId: string | null, storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(makeStorageKey(userId, storageKey));
  } catch {
    /* ignore */
  }
}

interface PersistedFiltersOptions {
  /**
   * 키 중 일부를 localStorage에 저장하지 않도록 제외.
   * 예: date 같이 매 세션 새 값을 써야 하는 키는 URL sync만 유지하고 영속화 X.
   * (defaults 의 키 추론과 분리하기 위해 readonly string[] 로 둔다.)
   */
  transient?: readonly string[];
}

/**
 * URL-first filter state with localStorage backup.
 *
 * @param storageKey - unique key per page (e.g. "users", "schedules.history")
 * @param defaults   - default value for each param (URL & storage stripped to these)
 * @param options    - optional: { transient: ["date"] } to skip persisting some keys
 *
 * @example
 * const [filters, setFilters] = usePersistedFilters("users", {
 *   q: "", role: "", page: "1",
 * });
 */
export function usePersistedFilters<K extends string>(
  storageKey: string,
  defaults: Record<K, string>,
  options?: PersistedFiltersOptions,
): [Record<K, string>, (updates: Partial<Record<K, string | null>>) => void] {
  const [params, rawSetParams] = useUrlParams(defaults);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const hydratedRef = useRef(false);
  const defaultsRef = useRef(defaults);
  const transientRef = useRef<Set<string>>(new Set(options?.transient ?? []));
  // 외부 링크 진입 감지 — 마운트 시점 URL 에 `?_ext=1` 마커가 있으면
  // "공유된 일회성 필터" 로 간주해, 사용자가 이 페이지에서 직접 변경하기 전까지
  // localStorage/서버 에 저장하지 않는다. 본인의 저장된 필터를 덮어쓰지 않음.
  // 사용자가 직접 즐겨찾기한 URL 은 마커 없으니 정상 영속화.
  const externalEntryRef = useRef(false);
  const fullKey = makeStorageKey(userId, storageKey);
  const lastHydratedKeyRef = useRef<string | null>(null);

  // storageKey 가 동적으로 바뀌는 경우 (예: ApplicantsPanel 처럼 storeId 별 분리) 새 키로 다시 hydrate 해야 한다.
  if (lastHydratedKeyRef.current !== fullKey) {
    hydratedRef.current = false;
    externalEntryRef.current = false;
    lastHydratedKeyRef.current = fullKey;
  }

  // One-shot hydration: on first mount (after auth resolves), if NONE of the
  // tracked keys are present in the URL, restore them from localStorage.
  useEffect(() => {
    if (hydratedRef.current) return;
    // Wait until the auth bucket is known so we read from the right slot.
    if (userId === null && useAuthStore.getState().isLoading) return;
    hydratedRef.current = true;

    // 명시 마커 (`?_ext=1`) 가 붙은 진입은 외부 공유 → 영속화 skip.
    // 마커 없이 query 만 있으면 사용자가 직접 입력/즐겨찾기 한 거로 보고 정상 저장.
    const extParam = searchParams.get(EXT_MARKER);
    if (extParam === "1" || extParam === "true") {
      externalEntryRef.current = true;
      return;
    }

    const hasAnyInUrl = (Object.keys(defaultsRef.current) as K[]).some(
      (k) => searchParams.get(k) !== null,
    );
    if (hasAnyInUrl) return; // URL 값이 source of truth — 그대로 두고 localStorage 덮어쓰지 않음

    const stored = readStorage(fullKey, defaultsRef.current);
    if (!stored) return;

    const next = new URLSearchParams(searchParams.toString());
    let dirty = false;
    for (const k of Object.keys(defaultsRef.current) as K[]) {
      if (transientRef.current.has(k)) continue;
      const v = stored[k];
      if (v && v !== defaultsRef.current[k]) {
        next.set(k, v);
        dirty = true;
      }
    }
    if (!dirty) return;
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  // 같은 tick 안에서 setParams 가 여러 번 호출되면 (예: setView + setSelectedDay 연쇄)
  // microtask 로 모아서 한 번에 URL 업데이트. 두 번째 호출이 첫 번째를 덮어쓰는 race 방지.
  //
  // 추가로 사용자 변경이 일어나면:
  // 1) externalEntryRef 해제 → 영속화 재개
  // 2) URL 의 `_ext` 마커도 함께 제거 → 다음 navigation 에서 더 이상 외부 진입으로 감지 X
  //    (이래야 사용자가 변경한 필터가 본인 의도된 상태로 깔끔하게 유지됨)
  const pendingRef = useRef<Partial<Record<K, string | null>> | null>(null);
  const setParams = useCallback(
    (updates: Partial<Record<K, string | null>>) => {
      externalEntryRef.current = false;
      if (pendingRef.current) {
        Object.assign(pendingRef.current, updates);
        return;
      }
      pendingRef.current = { ...updates };
      queueMicrotask(() => {
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (!pending) return;
        // URL 에 `_ext` 마커가 있으면 사용자 변경과 함께 제거 — defaults 외 키를 다뤄야
        // 하므로 useUrlParams 의 setParams 가 아니라 직접 router.replace 로 처리.
        if (
          typeof window !== "undefined"
          && new URLSearchParams(window.location.search).has(EXT_MARKER)
        ) {
          const sp = new URLSearchParams(window.location.search);
          for (const [k, v] of Object.entries(pending)) {
            if (
              v === null
              || v === undefined
              || v === ""
              || v === (defaultsRef.current as Record<string, string>)[k]
            ) {
              sp.delete(k);
            } else {
              sp.set(k, v as string);
            }
          }
          sp.delete(EXT_MARKER);
          const qs = sp.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        } else {
          rawSetParams(pending);
        }
      });
    },
    [rawSetParams, router, pathname],
  );

  // Mirror URL → localStorage whenever URL values change (post-hydration),
  // and schedule a debounced PUT to the server (1 account, 1 dataset).
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (externalEntryRef.current) return; // 외부 진입 후 사용자 변경 전 — skip
    writeStorage(fullKey, defaultsRef.current, params, transientRef.current);
    scheduleSync(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey, ...Object.keys(defaultsRef.current).map((k) => params[k as K])]);

  return [params, setParams];
}
