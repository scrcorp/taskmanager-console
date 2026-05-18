/**
 * 콘솔 페이지별 필터 영속 동기화 — 서버 ↔ localStorage 양방향.
 *
 * 구조:
 *  - localStorage 통합 키 `HTM:FILTERS` 하나에 모든 페이지 필터를 nested JSON 으로 보관
 *    예: { "schedules.calendar": {stores: "..."}, "attendances": {store: "..."}, ... }
 *  - page key 와 sub-key 는 모두 소문자 (URL params 와 1:1 매핑).
 *  - user 격리: logout 시 키 삭제 + login 시 hydrateFromServer 가 서버 dict 로 완전히 덮어쓰기.
 *    (key 에 userId 박지 않아도 두 메커니즘으로 격리 보장)
 *
 * 흐름:
 *  1. 로그인 직후 (또는 fetchMe) — 서버 console_filters 를 받아서 localStorage 에 hydrate.
 *  2. 사용자가 어떤 페이지에서 필터를 바꾸면 usePersistedFilters 가 localStorage 를 갱신하고
 *     scheduleSync() 를 호출 → 디바운스 후 통합 JSON 그대로 PUT.
 *  3. 로그아웃 — cancelPendingSync + clearStoredFilters 로 머신에 흔적 안 남김.
 *
 * Server-side: see `PUT /auth/me/console-filters` in app/api/auth.py.
 */

import api from "./api";

const STORAGE_KEY = "HTM:FILTERS";
// 이전 두 단계의 키 패턴 — 발견 시 자동 마이그레이션 후 제거.
// 1) `htm:filters:{userId}:{pageKey}` — 페이지마다 분리되어 있던 옛 구조
// 2) `HTM:FILTERS:{userId}` — userId prefix 가 붙어있던 직전 구조
// TODO(2026-08-15): 모든 user 가 새 구조로 migrate 된 후 (3개월 정도 운영 후) 마이그레이션
// 로직 제거. 새 코드에서는 영구적으로 STORAGE_KEY 만 사용.
const LEGACY_SPLIT_PREFIX = "htm:filters:";
const LEGACY_USER_PREFIX = "HTM:FILTERS:";
const DEBOUNCE_MS = 800;

type FilterDict = Record<string, Record<string, string>>;

function readAll(): FilterDict {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: FilterDict = {};
    for (const [pk, pv] of Object.entries(parsed as Record<string, unknown>)) {
      if (pv && typeof pv === "object" && !Array.isArray(pv)) {
        const inner: Record<string, string> = {};
        for (const [ik, iv] of Object.entries(pv as Record<string, unknown>)) {
          if (typeof iv === "string") inner[ik] = iv;
        }
        if (Object.keys(inner).length > 0) out[pk] = inner;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(dict: FilterDict): void {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(dict).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dict));
    }
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.) — fall back silently
  }
}

/**
 * usePersistedFilters 에서 자기 page 영속 dict 읽기.
 * 없으면 undefined.
 */
export function readPageFilters(pageKey: string): Record<string, string> | undefined {
  return readAll()[pageKey];
}

/**
 * usePersistedFilters 에서 자기 page 영속 dict 쓰기.
 * values 가 비어 있으면 해당 pageKey entry 제거. 전체가 비면 outer key 도 제거.
 */
export function writePageFilters(
  pageKey: string,
  values: Record<string, string>,
): void {
  const all = readAll();
  if (Object.keys(values).length > 0) {
    all[pageKey] = values;
  } else {
    delete all[pageKey];
  }
  writeAll(all);
}

/**
 * 두 종류의 옛 키를 새 통합 키로 옮기고 옛 항목 삭제. 한 번만 동작.
 *
 * TODO(2026-08-15): 운영 안정화 후 제거.
 */
