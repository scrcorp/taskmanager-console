/**
 * Mock 데이터 -- 서버 없이 페이지를 테스트하기 위한 샘플 데이터.
 *
 * Mock data for testing all admin pages without a running backend server.
 */

import type {
  UserMe,
  Store,
  StoreDetail,
  Shift,
  Position,
  Role,
  User,
  ChecklistTemplate,
  ChecklistItem,
  Announcement,
  AdditionalTask,
  Notification,
} from "@/types";

// ─── IDs ──────────────────────────────────────────────

const ORG_ID = "org-001";

const STORE_IDS = ["store-001", "store-002", "store-003"] as const;
const ROLE_IDS = ["role-001", "role-002", "role-003"] as const;
const USER_IDS = ["user-001", "user-002", "user-003", "user-004", "user-005"] as const;
const SHIFT_IDS = ["shift-001", "shift-002", "shift-003"] as const;
const POS_IDS = ["pos-001", "pos-002", "pos-003"] as const;
const TMPL_IDS = ["tmpl-001", "tmpl-002", "tmpl-003", "tmpl-004"] as const;
const ITEM_IDS = ["item-001", "item-002", "item-003", "item-004", "item-005", "item-006", "item-007"] as const;
const ANN_IDS = ["ann-001", "ann-002", "ann-003", "ann-004"] as const;
const TASK_IDS = ["task-001", "task-002", "task-003"] as const;
const NOTIF_IDS = ["notif-001", "notif-002", "notif-003", "notif-004", "notif-005"] as const;

// ─── Auth ─────────────────────────────────────────────

export const mockMe: UserMe = {
  id: USER_IDS[0],
  username: "admin",
  full_name: "Admin User",
  email: "admin@taskmanager.io",
  email_verified: true,
  phone: "010-1234-5678",
  role_name: "Super Admin",
  role_priority: 10,
  organization_id: ORG_ID,
  organization_name: "TaskManager Demo Org",
  organization_timezone: "America/New_York",
  company_code: "DEMO",
  is_active: true,
  permissions: [
    "announcements:create", "announcements:delete", "announcements:read", "announcements:update",
    "audit_log:read", "checklists:create", "checklists:delete", "checklists:read", "checklists:update",
    "dashboard:read", "evaluations:create", "evaluations:delete", "evaluations:read", "evaluations:update",
    "roles:create", "roles:delete", "roles:read", "roles:update",
    "schedules:create", "schedules:delete", "schedules:read", "schedules:update",
    "stores:create", "stores:delete", "stores:read", "stores:update",
    "tasks:create", "tasks:delete", "tasks:read", "tasks:update",
    "users:create", "users:delete", "users:read", "users:update",
  ],
};

// ─── Roles ────────────────────────────────────────────

export const mockRoles: Role[] = [
  { id: ROLE_IDS[0], name: "Owner", priority: 10, created_at: "2025-01-01T00:00:00Z" },
  { id: ROLE_IDS[1], name: "GM", priority: 20, created_at: "2025-01-01T00:00:00Z" },
  { id: ROLE_IDS[2], name: "Staff", priority: 40, created_at: "2025-01-01T00:00:00Z" },
];

// ─── Stores ───────────────────────────────────────────

export const mockStores: Store[] = [
  { id: STORE_IDS[0], organization_id: ORG_ID, name: "Seoul Station Branch", address: "서울특별시 중구 세종대로 12", is_active: true, operating_hours: null, max_work_hours_weekly: null, timezone: null, created_at: "2025-06-01T09:00:00Z" },
  { id: STORE_IDS[1], organization_id: ORG_ID, name: "Gangnam Branch", address: "서울특별시 강남구 테헤란로 123", is_active: true, operating_hours: null, max_work_hours_weekly: null, timezone: null, created_at: "2025-07-15T10:00:00Z" },
  { id: STORE_IDS[2], organization_id: ORG_ID, name: "Busan Branch", address: "부산광역시 해운대구 센텀로 45", is_active: false, operating_hours: null, max_work_hours_weekly: null, timezone: null, created_at: "2025-08-20T11:00:00Z" },
];

// ─── Shifts ───────────────────────────────────────────

export const mockShifts: Record<string, Shift[]> = {
  [STORE_IDS[0]]: [
    { id: SHIFT_IDS[0], store_id: STORE_IDS[0], name: "Morning (06:00-14:00)", sort_order: 1 },
    { id: SHIFT_IDS[1], store_id: STORE_IDS[0], name: "Afternoon (14:00-22:00)", sort_order: 2 },
    { id: SHIFT_IDS[2], store_id: STORE_IDS[0], name: "Night (22:00-06:00)", sort_order: 3 },
  ],
  [STORE_IDS[1]]: [
    { id: "shift-004", store_id: STORE_IDS[1], name: "Day Shift", sort_order: 1 },
    { id: "shift-005", store_id: STORE_IDS[1], name: "Night Shift", sort_order: 2 },
  ],
  [STORE_IDS[2]]: [],
};

// ─── Positions ────────────────────────────────────────

