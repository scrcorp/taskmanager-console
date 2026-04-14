/**
 * Permission-Based RBAC 유틸리티.
 *
 * Permission code 상수 (resource:action 형식).
 * 서버 PERMISSION_REGISTRY와 동기화 유지할 것.
 * 실제 권한 확인은 usePermissions 훅의 hasPermission()으로 수행.
 */

export const PERMISSIONS = {
  // ── Stores ──
  STORES_READ: "stores:read",
  STORES_CREATE: "stores:create",
  STORES_UPDATE: "stores:update",
  STORES_DELETE: "stores:delete",

  // ── Users ──
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",
  USERS_RESET_PASSWORD: "users:reset_password",

  // ── Roles ──
  ROLES_READ: "roles:read",
  ROLES_CREATE: "roles:create",
  ROLES_UPDATE: "roles:update",
  ROLES_DELETE: "roles:delete",

  // ── Schedules ──
  SCHEDULES_READ: "schedules:read",
  SCHEDULES_CREATE: "schedules:create",
  SCHEDULES_UPDATE: "schedules:update",
  SCHEDULES_DELETE: "schedules:delete",
  SCHEDULES_APPROVE: "schedules:approve",
  SCHEDULES_CANCEL: "schedules:cancel",
  SCHEDULES_REVERT: "schedules:revert",

  // ── Schedule History ──
  SCHEDULE_HISTORY_READ: "schedule_history:read",
  SCHEDULE_HISTORY_DELETE: "schedule_history:delete",

  // ── Schedule Settings ──
  SCHEDULE_SETTINGS_MANAGE: "schedule_settings:manage",

  // ── Announcements ──
  ANNOUNCEMENTS_READ: "announcements:read",
  ANNOUNCEMENTS_CREATE: "announcements:create",
  ANNOUNCEMENTS_UPDATE: "announcements:update",
  ANNOUNCEMENTS_DELETE: "announcements:delete",

  // ── Checklists ──
  CHECKLISTS_READ: "checklists:read",
  CHECKLISTS_CREATE: "checklists:create",
  CHECKLISTS_UPDATE: "checklists:update",
  CHECKLISTS_DELETE: "checklists:delete",

  // ── Checklist Review ──
  CHECKLIST_REVIEW_READ: "checklist_review:read",
  CHECKLIST_REVIEW_CREATE: "checklist_review:create",
  CHECKLIST_REVIEW_DELETE: "checklist_review:delete",

  // ── Checklist Log ──
  CHECKLIST_LOG_READ: "checklist_log:read",

  // ── Tasks ──
  TASKS_READ: "tasks:read",
  TASKS_CREATE: "tasks:create",
  TASKS_UPDATE: "tasks:update",
  TASKS_DELETE: "tasks:delete",

  // ── Evaluations ──
  EVALUATIONS_READ: "evaluations:read",
  EVALUATIONS_CREATE: "evaluations:create",
  EVALUATIONS_UPDATE: "evaluations:update",
  EVALUATIONS_DELETE: "evaluations:delete",

  // ── Daily Reports ──
  DAILY_REPORTS_READ: "daily_reports:read",
  DAILY_REPORTS_CREATE: "daily_reports:create",
  DAILY_REPORTS_UPDATE: "daily_reports:update",
  DAILY_REPORTS_DELETE: "daily_reports:delete",

  // ── Dashboard ──
  DASHBOARD_READ: "dashboard:read",

  // ── Inventory ──
  INVENTORY_READ: "inventory:read",
  INVENTORY_CREATE: "inventory:create",
  INVENTORY_UPDATE: "inventory:update",
  INVENTORY_DELETE: "inventory:delete",

  // ── Cost ──
  COST_READ: "cost:read",
  COST_UPDATE: "cost:update",

  // ── Organization ──
  ORG_READ: "org:read",
  ORG_UPDATE: "org:update",
} as const;

/**
 * 페이지 경로 → 필요 permission 매핑.
 *
 * layout에서 자동으로 접근 제어에 사용.
 * 새 페이지 추가 시 여기에 한 줄 추가.
 * 매핑에 없는 페이지는 인증만 필요 (permission 체크 없음).
 */
export const PAGE_PERMISSIONS: Record<string, string> = {
  "/stores": PERMISSIONS.STORES_READ,
  "/users": PERMISSIONS.USERS_READ,
  "/schedules": PERMISSIONS.SCHEDULES_READ,
  "/schedules/history": PERMISSIONS.SCHEDULE_HISTORY_READ,
  "/schedules/settings": PERMISSIONS.SCHEDULE_SETTINGS_MANAGE,
  "/checklists": PERMISSIONS.CHECKLISTS_READ,
  "/checklists/progress": PERMISSIONS.CHECKLISTS_READ,
  "/checklists/log": PERMISSIONS.CHECKLIST_LOG_READ,
  "/tasks": PERMISSIONS.TASKS_READ,
  "/announcements": PERMISSIONS.ANNOUNCEMENTS_READ,
  "/evaluations": PERMISSIONS.EVALUATIONS_READ,
  "/daily-reports": PERMISSIONS.DAILY_REPORTS_READ,
  "/inventory": PERMISSIONS.INVENTORY_READ,
  "/settings/roles": PERMISSIONS.ROLES_READ,
};
// Note: /settings (General) has no permission gate — password change must remain accessible.
// SV/Staff are hidden from the Settings menu via MENU_PERMISSIONS instead.

/**
 * Sidebar 메뉴 → 필요 permission 매핑.
 *
 * 해당 permission이 없으면 메뉴 자체가 안 보임.
 * PAGE_PERMISSIONS와 별도로 관리 (메뉴 구조 ≠ 페이지 구조).
 */
export const MENU_PERMISSIONS: Record<string, string> = {
  "/stores": PERMISSIONS.STORES_READ,
  "/users": PERMISSIONS.USERS_READ,
  "/schedules": PERMISSIONS.SCHEDULES_READ,
  "/checklists/progress": PERMISSIONS.CHECKLISTS_READ,
  "/tasks": PERMISSIONS.TASKS_READ,
  "/announcements": PERMISSIONS.ANNOUNCEMENTS_READ,
  "/evaluations": PERMISSIONS.EVALUATIONS_READ,
  "/daily-reports": PERMISSIONS.DAILY_REPORTS_READ,
  "/inventory": PERMISSIONS.INVENTORY_READ,
  "/settings": PERMISSIONS.ORG_UPDATE,
  "/settings/roles": PERMISSIONS.ROLES_READ,
};

/**
 * Role Priority 상수.
 *
 * 매직넘버(10, 20, 30, 40) 직접 비교 금지.
 * UI에서 priority 기반 분기가 필요할 때 이 상수를 사용.
 * 접근 제어는 hasPermission()을 우선 사용할 것.
 */
export const ROLE_PRIORITY = {
  OWNER: 10,
  GM: 20,
  SV: 30,
  STAFF: 40,
} as const;
