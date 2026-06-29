/**
 * 매장 코드 자동 생성 미리보기 — 서버의 _generate_unique_code 로직을 그대로 미러링.
 *
 * Client-side preview of the auto-generated store code, mirroring the server's
 * StoreService._generate_unique_code: first 3 alphanumerics uppercased
 * (fallback "STO" when fewer than 2), then 2/3/4… suffix on org-scoped collision.
 *
 * 빈 코드로 매장을 만들 때 실제로 부여될 코드를 placeholder로 보여주기 위함.
 *
 * 서버와 정확히 같은 코드를 보여주기 위해 빈/한글 전용 이름도 폴백(STO)으로 처리한다.
 * 호출 측에서 이름이 비었을 때는 미리보기를 띄우지 않도록 가드한다.
 *
 * @param name - 매장 이름 (Store name to derive from)
 * @param existingCodes - org 내 사용 중인 코드들 (live, 즉 폐점 제외 매장의 코드)
 * @returns 자동 생성될 코드 (항상 2-10 alnum)
 */
export function previewStoreCode(
  name: string,
  existingCodes: Iterable<string>,
): string {
  const alnum: string = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let base: string = alnum.slice(0, 3);
  if (base.length < 2) {
    // 한글 등 영숫자가 부족하면 'STO'로 폴백 (서버와 동일)
    base = (base + "STORE").slice(0, 3);
  }

  const taken = new Set<string>();
  for (const c of existingCodes) {
    if (c) taken.add(c.toUpperCase());
  }

  let candidate: string = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}
