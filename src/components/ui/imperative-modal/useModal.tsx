"use client";

/**
 * useModal — imperative 모달 시스템의 공개 hook.
 *
 * 호출 측이 보는 표면. 3가지 메서드:
 *   - alert(props)   → 메시지 모달, Promise<void>
 *   - confirm(props) → 확인/취소, Promise<boolean | string | undefined> (props 에 따라)
 *   - open(render)   → 임의 컴포넌트, Promise<T | undefined>
 *
 * 책임:
 *   - ModalProvider 의 push 를 호출해서 모달 stack 에 추가
 *   - alert/confirm 프리셋은 본문 컴포넌트 (AlertBody/ConfirmBody) 를 자동으로 끼움
 *   - Promise 반환 (호출 측이 await 가능)
 *
 * 호출 측 예시:
 *   const modal = useModal();
 *   await modal.alert({ type: "success", message: "Saved." });
 *   const ok = await modal.confirm({ title: "Delete?", variant: "danger" });
 *   const data = await modal.open(({ close }) => <MyForm onDone={close} />);
 */

import { useCallback, useMemo, type ReactNode } from "react";
import { useModalCtx } from "./ModalProvider";
import { AlertBody } from "./AlertBody";
import { ConfirmBody } from "./ConfirmBody";
import type {
  AlertProps,
  ConfirmProps,
  ModalApi,
  ModalShellOptions,
  OpenHandlers,
} from "./types";

/**
 * type 별 기본 헤더 제목.
 * title 옵션 안 주면 자동으로 채워짐 — 호출 측 보일러플레이트 줄이는 편의.
 */
function defaultAlertTitle(type: AlertProps["type"]): string {
  if (type === "success") return "Done";
  if (type === "error") return "Something went wrong";
  return "Notice";
}

export function useModal(): ModalApi {
  const { push } = useModalCtx();

  /**
   * alert — AlertBody 가 본문을 그림.
   *
   * 흐름:
   *   1. push 가 Promise 반환 (resolve 값은 unknown)
   *   2. AlertBody 의 OK 버튼 → onClose 콜백 → close(undefined)
   *   3. ESC/backdrop 클릭 → Modal.onClose → close(undefined)
   *   4. 외부 시그니처는 Promise<void> 이므로 .then(() => undefined)
   */
  const alert = useCallback(
    (props: AlertProps): Promise<void> => {
      const promise = push(
        (close) => (
          <AlertBody {...props} onClose={() => close(undefined)} />
        ),
        {
          size: "sm",
          title: props.title ?? defaultAlertTitle(props.type),
        },
      );
      return promise.then(() => undefined);
    },
    [push],
  );

  /**
   * confirm — ConfirmBody 가 본문을 그림.
   *
   * 반환 타입 정리 (TypeScript overload 가 호출 측에서 자동 분기):
   *   reason 모드 (requiresReason: true):
   *     - ConfirmBody onResult 에서 받은 값 그대로 → Promise<string | undefined>
   *   일반 모드:
   *     - ConfirmBody 가 true/false 로 resolve
   *     - 단 ESC/backdrop 으로 닫히면 Provider 가 undefined 로 resolve
   *     - 호출 측 편의를 위해 undefined → false 로 coerce
   *
   * closeOnBackdrop: false 가 기본 — confirm 은 실수로 backdrop 클릭해서
   *   취소되지 않도록 안전 기본값. ESC 는 막지 않음 (사용자 의도 명확).
   *
   * 내부 구현 시그니처는 union 으로 받고, 반환 시 ModalApi["confirm"] 로 cast.
   */
  const confirm = useCallback(
    (props: ConfirmProps): Promise<boolean | string | undefined> => {
      const promise = push(
        (close) => (
          <ConfirmBody {...props} onResult={(v) => close(v)} />
        ),
        {
          size: "sm",
          title: props.title,
          closeOnBackdrop: false,
        },
      );

      if (props.requiresReason) {
        // string | undefined 그대로
        return promise as Promise<string | undefined>;
      }
      // 일반 모드: undefined (ESC) → false 로 coerce.
      // 호출 측은 "if (!ok) return;" 한 줄로 모든 취소 케이스 처리.
      return promise.then((v) => v === true);
    },
    [push],
  ) as ModalApi["confirm"];

  /**
   * open — wildcard. render 함수를 그대로 위임.
   *
   * 흐름:
   *   1. render(handlers) 가 본문 JSX 반환
   *   2. handlers.close(value) 호출하면 모달 닫힘 + Promise resolve(value)
   *   3. ESC/backdrop 으로 닫히면 Promise resolve(undefined)
   *
   * 제네릭 T 는 호출 측이 지정 — close 의 인자 타입과 Promise resolve 타입이 동기화.
   */
  const open = useCallback(
    <T,>(
      render: (h: OpenHandlers<T>) => ReactNode,
      options?: ModalShellOptions,
    ): Promise<T | undefined> => {
      return push(
        (close) => render({ close: (v?: T) => close(v) }),
        options ?? {},
      ) as Promise<T | undefined>;
    },
    [push],
  );

  /**
   * useMemo 로 ModalApi 객체 reference 안정성 확보.
   * 호출 측이 modal 을 useEffect/useCallback 의존성 배열에 넣어도 무한 루프 없음.
   */
  return useMemo<ModalApi>(
    () => ({ alert, confirm, open }),
    [alert, confirm, open],
  );
}
