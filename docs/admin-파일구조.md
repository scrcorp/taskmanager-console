# Admin 프로젝트 파일 구조

> Next.js 15 App Router + TypeScript 기반 관리자 콘솔.
> 최종 업데이트: 2026-03-04

## 디렉토리 개요

```
admin/src/
├── __tests__/          ← Vitest 단위 테스트
├── app/                ← Next.js App Router 페이지
├── components/         ← React 컴포넌트
├── hooks/              ← React Query + 커스텀 훅
├── lib/                ← 유틸리티, API 클라이언트, 인증
├── mocks/              ← 목 모드 어댑터 + 테스트 데이터
├── stores/             ← Zustand 전역 상태
└── types/              ← TypeScript 타입 정의
```

---

## 1. `app/` — 페이지 라우팅

Next.js App Router 구조. `(dashboard)`는 인증 필요한 레이아웃 그룹.

| 파일 | 설명 |
|------|------|
| `layout.tsx` | 루트 레이아웃 — HTML/body + Providers (React Query, Theme) |
| `providers.tsx` | 클라이언트 프로바이더 — QueryClientProvider + ThemeProvider |
| `globals.css` | Tailwind CSS v4 전역 스타일 + 다크 테마 변수 |
| `login/page.tsx` | 로그인 페이지 — 회사코드 + 아이디/비밀번호 인증 |

### `(dashboard)/` — 인증된 사용자 페이지

| 파일 | 설명 |
|------|------|
| `layout.tsx` | 대시보드 레이아웃 — 사이드바(데스크탑) + 햄버거 메뉴(모바일) + 인증 체크 |
| `page.tsx` | 대시보드 — 통계 카드, 매장별 체크리스트 완료율, 최근 공지 |

### `(dashboard)/stores/` — 매장 관리

| 파일 | 설명 |
|------|------|
| `page.tsx` | 매장 목록 — 검색, 생성 모달, 테이블 (이름, 주소, 교대/직책 수, 상태) |
| `[id]/page.tsx` | 매장 상세 — 탭 구조 (교대, 직책, 체크리스트) + 수정/삭제 |

### `(dashboard)/users/` — 직원 관리

| 파일 | 설명 |
|------|------|
| `page.tsx` | 직원 목록 — 역할/상태/매장 필터, 생성 모달, 테이블 |
| `[id]/page.tsx` | 직원 상세 — 프로필, 역할, 소속 매장 관리, 최근 배정 |

### `(dashboard)/schedules/` — 스케줄 관리

| 파일 | 설명 |
|------|------|
| `page.tsx` | 스케줄 허브 — 배정 캘린더/교대 관리/스케줄 관리 네비게이션 |
| `[id]/page.tsx` | 배정 상세 — 체크리스트 진행 상황, 완료 항목 뷰 |
| `list/page.tsx` | 배정 목록 — 매장/직원/기간/상태 필터, 초과근무 경고, 테이블 |
| `completion-log/page.tsx` | 완료 로그 — 체크리스트 완료 이력 조회 (정렬/검색) |
| `manage/page.tsx` | 스케줄 관리 목록 — 스케줄 생성/조회 |
| `manage/new/page.tsx` | 스케줄 생성 — 폼 |
| `manage/[id]/page.tsx` | 스케줄 상세 — 편집/삭제 |

### `(dashboard)/checklists/` — 체크리스트

| 파일 | 설명 |
|------|------|
| `page.tsx` | 체크리스트 허브 — 템플릿/인스턴스 네비게이션 |
| `instances/page.tsx` | 인스턴스 목록 — 날짜/매장/상태 필터, 테이블 |
| `instances/[id]/page.tsx` | 인스턴스 상세 — 항목별 완료 상태, 사진/메모 |

### `(dashboard)/tasks/` — 추가 업무

| 파일 | 설명 |
|------|------|
| `page.tsx` | 업무 목록 — 우선순위/상태 필터, 카드 레이아웃 |
| `[id]/page.tsx` | 업무 상세 — 설명, 담당자, 상태, 생성자 |

### `(dashboard)/announcements/` — 공지사항

| 파일 | 설명 |
|------|------|
| `page.tsx` | 공지 목록 — 테이블 (제목, 대상, 작성자, 날짜) |
| `[id]/page.tsx` | 공지 상세 — 내용, 수정/삭제 |

### `(dashboard)/notifications/` — 알림

| 파일 | 설명 |
|------|------|
| `page.tsx` | 알림 목록 — 아코디언, 읽음/전체읽음 처리, 관련 페이지 이동 |

### `(dashboard)/attendances/` — 근태 관리

