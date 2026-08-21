/**
 * 직원 표시 이름 — 콘솔 전역에서 사람 이름을 화면에 쓰는 단 하나의 규칙.
 *
 * 왜 유틸인가 — `full_name || username` 이 콘솔 45곳에 하드코딩돼 있었다. 라벨에
 * EMPID 를 붙이거나 성-이름 순서를 바꾸는 순간 45곳을 찾아다녀야 하고, 그래서
 * 아무도 안 고친다. 규칙을 한 곳에 두면 한 번만 고치면 된다.
 *
 * full_name 이 비어 있는 경우 — 미가입(유령) 계정 생성 직후, 혹은 임포트 중간 상태.
 * 이때 username 으로 떨어지는 것이 지금까지의 관례라 그대로 유지한다.
 */

/** displayName 이 받는 최소 형태 — User 전체를 요구하지 않아 부분 데이터에도 쓸 수 있다. */
export interface NameLike {
  full_name?: string | null;
  username?: string | null;
}

/** 화면에 보여줄 직원 이름. */
export function displayName(user: NameLike | null | undefined): string {
  if (!user) return "";
  const full = user.full_name?.trim();
  if (full) return full;
  return user.username?.trim() ?? "";
}

/**
 * 검색 매칭용 문자열 — 사람을 **식별하는** 값들을 한 줄로 합쳐 소문자화.
 * 이름·username·EMPID·email 이 기본이다. 화면마다 다르던 매칭 대상을 통일한다.
 *
 * 역할(role)은 기본에서 뺐다 — 식별자가 아니라 분류라, 넣으면 "manager" 검색에
 * 매니저 전원이 걸린다. 그것을 의도한 화면(플레이스홀더에 "name or role" 이라
 * 적힌 곳)만 `{ includeRole: true }` 로 명시적으로 켠다.
 */
export function searchHaystack(
  user: NameLike & {
    employee_no?: string | null;
    email?: string | null;
    role_name?: string | null;
  },
  options?: { includeRole?: boolean },
): string {
  const parts = [user.full_name, user.username, user.employee_no, user.email];
  if (options?.includeRole) parts.push(user.role_name);
  return parts.filter(Boolean).join(" ").toLowerCase();
}
