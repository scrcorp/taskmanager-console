/**
 * 매장/조직 타임존을 반환하는 훅.
 *
 * 우선순위: storeTimezone → organization_timezone → undefined (브라우저 기본)
 */

import { useAuthStore } from "@/stores/authStore";

export function useTimezone(storeTimezone?: string | null): string | undefined {
  const orgTimezone = useAuthStore((s) => s.user?.organization_timezone);
  return storeTimezone ?? orgTimezone ?? undefined;
}
