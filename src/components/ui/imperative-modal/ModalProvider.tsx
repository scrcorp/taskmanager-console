"use client";

/**
 * ModalProvider — imperative 모달 시스템의 엔진.
 *
 * 역할:
 *   1. 열려있는 모달들의 stack 보관 (한 번에 여러 개 가능)
 *   2. 각 모달에 대응하는 Promise resolve 함수 보관
 *   3. stack 크기만큼 실제 <Modal/> 컴포넌트 렌더링
 *
 * 외부에서는 useModal() hook 으로만 접근. ModalProvider 자체는 한 번만 마운트
 * (src/app/providers.tsx 에서 RootLayout 안에 박힘).
 *
 * Promise 가 동작하는 핵심 메커니즘:
 *   push() 호출 → new Promise 만들면서 resolve 함수 capture
 *               → stack 에 { ..., resolve } entry 추가
 *               → 모달이 닫힐 때 closeEntry() 가 resolve(value) 호출
 *               → 호출 측 await 가 풀림
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "../Modal";
import type { ModalShellOptions } from "./types";

/**
 * stack 안의 한 모달 인스턴스의 내부 상태.
 *   - id:      stack 안에서 식별. 닫을 때 어떤 항목인지 알아야 함
 *   - render:  본문을 그리는 함수. close 콜백을 인자로 받음
 *   - options: shell 옵션 (Modal.tsx 에 그대로 전달)
 *   - resolve: 이 모달의 Promise resolve. 닫힘 시 값과 함께 호출
 *
 * 외부에 노출 안 함 — 내부 구현 디테일.
 */
interface ModalEntry {
  id: number;
  render: (close: (value: unknown) => void) => ReactNode;
  options: ModalShellOptions;
  resolve: (value: unknown) => void;
}

/**
 * Context 가 노출하는 유일한 함수.
 * useModal() 내부에서만 사용 (외부 코드는 모름).
 */
interface ModalCtxValue {
  push: (
    render: (close: (value: unknown) => void) => ReactNode,
    options: ModalShellOptions,
  ) => Promise<unknown>;
}

const ModalCtx = createContext<ModalCtxValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  /**
   * stack — 동시에 여러 모달이 열릴 수 있음.
   * 예: 폼 모달 안에서 "정말 저장?" confirm 을 띄우는 흐름.
   * stack 의 마지막 항목이 가장 위에 그려짐 (React 의 마운트 순서 = z-index 자연 순서).
   */
  const [stack, setStack] = useState<ModalEntry[]>([]);

  /**
   * id 자동 증가용 ref.
   * useState 대신 useRef 사용 이유: 같은 tick 안에 push 가 2번 들어와도 안 꼬임.
   */
  const idRef = useRef(0);

  /**
   * 새 모달을 stack 에 추가하고 Promise 를 반환.
   *
   * 동작 순서:
   *   1. new Promise 생성 (executor 안에서 resolve 함수를 ref 처럼 capture)
   *   2. 새 id 발급
   *   3. setStack 으로 entry 추가
   *   4. 리액트가 리렌더 → <Modal/> 컴포넌트 새로 그려짐
   *   5. 호출 측 await 는 닫힘 콜백이 resolve 부를 때까지 대기
   *
   * useCallback 으로 reference 고정 — Context 값이 매 렌더마다 바뀌면
   * useModal 안의 콜백들도 다 갈아엎혀서 의존성 배열에 따라 무한 루프 위험.
   */
  const push = useCallback<ModalCtxValue["push"]>((render, options) => {
    return new Promise<unknown>((resolve) => {
      idRef.current += 1;
      const id = idRef.current;
      setStack((prev) => [...prev, { id, render, options, resolve }]);
    });
  }, []);

  /**
   * 특정 id 의 모달을 닫음 + 해당 entry 의 resolve(value) 호출.
   *
   * 호출 경로:
   *   - 본문 컴포넌트가 close(value) 호출  → useModal 의 wrapper 가 closeEntry 호출
   *   - ESC 키나 backdrop 클릭             → <Modal onClose> → closeEntry(id, undefined)
   *
   * setStack 안에서 resolve 호출하는 이유:
   *   - prev 가 stale 하지 않은 시점에 entry 찾기
   *   - resolve 와 stack 제거가 같은 commit 에서 일어남 (race 없음)
   */
  const closeEntry = useCallback((id: number, value: unknown) => {
    setStack((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry) entry.resolve(value);
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  return (
    <ModalCtx.Provider value={{ push }}>
      {children}
      {/* stack 길이만큼 Modal 렌더. key={id} 로 React 재조정 안정 */}
      {stack.map((entry) => (
        <Modal
          key={entry.id}
          isOpen={true}
          /**
           * ESC/backdrop 클릭 시 호출.
           * value 없이 닫으니 Promise 는 undefined 로 resolve.
           * (useModal 의 confirm wrapper 가 boolean 변환 처리)
           */
          onClose={() => closeEntry(entry.id, undefined)}
          title={entry.options.title}
          size={entry.options.size ?? "sm"}
          closeOnBackdrop={entry.options.closeOnBackdrop ?? true}
          closeOnEscape={entry.options.closeOnEscape ?? true}
        >
          {/*
            본문은 render 함수가 그림.
            close 콜백을 인자로 넘김 → 본문 컴포넌트가 자기 안에서 close(value) 호출 가능.
            이때 value 가 Promise 의 최종 resolve 값.
          */}
          {entry.render((v) => closeEntry(entry.id, v))}
        </Modal>
      ))}
    </ModalCtx.Provider>
  );
}

/**
 * Provider 의 push 함수에 접근하는 내부 hook.
 * 외부에서는 직접 쓰지 말고 useModal() 사용.
 *
 * Context 가 null 이면 ModalProvider 안에서 호출되지 않은 것 — 에러 throw.
 */
export function useModalCtx(): ModalCtxValue {
  const ctx = useContext(ModalCtx);
  if (!ctx) {
    throw new Error("useModal must be used within ModalProvider");
  }
  return ctx;
}
