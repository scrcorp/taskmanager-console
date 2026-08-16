/**
 * 가시성 표시 문구 — 목록 행 / 상세 / 신청 diff 가 **같은 문구**를 쓰게 모아 둔다.
 *
 * 셋이 제각기 문자열을 만들면 같은 상태가 화면마다 달라 보인다.
 * 대상은 매장/직급/개인 3축이 섞여 들어오므로(V4), 요약할 때 **축을 뭉개지 않는다** —
 * "3 targets" 처럼 적으면 누가 보는지 감이 안 온다.
 */

import type { Contact, ContactTargetRef, ContactTargetType } from "@/types";

const TYPE_LABEL: Record<ContactTargetType, { one: string; many: string }> = {
  store: { one: "store", many: "stores" },
  role: { one: "role", many: "roles" },
  user: { one: "person", many: "people" },
};

/** 축 순서 고정 — 매장 → 직급 → 개인. 요청마다 순서가 흔들리면 눈으로 대조가 안 된다. */
const TYPE_ORDER: ContactTargetType[] = ["store", "role", "user"];

function groupByType(targets: ContactTargetRef[]): Map<ContactTargetType, ContactTargetRef[]> {
  const map = new Map<ContactTargetType, ContactTargetRef[]>();
  for (const t of TYPE_ORDER) {
    const found = targets.filter((x) => x.type === t);
    if (found.length > 0) map.set(t, found);
  }
  return map;
}

/**
 * 목록 행처럼 좁은 자리 — 첫 대상 이름 + 나머지 개수.
 *
 * 전 조직 공유는 "All stores" 를 그대로 쓴다(기존 문구 유지).
 */
export function visibilityLabel(contact: {
  visibility: Contact["visibility"];
  targets: ContactTargetRef[];
}): string {
  if (contact.visibility === "organization") return "All stores";
  if (contact.targets.length === 0) {
    // 대상이 전부 삭제된 경우. 조용히 "전체 공유"로 보이면 실제 가시성과 반대로 읽힌다.
    return "No one (owners only)";
  }
  const ordered = TYPE_ORDER.flatMap((t) => contact.targets.filter((x) => x.type === t));
  const [first, ...rest] = ordered;
  return rest.length === 0 ? first.name : `${first.name} +${rest.length}`;
}

/** 상세 모달처럼 넓은 자리 — 축별로 묶어 문장으로. */
export function visibilitySentence(contact: Contact): string {
  if (contact.visibility === "organization") {
    return "Shared with the whole organization";
  }
  if (contact.targets.length === 0) {
    return "No targets selected — only owners and the creator can see this";
  }
  const parts: string[] = [];
  for (const [type, items] of groupByType(contact.targets)) {
    const label = items.length === 1 ? TYPE_LABEL[type].one : TYPE_LABEL[type].many;
    parts.push(`${label} ${items.map((i) => i.name).join(", ")}`);
  }
  const base = `Visible to ${parts.join("; ")} (plus owners and the creator)`;
  if (contact.excluded_users.length === 0) return base;
  // 제외는 반드시 드러낸다 — 안 보이면 "왜 저 사람은 못 보지"를 아무도 설명 못 한다.
  return `${base} — except ${contact.excluded_users.map((u) => u.name).join(", ")}`;
}

/** 신청 diff 처럼 한 줄 요약이 필요한 자리 (이름 해석 없이 타입+개수만 아는 경우 포함). */
export function targetsSummary(
  visibility: Contact["visibility"],
  targets: { type: ContactTargetType; name?: string }[],
): string {
  if (visibility === "organization") return "Shared with the whole organization";
  if (targets.length === 0) return "No targets selected";
  const parts: string[] = [];
  for (const t of TYPE_ORDER) {
    const items = targets.filter((x) => x.type === t);
    if (items.length === 0) continue;
    const label = items.length === 1 ? TYPE_LABEL[t].one : TYPE_LABEL[t].many;
    const named = items.map((i) => i.name).filter(Boolean);
    parts.push(named.length > 0 ? `${label} ${named.join(", ")}` : `${items.length} ${label}`);
  }
  return parts.join("; ");
}
