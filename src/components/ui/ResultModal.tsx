"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

/**
 * Result modal — 사용자 행동 결과(success/error/info) 를 명확히 인지시키기 위한 모달.
 *
 * 토스트와 다른 점:
 * - 사용자가 직접 닫아야 사라짐 (자동 dismiss 안 함)
 * - 화면 중앙에 떠 시선 강제
 * - 긴 메시지 / bullet list 표시 가능
 *
 * 사용법:
 *   const { show } = useResultModal();
 *   show({ type: "success", title: "Created", message: "Schedule created." });
 *   show({ type: "error", title: "Failed", message: "...", details: ["a","b"] });
 */

export type ResultType = "success" | "error" | "info";

/** 모달 안에 추가로 보여줄 액션 버튼 정의 */
export interface ResultModalAction {
  label: string;
  onClick?: () => void | Promise<void>;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  /** true 면 모달이 자동 닫힘 (기본 true). 비동기 작업 후 직접 닫고 싶으면 false. */
  closeOnClick?: boolean;
}

interface ResultModalProps {
  type: ResultType;
  title: string;
  message: string;
  details?: string[];
  /** 본문에 message/details 외에 자유로운 JSX 삽입 가능 */
  body?: React.ReactNode;
  /** 닫기 버튼 라벨 (기본 "OK"). actions 와 같이 사용 가능 — actions 끝에 추가됨. */
  closeLabel?: string;
  /** 닫기 버튼 숨기기 — actions 만 노출하고 싶을 때 */
  hideCloseButton?: boolean;
  /** 추가 액션 버튼들 (왼쪽부터 순서대로 렌더링됨). closeLabel 보다 앞에 표시. */
  actions?: ResultModalAction[];
}

interface ResultModalContext {
  show: (props: ResultModalProps) => void;
  showSuccess: (message: string, options?: { title?: string; details?: string[] }) => void;
  showError: (message: string, options?: { title?: string; details?: string[] }) => void;
}

const Ctx = createContext<ResultModalContext | null>(null);

const styles: Record<ResultType, { color: string; icon: React.ReactElement }> = {
  success: {
    color: "var(--color-success)",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  error: {
    color: "var(--color-danger)",
    icon: <AlertCircle className="h-5 w-5" />,
  },
  info: {
    color: "var(--color-accent)",
    icon: <Info className="h-5 w-5" />,
  },
};

export function ResultModalProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<ResultModalProps[]>([]);

  const show = useCallback((props: ResultModalProps) => {
    setStack((prev) => [...prev, props]);
  }, []);

  const showSuccess = useCallback(
    (message: string, options?: { title?: string; details?: string[] }) => {
      show({ type: "success", title: options?.title ?? "Done", message, details: options?.details });
    },
    [show],
  );

  const showError = useCallback(
    (message: string, options?: { title?: string; details?: string[] }) => {
      show({ type: "error", title: options?.title ?? "Something went wrong", message, details: options?.details });
    },
    [show],
  );

  const close = useCallback(() => {
    setStack((prev) => prev.slice(1));
  }, []);

  const current = stack[0] ?? null;
  const style = current ? styles[current.type] : null;

  return (
    <Ctx.Provider value={{ show, showSuccess, showError }}>
      {children}
      {current && style && (
        <Modal
          isOpen={true}
          onClose={close}
          title={current.title}
          size="sm"
          footer={
            <div className="flex justify-end gap-2 flex-wrap">
              {current.actions?.map((a, i) => (
                <Button
                  key={i}
                  variant={a.variant ?? "secondary"}
                  size="sm"
                  onClick={async () => {
                    try {
                      await a.onClick?.();
                    } finally {
                      if (a.closeOnClick !== false) close();
                    }
                  }}
                >
                  {a.label}
                </Button>
              ))}
              {!current.hideCloseButton && (
                <Button variant="primary" size="sm" onClick={close}>
                  {current.closeLabel ?? "OK"}
                </Button>
              )}
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0" style={{ color: style.color }}>
              {style.icon}
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-[14px] text-[var(--color-text)] leading-relaxed">{current.message}</p>
              {current.details && current.details.length > 0 && (
                <ul className="list-disc list-inside text-[12.5px] text-[var(--color-text-secondary)] space-y-1">
                  {current.details.map((d, i) => (
                    <li key={i} className="leading-snug">{d}</li>
                  ))}
                </ul>
              )}
              {current.body}
            </div>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function useResultModal(): ResultModalContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useResultModal must be used within ResultModalProvider");
  return ctx;
}
