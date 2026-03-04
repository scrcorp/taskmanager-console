# Admin 파일 분석 — 삭제 가능 vs 유지 필요

> 전체 87개 파일 분석 결과.
> 최종 업데이트: 2026-03-04

---

## 삭제 가능한 파일 (2개)

### 1. `src/components/ui/Tabs.tsx`

- **상태**: 미사용 (어디에서도 import하지 않음)
- **이유**: `components/ui/index.ts`에서 export하지만 실제 페이지에서 사용하는 곳 없음
- **삭제 시 필요 작업**: `components/ui/index.ts`에서 `export { Tabs }` 라인 제거
- **위험도**: 없음 — 빌드/런타임에 영향 없음

### 2. `src/components/ui/ImageUpload.tsx`

- **상태**: 미사용 (어디에서도 import하지 않음)
- **이유**: `components/ui/index.ts`에서 export하지만 실제 페이지에서 사용하는 곳 없음
- **비고**: Presigned URL 기반 파일 업로드 컴포넌트. 향후 프로필 사진, 체크리스트 사진 업로드 기능에서 필요할 수 있음
- **삭제 시 필요 작업**: `components/ui/index.ts`에서 `export { ImageUpload }` 라인 제거
- **위험도**: 낮음 — 향후 기능 구현 시 다시 만들어야 할 수 있음
- **권장**: 당장 삭제보다는 유지 권장 (향후 사용 가능성 높음)

---

## 유지해야 하는 파일 (85개)

### 핵심 인프라 (반드시 유지)

| 파일 | 유지 이유 |
|------|-----------|
| `lib/api.ts` | 전체 API 통신의 핵심 — Axios 인스턴스, JWT 토큰 갱신, 목 모드 |
| `lib/auth.ts` | 인증 상태 관리 — 토큰/회사코드 localStorage 처리 |
| `lib/permissions.ts` | 권한 코드 상수 — RBAC 체계 전체가 의존 |
| `lib/utils.ts` | 유틸리티 — cn(), 날짜 포맷팅, 페이지 계산 (전역 사용) |
| `stores/authStore.ts` | Zustand 인증 스토어 — login/logout/fetchMe (전역 사용) |
| `stores/sidebarStore.ts` | 사이드바 상태 — 모바일 레이아웃에서 사용 |
| `types/index.ts` | 전체 타입 정의 — 모든 훅과 컴포넌트가 의존 |
| `app/layout.tsx` | 루트 레이아웃 — 앱 진입점 |
| `app/providers.tsx` | 클라이언트 프로바이더 — React Query + Theme |
| `app/globals.css` | 전역 스타일 + 다크 테마 CSS 변수 |
| `app/login/page.tsx` | 로그인 — 인증 진입점 |
| `app/(dashboard)/layout.tsx` | 대시보드 레이아웃 — 인증 체크 + 사이드바 |

### UI 컴포넌트 (16개 활성 사용)

| 파일 | 사용처 수 | 비고 |
|------|-----------|------|
| `Button.tsx` | 16+ | 가장 많이 사용되는 컴포넌트 |
| `Badge.tsx` | 13+ | 상태 표시에 광범위 사용 |
| `Toast.tsx` | 19+ | useToast 전역 사용 |
| `Modal.tsx` | 11+ | 생성/수정 폼에 사용 |
| `Card.tsx` | 10+ | 페이지 레이아웃 래퍼 |
| `LoadingSpinner.tsx` | 9+ | 로딩 상태 표시 |
| `Table.tsx` | 5+ | 목록 페이지 테이블 |
| `Input.tsx` | 5+ | 폼 입력 필드 |
| `Select.tsx` | 5+ | 필터/폼 드롭다운 |
| `ConfirmDialog.tsx` | 5+ | 삭제 확인 다이얼로그 |
| `EmptyState.tsx` | 3+ | 데이터 없을 때 표시 |
| `Pagination.tsx` | 3+ | 목록 페이지네이션 |
| `Lightbox.tsx` | 1 | 체크리스트 사진 전체화면 뷰 |
| `CompanyCodeModal.tsx` | 1 | 로그인 페이지 회사코드 입력 |
| `SortableList.tsx` | 3+ | 교대/직책/체크리스트 항목 드래그 정렬 |
| `Textarea.tsx` | 1 | 체크리스트 항목 설명 입력 |
| `index.ts` | - | 배럴 내보내기 (편의성) |

### 훅 (21개 전부 활성)

모든 훅이 최소 1개 이상의 페이지에서 사용됨. 특히:
- `usePermissions.ts` — 권한 체크에 전역 사용
- `useDashboard.ts` — 대시보드 4개 쿼리
- `useChecklists.ts` — 템플릿 + 항목 8개 훅
- `useUsers.ts` — 직원 관리 9개 훅

### 목 모드 (2개 유지)

| 파일 | 유지 이유 |
|------|-----------|
| `mocks/adapter.ts` | `lib/api.ts`에서 import — 백엔드 없이 개발/테스트 가능 |
| `mocks/data.ts` | `adapter.ts`에서 import — 목 데이터 제공 |

### 테스트 (12개 유지)

모든 테스트 파일은 대응하는 소스 파일의 동작을 검증. 삭제 불가.

### 페이지 (23개 전부 유지)

모든 페이지 파일은 라우팅에 의해 직접 사용됨. 삭제 시 해당 URL 접근 불가.

### 체크리스트 컴포넌트 (4개 유지)

| 파일 | 유지 이유 |
|------|-----------|
| `ChecklistInstanceTable.tsx` | 인스턴스 목록 페이지에서 사용 |
| `ChecklistInstanceDetail.tsx` | 인스턴스 상세 페이지에서 사용 |
| `ChecklistItemRow.tsx` | 상세 페이지 내 항목 행 렌더링 |
| `ReviewChatModal.tsx` | 상세 페이지 내 리뷰 채팅 모달 |

### 레이아웃 컴포넌트 (2개 유지)

| 파일 | 유지 이유 |
|------|-----------|
| `Sidebar.tsx` | 대시보드 레이아웃에서 사용 — 네비게이션 핵심 |
| `ThemeToggle.tsx` | 사이드바에서 사용 — 테마 전환 |

---

## 요약

| 분류 | 파일 수 | 비고 |
|------|---------|------|
| 삭제 가능 (확실) | 1 | `Tabs.tsx` |
| 삭제 가능 (유보) | 1 | `ImageUpload.tsx` — 향후 사용 가능성으로 유지 권장 |
| 유지 필요 | 85 | 전부 활성 사용 중 |
| **합계** | **87** | |

---

## 참고: 저사용 파일 (삭제 대상 아님)

아래 파일들은 사용처가 1곳이지만 해당 기능에 필수적이므로 유지:

- `Lightbox.tsx` — 체크리스트 사진 뷰어 (ReviewChatModal에서 사용)
- `CompanyCodeModal.tsx` — 로그인 페이지 전용
- `Textarea.tsx` — 체크리스트 항목 설명 입력
- `ClearButton` (Button.tsx 내) — 필터 초기화 버튼
