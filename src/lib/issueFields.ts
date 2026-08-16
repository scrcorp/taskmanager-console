/**
 * 이슈 폼 필드 해석 — 서버 `app/core/issue_fields.py` 의 `resolve_issue_fields` 와
 * **같은 규칙**이어야 한다. 어긋나면 화면에 안 보이는 필드가 서버에서 required 로 걸리거나,
 * 보이는데 저장이 안 되는 상황이 생긴다.
 *
 * 규칙:
 *  - 표시 대상 = 전역 `custom_fields` + 선택된 카테고리의 `fields`
 *  - 순서 = `field_order` 기준. 목록에 없는 필드는 뒤에 `sort_order` 순으로 붙는다
 *  - `__` 접두(=표준 필드 자리표시자)는 커스텀 필드가 아니므로 제외
 */

export interface IssueFieldDef {
  type: "short_text" | "long_text" | "number" | "single_choice" | "multi_choice";
  id: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  helper_text?: string;
  options?: string[];
  max_length?: number;
  min?: number;
  max?: number;
  decimals?: number;
  sort_order?: number;
}

interface TemplatePayloadish {
  custom_fields?: IssueFieldDef[];
  categories?: { code: string; fields?: IssueFieldDef[] }[];
  field_order?: string[];
}

export function resolveIssueFields(
  payload: TemplatePayloadish | null | undefined,
  categoryCode: string | null | undefined,
): IssueFieldDef[] {
  const tpl = payload ?? {};
  const merged: IssueFieldDef[] = [...(tpl.custom_fields ?? [])];

  if (categoryCode) {
    const cat = (tpl.categories ?? []).find((c) => c.code === categoryCode);
    if (cat?.fields) merged.push(...cat.fields);
  }

  // id 중복 시 카테고리 필드가 전역을 덮는다 (서버와 동일).
  const byId = new Map<string, IssueFieldDef>();
  for (const f of merged) {
    if (f?.id) byId.set(f.id, f);
  }

  const order = (tpl.field_order ?? []).filter((k) => !k.startsWith("__"));
  const out: IssueFieldDef[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    const f = byId.get(key);
    if (f && !seen.has(key)) {
      out.push(f);
      seen.add(key);
    }
  }
  const rest = [...byId.entries()]
    .filter(([id]) => !seen.has(id))
    .map(([, f]) => f)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return [...out, ...rest];
}

/**
 * 제출용 값 정규화 — **물어본 필드는 전부 키를 만든다. 미응답은 null.**
 * 그래야 서버·조회 화면에서 "안 물어봄"(키 없음)과 구분된다.
 */
export function normalizeIssueFieldValues(
  fields: IssueFieldDef[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = answers[f.id];
    out[f.id] = v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
      ? null
      : v;
  }
  return out;
}
