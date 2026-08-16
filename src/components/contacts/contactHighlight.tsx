"use client";

/**
 * 검색어 강조 — 왜 이 행이 검색에 걸렸는지 눈에 보이게 (확장 U1).
 *
 * 검색 **판정은 서버**가 하고 강조만 여기서 한다. 그래서 두 판정이 갈리면
 * "걸렸는데 아무 데도 안 칠해진 행"이 나온다. 그걸 줄이려고 전화번호는 서버와
 * 같은 정규화(숫자만) 기준을 함께 태운다 — 서버 `normalize_phone` 과 같은 규칙.
 *
 * 완벽히 같지는 않다(서버는 원본 표기 ilike + 정규화 like 를 OR 한다).
 * 강조가 없다고 결과가 틀린 것은 아니므로, 강조는 **거들 뿐** 판정을 바꾸지 않는다.
 */

import React from "react";

import { normalizePhone } from "./contactDraft";

/** 정규화 매칭을 태울 최소 자릿수 — 서버 `_MIN_PHONE_SEARCH_DIGITS` 와 같은 값. */
const MIN_PHONE_DIGITS = 3;

function normalizeTerm(term: string | undefined | null): string {
  return (term ?? "").trim();
}

/** 원본 표기에서 term 이 나타나는 [start, end) 구간 (대소문자 무시). 없으면 null. */
function literalRange(text: string, term: string): [number, number] | null {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  return at < 0 ? null : [at, at + term.length];
}

/**
 * 숫자만 비교해서 맞은 구간을 **원본 표기 위치로 되돌린다.**
 *
 * `213-555` 로 검색해도 `(213) 555-0142` 에서 `(213) 555` 가 칠해지도록.
 * 숫자가 아닌 문자는 구간 안에 있으면 함께 포함된다(중간의 `) ` 처럼).
 */
function digitRange(text: string, term: string): [number, number] | null {
  const termDigits = normalizePhone(term);
  if (termDigits.length < MIN_PHONE_DIGITS) return null;

  // 원본 문자열의 각 숫자가 몇 번째 인덱스에 있는지 기록해 두고 그 위에서 찾는다.
  const positions: number[] = [];
  let digitsOnly = "";
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] >= "0" && text[i] <= "9") {
      positions.push(i);
      digitsOnly += text[i];
    }
  }
  const at = digitsOnly.indexOf(termDigits);
  if (at < 0) return null;
  return [positions[at], positions[at + termDigits.length - 1] + 1];
}

/** 이 텍스트가 검색어에 걸리는가 (강조 표시 여부 판단용). */
export function matchesTerm(
  text: string | null | undefined,
  term: string | null | undefined,
): boolean {
  const needle = normalizeTerm(term);
  if (!needle || !text) return false;
  return literalRange(text, needle) !== null;
}

/**
 * 검색어에 걸린 부분을 `<mark>` 로 감싼 노드를 돌려준다.
 *
 * 첫 매칭 한 곳만 칠한다 — 메모처럼 긴 텍스트에서 전부 칠하면 오히려 안 읽힌다.
 * 매칭이 없으면 원문을 그대로 돌려주므로 어디서든 그냥 갈아끼우면 된다.
 */
export function highlight(
  text: string | null | undefined,
  term: string | null | undefined,
  options: { phone?: boolean } = {},
): React.ReactNode {
  if (!text) return text ?? null;
  const needle = normalizeTerm(term);
  if (!needle) return text;

  const range =
    literalRange(text, needle) ?? (options.phone ? digitRange(text, needle) : null);
  if (!range) return text;

  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-warning-muted px-0.5 text-text">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

/**
 * 검색에 걸린 항목을 앞으로 (확장 U2).
 *
 * 목록의 태그 칸은 좁아서 앞 몇 개만 보인다. 검색에 걸린 태그가 뒤에 있으면
 * "왜 걸렸는지"가 잘려서 안 보이므로, 걸린 것부터 보여준다.
 * 걸린 것끼리 / 안 걸린 것끼리의 **원래 순서는 유지**한다(안정 정렬).
 */
export function matchedFirst<T>(
  items: T[],
  term: string | null | undefined,
  getText: (item: T) => string,
): T[] {
  const needle = normalizeTerm(term);
  if (!needle) return items;
  const hit: T[] = [];
  const miss: T[] = [];
  for (const item of items) {
    (matchesTerm(getText(item), needle) ? hit : miss).push(item);
  }
  return [...hit, ...miss];
}