export const mockPositions: Record<string, Position[]> = {
  [STORE_IDS[0]]: [
    { id: POS_IDS[0], store_id: STORE_IDS[0], name: "Floor Manager", sort_order: 1 },
    { id: POS_IDS[1], store_id: STORE_IDS[0], name: "Cashier", sort_order: 2 },
    { id: POS_IDS[2], store_id: STORE_IDS[0], name: "Stock Clerk", sort_order: 3 },
  ],
  [STORE_IDS[1]]: [
    { id: "pos-004", store_id: STORE_IDS[1], name: "Barista", sort_order: 1 },
    { id: "pos-005", store_id: STORE_IDS[1], name: "Server", sort_order: 2 },
  ],
  [STORE_IDS[2]]: [],
};

// ─── Store Details ────────────────────────────────────

export const mockStoreDetails: Record<string, StoreDetail> = {
  [STORE_IDS[0]]: { ...mockStores[0], shifts: mockShifts[STORE_IDS[0]], positions: mockPositions[STORE_IDS[0]] },
  [STORE_IDS[1]]: { ...mockStores[1], shifts: mockShifts[STORE_IDS[1]], positions: mockPositions[STORE_IDS[1]] },
  [STORE_IDS[2]]: { ...mockStores[2], shifts: [], positions: [] },
};

// ─── Users ────────────────────────────────────────────

export const mockUsers: User[] = [
  { id: USER_IDS[0], username: "admin", full_name: "Admin User", email: "admin@taskmanager.io", email_verified: true, phone: "010-1234-5678", role_name: "Owner", role_priority: 10, is_active: true, created_at: "2025-01-01T00:00:00Z" },
  { id: USER_IDS[1], username: "manager01", full_name: "Kim Manager", email: "kim@taskmanager.io", email_verified: true, phone: "010-2345-6789", role_name: "GM", role_priority: 20, is_active: true, created_at: "2025-03-15T09:00:00Z" },
  { id: USER_IDS[2], username: "staff01", full_name: "Lee Staff", email: "lee@taskmanager.io", email_verified: true, phone: "010-3456-7890", role_name: "Staff", role_priority: 40, is_active: true, created_at: "2025-04-01T09:00:00Z" },
  { id: USER_IDS[3], username: "staff02", full_name: "Park Worker", email: null, email_verified: false, phone: "010-4567-8901", role_name: "Staff", role_priority: 40, is_active: true, created_at: "2025-05-10T09:00:00Z" },
  { id: USER_IDS[4], username: "inactive01", full_name: "Choi Former", email: "choi@taskmanager.io", email_verified: false, phone: null, role_name: "Staff", role_priority: 40, is_active: false, created_at: "2025-02-20T09:00:00Z" },
];

/** 사용자별 소속 매장 (User store memberships) */
export const mockUserStores: Record<string, Store[]> = {
  [USER_IDS[0]]: [mockStores[0], mockStores[1], mockStores[2]],
  [USER_IDS[1]]: [mockStores[0], mockStores[1]],
  [USER_IDS[2]]: [mockStores[0]],
  [USER_IDS[3]]: [mockStores[1]],
  [USER_IDS[4]]: [],
};

// ─── Checklist Templates & Items ──────────────────────

export const mockTemplates: Record<string, ChecklistTemplate[]> = {
  [STORE_IDS[0]]: [
    { id: TMPL_IDS[0], store_id: STORE_IDS[0], shift_id: SHIFT_IDS[0], position_id: POS_IDS[0], shift_name: "Morning", position_name: "Floor", title: "Morning Floor Opening Checklist", item_count: 3 },
    { id: TMPL_IDS[1], store_id: STORE_IDS[0], shift_id: SHIFT_IDS[1], position_id: POS_IDS[1], shift_name: "Afternoon", position_name: "Cashier", title: "Afternoon Cashier Duties", item_count: 1 },
    { id: TMPL_IDS[2], store_id: STORE_IDS[0], shift_id: SHIFT_IDS[0], position_id: POS_IDS[0], shift_name: "Morning", position_name: "Floor", title: "Morning Safety Inspection", item_count: 2 },
    { id: TMPL_IDS[3], store_id: STORE_IDS[0], shift_id: SHIFT_IDS[2], position_id: POS_IDS[0], shift_name: "Night", position_name: "Floor", title: "Night Security Rounds", item_count: 1 },
  ],
  [STORE_IDS[1]]: [],
  [STORE_IDS[2]]: [],
};

