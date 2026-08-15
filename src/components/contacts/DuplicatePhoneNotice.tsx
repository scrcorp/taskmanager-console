"use client";

/**
 * 같은 번호가 이미 등록돼 있으면 경고만 한다 — 저장은 막지 않는다 (설계 N7).
 *
 * 전용 중복 감지 API 는 없다(계약 "남은 이슈 5"). 기존 검색을 그대로 쓰되,
 * 검색은 메모·이름까지 OR 로 걸리므로 **정규화 번호가 실제로 같은 건만** 남겨서 보여준다.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

import { useContacts } from "@/hooks/useContacts";
import { useDebounce } from "@/hooks/useDebounce";

/**
 * 이 길이 미만은 조회하지 않는다 — 두세 자리로는 전부 걸려서 경고가 소음이 된다.
 * **호출 측이** 이 길이를 넘을 때만 컴포넌트를 렌더한다(짧은 입력에 쿼리를 걸지 않기 위해).
 */
export const DUPLICATE_MIN_DIGITS = 7;

interface DuplicatePhoneNoticeProps {
  /** 숫자만 남긴 값. */
  digits: string;
  /** 수정 중인 자기 자신은 중복이 아니다. */
  excludeContactId?: string;
}

export function DuplicatePhoneNotice({
  digits,
  excludeContactId,
}: DuplicatePhoneNoticeProps): React.ReactElement | null {
  // 타자 한 번에 한 번씩 목록을 부르지 않도록 늦춘다.
  const debounced = useDebounce(digits, 400);
  const query = useContacts({ q: debounced, per_page: 5, sort: "name" });

  // 조회 실패는 경고를 못 띄웠을 뿐 저장을 막지 않는다. 조용히 넘긴다(차단 요소가 아님).
  if (debounced.length < DUPLICATE_MIN_DIGITS || query.isError || query.isLoading) return null;

  const matches = (query.data?.items ?? []).filter(
    (c) => c.id !== excludeContactId && c.phones.some((p) => p.number_normalized === debounced),
  );
  if (matches.length === 0) return null;

  const names = matches.map((c) => c.name).join(", ");
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-warning">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span>
        This number is already saved under {names}. You can still save — check it is not a
        duplicate first.
      </span>
    </p>
  );
}
