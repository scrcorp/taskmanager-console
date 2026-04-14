/**
 * Permission-based RBAC hook.
 *
 * Owner bypasses all permission checks (always true).
 * Other roles check against /auth/me permissions[] array.
 */

import { useAuthStore } from "@/stores/authStore";
import { ROLE_PRIORITY } from "@/lib/permissions";

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const permissions = new Set(user?.permissions ?? []);
  const priority = user?.role_priority ?? 999;
  const isOwner = priority <= ROLE_PRIORITY.OWNER;

  return {
    permissions,
    priority,
    isOwner,
    isGMPlus: priority <= ROLE_PRIORITY.GM,
    isSVPlus: priority <= ROLE_PRIORITY.SV,

    // Owner bypasses all permission checks
    hasPermission: (code: string) => isOwner || permissions.has(code),
    hasAnyPermission: (...codes: string[]) => isOwner || codes.some((c) => permissions.has(c)),
    hasAllPermissions: (...codes: string[]) => isOwner || codes.every((c) => permissions.has(c)),
  };
}
