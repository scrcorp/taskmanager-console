// Auth
export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export type PreferredLanguage = "en" | "es" | "ko";

export interface UserMe {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  role_name: string;
  role_priority: number;
  organization_id: string;
  organization_name: string;
  organization_timezone: string;
  company_code: string;
  is_active: boolean;
  permissions: string[];
  password_changed_at: string | null;
  must_change_password: boolean;
  preferred_language: PreferredLanguage;
}

// Organization
export interface Organization {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  timezone: string;
  default_hourly_rate: number;
  created_at: string;
}

// Store
export interface Store {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  operating_hours: Record<string, unknown> | null;
  day_start_time: Record<string, string> | null;
  max_work_hours_weekly: number | null;
  timezone: string | null;
  default_hourly_rate: number | null;
  created_at: string;
}

export interface UserStoreAssignment extends Store {
  is_manager: boolean;
  is_work_assignment: boolean;
}

export interface StoreDetail extends Store {
  shifts: Shift[];
  positions: Position[];
}

// Shift / Position
export interface Shift {
  id: string;
  store_id: string;
  name: string;
  sort_order: number;
}

export interface Position {
  id: string;
  store_id: string;
  name: string;
  sort_order: number;
}

// Shift Preset
export interface ShiftPreset {
  id: string;
  store_id: string;
  shift_id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// Labor Law Setting
export interface LaborLawSetting {
  id: string;
  store_id: string;
  federal_max_weekly: number;
  state_max_weekly: number | null;
  store_max_weekly: number | null;
  overtime_threshold_daily: number | null;
  created_at: string;
}

// Dashboard
export interface ChecklistCompletion {
  total_assignments: number;
  completed: number;
  completion_rate: number;
}

export interface AttendanceSummary {
  total: number;
  completed: number;
  clocked_in: number;
  avg_work_minutes: number;
}

export interface OvertimeSummary {
  users: { user_id: string; user_name: string | null; total_hours: number; max_weekly: number; over_hours: number }[];
}

export interface EvaluationSummary {
  total: number;
  draft: number;
  submitted: number;
}

// Role
export interface Role {
  id: string;
  name: string;
  priority: number;
  created_at: string;
}

// User
export interface User {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  role_name: string;
  role_priority: number;
  /** 개인 시급 raw — null이면 상속 (DB에 설정된 값 그대로) */
  hourly_rate: number | null;
  /** effective 시급 — user.hourly_rate ?? organization.default_hourly_rate. 서버에서 계산. */
  effective_hourly_rate?: number | null;
  is_active: boolean;
  created_at: string;
}

// Checklist
export interface ChecklistTemplate {
  id: string;
  store_id: string;
  shift_id: string;
  position_id: string;
  shift_name: string;
  position_name: string;
  title: string;
  item_count: number;
}

export interface ExcelImportResponse {
  created_templates: number;
  created_items: number;
  created_stores: number;
  created_shifts: number;
  created_positions: number;
  skipped_templates: number;
  updated_templates: number;
  errors: string[];
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  verification_type: string;
  min_photos?: number;
  recurrence_type: "daily" | "weekly";
  recurrence_days: number[] | null;
  sort_order: number;
}

// Notice
export interface Notice {
  id: string;
  title: string;
  content: string;
  store_id: string | null;
  store_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

// Additional Task
export interface AdditionalTask {
  id: string;
  title: string;
  description: string | null;
  store_id: string | null;
  store_name: string | null;
  priority: "normal" | "urgent";
  status: "pending" | "in_progress" | "completed";
  due_date: string | null;
  created_by_name: string | null;
  assignee_names: string[];
  created_at: string;
}

// Task Evidence
/** 업무 증빙 응답 타입.
 * Task evidence response type — photo/document evidence for additional tasks. */
export interface TaskEvidence {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string | null;
  file_url: string;
  file_type: string;
  note: string | null;
  created_at: string;
}

// Alert
export interface Alert {
  id: string;
  type: string;
  message: string;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

// === Request Types (Create/Update) ===

/** 매장 생성 요청 타입.
 * Store creation request payload. */
export interface StoreCreate {
  name: string;
  address?: string | null;
  timezone?: string | null;
}

/** 매장 수정 요청 타입.
 * Store update request payload (partial). */
export interface StoreUpdate {
  name?: string;
  address?: string | null;
  is_active?: boolean;
  max_work_hours_weekly?: number | null;
  timezone?: string | null;
  default_hourly_rate?: number | null;
}

/** 역할 생성 요청 타입.
 * Role creation request payload. */
export interface RoleCreate {
  name: string;
  priority: number;
}

/** 역할 수정 요청 타입.
 * Role update request payload (partial). */
export interface RoleUpdate {
  name?: string;
  priority?: number;
}

/** 사용자 생성 요청 타입.
 * User creation request payload. */
export interface UserCreate {
  username: string;
  password: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role_id: string;
}

/** 사용자 수정 요청 타입.
 * User update request payload (partial). */
export interface UserUpdate {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  role_id?: string;
  is_active?: boolean;
  hourly_rate?: number | null;
}

/** 시간대 생성 요청 타입.
 * Shift creation request payload. */
export interface ShiftCreate {
  name: string;
  sort_order?: number;
}

/** 시간대 수정 요청 타입.
 * Shift update request payload (partial). */
export interface ShiftUpdate {
  name?: string;
  sort_order?: number;
}

/** 포지션 생성 요청 타입.
 * Position creation request payload. */
export interface PositionCreate {
  name: string;
  sort_order?: number;
}

/** 포지션 수정 요청 타입.
 * Position update request payload (partial). */
export interface PositionUpdate {
  name?: string;
  sort_order?: number;
}

/** 체크리스트 템플릿 생성 요청 타입.
 * Checklist template creation request payload. */
export interface ChecklistTemplateCreate {
  store_id: string;
  shift_id: string;
  position_id: string;
  title: string;
}

/** 체크리스트 항목 생성 요청 타입.
 * Checklist item creation request payload. */
export interface ChecklistItemCreate {
  title: string;
  description?: string | null;
  verification_type?: string;
  min_photos?: number;
  recurrence_type?: "daily" | "weekly";
  recurrence_days?: number[] | null;
  sort_order?: number;
}

/** 체크리스트 항목 수정 요청 타입.
 * Checklist item update request payload (partial). */
export interface ChecklistItemUpdate {
  title?: string;
  description?: string | null;
  verification_type?: string;
  min_photos?: number;
  recurrence_type?: "daily" | "weekly";
  recurrence_days?: number[] | null;
  sort_order?: number;
}

/** 공지사항 생성 요청 타입.
 * Notice creation request payload. */
export interface NoticeCreate {
  title: string;
  content: string;
  store_id?: string | null;
}

/** 공지사항 수정 요청 타입.
 * Notice update request payload (partial). */
export interface NoticeUpdate {
  title?: string;
  content?: string;
}

/** 추가 업무 생성 요청 타입.
 * Additional task creation request payload. */
export interface TaskCreate {
  title: string;
  description?: string | null;
  store_id?: string | null;
  priority?: "normal" | "urgent";
  due_date?: string | null;
  assignee_ids?: string[];
}

/** 추가 업무 수정 요청 타입.
 * Additional task update request payload (partial). */
export interface TaskUpdate {
  title?: string;
  description?: string | null;
  priority?: "normal" | "urgent";
  status?: "pending" | "in_progress" | "completed";
  due_date?: string | null;
}

/** 사용자 목록 필터 파라미터 타입.
 * User list filter parameters. */
export interface UserFilters {
  store_id?: string;
  role_id?: string;
  is_active?: boolean;
}

/** 추가 업무 목록 필터 파라미터 타입.
 * Additional task list filter parameters. */
export interface TaskFilters {
  store_id?: string;
  status?: string;
  priority?: string;
  page?: number;
  per_page?: number;
}

// Checklist Instance
export interface ChecklistInstance {
  id: string;
  template_id: string | null;
  schedule_id: string | null;
  store_id: string;
  user_id: string;
  work_date: string;
  items: ChecklistInstanceItem[];
  total_items: number;
  completed_items: number;
  status: "pending" | "in_progress" | "completed";
  score?: number | null;
  score_note?: string | null;
  created_at: string;
  updated_at: string;
  store_name?: string;
  user_name?: string;
  template_title?: string;
}

/** 체크리스트 인스턴스 아이템 파일 (제출/리뷰/채팅 첨부).
 * File attached to a checklist instance item. */
export interface ChecklistItemFile {
  id: string;
  context: "submission" | "review" | "chat";
  context_id: string | null;
  file_url: string;
  file_type: string;
  sort_order: number;
}

/** 체크리스트 아이템 제출 기록.
 * Submission record for a checklist instance item. */
export interface ChecklistItemSubmission {
  id: string;
  version: number;
  note: string | null;
  location: object | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_at: string;
}

/** 리뷰 결과 변경 로그.
 * Review result change log entry. */
export interface ChecklistItemReviewLog {
  id: string;
  old_result: string | null;
  new_result: string | null;
  comment: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
}

/** 체크리스트 아이템 메시지 (채팅).
 * Chat message on a checklist instance item. */
export interface ChecklistItemMessage {
  id: string;
  author_id: string | null;
  author_name: string | null;
  content: string | null;
  created_at: string;
}

/** 체크리스트 인스턴스 아이템 (새 형식).
 * Checklist instance item — flat structure with inline review state. */
export interface ChecklistInstanceItem {
  id: string;
  item_index: number;
  title: string;
  description: string | null;
  verification_type: string;
  min_photos: number;
  max_photos: number | null;
  sort_order: number;