| 파일 | 설명 |
|------|------|
| `page.tsx` | 근태 목록 — 날짜/매장/직원 필터, 테이블 |
| `[id]/page.tsx` | 근태 상세 — 출퇴근 시간, 근무시간, 위치 |

### `(dashboard)/evaluations/` — 평가

| 파일 | 설명 |
|------|------|
| `page.tsx` | 평가 목록 — 매장/기간 필터, 평가 카드 |

---

## 2. `components/` — React 컴포넌트

### `components/ui/` — 재사용 UI 프리미티브

| 파일 | 설명 |
|------|------|
| `index.ts` | 배럴 내보내기 — 모든 UI 컴포넌트를 한 곳에서 import |
| `Badge.tsx` | 뱃지 — variant (default, accent, success, warning, danger) |
| `Button.tsx` | 버튼 — variant (primary, secondary, danger, ghost) + size + ClearButton |
| `Card.tsx` | 카드 — 배경/테두리 래퍼 + 커스텀 padding |
| `CompanyCodeModal.tsx` | 회사 코드 모달 — 6자리 영숫자 입력, localStorage 저장 |
| `ConfirmDialog.tsx` | 확인 다이얼로그 — 삭제/위험 작업 전 확인 |
| `EmptyState.tsx` | 빈 상태 — 아이콘 + 메시지 + 선택적 액션 버튼 |
| `ImageUpload.tsx` | 이미지 업로드 — Presigned URL 패턴, 드래그앤드롭, 미리보기 |
| `Input.tsx` | 입력 — 라벨 + 에러 메시지 + 다크 테마 스타일 |
| `Lightbox.tsx` | 라이트박스 — 이미지/동영상 전체화면 뷰어 (줌, 드래그, ESC) |
| `LoadingSpinner.tsx` | 로딩 스피너 — 크기 변형 (sm, md, lg) |
| `Modal.tsx` | 모달 — 오버레이 + 크기 (sm, md, lg, xl) + ESC 닫기 |
| `Pagination.tsx` | 페이지네이션 — 이전/다음 + 페이지 번호 |
| `Select.tsx` | 셀렉트 — options 배열 기반, 라벨 + 에러 |
| `SortableList.tsx` | 정렬 리스트 — dnd-kit 드래그앤드롭, 수정/삭제 액션 |
| `Table.tsx` | 테이블 — 제네릭 `T extends { id?: string }`, 정렬/모바일 숨김 |
| `Tabs.tsx` | 탭 — 활성 탭 accent 스타일 |
| `Textarea.tsx` | 텍스트영역 — 라벨 + 에러 + 자동 크기 조절 |
| `Toast.tsx` | 토스트 — type (success, error, info), 자동 사라짐 |

### `components/layout/` — 레이아웃 컴포넌트

| 파일 | 설명 |
|------|------|
| `Sidebar.tsx` | 사이드바 — 네비게이션 메뉴 + 사용자 정보 + 로그아웃 + 테마 토글 |
| `ThemeToggle.tsx` | 테마 토글 — system → light → dark 순환 (next-themes) |

### `components/checklists/` — 체크리스트 전용 컴포넌트

| 파일 | 설명 |
|------|------|
| `ChecklistInstanceTable.tsx` | 인스턴스 테이블 — 날짜/매장/상태별 필터링 테이블 |
| `ChecklistInstanceDetail.tsx` | 인스턴스 상세 — 항목별 완료 상태 + 사진/메모/리뷰 |
| `ChecklistItemRow.tsx` | 체크리스트 항목 행 — 완료 체크, 사진, 메모 표시 |
| `ReviewChatModal.tsx` | 리뷰 채팅 모달 — SV/GM 리뷰 대화 뷰 |

---

## 3. `hooks/` — 데이터 조회/변경 훅

React Query 기반. 각 훅은 `useQuery`(조회) 또는 `useMutation`(변경) 패턴.

