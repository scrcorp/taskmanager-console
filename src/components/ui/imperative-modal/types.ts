/**
 * Imperative modal system — 모든 공개 타입.
 *
 * 여기 정의된 타입들이 ModalApi 의 시그니처를 구성하고,
 * 호출 측 (페이지/컴포넌트) 이 props 를 쓸 때 자동완성/검증의 기준이 됨.
 *
 * 파일 구조에서의 위치 (src/components/ui/imperative-modal/):
 *   - types.ts          ← 너 여기있음 (모든 props/옵션/공개 API 타입)
 *   - ModalProvider.tsx (stack/Promise 보관 + 실제 렌더링)
 *   - useModal.tsx      (alert/confirm/open hook 표면)
 *   - AlertBody.tsx     (alert 본문 컴포넌트)
 *   - ConfirmBody.tsx   (confirm 본문 컴포넌트)
 *   - index.ts          (barrel)
 */

import type { ReactNode } from "react";

// ============================================================
// Shell — 모든 모달 공통 옵션
// ============================================================
// 모달의 "껍데기" (위치/크기/닫기 동작) 옵션. 본문과 무관.
// 내부적으로 Modal.tsx 의 props 와 1:1 대응.

/** Modal.tsx 가 지원하는 size 와 동일. 더 큰 크기 필요해지면 Modal.tsx 도 같이 확장 */
export type ModalSize = "sm" | "md" | "lg";

/**
 * 모달 표시 방식.
 * 현재는 "center" 하나만 — 화면 중앙에 fade-in.
 * future: "drawer-right" / "drawer-bottom" / "sheet"
 *   → 자리만 잡아둠. 실수요 나오면 그때 ModalProvider 의 렌더 분기 추가.
 */
export type ModalPresentation = "center";

export interface ModalShellOptions {
  /** 모달 헤더 제목. 비우면 헤더 자체가 안 그려짐 */
  title?: string;
  /** 모달 가로 크기. 기본 "sm" */
  size?: ModalSize;
  /** ESC 키로 닫기 허용 여부. 기본 true */
  closeOnEscape?: boolean;
  /** backdrop 클릭으로 닫기 허용 여부. 기본 true */
  closeOnBackdrop?: boolean;
  /** 표시 방식. 기본 "center" */
  presentation?: ModalPresentation;
}

// ============================================================
// alert — 메시지 모달 프리셋
// ============================================================
// 단순 알림/결과 모달. 사용자가 OK 누르면 닫힘.
// Promise<void> — 받을 정보 없지만 await 가능 (닫힘까지 대기).

export interface AlertProps {
  /** 모달 톤. 색/아이콘이 자동 결정됨. 기본 "info" */
  type?: "success" | "error" | "info";
  /** 헤더 제목. 안 주면 type 에 따라 자동 ("Done" / "Something went wrong" / "Notice") */
  title?: string;
  /** 본문 메시지 (한 줄~두 줄). 필수 */
  message: string;
  /** 추가 bullet 정보. bulk 작업 부분 실패 결과 등에 사용 */
  details?: string[];
  /** 본문에 임의 JSX 삽입 (이미지/미리보기 등). message + details 뒤에 렌더 */
  body?: ReactNode;
  /** 닫기 버튼 라벨. 기본 "OK" */
  closeLabel?: string;
}

// ============================================================
// confirm — 확인/취소 모달 프리셋
// ============================================================
// 확인/취소 + 선택적 reason 입력.
//   - 일반 모드:   Promise<boolean>
//   - reason 모드: Promise<string | undefined>
// (TypeScript overload 로 호출 시 자동 분기)

export interface ConfirmProps {
  title?: string;
  message: string;
  /** Confirm 버튼 라벨. 기본 "Confirm" */
  confirmLabel?: string;
  /** Cancel 버튼 라벨. 기본 "Cancel" */
  cancelLabel?: string;
  /** "danger" = 빨강 톤 + 경고 아이콘. 기본 "primary" */
  variant?: "primary" | "danger";
  /** true 면 textarea 노출, 반환 타입이 string | undefined 로 바뀜 */
  requiresReason?: boolean;
  /** reason 입력을 필수로 강제 (빈 값 시 Confirm 버튼 비활성). requiresReason 와 같이 사용 */
  reasonMandatory?: boolean;
  /** reason 입력 칸 라벨. 기본 "Reason" */
  reasonLabel?: string;
}

// ============================================================
// open — 임의 컴포넌트 모달
// ============================================================
// alert/confirm 로 표현할 수 없는 모든 케이스 (폼/리스트/멀티스텝/프리뷰 등).
// 컴포넌트가 자기 본문/버튼/로직 다 책임짐.
// close(value) 호출 시 모달 닫힘 + Promise 가 value 로 resolve.

/**
 * open 의 render 함수에 전달되는 핸들러.
 * close(value)  → 모달 닫기 + Promise resolve (value 전달)
 * close()       → 모달 닫기 + Promise resolve (undefined)
 */
export interface OpenHandlers<T> {
  close: (value?: T) => void;
}

// ============================================================
// 공개 API — useModal() 반환 타입
// ============================================================

export interface ModalApi {
  /** 메시지 모달. 사용자가 OK 누를 때까지 await */
  alert(props: AlertProps): Promise<void>;

  /**
   * 확인/취소 모달.
   * overload 시그니처로 반환 타입 자동 분기:
   *   - requiresReason: true → Promise<string | undefined>
   *   - 그 외 → Promise<boolean>
   */
  confirm(props: ConfirmProps & { requiresReason: true }): Promise<string | undefined>;
  confirm(props: ConfirmProps): Promise<boolean>;

  /**
   * 임의 컴포넌트 모달.
   * render 안에서 close(value) 호출하면 모달 닫히고 Promise 가 value 로 resolve.
   * ESC/backdrop 으로 닫히면 Promise 가 undefined 로 resolve.
   */
  open<T = unknown>(
    render: (handlers: OpenHandlers<T>) => ReactNode,
    options?: ModalShellOptions,
  ): Promise<T | undefined>;
}
