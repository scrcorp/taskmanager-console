// 스케줄 검증 항목의 코드/문구는 lib/scheduleCodes 가 단일 출처 — 타입만 여기서 재수출한다.
import type { ScheduleIssue } from "@/lib/scheduleCodes";
export type { ScheduleIssue };

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
  /** Server-persisted console filters per page (1 account, 1 dataset). */
  console_filters?: Record<string, Record<string, string>>;
  /** [Model B] 이 계정이 소속된 모든 org + 각 접근상태 (org 스위처/차단화면용). */
  organizations?: OrgMembership[];
  /** 현재(선택된) org 접근 가능 여부. 차단이면 false + block_reason. */
  current_org_accessible?: boolean;
  current_org_block_reason?: string | null;
}

/** org 접근 차단 이유 코드 (서버 계약). */
export type OrgBlockReason =
  | "ORG_LICENSE_INACTIVE"
  | "ORG_ACCESS_REVOKED"
  | "NOT_A_MEMBER";

/** 사용자의 org 소속 1건 + 접근상태. */
export interface OrgMembership {
  organization_id: string;
  organization_name: string | null;
  organization_code: string | null;
  role_name: string | null;
  role_priority: number | null;
  member_status: string;
  license_status: string | null;
  accessible: boolean;
  block_reason: OrgBlockReason | null;
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
export type StoreStatus = "preparing" | "open" | "paused" | "closed";

export const STORE_STATUS_OPTIONS: { value: StoreStatus; label: string }[] = [
  { value: "preparing", label: "Preparing" },
  { value: "open", label: "Open" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
];

export interface Store {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: StoreStatus;
  sort_order: number;
  is_active: boolean; // derived (status === "open"), server-provided for back-compat
  require_approval: boolean;
  day_start_time: Record<string, string> | null;
  max_work_hours_weekly: number | null;
  state_code: string | null;
  timezone: string | null;
  default_hourly_rate: number | null;
  accepting_signups: boolean;
  created_at: string;
  /** 소속 그룹 ID (없으면 Ungrouped). Optional — 기존 mock/test 리터럴 호환. */
  group_id?: string | null;
  /** Per-store numbering 시작 번호 (null = 기본). Optional — 기존 mock/test 리터럴 호환. */
  number_range_start?: number | null;
  /** 그룹 편성 변경 PUT 응답에서만 비어있지 않음 / Only populated on group-changing PUT responses. */
  duplicate_empids?: DuplicateEmpid[];
}

/** 그룹/매장 numbering 범위 안에서 중복된 EMPID / Duplicated EMPID within a numbering scope */
export interface DuplicateEmpid {
  empid: number;
  count: number;
}

// Store Group
export interface StoreGroup {
  id: string;
  organization_id: string;
  name: string;
  /** 그룹 코드 — 급여/외부 시스템의 법인 표기 (예: "ODG"). EMPID 임포트 자연 매칭 키 */
  code: string | null;
  sort_order: number;
  /** "group" = shared numbering across the group, "store" = per-store numbering */
  numbering_mode: "group" | "store";
  number_range_start: number | null;
  store_count: number;
  duplicate_empids: DuplicateEmpid[];
  created_at: string;
}

export interface UserStoreAssignment extends Store {
  is_manager: boolean;
  is_work_assignment: boolean;
  /** 이 매장에서의 EMPID (매장 안 1부터 순번). */
  empid?: number | null;
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
  /** FOH/BOH 분류 — null이면 미지정 (오너·매니저 등) */
  department?: "FOH" | "BOH" | null;
  /** 사번 — org 내 유일. null이면 미부여 */
  employee_no?: string | null;
  /** CREWID — org 안 1부터 순번 (org 번호). */
  crewid?: number | null;
  is_active: boolean;
  /**
   * 미가입(유령) 계정 — 아직 앱에 가입하지 않은 직원 자리.
   * 항상 is_active=false 로 온다 (로그인 불가). 스케줄 배정·empid 부여는 가능.
   * optional — 기존 mock/테스트 리터럴 보호.
   */
  is_provisional?: boolean;
  /** 인수 코드 — 유령 계정만. 직원이 가입할 때 입력하면 이 계정을 인수한다. */
  claim_code?: string | null;
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
  /** FOH/BOH 분류 — null/생략 시 미지정 */
  department?: "FOH" | "BOH" | null;
  /** 사번 — org 내 유일. 생략 시 미부여 */
  employee_no?: string | null;
  /** CREWID — org 안 1부터 순번 (org 번호). */
  crewid?: number | null;
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
  /** FOH/BOH 분류 — null이면 미지정으로 해제 */
  department?: "FOH" | "BOH" | null;
  /** 사번 — org 내 유일. null이면 해제, 생략 시 변경 없음 */
  employee_no?: string | null;
  /** CREWID — org 안 1부터 순번 (org 번호). */
  crewid?: number | null;
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
  /** 인스턴스 소속 store 의 타임존(store→org→default 해석). 사진 워터마크 등 시각 표시를 store-tz 로 고정. */
  timezone?: string | null;
}

/** 체크리스트 인스턴스 아이템 파일 (제출/리뷰/채팅 첨부).
 * File attached to a checklist instance item. */
export interface ChecklistItemFile {
  id: string;
  context: "submission" | "review" | "chat";
  context_id: string | null;
  file_url: string;
  /** Thumbnail URL for grids; server falls back to full when no derivative exists. */
  thumb_url: string | null;
  file_type: string;
  sort_order: number;
  /** Claimed capture time from the device (live shutter or gallery EXIF), or null for legacy rows. */
  capture_time: string | null;
  /** Provenance of capture_time: "live" | "gallery" | "unknown". */
  capture_source: string | null;
  /** Server-received time — the trust anchor rendered as the photo watermark. */
  received_at: string | null;
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
  /** 수정 이력 개수 — list 응답에서 corrections 본문 없이 "수정됨" 표시용. */
  correction_count?: number;
  /** L6 자동퇴근 확인 시각 — 'auto_clocked_out' anomaly 인데 null 이면 "needs confirmation". */
  auto_clock_out_confirmed_at?: string | null;
  /** 확인자 UUID — 서버가 이름은 주지 않으므로 UI 에서 store users 로 resolve. */
  auto_clock_out_confirmed_by?: string | null;
  /** 조기 출근 강행 확인 시각 — 'early_clock_in_override' anomaly 인데 null 이면
   *  "needs confirmation" (payroll 확정도 이 값이 채워질 때까지 막힌다). */
  early_clock_in_confirmed_at?: string | null;
  /** 확인자 UUID. */
  early_clock_in_confirmed_by?: string | null;
}

/** 근태 수정 이력 응답 타입.
 *  Attendance correction audit trail response type. */
export interface AttendanceCorrection {
  id: string;
  /** 한 사용자 액션이 만든 행들을 한 카드로 묶는 키.
   *  null = 이 필드 도입 이전 레거시 행 → 시간 근접 휴리스틱으로 fallback. */
  group_id: string | null;
  /** 카드 태그 — 무엇을 했나 (clock_in / modify / break_added …).
   *  null = 레거시 행 → field_name 으로 fallback. */
  action: string | null;
  /** 전이 대상 항목 — 무엇이 바뀌었나 (status / clock_in / break_type …). */
  field_name: string;
  /** "attendance" | "break". null = 레거시(= attendance). */
  target_type: string | null;
  /** 하위 엔터티 식별자 (break 세션 id). 본체 전이면 null. */
  target_id: string | null;
  /** 전이 전 값. 신규 행은 항상 채워짐 — 비어 있던 값은 "(none)"/"(empty)" 센티널.
   *  null 은 레거시 행에서만 나온다. */
  original_value: string | null;
  corrected_value: string;
  reason: string | null;
  corrected_by: string;
  corrected_by_name: string | null;
  /** 기록 경로(채널) — console / console_compact / htma / staff_app /
   *  backoffice / system / api. null/미제공 = 채널 도입 전 레거시 행 → 칩 미표시. */
  channel?: string | null;
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
 *  reason: 필수 (preset label 또는 Other free-text). DB NOT NULL 과 일치. */
export interface AttendanceCorrectionRequest {
  field_name: string;
  corrected_value: string;
  reason: string;
}

/** 기존 correction 의 reason 만 갱신 (History 인라인 편집). */
export interface AttendanceCorrectionUpdateRequest {
  reason: string;
}

/** 시간 기반 액션 요청 (clock_in / clock_out / end_break). */
export interface AttendanceClockActionRequest {
  at: string; // ISO datetime
  reason: string;
}

/** Break 시작 요청 — break_type 필수. */
export interface AttendanceBreakStartRequest {
  at: string;
  break_type: "paid_10min" | "unpaid_meal";
  reason: string;
}

/** reason 만 받는 액션 (mark_no_show / cancel / reopen). */
export interface AttendanceReasonOnlyRequest {
  reason: string;
}

/** Break session 추가 요청 타입. 모든 새 쓰기는 paid_10min/unpaid_meal 사용. */
export interface BreakSessionCreateRequest {
  started_at: string; // ISO
  ended_at?: string | null;
  break_type: "paid_10min" | "unpaid_meal";
  /** 선택 사유 — preset 또는 free text. 비면 이력에 "(no reason)" 으로 남는다. */
  reason?: string | null;
}

/** Break session 수정 요청 타입. None 인 필드는 변경하지 않음. */
export interface BreakSessionUpdateRequest {
  started_at?: string | null;
  ended_at?: string | null;
  break_type?: "paid_10min" | "unpaid_meal" | null;
  clear_ended_at?: boolean;
  /** 선택 사유 — BreakSessionCreateRequest 와 동일 규칙. */
  reason?: string | null;
}

// Evaluation (v1) — canonical types live in ./evaluation, re-exported below.
export type {
  CriterionConfig,
  ScalePoint,
  TemplateConfig,
  EvalTemplate,
  EvaluationStatus,
  EvaluationScores,
  Evaluation,
  EvaluationCreate,
  EvaluationUpdate,
  EvaluationFilters,
  EvaluatableUser,
  EvaluatableUsersPage,
} from "./evaluation";

// Warning — canonical types live in ./warning, re-exported below.
export type {
  WarningStatus,
  WarningSignatureMethod,
  WarningCategory,
  WarningCategoryItem,
  WarningCategoryCreate,
  WarningCategoryUpdate,
  Warning,
  WarningCreate,
  WarningUpdate,
  WarningFilters,
  WarnableUser,
  WarnableUserStore,
  WarnableUsersPage,
  WarningCount,
  SignatureStrokes,
  SignatureMethod,
  SigInfo,
  SignParty,
  WarningSignatures,
  WarningSignRequest,
  MySignatureResponse,
} from "./warning";

// Contacts — canonical types live in ./contact, re-exported below.
export type {
  ContactVisibility,
  ContactTargetType,
  ContactTargetRef,
  ContactTargetInput,
  ContactViewer,
  ContactVisibilityPreview,
  ContactPhone,
  ContactPhoneInput,
  ContactTag,
  ContactTagSuggestion,
  Contact,
  ContactCreate,
  ContactUpdate,
  ContactDeleteRequest,
  ContactDeleteResult,
  ContactSort,
  ContactFilters,
  ContactRequestType,
  ContactRequestStatus,
  ContactRequestPayload,
  ContactRequestCreate,
  ContactChangeRequest,
  ContactRequestFilters,
  ContactRequestApprove,
  ContactRequestReject,
  ContactRequestApproveResult,
} from "./contact";
export { CONTACT_STORE_SHARED } from "./contact";

// Changelog — canonical types live in ./changelog, re-exported below.
export type {
  ChangelogCategory,
  ChangelogListItem,
  ChangelogDetail,
  ChangelogPaginatedResponse,
} from "./changelog";
export { CHANGELOG_CATEGORY_LABELS, CHANGELOG_CATEGORIES } from "./changelog";

// Work Availability — canonical types live in ./availability, re-exported below.
export type {
  AvailabilityState,
  AvailabilityDay,
  AvailabilityDayInput,
  AvailabilityMember,
  AvailabilityHistory,
  AvailabilityDetail,
  Preset,
} from "./availability";
export {
  DAY_LABELS,
  AVAIL_COLORS,
  OFF_HATCH,
  DEFAULT_RANGE,
  toRoutine,
  fmtDay,
  toDaysInput,
  validateRoutine,
  routinesEqual,
} from "./availability";

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
  /** 배정 직원의 FOH/BOH 분류 (스케줄 필터용, null=미지정) */
  user_department?: "FOH" | "BOH" | null;
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
  /** 영업일 라벨(전환기: work_date와 동기화). 물리 시각은 start_at/end_at. */
  operating_day?: string | null;
  /** 벽시계 datetime "YYYY-MM-DDTHH:MM" (store tz 해석). start_time보다 정확(자정 넘김). */
  start_at?: string | null;
  end_at?: string | null;
  break_start_at?: string | null;
  break_end_at?: string | null;
  /**
   * 시작이 자기 영업일 구간 `[day_start(D), day_start(D+1))` **밖**인가 (서버 판정).
   *
   * true 면 이 행은 현장에서 쓸 수 없다 — 출근하려는 시각의 영업일과 라벨이 달라
   * 후보 조회에 안 잡힌다. 저장 검증(400 START_DATE_MISMATCH) 이전 행·SQL 직접 수정·
   * 임포트·**매장 경계 설정을 나중에 바꾼 경우**가 여기 해당한다.
   * 화면은 이 행을 정상처럼 보이게 두지 않고 "에러 스케줄"로 드러낸다.
   */
  start_outside_operating_window?: boolean;
  net_work_minutes: number;
  /** 저장된 스냅샷 시급 (0이면 override 없음) */
  hourly_rate: number;
  /** Cascade(user → store → org)로 계산한 실효 시급. redact 시 null. */
  effective_rate: number | null;
  /** effective_rate 출처 레이어 */
  effective_rate_source: "schedule" | "user" | "store" | "org" | null;
  status: "draft" | "requested" | "confirmed" | "rejected" | "cancelled" | "deleted";
  /** 스케줄 출처: 'manual' = 관리자/직원 등록, 'walk_in' = 키오스크 워크인 클락인으로 자동 생성. */
  origin: "manual" | "walk_in";
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
  /** 전환기: 구(work_date+HH:MM) 또는 신(operating_day+ISO datetime) 중 하나. 신 우선. */
  work_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  operating_day?: string | null;
  /** 벽시계 ISO "YYYY-MM-DDTHH:MM" */
  start_at?: string | null;
  end_at?: string | null;
  break_start_at?: string | null;
  break_end_at?: string | null;
  /** Override the auto-calculated hourly rate. Omit to use org/store/user cascade. */
  hourly_rate?: number | null;
  note?: string | null;
  /** Initial status. Default 'confirmed' for direct admin creation. */
  status?: "draft" | "requested" | "confirmed";
  force?: boolean;
  /**
   * 시작 달력일을 **사람이 화면에서 직접 골랐다**는 의사표시.
   * 날짜는 (영업일, 시작 시각, 매장 경계)에서 하나로 결정되는 파생값이라, 표시 없이
   * 자동값과 다른 날짜가 오면 서버가 START_DATE_MISMATCH(400)로 차단한다.
   */
  date_override?: boolean;
}

/**
 * 프리뷰(/console/schedules/validate) 응답 — **항상 200**.
 * 항목은 문장이 아니라 `{code, params}` 다(D9-4). 문구는 `lib/scheduleCodes` 가 만든다.
 */
export interface ScheduleValidation {
  valid: boolean;
  warnings: ScheduleIssue[];
  errors: ScheduleIssue[];
}

export interface ScheduleBulkCreate {
  entries: ScheduleCreate[];
  skip_on_conflict?: boolean;
}

/** 벌크 항목 하나에 붙은 경고 — index 는 요청 entries 배열 위치. */
export interface BulkEntryWarnings {
  index: number;
  warnings: ScheduleIssue[];
}

export interface ScheduleBulkResult {
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
  items: Schedule[];
  /** 저장은 됐지만 확인이 필요한 항목들. 비어 있으면 경고 없음. */
  warnings?: BulkEntryWarnings[];
}

export interface ScheduleUpdate {
  user_id?: string | null;
  work_role_id?: string | null;
  work_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  operating_day?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  break_start_at?: string | null;
  break_end_at?: string | null;
  /** Override the auto-calculated hourly rate. Omit to use org/store/user cascade. */
  hourly_rate?: number | null;
  note?: string | null;
  force?: boolean;
  /**
   * 시작 달력일을 **사람이 화면에서 직접 골랐다**는 의사표시.
   * 날짜는 (영업일, 시작 시각, 매장 경계)에서 하나로 결정되는 파생값이라, 표시 없이
   * 자동값과 다른 날짜가 오면 서버가 START_DATE_MISMATCH(400)로 차단한다.
   */
  date_override?: boolean;
  /** 수정 사유 — schedule_audit_logs.reason 에 기록되어 History 에 노출된다.
   *  선택 입력이지만 compact 편집 경로는 항상 채워 보낸다 (근태 정정과 기록 수준을 맞추려고). */
  change_reason?: string | null;
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
  operating_day?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  break_start_at?: string | null;
  break_end_at?: string | null;
  note?: string | null;
  hourly_rate?: number | null;
  reset_checklist?: boolean | null;
  /**
   * 시작 달력일을 **사람이 화면에서 직접 골랐다**는 의사표시.
   * 날짜는 (영업일, 시작 시각, 매장 경계)에서 하나로 결정되는 파생값이라, 표시 없이
   * 자동값과 다른 날짜가 오면 서버가 START_DATE_MISMATCH(400)로 차단한다.
   */
  date_override?: boolean;
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

/** Access code 응답 — 서비스 키별 코드.
 * Access code response per service key (masked until revealed).
 * source: env(환경변수 주입) / auto(자동 생성) / manual(관리자 직접 설정) */
export interface AccessCode {
  service_key: string;
  code: string;
  source: "env" | "auto" | "manual";
  rotated_at: string | null;
  created_at: string;
}

/** 직원 개인 6자리 PIN 응답.
 * Per-staff 6-digit clock-in PIN. */
export interface ClockinPin {
  user_id: string;
  /** PIN 제거(DELETE) 후에는 null. */
  clockin_pin: string | null;
}

/** PIN 도구에서 보여주는 직원 한 명 (clockin_pin:read 권한자 전용 응답). */
export interface ClockinPinHolder {
  user_id: string;
  full_name: string;
  username: string | null;
  role_name: string | null;
  is_active: boolean;
  is_provisional: boolean;
  clockin_pin: string | null;
  /** lookup 응답에서만 채워짐 — 이 사람이 그 PIN 을 이미 쓰고 있으면 "exact". */
  conflict: "exact" | null;
}

/** GET /console/users/clockin-pin/lookup — 이 PIN 을 지금 배정할 수 있는가. */
export interface ClockinPinLookup {
  pin: string;
  available: boolean;
  /** 충돌 사유. 값은 exact 하나뿐 — 같은 번호를 이미 쓰는 사람이 있다는 뜻. */
  reason: "exact" | null;
  holders: ClockinPinHolder[];
}

/** GET /console/users/clockin-pin/directory — 이름/PIN 으로 직원 찾기. */
export interface ClockinPinDirectory {
  items: ClockinPinHolder[];
  /** 서버 상한에 걸려 잘렸는지 — true 면 검색어를 좁히라고 안내. */
  truncated: boolean;
}

/** GET /console/users/clockin-pin/suggest — 안 쓰이는 PIN 추천 (배정 안 함). */
export interface ClockinPinSuggestion {
  /** 해당 자릿수 공간이 꽉 찼으면 null. */
  pin: string | null;
  length: number;
}


// ── Unified Report (multi-type: daily, issue, ...) ──────────────

/** Multi-type report. type 디스크리미네이터 + payload jsonb. */
export interface Report {
  id: string;
  type: string;
  organization_id: string;
  store_id: string | null;
  store_name: string | null;
  template_id: string | null;
  author_id: string | null;
  author_name: string | null;
  title: string | null;
  status: string;
  report_date: string | null;
  submitted_at: string | null;
  // Deadline (store tz → UTC). null = no deadline rule for this period.
  deadline_at: string | null;
  is_overdue: boolean; // 마감 지남 + 미제출
  is_late: boolean; // 마감 이후 제출됨
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown>;
  comment_count: number;
  comments: ReportComment[];
  acknowledgement_count: number;
  acknowledgements: ReportAcknowledgement[];
}

export interface ReportComment {
  id: string;
  user_id: string | null;
  user_name?: string | null;
  content: string;
  created_at: string;
}

export interface ReportAcknowledgement {
  user_id: string;
  user_name: string | null;
  acknowledged_at: string;
}

/** daily report payload 본문 — period + 섹션별 작성 내용. */
export interface DailyReportPayloadSection {
  id?: string | null;
  title: string;
  content?: string | null;
  sort_order: number;
  template_section_id?: string | null;
}

export interface DailyReportPayload {
  period: string;
  sections?: DailyReportPayloadSection[];
}

// ── Report Types (daily 'period' 종류 — org-default + store override) ──

/** report_types raw row (org-default 또는 store override). */
export interface ReportType {
  id: string;
  organization_id: string;
  store_id: string | null;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  default_deadline_local_time: string | null; // "HH:MM"
  deadline_day_offset: number;
  created_at?: string | null;
  updated_at?: string | null;
}

/** 매장에 실제 적용되는 resolved report type (org+store 병합). */
export interface EffectiveReportType {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  default_deadline_local_time: string | null;
  deadline_day_offset: number;
  scope: "org" | "store";
  // 편집 시 PUT 대상 row id. 내장 기본값(DB row 없음)이면 null.
  id: string | null;
  // store override 가 가리키는 org-default row id.
  org_type_id: string | null;
}

export interface ReportTypeCreate {
  code: string;
  label: string;
  store_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
  default_deadline_local_time?: string | null;
  deadline_day_offset?: number;
}

export interface ReportTypeUpdate {
  label?: string;
  sort_order?: number;
  is_active?: boolean;
  default_deadline_local_time?: string | null;
  deadline_day_offset?: number;
}

export interface ReportFilters {
  type?: string;
  store_id?: string;
  date_from?: string;
  date_to?: string;
  period?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

// Issue payload shape (typed view of payload jsonb)
export const ISSUE_CATEGORIES = [
  "equipment",
  "safety",
  "customer",
  "staff",
  "inventory",
  "review",
  "other",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

/**
 * issue 템플릿의 카테고리 정의 (report_templates.payload.categories[]).
 *
 * description_template: 카테고리를 고르면 작성 화면 description 에 프리필할 원문.
 * 키가 없거나 null 이면 프리셋 없음 (하위호환 — 기존 템플릿은 키 자체가 없다).
 */
export interface IssueCategoryDef {
  code: string;
  label: string;
  color?: string | null;
  sort_order?: number;
  is_active?: boolean;
  description_template?: string | null;
}

/**
 * issue 조회 범위 — **확대 전용**. 축소 값은 만들지 않는다.
 * default   = 작성자 + 그 매장에 배정된 GM 이상 전원 + 지목된 사람 + Owner
 * managers  = + 그 매장 manager 전원(직급 무관)
 * store_all = + 그 매장 배정 인원 전원
 */
export const ISSUE_VISIBILITY_SCOPES = ["default", "managers", "store_all"] as const;
export type IssueVisibilityScope = (typeof ISSUE_VISIBILITY_SCOPES)[number];

export const ISSUE_VISIBILITY_SCOPE_LABELS: Record<
  IssueVisibilityScope,
  { label: string; description: string }
> = {
  default: {
    label: "Store leadership (default)",
    description:
      "The author, everyone ranked General Manager or above at this store, the managers above the author, and anyone the author added.",
  },
  managers: {
    label: "All managers of this store",
    description:
      "Every manager of this store can see it, regardless of rank — plus everyone in the default scope.",
  },
  store_all: {
    label: "Everyone at this store",
    description:
      "All staff assigned to this store can see it. Use for issues the whole team should know about.",
  },
};

/**
 * 수신자 조회 엔드포인트 항목 (GET /console|app/reports/issue-recipients).
 * 서버 스키마: app/schemas/report.py IssueRecipientItem — 필드를 바꿀 땐 3곳(server/console/app) 동시.
 */
export interface IssueRecipientItem {
  user_id: string;
  full_name: string;
  /** DB role name 원문 (owner / general_manager / supervisor / staff / 커스텀). */
  role_label: string;
  role_priority: number;
  /** "auto" = 그 매장 GM 이상(항상 수신·해제 불가), "added" = 콕 집어 추가한 사람. */
  source: "auto" | "added";
  is_recipient: boolean;
  /** 작성 화면에서 뺄 수 있는가. auto=false(잠김), added=true. */
  can_remove?: boolean;
}

export interface IssueRecipientsResponse {
  store_id: string;
  report_id: string | null;
  items: IssueRecipientItem[];
}

/**
 * 조회 범위 미리보기 (GET /console|app/reports/issue-viewers?scope=…).
 * 서버 스키마: app/schemas/report.py IssueExpectedViewersResponse.
 *
 * console 과 app 이 같은 body 를 쓴다 — 필드명을 바꾸면 세 repo 를 함께 고쳐야 한다.
 */
export interface IssueViewerItem {
  user_id: string;
  full_name: string;
  /** DB role name 원문. */
  role_label: string;
  role_priority: number;
  /** 코드값: "author" | "gm_or_above" | "store_manager" | "added". */
  reason: string;
  /** 그대로 화면에 찍는 영어 문구 (코드→문구 매핑을 클라가 또 만들지 않게 서버가 준다). */
  reason_label: string;
  /** 조회권만이 아니라 알림까지 받는가. */
  is_notified: boolean;
}

export interface IssueViewersSummary {
  label: string;
  count: number;
}

export interface IssueViewersResponse {
  store_id: string;
  report_id: string | null;
  scope: string;
  /** "list" = items 에 사람 목록, "summary" = items 비고 summary 만 (store_all). */
  mode: "list" | "summary";
  summary: IssueViewersSummary;
  items: IssueViewerItem[];
}

export const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = ["open", "in_progress", "closed"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export interface IssueAttachment {
  key: string;
  url?: string;
  mime_type?: string | null;
  kind?: "image" | "video" | null;
  name?: string | null;
  size?: number | null;
}

export interface IssueReportPayload {
  category: string; // store template의 카테고리 code (동적)
  severity: IssueSeverity;
  description?: string | null;
  attachments?: IssueAttachment[];
  links?: {
    schedule_ids?: string[];
    checklist_instance_ids?: string[];
    position_ids?: string[];
    work_role_ids?: string[];
    related_user_ids?: string[];
    related_roles?: string[];
  };
  /** 콕 집어 추가한 사람 — 조회권 + 이메일 알림을 함께 받는다. */
  extra_viewers?: {
    user_ids?: string[];
    position_ids?: string[];
  };
  /** 확대 전용 조회 범위. 키 없음 = "default". */
  visibility_scope?: IssueVisibilityScope;
  /**
   * @deprecated 레거시 키 — 매장 GM 이상은 항상 알림을 받으므로 서버가 무시한다.
   * 읽기 호환만 유지하고 새로 쓰지 않는다.
   */
  notify_excluded_user_ids?: string[];
  /**
   * 레거시 키 — true 면 visibility_scope="store_all" 로 읽힌다.
   * 신규 쓰기 금지(읽기 호환만 유지).
   */
  share_with_store_all?: boolean;
  custom_field_values?: Record<string, unknown>;
  // promote 시 채워짐. 신규 키는 linked_task_id, 구버전 데이터는 linked_issue_id 도 인식.
  linked_task_id?: string | null;
  linked_issue_id?: string | null;
}

// 신고 리포트(issue_report) 생성 요청
export interface IssueReportCreateRequest {
  type: "issue";
  store_id: string;
  title: string;
  report_date?: string;
  payload: IssueReportPayload;
}

// ── Task (work item: additional_tasks → issues → tasks) ──
// 명칭 변경 이력: additional_tasks → issues → tasks. issue report 와 단어가 겹쳐
// 혼동되어 tasks 로 정착.

export interface TaskAssignee {
  user_id: string | null;
  user_name: string | null;
}

export interface TaskLinks {
  schedule_ids?: string[];
  checklist_instance_ids?: string[];
  position_ids?: string[];
  work_role_ids?: string[];
  related_user_ids?: string[];
  related_roles?: string[];
}

export interface TaskAttachment {
  key: string;
  url?: string;
  mime_type?: string | null;
  kind?: "image" | "video" | "file" | null;
  name?: string | null;
  size?: number | null;
}

export type TaskStatus = "pending" | "in_progress" | "under_review" | "completed";

export interface Task {
  id: string;
  organization_id: string;
  // store scope — store_ids 가 정 (단일/다중/org-wide). store_id 는 legacy mirror.
  store_ids: string[];
  store_names: string[];
  store_id: string | null;
  store_name: string | null;
  title: string;
  description: string | null;
  priority: "normal" | "urgent";
  severity: IssueSeverity | null;
  category: string | null;
  status: TaskStatus;
  due_date: string | null;
  created_by: string | null;
  created_by_name: string | null;
  source_report_id: string | null;
  links?: TaskLinks;
  attachments?: TaskAttachment[];
  submitted_at?: string | null;
  submitted_by?: string | null;
  submitted_by_name?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  created_at: string;
  updated_at: string;
  assignees: TaskAssignee[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string | null;
  user_name: string | null;
  content: string;
  kind: "comment" | "system";
  attachments?: TaskAttachment[];
  created_at: string;
}

export interface TaskCreateRequest {
  // store_ids 가 정. 빈 array = org-wide. store_id (legacy) 도 받지만 권장은 store_ids.
  store_ids?: string[];
  store_id?: string | null;
  title: string;
  description?: string | null;
  priority?: "normal" | "urgent";
  severity?: IssueSeverity | null;
  category?: string | null;
  due_date?: string | null;
  assignee_ids?: string[];
  source_report_id?: string | null;
  links?: TaskLinks;
  attachments?: TaskAttachment[];
}

export interface TaskUpdateRequest {
  store_ids?: string[];
  title?: string;
  description?: string | null;
  priority?: "normal" | "urgent";
  severity?: IssueSeverity | null;
  category?: string | null;
  status?: TaskStatus;
  due_date?: string | null;
  assignee_ids?: string[];
  links?: TaskLinks;
  attachments?: TaskAttachment[];
}

export interface TaskTransitionRequest {
  status: TaskStatus;
  comment?: string;
  attachments?: TaskAttachment[];
}

export interface TaskCommentCreateRequest {
  content: string;
  attachments?: TaskAttachment[];
}

export interface TaskPromoteRequest {
  title?: string;
  description?: string | null;
  priority?: "normal" | "urgent";
  severity?: IssueSeverity | null;
  category?: string | null;
  due_date?: string | null;
  assignee_ids?: string[];
}
