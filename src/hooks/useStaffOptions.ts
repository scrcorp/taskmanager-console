"use client";

/**
 * 드롭다운·피커에 넣을 **직원 옵션 목록**을 만드는 단 하나의 경로.
 *
 * 왜 필요한가 — `useUsers()` 호출부가 콘솔에 35곳이다. 소스는 하나인데 그 위의
 * 파생이 화면마다 제각각이었다: 라벨 규칙(`full_name || username` 45곳 하드코딩),
 * 정렬 유무, 그리고 무엇보다 **누구를 빼는가**(비활성/미가입/퇴사)가 다 달랐다.
 * 같은 사람이 A 화면 드롭다운엔 보이고 B 화면엔 안 보이는 상태가 구조적으로 가능했고,
 * 이건 느린 것보다 나쁘다.
 *
 * 그래서 경계를 이렇게 긋는다:
 *   화면이 정하는 것 = **스코프** (어느 매장인가)
 *   훅이 정하는 것   = 라벨 · 정렬 · 제외 규칙 · 메모이제이션
 *
 * 서버의 도메인 게이트웨이 원칙(2026-08-16)의 프론트엔드판이다. 배정 가능 여부처럼
 * 판정이 서버에 있는 것은 서버 값을 그대로 쓰고 여기서 다시 계산하지 않는다.
 */

import { useMemo } from "react";
import { useUsers } from "./useUsers";
import { displayName, searchHaystack } from "@/lib/staffLabel";
import type { User } from "@/types";

/**
 * 누구를 목록에 넣을 것인가.
 *
 * - `active`      재직 중인 정상 계정만. 미가입(유령) 제외.
 *                 → 실제로 지금 일하는 사람만 골라야 하는 곳 (근무 배정, 팁 분배 등)
 * - `assignable`  active + 미가입(유령). 유령은 로그인만 못 할 뿐 배정·사번 부여 대상이다.
 *                 → 스케줄·근태처럼 "일할 사람" 을 고르는 곳. 대부분의 드롭다운이 여기다.
 * - `all`         비활성(퇴사·정지)까지 전부. 과거 데이터를 다루는 곳에서만.
 *                 → 이력 조회, 관리자용 전체 목록
 */
export type StaffInclude = "active" | "assignable" | "all";

export interface StaffOption {
  id: string;
  label: string;
  /** 원본 — renderOption 에서 뱃지·부역할 등을 그릴 때 쓴다. */
  user: User;
  /** 검색 매칭용 소문자 문자열 (이름·username·EMPID·email). */
  haystack: string;
}

export interface StaffOptionsParams {
  /** 단일 매장 스코프. storeIds 와 같이 주면 storeIds 가 우선한다. */
  storeId?: string;
  /** 복수 매장 스코프. */
  storeIds?: string[];
  /** 누구를 넣을지. 기본 "assignable". */
  include?: StaffInclude;
  /** false 면 조회 자체를 하지 않는다 (모달이 닫혀 있을 때 등). */
  enabled?: boolean;
}

export interface StaffOptionsResult {
  options: StaffOption[];
  /** 필터 전 원본 — 개수 표시나 별도 가공이 필요한 화면용. */
  users: User[];
  isLoading: boolean;
}

/** 이름 오름차순. 로케일 비교라 한글·영문 혼재에서도 자연스럽다. */
function byName(a: StaffOption, b: StaffOption): number {
  return a.label.localeCompare(b.label);
}

/**
 * 이미 받아온 User[] 를 옵션으로 변환한다 — 목록을 부모가 이미 쥐고 있어
 * 훅으로 다시 조회할 필요가 없는 화면용(필터바 등). 라벨·정렬·검색 문자열 규칙은
 * useStaffOptions 와 같은 것을 쓴다.
 *
 * 호출부에서 반드시 useMemo 로 감쌀 것 — 매 렌더 새 배열을 만들면 하위 컴포넌트가
 * 매번 새 참조를 받아 리렌더된다 (기존 FilterBar 들의 문제였다).
 */
export function toStaffOptions(users: User[]): StaffOption[] {
  return users
    .map((u) => ({
      id: u.id,
      label: displayName(u),
      user: u,
      haystack: searchHaystack(u),
    }))
    .sort(byName);
}

export function useStaffOptions(
  params?: StaffOptionsParams,
): StaffOptionsResult {
  const {
    storeId,
    storeIds,
    include = "assignable",
    enabled = true,
  } = params ?? {};

  // 서버 필터 — 여기서 좁힐 수 있는 것은 좁혀서 받는다.
  // 미가입(유령)은 is_active=false 로 오므로, 포함하려면 include_provisional 이 필요하다.
  const filters = useMemo(() => {
    const f: Parameters<typeof useUsers>[0] = {};
    if (storeIds && storeIds.length > 0) f.store_ids = storeIds;
    else if (storeId) f.store_id = storeId;
    if (include === "assignable") f.include_provisional = true;
    return f;
  }, [storeId, storeIds, include]);

  const { data, isLoading } = useUsers(enabled ? filters : undefined);

  const users = useMemo<User[]>(() => (Array.isArray(data) ? data : []), [data]);

  const options = useMemo<StaffOption[]>(() => {
    const kept = users.filter((u) => {
      if (include === "all") return true;
      const provisional = u.is_provisional === true;
      if (include === "active") return u.is_active && !provisional;
      // assignable — 재직자 + 유령. 유령은 항상 is_active=false 라 별도로 통과시킨다.
      return u.is_active || provisional;
    });
    return kept
      .map((u) => ({
        id: u.id,
        label: displayName(u),
        user: u,
        haystack: searchHaystack(u),
      }))
      .sort(byName);
  }, [users, include]);

  return { options, users, isLoading };
}

/** 옵션 목록의 표준 검색 매칭 — 화면마다 다르던 매칭 기준을 통일한다. */
export function matchStaffOption(option: StaffOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return option.haystack.includes(q);
}
