# Employee Management Service — Admin (Next.js)

> **IMPORTANT**: Before implementing any feature, read the parent `../CLAUDE.md` and relevant task docs in `../docs/02_plan/`.
> Task documents are the Source of Truth for UI features, API integration, and permissions.
> Do NOT change existing screen layouts, color palette, or navigation structure without explicit request.

## Project Overview

Admin management console for multi-brand employee management. Next.js App Router with TypeScript. Dark theme UI.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **State**: Zustand (global) + React Query (server state)
- **HTTP**: Axios
- **Icons**: Lucide React
- **Font**: DM Sans + Pretendard

## Project Structure

```
admin/
├── CLAUDE.md              ← You are here
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local.example
├── public/
├── src/
│   ├── app/                 ← App Router pages
│   │   ├── layout.tsx        (root layout: font, providers)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── (dashboard)/      (authenticated layout group)
│   │   │   ├── layout.tsx    (sidebar + main content)
│   │   │   ├── page.tsx      (dashboard)
│   │   │   ├── brands/
│   │   │   │   ├── page.tsx  (brand list)
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx (brand detail: tabs)
│   │   │   ├── users/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── assignments/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── tasks/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── announcements/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   └── notifications/
│   │   │       └── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── ui/              (reusable primitives)
│   │   │   ├── Badge.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── ConfirmDialog.tsx
│   │   ├── brands/
│   │   │   ├── BrandTable.tsx
│   │   │   ├── BrandDetail.tsx
│   │   │   ├── ShiftTab.tsx
│   │   │   ├── PositionTab.tsx
│   │   │   └── ChecklistTab.tsx
│   │   ├── users/
│   │   │   ├── UserTable.tsx
│   │   │   └── UserDetail.tsx
│   │   ├── assignments/
│   │   │   ├── AssignmentView.tsx
│   │   │   ├── AssignmentDetail.tsx
│   │   │   └── AssignModal.tsx
│   │   ├── tasks/
│   │   │   ├── TaskList.tsx
│   │   │   └── TaskDetail.tsx
│   │   ├── announcements/
│   │   │   ├── AnnouncementTable.tsx
│   │   │   └── AnnouncementDetail.tsx
│   │   └── notifications/
│   │       └── NotificationList.tsx
│   ├── lib/
│   │   ├── api.ts            (Axios instance + interceptor)
│   │   ├── auth.ts           (token storage, refresh logic)
│   │   └── utils.ts          (formatDate, cn helper)
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useBrands.ts
│   │   ├── useUsers.ts
│   │   ├── useAssignments.ts
│   │   ├── useTasks.ts
│   │   ├── useAnnouncements.ts
│   │   └── useNotifications.ts
│   ├── stores/
│   │   └── authStore.ts      (Zustand: user, token, logout)
│   └── types/
│       ├── index.ts           (all type exports)
│       ├── auth.ts
│       ├── organization.ts
│       ├── user.ts
│       ├── brand.ts
│       ├── assignment.ts
│       ├── checklist.ts
│       ├── announcement.ts
│       ├── task.ts
│       └── notification.ts
└── middleware.ts             (auth redirect: /login ↔ /dashboard)
```

## Design System

### Color Palette (Dark Theme)

```typescript
const colors = {
  bg: "#0F1117",
  surface: "#1A1D27",
  surfaceHover: "#22252F",
  card: "#1E2130",
  border: "#2A2D3A",
  accent: "#6C5CE7",
  accentLight: "#7C6DF0",
  accentMuted: "rgba(108, 92, 231, 0.15)",
  success: "#00B894",
  successMuted: "rgba(0, 184, 148, 0.15)",
  warning: "#FDCB6E",
  warningMuted: "rgba(253, 203, 110, 0.15)",
  danger: "#FF6B6B",
  dangerMuted: "rgba(255, 107, 107, 0.15)",
  text: "#E8E8EF",
  textSecondary: "#8B8DA3",
  textMuted: "#5A5C6F",
};
```