export const mockChecklistItems: Record<string, ChecklistItem[]> = {
  [TMPL_IDS[0]]: [
    { id: ITEM_IDS[0], title: "Check floor cleanliness", description: "Inspect all aisles and common areas", verification_type: "photo", recurrence_type: "daily", recurrence_days: null, sort_order: 1 },
    { id: ITEM_IDS[1], title: "Verify POS system operational", description: null, verification_type: "none", recurrence_type: "daily", recurrence_days: null, sort_order: 2 },
    { id: ITEM_IDS[2], title: "Temperature check display units", description: "Record temperature readings for all refrigerated units", verification_type: "text", recurrence_type: "daily", recurrence_days: null, sort_order: 3 },
  ],
  [TMPL_IDS[1]]: [
    { id: ITEM_IDS[3], title: "Count register float", description: "Verify starting cash amount matches standard", verification_type: "text", recurrence_type: "weekly", recurrence_days: [0, 2, 4], sort_order: 1 },
  ],
  [TMPL_IDS[2]]: [
    { id: ITEM_IDS[4], title: "Inspect fire extinguishers", description: "Check all extinguishers are accessible and not expired", verification_type: "photo", recurrence_type: "daily", recurrence_days: null, sort_order: 1 },
    { id: ITEM_IDS[5], title: "Test emergency exits", description: null, verification_type: "none", recurrence_type: "daily", recurrence_days: null, sort_order: 2 },
  ],
  [TMPL_IDS[3]]: [
    { id: ITEM_IDS[6], title: "Lock all entry points", description: "Verify all doors and windows are secured", verification_type: "none", recurrence_type: "daily", recurrence_days: null, sort_order: 1 },
  ],
};

// ─── Announcements ────────────────────────────────────

export const mockAnnouncements: Announcement[] = [
  { id: ANN_IDS[0], title: "New Hygiene Policy Effective March 1st", content: "All staff must complete the updated hygiene training by February 28th.\nPlease check the training portal for the new module.\n\nFailure to complete by the deadline may result in schedule reassignment.", store_id: null, store_name: null, created_by_name: "Admin User", created_at: "2026-02-15T09:00:00Z" },
  { id: ANN_IDS[1], title: "Seoul Station Branch Renovation Notice", content: "The Seoul Station branch will undergo renovation from March 5-10.\nAll shifts during this period will be reassigned to Gangnam branch.", store_id: STORE_IDS[0], store_name: "Seoul Station Branch", created_by_name: "Kim Manager", created_at: "2026-02-14T14:30:00Z" },
  { id: ANN_IDS[2], title: "Holiday Schedule Change", content: "Please note the updated holiday schedule for March. Check the calendar for details.", store_id: null, store_name: null, created_by_name: "Admin User", created_at: "2026-02-10T11:00:00Z" },
  { id: ANN_IDS[3], title: "Gangnam Branch New Equipment Arrival", content: "New espresso machines will be delivered on Feb 20. Training session scheduled for Feb 21.", store_id: STORE_IDS[1], store_name: "Gangnam Branch", created_by_name: "Kim Manager", created_at: "2026-02-08T16:00:00Z" },
];

// ─── Tasks ────────────────────────────────────────────

export const mockTasks: AdditionalTask[] = [
  { id: TASK_IDS[0], title: "Restock cleaning supplies", description: "Order and restock cleaning supplies for all branches by end of week.", store_id: null, store_name: null, priority: "urgent", status: "in_progress", due_date: "2026-02-20", created_by_name: "Admin User", assignee_names: ["Kim Manager", "Lee Staff"], created_at: "2026-02-15T09:00:00Z" },
  { id: TASK_IDS[1], title: "Update employee handbook", description: "Incorporate new policy changes into the employee handbook.", store_id: null, store_name: null, priority: "normal", status: "pending", due_date: "2026-03-01", created_by_name: "Admin User", assignee_names: ["Kim Manager"], created_at: "2026-02-14T10:00:00Z" },
  { id: TASK_IDS[2], title: "Fix broken display shelf", description: null, store_id: STORE_IDS[0], store_name: "Seoul Station Branch", priority: "urgent", status: "completed", due_date: "2026-02-16", created_by_name: "Kim Manager", assignee_names: ["Park Worker"], created_at: "2026-02-13T14:00:00Z" },
];

// ─── Notifications ────────────────────────────────────

export const mockNotifications: Notification[] = [
  { id: NOTIF_IDS[0], type: "schedule", message: "New schedule for Seoul Station Branch - Morning shift on Feb 18", reference_type: "schedule", reference_id: "schedule-001", is_read: false, created_at: "2026-02-17T07:00:00Z" },
  { id: NOTIF_IDS[1], type: "task", message: "Task 'Restock cleaning supplies' is now urgent", reference_type: "task", reference_id: TASK_IDS[0], is_read: false, created_at: "2026-02-16T15:00:00Z" },
  { id: NOTIF_IDS[2], type: "announcement", message: "New announcement: New Hygiene Policy Effective March 1st", reference_type: "announcement", reference_id: ANN_IDS[0], is_read: false, created_at: "2026-02-15T09:00:00Z" },
  { id: NOTIF_IDS[3], type: "schedule", message: "Schedule confirmed for Lee Staff at Seoul Station Morning shift", reference_type: "schedule", reference_id: "schedule-002", is_read: true, created_at: "2026-02-17T08:05:00Z" },
  { id: NOTIF_IDS[4], type: "task", message: "Task 'Fix broken display shelf' marked as completed", reference_type: "task", reference_id: TASK_IDS[2], is_read: true, created_at: "2026-02-16T10:00:00Z" },
];
