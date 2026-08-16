/**
 * 태그 입력의 IME(한글) 조합 처리.
 *
 * 회귀 방지 대상 (2026-08-15 실측 버그): `이런수가` 를 치고 Enter 를 누르면 태그가
 * `이런`, `런`, `수가`, `가` 로 **두 배** 들어갔다. 조합 중의 Enter 를 "제출"로 받아
 * 앞부분을 태그로 넣고 입력칸을 비우는데, 곧이어 IME 가 조합을 확정하며 남은 글자를
 * 비워진 칸에 다시 써넣기 때문이다.
 *
 * 규칙: **조합 중(isComposing)의 Enter 는 아무것도 하지 않는다.**
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { ContactTagInput } from "@/components/contacts/ContactTagInput";

function renderInput(value: string[] = []) {
  const onChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <ContactTagInput value={value} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { input: screen.getByLabelText("Add a tag"), onChange };
}

describe("ContactTagInput — IME 조합", () => {
  it("조합이 끝난 Enter 는 태그를 넣는다", () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "vendor" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["vendor"]);
  });

  it("조합 중(isComposing)의 Enter 는 태그를 넣지 않는다", () => {
    // 한글을 치는 도중의 Enter — 이게 통과하면 글자가 두 번 들어간다.
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "이런" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("isComposing 을 안 채우는 브라우저용으로 keyCode 229 도 막는다", () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "이런" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("조합 확정 후 다시 Enter 를 누르면 그제야 들어간다", () => {
    // 표준 IME 동작: 첫 Enter 는 조합 확정, 두 번째 Enter 가 제출.
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "이런수가" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["이런수가"]);
  });

  it("조합 중의 쉼표도 태그를 넣지 않는다", () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "이런" } });
    fireEvent.keyDown(input, { key: ",", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("조합 중의 Backspace 는 기존 태그를 지우지 않는다", () => {
    // 입력칸이 비어 보여도 조합 중이면 IME 가 자모를 지우는 중이다.
    // 여기서 태그를 지우면 사용자가 안 지운 태그가 사라진다.
    const { input, onChange } = renderInput(["vendor"]);
    fireEvent.keyDown(input, { key: "Backspace", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
  });
});