### Navigation (Sidebar)

```
[● HTM]
[Admin Console]
─────────────
Dashboard
Brands
Staff
Assignments
Additional Tasks
Notices
Alerts (unread badge)
─────────────
[Avatar] Admin email [Logout]
```

- Sidebar: 240px fixed left
- Active item: accent background + bold
- Detail pages: highlight parent nav item

## Screens (20 total)

### Phase 1 (7 screens)
1. **Login** — Username/password, reject staff accounts
2. **Dashboard** — Stat cards (Total/Pending/InProgress/Completed/ExtraTasks), brand completion rates, recent notices
3. **Brands List** — Table with name, address, shift/position counts, status
4. **Brand Detail** — 3 tabs: Shifts, Positions, Checklists (NO staff tab)
5. **Staff List** — Filter by role/status, table with name/role/status
6. **Staff Detail** — Profile info, stats, recent assignments with progress
7. **Roles** — Admin-only CRUD for roles with level

### Phase 2 (5 screens)
8. **Checklist Templates** — Inside brand detail Checklists tab
9. **Checklist Template Detail** — Item list with drag-drop reorder
10. **Assignments** — Date navigator + brand/shift/position grouped cards
11. **Assignment Detail** — Checklist progress (read-only from admin)
12. **Assign Modal** — Brand → Shift/Position (cascade) → Staff checkboxes

### Phase 3 (8 screens)
13. **Notices List** — Table with title/target/author/date
14. **Notice Detail** — Full content + Edit/Delete buttons
15. **Notice Create** — Form
16. **Tasks List** — Cards with priority dot, status badge
17. **Task Detail** — Description + assignees + creator, 2-column layout
18. **Task Create Modal** — Form with assignee selection
19. **Alerts** — Accordion expand on click, detail + navigate button
20. **Alert Detail** — Inline in accordion (time, status, link)

## API Integration

### Base URL
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### Auth Flow
1. Login → POST `/admin/auth/login` → store tokens
2. Axios interceptor: attach `Authorization: Bearer {token}`
3. 401 response → try refresh → POST `/admin/auth/refresh`
4. Refresh fails → redirect to `/login`

### Data Fetching Pattern (React Query)
```typescript
// hooks/useBrands.ts
export function useBrands() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: () => api.get("/admin/brands").then(r => r.data),
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BrandCreate) => api.post("/admin/brands", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brands"] }),
  });
}
```

## Development Phases

### Phase 1 — Build in this order:
1. Project setup: Next.js + Tailwind + providers
2. Auth: login page, token storage, middleware redirect
3. Layout: sidebar, route structure
4. Dashboard page with stat cards
5. Brands list + detail (shifts/positions tabs)
6. Staff list + detail
7. Roles management

### Phase 2:
8. Checklist tab in brand detail
9. Checklist template detail with items
10. Assignments page with date navigator
11. Assignment detail
12. Assign work modal

### Phase 3:
13. Notices CRUD
14. Additional Tasks CRUD
15. Notifications with accordion

## Commands

```bash
# Install
npm install

# Dev
npm run dev        # localhost:3000

# Build
npm run build
npm start

# Lint
npm run lint
```

## Git Workflow

> 상세 규칙은 `../CLAUDE.md`의 "Git Branch Workflow" 참조.

- 브랜치 prefix: `feat/*`, `fix/*`, `docs/*`, `refactor/*`, `chore/*` (업무 성격에 맞게)
- **dev 머지는 반드시 사용자 허락 후 진행**
- docs 같은 경량 작업은 main에서 직접 분기 허용
- **AI Agent는 작업 시 무조건 worktree 사용**

## Permission System (MUST FOLLOW)

이 프로젝트는 Permission-Based RBAC를 사용한다. **매직넘버(10, 20, 30, 40) 직접 비교 절대 금지.**

### 접근 제어 — `hasPermission()` 우선 사용