function migrateLegacyKeys(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const toMigrate: Array<{ k: string; pageKey: string; values: Record<string, string> }> = [];
    const toDelete: string[] = [];

    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;

      // 1) htm:filters:{userId}:{pageKey} — 페이지별 분리 키
      if (k.startsWith(LEGACY_SPLIT_PREFIX)) {
        const rest = k.slice(LEGACY_SPLIT_PREFIX.length);
        const sepIdx = rest.indexOf(":");
        if (sepIdx > 0) {
          const pageKey = rest.slice(sepIdx + 1);
          const raw = window.localStorage.getItem(k);
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as unknown;
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                const inner: Record<string, string> = {};
                for (const [ik, iv] of Object.entries(parsed as Record<string, unknown>)) {
                  if (typeof iv === "string") inner[ik] = iv;
                }
                if (Object.keys(inner).length > 0) {
                  toMigrate.push({ k, pageKey, values: inner });
                }
              }
            } catch {
              // 깨진 entry — 그냥 삭제
            }
          }
          toDelete.push(k);
          continue;
        }
      }

      // 2) HTM:FILTERS:{userId} — userId prefix 가 붙어있던 직전 구조
      if (k.startsWith(LEGACY_USER_PREFIX) && k !== STORAGE_KEY) {
        const raw = window.localStorage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              for (const [pk, pv] of Object.entries(parsed as Record<string, unknown>)) {
                if (pv && typeof pv === "object" && !Array.isArray(pv)) {
                  const inner: Record<string, string> = {};
                  for (const [ik, iv] of Object.entries(pv as Record<string, unknown>)) {
                    if (typeof iv === "string") inner[ik] = iv;
                  }
                  if (Object.keys(inner).length > 0) {
                    toMigrate.push({ k, pageKey: pk, values: inner });
                  }
                }
              }
            }
          } catch {
            /* skip */
          }
        }
        toDelete.push(k);
      }
    }

    if (toMigrate.length === 0 && toDelete.length === 0) return false;

    const all = readAll();
    for (const m of toMigrate) {
      // 새 통합 키에 같은 pageKey 가 이미 있으면 기존 새 값 우선
      if (!all[m.pageKey] && Object.keys(m.values).length > 0) {
        all[m.pageKey] = m.values;
      }
    }
    for (const k of toDelete) {
      window.localStorage.removeItem(k);
    }
    writeAll(all);
    return true;
  } catch {
    return false;
  }
}

/** Hydrate localStorage with the server-supplied console_filters dict. */
export function hydrateFromServer(
  _userId: string,
  serverFilters: FilterDict | undefined,
): void {
  if (typeof window === "undefined") return;
  // 매 hydrate 마다 legacy 청소 — login/fetchMe 시 깨끗한 상태 보장.
  migrateLegacyKeys();
  if (!serverFilters) {
    return;
  }
  try {
    const clean: FilterDict = {};
    for (const [pk, params] of Object.entries(serverFilters)) {
      if (!params || typeof params !== "object") continue;
      const inner: Record<string, string> = {};
      for (const [ik, iv] of Object.entries(params)) {
        if (typeof iv === "string") inner[ik] = iv;
      }
      if (Object.keys(inner).length > 0) clean[pk] = inner;
    }
    writeAll(clean);
  } catch {
    // Ignore — localStorage may be unavailable in private mode etc.
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced upload of the current localStorage filter snapshot to the server. */
export function scheduleSync(userId: string | null): void {
  if (!userId) return;
  if (typeof window === "undefined") return;

  if (syncTimer) clearTimeout(syncTimer);

  syncTimer = setTimeout(() => {
    syncTimer = null;
    const filters = readAll();
    api
      .put("/auth/me/console-filters", { filters })
      .catch(() => {
        // 실패해도 조용히 — 다음 변경 시 재시도된다.
      });
  }, DEBOUNCE_MS);
}

/** Cancel any pending sync (used on logout to avoid leaking writes after token clear). */
export function cancelPendingSync(): void {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

/**
 * 로그아웃 시 localStorage 필터 entry 완전 삭제 — 같은 머신에 다른 admin 이 로그인해도
 * 이전 사용자의 필터가 노출되지 않게 보장.
 */
export function clearStoredFilters(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Mount-time hook: ensure legacy keys are migrated. Idempotent. */
export function ensureMigrated(_userId: string | null): void {
  migrateLegacyKeys();
}
