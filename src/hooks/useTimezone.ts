/**
 * 매장/조직 타임존을 반환하는 훅.
 *
 * 우선순위: storeTimezone → organization_timezone → undefined (브라우저 기본)
 */

import { useAuthStore } from "@/stores/authStore";
import { useStores } from "./useStores";

export function useTimezone(storeTimezone?: string | null): string | undefined {
  const orgTimezone = useAuthStore((s) => s.user?.organization_timezone);
  return storeTimezone ?? orgTimezone ?? undefined;
}

/**
 * 특정 매장의 시간대. 매장에 값이 없으면 조직 기본값으로 떨어진다.
 *
 * 화면이 한 매장에 고정돼 있을 때(간소화 콘솔) 쓴다. 조직 시간대만 쓰면 매장 시간대가
 * 다른 곳에서 시각이 어긋난다 — 서버는 매장 시간대로 표시하는데 입력은 조직 시간대로
 * 인코딩되어, UTC 매장에서 16:15 로 넣은 출근이 23:15 로 되돌아오는 식이다.
 */
export function useStoreTimezone(storeId?: string): string | undefined {
  const { data: stores } = useStores();
  const store = storeId ? stores?.find((s) => s.id === storeId) : undefined;
  return useTimezone(store?.timezone);
}