```typescript
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";

const { hasPermission, isOwner, isGMPlus } = usePermissions();

// ✅ 올바른 패턴
if (hasPermission(PERMISSIONS.SCHEDULES_CREATE)) { ... }  // 접근 제어
if (isOwner) { ... }                                       // UI 표시용
if (isGMPlus) { ... }                                      // UI 표시용
```

### 새 페이지 추가 시

1. `src/lib/permissions.ts`의 `PAGE_PERMISSIONS`에 경로 → permission 코드 매핑 추가
2. 서버 `PERMISSION_REGISTRY`에 해당 코드가 있는지 확인 (없으면 서버에 먼저 추가)
3. 페이지 내 버튼/액션은 `hasPermission(PERMISSIONS.XXX)`으로 조건부 렌더링
4. **PERMISSIONS 상수 밖에서 permission 코드 문자열을 임의 사용 금지**

### 금지 패턴

```typescript
// ❌ 절대 하지 말 것
if (role_priority <= 10)                    // → isOwner
if (role_priority <= 20)                    // → isGMPlus
if (priority <= 30)                         // → isSVPlus
const isGM = user?.role_priority <= 20;     // → usePermissions().isGMPlus
if (name.includes("owner"))                 // → isOwner (문자열 비교 금지)
```

### 상수 위치

- `src/lib/permissions.ts` — `PERMISSIONS` (코드), `ROLE_PRIORITY` (상수)
- `src/hooks/usePermissions.ts` — `hasPermission()`, `isOwner`, `isGMPlus`, `isSVPlus`

## Coding Conventions

- Use Server Components by default, `"use client"` only when needed
- Keep page.tsx thin: import components, pass params
- All API calls in `hooks/` using React Query
- Type everything: no `any`
- Tailwind for all styling, custom theme colors in config
- Components: PascalCase files, one component per file
- Use `cn()` helper for conditional classes (clsx + tailwind-merge)

## Result Feedback Policy (반드시 따를 것)

사용자 액션 결과는 일관된 패턴으로 표시한다.

### MODAL (`useResultModal` / `ResultModal` / `AppModal`)

자동 dismiss 안 함, 사용자가 OK 눌러야 닫힘. 화면 중앙.

다음의 경우 **반드시 모달**:

- 명시적 사용자 액션 결과 (생성/수정/삭제/확정/취소/제출/전송 등)
- 폼 제출 결과 (입력값 손실 방지)
- 권한/인증/세션 만료 오류
- 네트워크/서버 오류 (재시도 필요한 경우)
- bulk 작업 결과 (부분 실패 시 `details` bullet 표시)
- 영구 변경 / 결제 / 게시 / 송신
- 회원가입 / 로그인 결과

### TOAST (`useToast` / `ToastManager.info`)

자동 사라짐. 가벼운 정보용.

다음에만 사용:

- "Copied to clipboard"
- 광학적 reorder/sort/copy-paste 즉시 시각 피드백 동반된 micro 작업
- 자동 백그라운드 sync 결과 (사용자 의도 X)

### Hook 패턴

```typescript
import { useMutationResult } from "@/lib/mutationResult";

const { success, error } = useMutationResult();
return useMutation({
  mutationFn,
  onSuccess: () => success("X created."),
  onError: error("Couldn't create X"),
});
```

### Component 패턴

```typescript
import { useResultModal } from "@/components/ui/ResultModal";

const { showSuccess, showError } = useResultModal();
// ...
showSuccess("Saved.");
showError(parseApiError(err, "Unexpected error"), { title: "Couldn't save" });
```

### Flutter 패턴

```dart
import '../../widgets/app_modal.dart';

await AppModal.show(context, title: 'Saved', message: '...', type: ModalType.success);
await AppModal.show(context, title: 'Couldn\'t save', message: '...', type: ModalType.error);
```

### parseApiError

광범위한 "Failed to do X" fallback 대신 `parseApiError(err, "Unexpected error")` 사용.
status code (401/403/404/408/409/413/422/429/5xx)와 `detail`/`message` 필드를 자동
가공하여 친화 메시지 반환.
