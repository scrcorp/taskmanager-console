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

export interface UserMe {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_name: string;
  role_priority: number;
  organization_id: string;
  organization_name: string;
  company_code: string;
  is_active: boolean;
  permissions: string[];
}

// Organization
export interface Organization {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
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
  max_work_hours_weekly: number | null;
  created_at: string;
}

export interface UserStoreAssignment extends Store {
  is_manager: boolean;
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
  users: { user_id: string; user_name: string; total_hours: number; max_weekly: number; over_hours: number }[];
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
  phone: string | null;
  role_name: string;
  role_priority: number;
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
  recurrence_type: "daily" | "weekly";
  recurrence_days: number[] | null;
  sort_order: number;
}

// Assignment
export interface Assignment {
  id: string;
  store_id: string;
  store_name: string;
  shift_id: string;
  shift_name: string;
  shift_sort_order: number;
  position_id: string;
  position_name: string;
  user_id: string;
  user_name: string;
  work_date: string;
  status: "assigned" | "in_progress" | "completed";
  total_items: number;
  completed_items: number;
  created_at: string;
}

export interface AssignmentDetail extends Assignment {
  checklist_snapshot: ChecklistSnapshotItem[] | null;
  checklist_instance_id?: string | null;
}

export interface ChecklistSnapshotItem {
  item_index: number;
  title: string;
  description: string | null;
  verification_type: string;
  is_completed: boolean;
  completed_at: string | null;
  completed_tz: string | null;
  review?: {
    id: string;
    reviewer_id: string;
    reviewer_name: string | null;
    result: "pass" | "fail" | "caution";
    comment: string | null;
    photo_url: string | null;
    created_at: string;
    updated_at: string;
  } | null;
}

// Announcement
export interface Announcement {
  id: string;
  title: string;
  content: string;
  store_id: string | null;
  store_name: string | null;
  created_by_name: string;
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
  created_by_name: string;
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

// Notification
export interface Notification {
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
}

/** 매장 수정 요청 타입.
 * Store update request payload (partial). */
export interface StoreUpdate {
  name?: string;
  address?: string | null;
  is_active?: boolean;
  max_work_hours_weekly?: number | null;
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
  recurrence_type?: "daily" | "weekly";
  recurrence_days?: number[] | null;
  sort_order?: number;
}

/** 근무 배정 생성 요청 타입.
 * Work assignment creation request payload. */
export interface AssignmentCreate {
  store_id: string;
  shift_id: string;
  position_id: string;
  user_id: string;
  work_date: string;
}

/** 공지사항 생성 요청 타입.
 * Announcement creation request payload. */
export interface AnnouncementCreate {
  title: string;
  content: string;
  store_id?: string | null;
}

/** 공지사항 수정 요청 타입.
 * Announcement update request payload (partial). */
export interface AnnouncementUpdate {
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

/** 배정 목록 필터 파라미터 타입.
 * Assignment list filter parameters. */
export interface AssignmentFilters {
  store_id?: string;
  user_id?: string;
  work_date?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  page?: number;
  per_page?: number;
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
  work_assignment_id: string;
  store_id: string;
  user_id: string;
  work_date: string;
  snapshot: ChecklistInstanceSnapshotItem[];
  total_items: number;
  completed_items: number;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
  updated_at: string;
  store_name?: string;
  user_name?: string;
  template_title?: string;
}

/** 리뷰 결과 변경 히스토리 항목.
 * Review result change history item. */
export interface ReviewHistoryItem {
  id: string;
  changed_by: string;
  changed_by_name: string | null;
  old_result: string | null;
  new_result: string;
  created_at: string;
}

/** 완료 히스토리 (재제출 아카이브) 항목.
 * Completion history item — archived evidence from resubmission. */
export interface CompletionHistoryItem {
  id: string;
  photo_url: string | null;
  note: string | null;
  location: { lat: number; lng: number } | null;
  submitted_at: string;
  created_at: string;
}

export interface ChecklistInstanceSnapshotItem {
  item_index: number;
  title: string;
  description: string | null;
  verification_type: "none" | "photo" | "text" | "both";
  is_completed?: boolean;
  completed_at?: string | null;
  completed_timezone?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  photo_url?: string | null;
  note?: string | null;
  location?: { lat: number; lng: number } | null;
  resubmission_count?: number;
  completion_history?: CompletionHistoryItem[];
  review?: {
    id: string;
    reviewer_id: string;
    reviewer_name: string | null;
    result: "pass" | "fail" | "caution" | "pending_re_review";
    contents: ReviewContent[];
    history: ReviewHistoryItem[];
    created_at: string;
    updated_at: string;
  } | null;
}

/** 리뷰 콘텐츠 (텍스트/사진/영상).
 * Review content item — text, photo, or video attached to a review. */
export interface ReviewContent {
  id: string;
  review_id: string;
  author_id: string;
  author_name: string | null;
  type: "text" | "photo" | "video";
  content: string;
  created_at: string;
}

/** 체크리스트 아이템 리뷰 응답 타입.
 * Checklist item review response type. */
export interface ChecklistItemReview {
  id: string;
  instance_id: string;
  item_index: number;
  reviewer_id: string;
  reviewer_name: string | null;
  result: "pass" | "fail" | "caution" | "pending_re_review";
  contents: ReviewContent[];
  history: ReviewHistoryItem[];
  created_at: string;
  updated_at: string;
}

/** 체크리스트 인스턴스 목록 필터 파라미터 타입.
 * Checklist instance list filter parameters. */
export interface ChecklistInstanceFilters {
  store_id?: string;
  work_date?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

// Schedule
/** 스케줄 응답 타입 — SV가 작성하고 GM이 승인하는 스케줄.
 *  Schedule response type — draft created by SV, approved by GM. */
export interface Schedule {
  id: string;
  organization_id: string;
  store_id: string;
  store_name: string;
  user_id: string;
  user_name: string;
  shift_id: string | null;
  shift_name: string | null;
  position_id: string | null;
  position_name: string | null;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  status: "draft" | "pending" | "approved" | "cancelled";
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  work_assignment_id: string | null;
  created_at: string;
}

/** 스케줄 생성 요청 타입.
 *  Schedule creation request payload. */
export interface ScheduleCreate {
  store_id: string;
  user_id: string;
  shift_id?: string | null;
  position_id?: string | null;
  work_date: string;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
}

/** 스케줄 수정 요청 타입.
 *  Schedule update request payload (partial). */
export interface ScheduleUpdate {
  shift_id?: string | null;
  position_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
}

/** 스케줄 목록 필터 파라미터 타입.
 *  Schedule list filter parameters. */
export interface ScheduleFilters {
  store_id?: string;
  user_id?: string;
  work_date?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

// Attendance
/** 근태 기록 응답 타입.
 *  Attendance record response type — daily clock-in/out tracking. */
export interface Attendance {
  id: string;
  store_id: string;
  store_name: string | null;
  user_id: string;
  user_name: string | null;
  work_date: string;
  clock_in: string | null;
  clock_in_timezone: string | null;
  break_start: string | null;
  break_end: string | null;
  clock_out: string | null;
  clock_out_timezone: string | null;
  status: "clocked_in" | "on_break" | "clocked_out";
  total_work_minutes: number | null;
  total_break_minutes: number | null;
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
  reason: string;
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
 *  Attendance correction request payload. */
export interface AttendanceCorrectionRequest {
  field_name: string;
  corrected_value: string;
  reason: string;
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
  id: string;
  template_section_id: string | null;
  title: string;
  content: string | null;
  sort_order: number;
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
