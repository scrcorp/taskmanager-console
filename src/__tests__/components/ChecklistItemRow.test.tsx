/**
 * ChecklistItemRow 접기/펼치기 테스트.
 *
 * 테스트 범위:
 * - 접힘(isExpanded=false): 인라인 스레드(입력칸) 숨김, Comments 버튼 노출, Expand 토글
 * - 펼침(isExpanded=true): 인라인 스레드(입력칸) 노출, Comments 버튼 숨김, Collapse 토글
 * - chevron 토글 클릭 → onToggleExpand 호출
 */

import "@testing-library/jest-dom/vitest";
import React, { type ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChecklistItemRow } from "@/components/checklists/ChecklistItemRow";
import type { ChecklistInstanceItem } from "@/types";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// imperative-modal 은 mutation 결과 모달용. 렌더만 검증하는 테스트라 no-op 으로 대체
// (실 모듈은 top-level JSX 를 실행해 classic JSX 런타임에서 로드 시 크래시).
vi.mock("@/components/ui/imperative-modal", () => ({
  useModal: () => ({ alert: vi.fn(), confirm: vi.fn(), open: vi.fn() }),
}));

function makeItem(overrides: Partial<ChecklistInstanceItem> = {}): ChecklistInstanceItem {
  return {
    id: "item-1",
    item_index: 0,
    title: "Wipe the counter",
    description: null,
    verification_type: "none",
    min_photos: 0,
    max_photos: null,
    sort_order: 0,
    is_completed: false,
    completed_at: null,
    completed_tz: null,
    completed_by: null,
    completed_by_name: null,
    review_result: null,
    reviewer_id: null,
    reviewer_name: null,
    reviewed_at: null,
    files: [],
    submissions: [],
    reviews_log: [],
    messages: [],
    ...overrides,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderRow(props: Partial<React.ComponentProps<typeof ChecklistItemRow>> = {}) {
  return render(
    <ChecklistItemRow
      item={makeItem()}
      instanceId="inst-1"
      itemIndex={0}
      workDate="2026-07-16"
      isExpanded={false}
      onToggleExpand={vi.fn()}
      {...props}
    />,
    { wrapper: Wrapper },
  );
}

describe("ChecklistItemRow — collapse/expand", () => {
  it("collapsed: hides the inline thread, shows the Comments button and an Expand toggle", () => {
    renderRow({ isExpanded: false });

    // 인라인 스레드(입력칸)는 접힘 상태에서 숨겨진다.
    expect(screen.queryByPlaceholderText("Type a message...")).not.toBeInTheDocument();
    // 접힘 상태에서는 대화가 모달 뒤에 있으므로 Comments 버튼 노출.
    expect(screen.getByTitle("Comments")).toBeInTheDocument();
    // 펼침 토글.
    expect(screen.getByTitle("Expand")).toBeInTheDocument();
  });

  it("expanded: shows the inline thread and hides the redundant Comments button", () => {
    renderRow({ isExpanded: true });

    // 펼치면 제출내용/대화/입력이 카드 안에 인라인으로 뜬다.
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    // 스레드가 인라인이므로 Comments 버튼은 중복 → 숨김.
    expect(screen.queryByTitle("Comments")).not.toBeInTheDocument();
    // 접힘 토글.
    expect(screen.getByTitle("Collapse")).toBeInTheDocument();
  });

  it("clicking the chevron calls onToggleExpand", () => {
    const onToggleExpand = vi.fn();
    renderRow({ isExpanded: false, onToggleExpand });

    fireEvent.click(screen.getByTitle("Expand"));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("keeps the O/X review buttons available in both states", () => {
    const { rerender } = renderRow({ isExpanded: false });
    expect(screen.getByTitle("Pass")).toBeInTheDocument();
    expect(screen.getByTitle("Fail")).toBeInTheDocument();

    rerender(
      <ChecklistItemRow
        item={makeItem()}
        instanceId="inst-1"
        itemIndex={0}
        workDate="2026-07-16"
        isExpanded
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Pass")).toBeInTheDocument();
    expect(screen.getByTitle("Fail")).toBeInTheDocument();
  });
});