  is_completed: boolean;
  completed_at: string | null;
  completed_tz: string | null;
  completed_by: string | null;
  completed_by_name: string | null;

  review_result: "pass" | "fail" | "pending_re_review" | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;

  files: ChecklistItemFile[];
  submissions: ChecklistItemSubmission[];
  reviews_log: ChecklistItemReviewLog[];
  messages: ChecklistItemMessage[];
}

/** 체크리스트 인스턴스 목록 필터 파라미터 타입.
 * Checklist instance list filter parameters. */
export interface ChecklistInstanceFilters {
  store_id?: string;
  work_date?: string;
  status?: string;
  page?: number;
  per_page?: number;
  /** date_from/date_to is client-side only — server filters by work_date (single date).
   * Used by useScheduleChecklistMap to post-filter fetched results. */
  date_from?: string;
  date_to?: string;
}

// Schedule (legacy types removed — ScheduleEntry renamed to Schedule)

// Attendance
/** 개별 break 세션 타입.
 *  Per-break session row from attendance_breaks table. */
export interface AttendanceBreakItem {
  id: string;
  started_at: string;
  ended_at: string | null;
  break_type: "paid_10min" | "unpaid_meal" | "paid_short" | "unpaid_long" | string;
  duration_minutes: number | null;
  /** store tz 기준 "HH:MM" 포매팅 (서버 pre-format). */
  started_at_display?: string | null;
  /** store tz 기준 "HH:MM" 포매팅 — 진행 중이면 null. */
  ended_at_display?: string | null;
}

/** 근태 기록 응답 타입.
 *  Attendance record response type — daily clock-in/out tracking. */
export interface Attendance {
  id: string;
  store_id: string;
  store_name: string | null;
  user_id: string;
  user_name: string | null;
  schedule_id: string | null;
  work_date: string;
  clock_in: string | null;
  /** store tz 기준 "HH:MM" (서버 pre-format). 브라우저 로컬 tz 변환 없이 그대로 렌더. */
  clock_in_display?: string | null;
  clock_in_timezone: string | null;
  break_start: string | null;
  break_end: string | null;
  clock_out: string | null;
  /** store tz 기준 "HH:MM" (서버 pre-format). */
  clock_out_display?: string | null;
  clock_out_timezone: string | null;
  /** 연결된 스케줄 시작/종료 시각 — store tz 기준 ISO 문자열 (null if no linked schedule). */
  scheduled_start: string | null;
  /** store tz 기준 "HH:MM" (서버 pre-format). */
  scheduled_start_display?: string | null;
  scheduled_end: string | null;
  /** store tz 기준 "HH:MM" (서버 pre-format). */
  scheduled_end_display?: string | null;
  status: "upcoming" | "soon" | "working" | "on_break" | "late" | "clocked_out" | "no_show" | "cancelled";
  anomalies: string[] | null;
  total_work_minutes: number | null;
  total_break_minutes: number | null;
  /** attendance_breaks 기준 유급 휴식 합계 (분). */
  paid_break_minutes: number;
  /** attendance_breaks 기준 무급 휴식 합계 (분). */
  unpaid_break_minutes: number;
  /** 유급 휴식 중 10분 초과 차감분 합계 (분). 서버가 계산. */
  paid_break_overage_minutes?: number;
  /** 순 근무 시간(분) = total_work - unpaid_break - paid_break_overage. */
  net_work_minutes: number | null;
  /** break 세션 타임라인 (세부 보기용). */
  breaks: AttendanceBreakItem[];
  note: string | null;
  created_at: string;
  corrections?: AttendanceCorrection[];
}

/** 근태 수정 이력 응답 타입.
 *  Attendance correction audit trail response type. */
export interface AttendanceCorrection {
  id: string;
  field_name: string;
  original_value: string | null;
  corrected_value: string;
  reason: string | null;
  corrected_by: string;
  corrected_by_name: string | null;
  created_at: string;
}

/** QR 코드 응답 타입.
 *  Store QR code response type for attendance scanning. */
export interface QRCode {
  id: string;
  store_id: string;
  store_name: string | null;
  code: string;
  is_active: boolean;
  created_at: string;
}

/** 근태 목록 필터 파라미터 타입.
 *  Attendance list filter parameters. */
export interface AttendanceFilters {
  store_id?: string;
  user_id?: string;
  work_date?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

/** 근태 수정 요청 타입.
 *  Attendance correction request payload.
 *  field_name: clock_in | clock_out | break_start | break_end | status
 *  corrected_value: ISO datetime (시간 필드) 또는 status 문자열
 *  reason: optional */
export interface AttendanceCorrectionRequest {
  field_name: string;
  corrected_value: string;
  reason?: string | null;
}

/** Break session 추가 요청 타입. 모든 새 쓰기는 paid_10min/unpaid_meal 사용. */
export interface BreakSessionCreateRequest {
  started_at: string; // ISO
  ended_at?: string | null;
  break_type: "paid_10min" | "unpaid_meal";
}

/** Break session 수정 요청 타입. None 인 필드는 변경하지 않음. */
export interface BreakSessionUpdateRequest {
  started_at?: string | null;
  ended_at?: string | null;
  break_type?: "paid_10min" | "unpaid_meal" | null;
  clear_ended_at?: boolean;
}

// Evaluation
export interface EvalTemplate {
  id: string;
  name: string;
  target_role: string | null;
  eval_type: string;
  cycle_weeks: number | null;
  item_count: number;
  items: EvalTemplateItem[];
  created_at: string;
  updated_at: string;
}

export interface EvalTemplateItem {
  id: string;
  title: string;
  type: string;
  max_score: number;
  sort_order: number;
}

export interface Evaluation {
  id: string;
  evaluator_id: string;
  evaluator_name: string | null;
  evaluatee_id: string;
  evaluatee_name: string | null;
  template_id: string | null;
  template_name: string | null;
  store_id: string | null;
  store_name: string | null;
  status: "draft" | "submitted";
  responses: EvalResponseItem[];
  created_at: string;
  submitted_at: string | null;
}

export interface EvalResponseItem {
  id: string;
  template_item_id: string;
  item_title: string | null;
  score: number | null;
  text: string | null;
}

export interface EvalTemplateCreate {
  name: string;
  target_role?: string | null;
  eval_type?: string;
  cycle_weeks?: number | null;
  items?: { title: string; type?: string; max_score?: number; sort_order?: number }[];
}

export interface EvaluationCreate {
  evaluatee_id: string;
  template_id: string;
  store_id?: string | null;
  responses?: { template_item_id: string; score?: number | null; text?: string | null }[];
}

export interface EvaluationFilters {
  evaluator_id?: string;
  evaluatee_id?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

// Daily Report
export interface DailyReport {
  id: string;
  organization_id: string;
  store_id: string;
  store_name: string | null;
  template_id: string | null;
  author_id: string;
  author_name: string | null;
  report_date: string;
  period: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  comment_count: number;
  sections: DailyReportSection[];
  comments: DailyReportComment[];
}

export interface DailyReportSection {
  title: string;
  description: string | null;
  content: string | null;
  sort_order: number;
  is_required: boolean;
}

export interface DailyReportComment {
  id: string;
  user_id: string;
  user_name: string | null;
  content: string;
  created_at: string;
}

export interface DailyReportFilters {
  store_id?: string;
  date_from?: string;
  date_to?: string;
  period?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

// Daily Report Template
/** 일일 보고서 템플릿 응답 타입.
 * Daily report template response type. */
export interface DailyReportTemplate {
  id: string;
  organization_id: string;
  store_id: string | null;
  name: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  sections: DailyReportTemplateSection[];
}

/** 일일 보고서 템플릿 섹션.
 * Daily report template section. */
export interface DailyReportTemplateSection {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
}

/** 일일 보고서 템플릿 생성 요청 타입.
 * Daily report template creation request payload. */
export interface DailyReportTemplateCreate {
  name: string;
  store_id?: string | null;
  is_default?: boolean;
  sections: { title: string; description?: string | null; sort_order: number; is_required: boolean }[];
}

/** 일일 보고서 템플릿 수정 요청 타입.
 * Daily report template update request payload (partial). */
export interface DailyReportTemplateUpdate {
  name?: string;
  is_default?: boolean;
  is_active?: boolean;
  sections?: { title: string; description?: string | null; sort_order: number; is_required: boolean }[];
}

// Common
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Schedule System ────────────────────────────────

// Work Role
export interface WorkRole {
  id: string;
  store_id: string;
  shift_id: string;
  shift_name: string | null;
  position_id: string;
  position_name: string | null;
  name: string | null;
  default_start_time: string | null;
  default_end_time: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  headcount: Record<string, number>; // {"all": 1, "sun": 1, "mon": 1, ...}
  use_per_day_headcount: boolean;
  default_checklist_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WorkRoleCreate {
  shift_id: string;
  position_id: string;
  name?: string | null;
  default_start_time?: string | null;
  default_end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  headcount?: Record<string, number> | null; // {"all": 1, "sun": 1, "mon": 1, ...}
  use_per_day_headcount?: boolean;
  default_checklist_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface WorkRoleUpdate {
  name?: string | null;
  default_start_time?: string | null;
  default_end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  headcount?: Record<string, number> | null; // {"all": 1, "sun": 1, "mon": 1, ...}
  use_per_day_headcount?: boolean;
  default_checklist_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

// Break Rule
export interface BreakRule {
  id: string;
  store_id: string;
  max_continuous_minutes: number;
  break_duration_minutes: number;
  max_daily_work_minutes: number;
  work_hour_calc_basis: string;
  created_at: string;
  updated_at: string;
}

export interface BreakRuleUpsert {
  max_continuous_minutes?: number;
  break_duration_minutes?: number;
  max_daily_work_minutes?: number;
  work_hour_calc_basis?: string;
}

// Schedule Period
export interface SchedulePeriod {
  id: string;
  organization_id: string;
  store_id: string;
  store_name: string | null;
  period_start: string;
  period_end: string;
  request_deadline: string | null;
  status: "open" | "closed" | "sv_draft" | "gm_review" | "finalized";
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchedulePeriodCreate {
  store_id: string;
  period_start: string;
  period_end: string;
  request_deadline?: string | null;
}

export interface SchedulePeriodUpdate {
  period_start?: string;
  period_end?: string;
  request_deadline?: string | null;
}

// Schedule Request
export interface ScheduleRequestItem {
  id: string;
  user_id: string;
  user_name: string | null;
  store_id: string;
  store_name: string | null;
  work_role_id: string | null;
  work_role_name: string | null;
  work_date: string;
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  note: string | null;
  status: "submitted" | "accepted" | "modified" | "rejected";
  hourly_rate: number;
  submitted_at: string;
  created_at: string;
  // Original value tracking (admin modification)
  original_preferred_start_time: string | null;
  original_preferred_end_time: string | null;
  original_work_role_id: string | null;
  original_user_id: string | null;
  original_user_name: string | null;
  original_work_date: string | null;
  created_by: string | null;
  rejection_reason: string | null;
}

export interface ScheduleRequestAdminCreate {
  store_id: string;
  user_id: string;
  work_role_id?: string | null;
  work_date: string;
  preferred_start_time?: string | null;
  preferred_end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  note?: string | null;
}

export interface ScheduleRequestAdminUpdate {
  user_id?: string | null;
  work_role_id?: string | null;
  work_date?: string | null;
  preferred_start_time?: string | null;
  preferred_end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  note?: string | null;
  rejection_reason?: string | null;
}

export interface ScheduleConfirmRequest {
  store_id: string;
  date_from: string;
  date_to: string;
}

export interface ScheduleConfirmPreview {
  will_confirm: number;
  will_skip_rejected: number;
  will_fail: Array<{ request_id: string; user_name: string; work_date: string; reason: string }>;
}

export interface ScheduleConfirmResult {
  entries_created: number;
  requests_confirmed: number;
  requests_rejected: number;
  errors: string[];
}

// Schedule
export interface Schedule {
  id: string;
  organization_id: string;
  request_id: string | null;
  user_id: string;
  user_name: string | null;
  store_id: string;
  store_name: string | null;
  work_role_id: string | null;
  work_role_name: string | null;
  /** Snapshot — preserved at creation time, immune to later renames */
  work_role_name_snapshot: string | null;
  position_snapshot: string | null;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  net_work_minutes: number;
  /** 저장된 스냅샷 시급 (0이면 override 없음) */
  hourly_rate: number;
  /** Cascade(user → store → org)로 계산한 실효 시급. redact 시 null. */
  effective_rate: number | null;
  /** effective_rate 출처 레이어 */
  effective_rate_source: "schedule" | "user" | "store" | "org" | null;
  status: "draft" | "requested" | "confirmed" | "rejected" | "cancelled" | "deleted";
  submitted_at: string | null;
  is_modified: boolean;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  confirmed_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleCreate {
  request_id?: string | null;
  user_id: string;
  store_id: string;
  work_role_id?: string | null;
  work_date: string;
  start_time: string;
  end_time: string;
  break_start_time?: string | null;
  break_end_time?: string | null;
  /** Override the auto-calculated hourly rate. Omit to use org/store/user cascade. */
  hourly_rate?: number | null;
  note?: string | null;
  /** Initial status. Default 'confirmed' for direct admin creation. */
  status?: "draft" | "requested" | "confirmed";
  force?: boolean;
}

export interface ScheduleValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface ScheduleBulkCreate {
  entries: ScheduleCreate[];
  skip_on_conflict?: boolean;
}

export interface ScheduleBulkResult {
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
  items: Schedule[];
}

export interface ScheduleUpdate {
  user_id?: string | null;
  work_role_id?: string | null;
  work_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  /** Override the auto-calculated hourly rate. Omit to use org/store/user cascade. */
  hourly_rate?: number | null;
  note?: string | null;
  force?: boolean;
  /** user_id/work_role_id 변경 시 체크리스트 처리:
   *   - undefined: 진행 중이면 400으로 거절됨 (프론트가 사용자 확인 후 재전송)
   *   - true: 진행 중이어도 강제 재생성
   *   - false: 기존 CL 유지 (stale 허용) */
  reset_checklist?: boolean;
}

// ─── Bulk Schedule ────────────────────────────────────────────────────────────

export interface BulkPreviewEntry {
  user_id: string;
  store_id: string;
  work_role_id?: string | null;
  work_date: string;
  start_time: string;
  end_time: string;
  break_start_time?: string | null;
  break_end_time?: string | null;
  /** Initial status to apply on save. Default 'confirmed'. Server may downgrade non-GM+. */
  status?: "draft" | "requested" | "confirmed";
}

export interface BulkPreviewItem {
  index: number;
  estimated_cost: number | null;
  net_work_minutes: number;
}

export interface BulkPreviewConflict {
  index: number;
  message: string;
}

export interface BulkPreviewWarning {
  user_id: string;
  type: string;
  total_minutes: number;
  limit_minutes: number;
}

export interface BulkPreviewResponse {
  valid: BulkPreviewItem[];
  conflicts: BulkPreviewConflict[];
  warnings: BulkPreviewWarning[];
}

export interface BulkUpdateItem {
  id: string;
  work_role_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  note?: string | null;
  hourly_rate?: number | null;
  reset_checklist?: boolean | null;
  /** Target status. If set, server triggers the matching status transition (submit/confirm/revert). */
  status?: "draft" | "requested" | "confirmed";
}

export interface BulkUpdateRequest {
  updates: BulkUpdateItem[];
}

export interface BulkUpdateResult {
  updated: number;
  failed: number;
  errors: string[];
}

export interface BulkDeleteRequest {
  ids: string[];
}

export interface BulkDeleteResult {
  deleted: number;
  failed: number;
  errors: string[];
}

// ─── Inventory ────────────────────────────────────────────────────────────────

/** 재고 카테고리 (2단계 셀프참조).
 * Inventory category — supports 2-level hierarchy (parent + subcategory). */
export interface InventoryCategory {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  product_count?: number;
  children?: InventoryCategory[];
  created_at: string;
  updated_at: string;
}

/** 공용 제품 마스터.
 * Inventory product master shared across organization. */
export interface InventoryProduct {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  barcode: string | null;
  category_id: string | null;
  category_name: string | null;
  subcategory_id: string | null;
  subcategory_name: string | null;
  sub_unit: string | null;
  sub_unit_ratio: number | null;
  image_url: string | null;
  description: string | null;
  is_active: boolean;
  store_count?: number;
  created_at: string;
  updated_at: string;
}

export interface StoreInventoryBrief {
  id?: string;
  store_id: string;
  store_name: string;
  current_quantity: number;
  min_quantity: number;
  is_frequent: boolean;
}

/** 제품 상세 (매장 사용현황 포함).
 * Product detail with list of stores currently using it. */
export interface InventoryProductDetail extends InventoryProduct {
  stores: StoreInventoryBrief[];
}

/** 매장별 재고 항목.
 * Store inventory item — product stock within a specific store. */
export interface StoreInventoryItem {
  id: string;
  store_id: string;
  store_name: string | null;
  product_id: string;
  product_name: string | null;
  product_code: string | null;
  product_image_url: string | null;
  sub_unit: string | null;
  sub_unit_ratio: number | null;
  current_quantity: number;
  min_quantity: number;
  is_frequent: boolean;
  is_active: boolean;
  last_audited_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 매장 재고 요약.
 * Store inventory summary stats. */
export interface StoreInventorySummary {
  total: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
  // Server returns these field names
  normal?: number;
  low?: number;
  out?: number;
}

/** 재고 트랜잭션.
 * Inventory transaction record — stock_in / stock_out / adjustment. */
export interface InventoryTransaction {
  id: string;
  store_inventory_id: string;
  product_id: string;
  product_name: string | null;
  product_code: string | null;
  sub_unit: string | null;
  sub_unit_ratio: number | null;
  type: "stock_in" | "stock_out" | "adjustment" | "audit";
  quantity: number;
  before_quantity: number;
  after_quantity: number;
  reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** 재고조사 기록.
 * Inventory audit record. */
export interface InventoryAudit {
  id: string;
  store_id: string;
  created_by: string | null;
  created_by_name: string | null;
  status: "in_progress" | "completed";
  items_count: number;
  items_checked: number;  // alias
  discrepancies: number;
  discrepancy_count: number;  // alias
  started_at: string;
  completed_at: string | null;
  note: string | null;
  created_at: string;
}

/** 재고조사 항목.
 * Inventory audit item — per-product result. */
export interface AuditItem {
  id: string;
  audit_id: string;
  store_inventory_id: string;
  product_id: string;
  product_name: string | null;
  product_code: string | null;
  sub_unit: string | null;
  sub_unit_ratio: number | null;
  system_quantity: number;
  actual_quantity: number;
  difference: number;
  created_at: string;
}

/** 재고조사 상세 (항목 포함).
 * Inventory audit detail with individual items. */
export interface InventoryAuditDetail extends InventoryAudit {
  items: AuditItem[];
}

/** 매장별 재고조사 설정.
 * Audit settings per store. */
export interface AuditSetting {
  id: string;
  store_id: string;
  frequency: "daily" | "weekly" | "custom";
  day_of_week: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Inventory Request Types ──────────────────────────────────────────────────

/** 카테고리 생성 요청.
 * Inventory category creation request payload. */
export interface InventoryCategoryCreate {
  name: string;
  parent_id?: string | null;
  sort_order?: number;
}

/** 카테고리 수정 요청.
 * Inventory category update request payload. */
export interface InventoryCategoryUpdate {
  name?: string;
  sort_order?: number;
}

/** 제품 생성 요청.
 * Inventory product creation request payload. */
export interface InventoryProductCreate {
  name: string;
  code?: string | null;
  auto_code?: boolean;
  category_id?: string | null;
  subcategory_id?: string | null;
  sub_unit?: string | null;
  sub_unit_ratio?: number | null;
  image_url?: string | null;
  description?: string | null;
  /** 제품 생성과 동시에 매장 재고 등록 (optional). */
  stores?: {
    store_id: string;
    min_quantity: number;
    initial_quantity: number;
    is_frequent: boolean;
  }[];
}

/** 제품 수정 요청.
 * Inventory product update request payload. */
export interface InventoryProductUpdate {
  name?: string;
  code?: string | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  sub_unit?: string | null;
  sub_unit_ratio?: number | null;
  image_url?: string | null;
  description?: string | null;
  is_active?: boolean;
}

/** 제품 목록 필터 파라미터.
 * Product list filter parameters. */
export interface InventoryProductFilters {
  category_id?: string;
  subcategory_id?: string;
  is_active?: boolean;
  search?: string;
  search_field?: "all" | "name" | "code";
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

/** 매장 재고 목록 필터 파라미터.
 * Store inventory list filter parameters. */
export interface StoreInventoryFilters {
  category_id?: string;
  search?: string;
  search_field?: "all" | "name" | "code";
  stock_status?: "in_stock" | "low_stock" | "out_of_stock";
  is_frequent?: boolean;
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

/** 매장 재고 설정 수정 요청.
 * Store inventory item update request. */
export interface StoreInventoryItemUpdate {
  min_quantity?: number;
  is_frequent?: boolean;
  is_active?: boolean;
}

/** 매장 재고 일괄 추가 요청.
 * Bulk add products to store request. */
export interface BulkAddStoreInventoryRequest {
  items: {
    product_id: string;
    min_quantity: number;
    initial_quantity: number;
    is_frequent: boolean;
  }[];
}

/** 입출고 트랜잭션 생성 요청.
 * Inventory transaction creation request. */
export interface InventoryTransactionCreate {
  type: "stock_in" | "stock_out" | "adjustment" | "audit";
  quantity: number;
  reason?: string | null;
}

/** 다건 입고 요청.
 * Bulk stock-in request. */
export interface BulkStockInRequest {
  items: {
    store_inventory_id: string;
    quantity: number;
    reason?: string | null;
  }[];
}

/** 다건 출고 요청.
 * Bulk stock-out request. */
export interface BulkStockOutRequest {
  items: {
    store_inventory_id: string;
    quantity: number;
    reason?: string | null;
  }[];
}

/** 입출고 히스토리 필터 파라미터.
 * Transaction history filter parameters. */
export interface InventoryTransactionFilters {
  product_id?: string;
  type?: "stock_in" | "stock_out" | "adjustment";
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}

/** 재고조사 설정 수정 요청.
 * Audit settings update request. */
export interface AuditSettingUpdate {
  frequency?: "daily" | "weekly" | "custom";
  day_of_week?: number | null;
}

// ─── Sub Unit Types ───────────────────────────────────────────────────────────

/** 서브유닛 (박스, 팩 등 묶음 단위).
 * Sub unit — a named bulk-packaging unit (e.g. box, pack, case). */
export interface InventorySubUnit {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  product_count: number;
  created_at: string;
  updated_at: string;
}

/** 서브유닛 생성 요청.
 * Sub unit creation request payload. */
export interface InventorySubUnitCreate {
  name: string;
  code?: string | null;
}

/** 서브유닛 수정 요청.
 * Sub unit update request payload. */
export interface InventorySubUnitUpdate {
  name: string;
}

// ─── Attendance Device Types ─────────────────────────────────────────────────

/** 출퇴근용 매장 공용 태블릿 디바이스.
 * Attendance device (shared store tablet) metadata. */
export interface AttendanceDevice {
  id: string;
  organization_id: string;
  store_id: string;
  store_name: string;
  device_name: string | null;
  fingerprint: string;
  registered_at: string;
  last_seen_at: string | null;
}

/** Access code 응답 — 서비스 키별 6자리 코드.
 * Access code response per service key (masked until revealed). */
export interface AccessCode {
  service_key: string;
  code: string;
  source: "env" | "auto";
  rotated_at: string | null;
  created_at: string;
}

/** 직원 개인 6자리 PIN 응답.
 * Per-staff 6-digit clock-in PIN. */
export interface ClockinPin {
  user_id: string;
  clockin_pin: string;
}

