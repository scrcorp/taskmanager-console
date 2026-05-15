/**
 * 콘솔 페이지별 필터 영속 동기화 — 서버 ↔ localStorage 양방향.
 *
 * 흐름:
 *  1. 로그인 직후 (또는 fetchMe) — 서버 console_filters 를 받아서 localStorage 에 hydrate
 *     (htm:filters:{userId}:{storageKey} 키에 각 페이지 dict 저장).
 *  2. 사용자가 어떤 페이지에서 필터를 바꾸면 usePersistedFilters 가 localStorage 를 갱신하고
 *     scheduleSync() 를 호출 → 디바운스 후 전체 localStorage 를 모아 PUT 한번에 전송.
 *  3. 1계정 1데이터 — last-write-wins. 같은 사용자가 다른 디바이스로 접속해도 마지막 변경이 보임.
 *
 * Server-side: see `PUT /auth/me/console-filters` in app/api/auth.py.
 */

import api from "./api";

const STORAGE_PREFIX = "htm:filters:";
const DEBOUNCE_MS = 800;

function userPrefix(userId: string): string {
  return `${STORAGE_PREFIX}${userId}:`;
}

/** Hydrate localStorage with the server-supplied console_filters dict. */
export function hydrateFromServer(
  userId: string,
  serverFilters: Record<string, Record<string, string>> | undefined,
): void {
  if (typeof window === "undefined") return;
  if (!serverFilters) return;
  try {
    const prefix = userPrefix(userId);
    // First clear any stale local-only entries for this user — server is source of truth on login.
    const toDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) toDelete.push(k);
    }
    for (const k of toDelete) window.localStorage.removeItem(k);

    for (const [pageKey, params] of Object.entries(serverFilters)) {
      if (params && Object.keys(params).length > 0) {
        window.localStorage.setItem(prefix + pageKey, JSON.stringify(params));
      }
    }
  } catch {
    // Ignore — localStorage may be unavailable in private mode etc.
  }
}

/** Collect all htm:filters:{userId}:* entries into a single object for upload. */
function collectForUser(userId: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (typeof window === "undefined") return out;
  try {
    const prefix = userPrefix(userId);
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const pageKey = k.slice(prefix.length);
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const sanitized: Record<string, string> = {};
          for (const [pk, pv] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof pv === "string") sanitized[pk] = pv;
          }
          if (Object.keys(sanitized).length > 0) out[pageKey] = sanitized;
        }
      } catch {
        // skip malformed entry
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

let timerByUser: Map<string, ReturnType<typeof setTimeout>> = new Map();

/** Debounced upload of the current localStorage filter snapshot to the server. */
export function scheduleSync(userId: string | null): void {
  if (!userId) return;
  if (typeof window === "undefined") return;

  const existing = timerByUser.get(userId);
  if (existing) clearTimeout(existing);

  const t = setTimeout(() => {
    timerByUser.delete(userId);
    const filters = collectForUser(userId);
    api
      .put("/auth/me/console-filters", { filters })
      .catch(() => {
        // 실패해도 조용히 — 다음 변경 시 재시도된다.
      });
  }, DEBOUNCE_MS);
  timerByUser.set(userId, t);
}

/** Cancel any pending sync (used on logout to avoid leaking writes after token clear). */
export function cancelPendingSync(): void {
  for (const t of timerByUser.values()) clearTimeout(t);
  timerByUser.clear();
}
