/**
 * 모달 레이어링 회귀 테스트.
 *
 * 배경(2026-08-14 현장 사고):
 *   스케줄 편집 모달은 z-[300] 자체 오버레이인데 confirm 셸은 z-50 이었다. 그래서
 *   Save 를 누르면 뜨는 "Confirm schedule" 이 편집 모달 뒤로 깔려 보이지도, 눌리지도
 *   않았고 — 응답할 수 없으니 스택에서 빠지지도 않아 — 시도할수록 반투명 딤이 겹쳐
 *   화면이 새까매졌다.
 *
 * 그래서 두 가지를 못으로 박는다:
 *   1. confirm/alert 셸은 DIALOG 레이어(앱 모달보다 위)에 뜬다
 *   2. 여러 겹 쌓여도 딤은 맨 아래 하나뿐이다 (겹치면 곱해져서 암전)
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModalProvider, useModal } from "@/components/ui/imperative-modal";
import { LAYER } from "@/lib/layers";

function Harness() {
  const modal = useModal();
  return (
    <button type="button" onClick={() => void modal.confirm({ title: "Really?", message: "..." })}>
      ask
    </button>
  );
}

/** 화면에 깔린 반투명 딤 레이어들. */
function dimLayers(container: HTMLElement): Element[] {
  return [...container.querySelectorAll("div")].filter((d) =>
    /bg-black\//.test(d.className),
  );
}

describe("modal layering", () => {
  it("renders confirm above app-level modals (z-[300] 같은 자체 오버레이 위)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ModalProvider>
        <Harness />
      </ModalProvider>,
    );

    await user.click(screen.getByRole("button", { name: "ask" }));

    const shell = [...container.querySelectorAll("div")].find((d) =>
      d.className.includes(LAYER.DIALOG),
    );
    expect(shell, "confirm 셸이 DIALOG 레이어에 있어야 한다").toBeTruthy();

    // 앱 모달(MODAL)보다 확실히 위여야 한다 — 숫자 비교로 못 박는다.
    const num = (cls: string) => Number(cls.replace(/\D/g, ""));
    expect(num(LAYER.DIALOG)).toBeGreaterThan(num(LAYER.MODAL));
  });

  it("keeps exactly one dim layer no matter how many dialogs stack", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ModalProvider>
        <Harness />
      </ModalProvider>,
    );

    const ask = screen.getByRole("button", { name: "ask" });
    await user.click(ask);
    expect(dimLayers(container)).toHaveLength(1);

    // 두 번째, 세 번째가 쌓여도 딤은 한 겹 — 이게 화면이 까매지던 원인이었다.
    await user.click(ask);
    await user.click(ask);
    expect(screen.getAllByText("Really?")).toHaveLength(3);
    expect(dimLayers(container)).toHaveLength(1);
  });
});