| 파일 | 설명 |
|------|------|
| `index.ts` | 배럴 내보내기 |
| `useAnnouncements.ts` | 공지사항 CRUD |
| `useAssignments.ts` | 근무 배정 CRUD + 일괄 생성 |
| `useAttendances.ts` | 근태 기록 조회/수정 |
| `useChecklistInstances.ts` | 체크리스트 인스턴스 조회/수정 |
| `useChecklists.ts` | 체크리스트 템플릿 + 항목 CRUD |
| `useCompletionLog.ts` | 체크리스트 완료 로그 조회 |
| `useDashboard.ts` | 대시보드 통계 (요약, 매장별 완료율, 최근 공지, 최근 배정) |
| `useEvaluations.ts` | 평가 CRUD + 체크리스트 기반 요약 |
| `useLaborLaw.ts` | 근로기준법 설정 조회/수정 |
| `useNotifications.ts` | 알림 조회 + 읽음 처리 + 미읽음 수 |
| `useOvertimeAlerts.ts` | 초과근무 경고 목록 조회 |
| `usePermissions.ts` | 권한 체크 — `hasPermission(code)` + priority 비교 |
| `usePositions.ts` | 매장별 직책 CRUD |
| `useRoles.ts` | 역할 CRUD |
| `useSchedules.ts` | 스케줄 CRUD + 교대 프리셋 연동 |
| `useShiftPresets.ts` | 교대 프리셋 CRUD |
| `useShifts.ts` | 매장별 교대 CRUD |
| `useStores.ts` | 매장 CRUD |
| `useTasks.ts` | 추가 업무 CRUD |
| `useUsers.ts` | 직원 CRUD + 매장 배정 관리 |

---

## 4. `lib/` — 유틸리티 라이브러리

| 파일 | 설명 |
|------|------|
| `api.ts` | Axios 인스턴스 — JWT 토큰 자동 첨부, 401 시 토큰 갱신 (mutex queue), 목 모드 인터셉터 |
| `auth.ts` | 인증 유틸리티 — localStorage 기반 토큰/회사코드 관리 |
| `permissions.ts` | 권한 코드 상수 — `resource:action` 형식 34개 |
| `utils.ts` | 유틸리티 — cn() 클래스 병합, 날짜 포맷팅 (3종류), 페이지 계산 |

---

## 5. `mocks/` — 목 모드

| 파일 | 설명 |
|------|------|
| `adapter.ts` | Axios 모킹 어댑터 — URL 패턴 매칭으로 목 데이터 반환 |
| `data.ts` | 목 데이터 — 테스트용 매장/직원/배정/체크리스트 등 |

---

## 6. `stores/` — 전역 상태 (Zustand)

| 파일 | 설명 |
|------|------|
| `authStore.ts` | 인증 스토어 — user 상태, login/logout/fetchMe 액션 |
| `sidebarStore.ts` | 사이드바 스토어 — 모바일 사이드바 열림/닫힘 상태 |

---

## 7. `types/` — TypeScript 타입 정의

| 파일 | 설명 |
|------|------|
| `index.ts` | 전체 타입 정의 — 인증, 조직, 사용자, 매장, 배정, 체크리스트, 공지, 업무, 알림, 평가, 스케줄, 근태 등 모든 도메인 타입 |

---

## 8. `__tests__/` — 단위 테스트 (Vitest)

### `__tests__/lib/`

| 파일 | 설명 |
|------|------|
| `auth.test.ts` | auth 유틸리티 테스트 — 토큰 관리 + 회사 코드 관리 |
| `utils.test.ts` | utils 테스트 — 날짜 포맷팅 + 페이지 계산 |

### `__tests__/stores/`

| 파일 | 설명 |
|------|------|
| `authStore.test.ts` | authStore 테스트 — login/logout/fetchMe 동작 검증 |

### `__tests__/hooks/`

| 파일 | 설명 |
|------|------|
| `useAnnouncements.test.ts` | 공지사항 훅 테스트 — 목록/상세/생성/수정/삭제 |
| `useAssignments.test.ts` | 근무 배정 훅 테스트 — 목록/상세/생성/일괄생성/삭제 |
| `useChecklists.test.ts` | 체크리스트 훅 테스트 — 템플릿 + 항목 CRUD |
| `useNotifications.test.ts` | 알림 훅 테스트 — 목록/미읽음수/읽음처리/전체읽음 |
| `useRoles.test.ts` | 역할 훅 테스트 — 목록/생성/수정/삭제 |
| `useShiftsPositions.test.ts` | 교대+직책 훅 테스트 — 각각 CRUD |
| `useStores.test.ts` | 매장 훅 테스트 — 목록/생성/삭제 + 에러 처리 |
| `useTasks.test.ts` | 추가 업무 훅 테스트 — 목록/상세/생성/수정/삭제 |
| `useUsers.test.ts` | 직원 훅 테스트 — CRUD + 활성 토글 + 매장 배정 |

---

## 총 파일 수

| 분류 | 파일 수 |
|------|---------|
| 페이지 (app/) | 23 |
| 컴포넌트 (components/) | 22 |
| 훅 (hooks/) | 21 |
| 라이브러리 (lib/) | 4 |
| 목 (mocks/) | 2 |
| 스토어 (stores/) | 2 |
| 타입 (types/) | 1 |
| 테스트 (__tests__/) | 12 |
| **합계** | **87** |
