"use client";

/**
 * 페이지별 필터/검색/페이지/정렬 상태 영속화 훅.
 * useUrlParams 위에 localStorage 백업을 얹어, 다음 동작을 보장한다.
 *
 * 1. 페이지 내 라우팅 (상세 → 뒤로가기): URL search params로 복원
 * 2. 새로고침 / 탭 닫고 다시 열기: URL search params로 복원
 * 3. 로그아웃 후 다시 로그인 / 새 세션: localStorage에서 복원
 * 4. 다른 디바이스 동기화: 서버 console_filters (PUT/GET /auth/me/console-filters)
 *
 * 저장 구조: 모든 페이지 필터가 단일 `HTM:FILTERS:{userId}` 키 안 nested JSON 으로 통합.
 *   { "schedules.calendar": {stores: "..."}, "attendances": {store: "..."}, ... }
 * page key 와 sub-key 는 URL params 와 1:1 대응 (모두 소문자).
 */

import { useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useUrlParams } from "./useUrlParams";
import { useAuthStore } from "@/stores/authStore";
import {
  ensureMigrated,
  readPageFilters,
  scheduleSync,
  writePageFilters,
} from "@/lib/consoleFiltersSync";

/**
 * 일회성 공유 링크 마커. URL 에 `?_ext=1` 가 붙어있으면 그 진입은 외부 공유로 간주되어
 * localStorage/서버 에 저장되지 않는다 (본인의 저장된 필터를 덮어쓰지 않음).
 *
 * - 사용자가 본인 즐겨찾기 / 직접 입력한 URL → 마커 없음 → 정상 영속화
 * - 누군가 공유한 일회성 링크 → 마커 있음 → 일회성, 페이지 떠나면 잊혀짐
 * - 사용자가 페이지 안에서 필터를 직접 변경 → 그 시점부터 정상 저장 재개
 */
const EXT_MARKER = "_ext";

function readPageWithCleanup<K extends string>(
  pageKey: string,
  defaults: Record<K, string>,
): { values: Partial<Record<K, string>>; hadStaleKeys: boolean } | null {
  const stored = readPageFilters(pageKey);
  if (!stored) return null;
  const result: Partial<Record<K, string>> = {};
  const known = new Set(Object.keys(defaults));
  let hadStaleKeys = false;
  for (const [pk, pv] of Object.entries(stored)) {
    if (!known.has(pk)) {
      hadStaleKeys = true;
      continue;
    }
    if (typeof pv === "string") result[pk as K] = pv;
  }
  return { values: result, hadStaleKeys };
}

function writePageFromParams<K extends string>(
  pageKey: string,
  defaults: Record<K, string>,
  values: Record<K, string>,
  transient: Set<string>,
): void {
  const toSave: Record<string, string> = {};
  for (const k of Object.keys(defaults) as K[]) {
    if (transient.has(k)) continue;
    const v = values[k];
    if (v && v !== defaults[k]) {
      toSave[k] = v;
    }
  }
  writePageFilters(pageKey, toSave);
}

/**
 * Clear stored filters for one storageKey (page).
 * (userId 인자는 옛 API 호환용 — 무시됨. user 격리는 logout 시 storage 전체 삭제로 보장.)
 */
export function clearPersistedFilters(_userId: string | null, storageKey: string): void {
  writePageFilters(storageKey, {});
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
  const lastHydratedSlotRef = useRef<string | null>(null);
  const slotKey = `${userId ?? "anon"}::${storageKey}`;

  // storageKey 가 동적으로 바뀌는 경우 (예: ApplicantsPanel 처럼 storeId 별 분리) 또는
  // user 가 바뀌면 새 slot 으로 다시 hydrate.
  if (lastHydratedSlotRef.current !== slotKey) {
    hydratedRef.current = false;
    externalEntryRef.current = false;
    lastHydratedSlotRef.current = slotKey;
  }

  // One-shot hydration: on first mount (after auth resolves), if NONE of the
  // tracked keys are present in the URL, restore them from localStorage.
  useEffect(() => {
    if (hydratedRef.current) return;
    // Wait until the auth bucket is known so we read from the right slot.
    if (userId === null && useAuthStore.getState().isLoading) return;
    hydratedRef.current = true;

    // 기존 분리 키 (`htm:filters:{userId}:*`) 가 남아 있으면 통합 키로 옮기고 청소.
    // 이미 마이그레이션된 사용자에겐 no-op.
    ensureMigrated(userId);

    // 명시 마커 (`?_ext=1`) 가 붙은 진입은 외부 공유 → 영속화 skip.
    const extParam = searchParams.get(EXT_MARKER);
    if (extParam === "1" || extParam === "true") {
      externalEntryRef.current = true;
      return;
    }

    // Per-key hydration:
    //   - URL 에 있는 키는 source of truth (그대로 둠).
    //   - URL 에 없는 키만 localStorage 에서 복원.
    //   detail → list 같이 일부 키만 전달되는 navigation 에서도 누락된 store/filter 가 복원됨.

    const stored = readPageWithCleanup(storageKey, defaultsRef.current);
    if (!stored) return;

    // Stale 키가 storage 에 남아 있으면 (defaults 에 없는 키), cleaned dict 로 다시 써서
    // 서버 PUT 시에도 정리된 dict 가 올라가도록 한다.
    if (stored.hadStaleKeys) {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(stored.values)) {
        if (typeof v === "string") cleaned[k] = v;
      }
      writePageFilters(storageKey, cleaned);
      scheduleSync(userId);
    }

    const next = new URLSearchParams(searchParams.toString());
    let dirty = false;
    for (const k of Object.keys(defaultsRef.current) as K[]) {
      if (transientRef.current.has(k)) continue;
      if (searchParams.get(k) !== null) continue; // URL 에 있으면 그대로 두고 덮어쓰지 않음
      const v = stored.values[k];
      if (v && v !== defaultsRef.current[k]) {
        next.set(k, v);
        dirty = true;
      }
    }
    if (!dirty) return;
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotKey]);

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
    writePageFromParams(storageKey, defaultsRef.current, params, transientRef.current);
    scheduleSync(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotKey, ...Object.keys(defaultsRef.current).map((k) => params[k as K])]);

  return [params, setParams];
}
