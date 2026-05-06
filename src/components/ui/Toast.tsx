"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

/**
 * 토스트 알림 시스템 -- 자동 사라지는 하단 우측 알림 메시지를 제공합니다.
 *
 * Toast alert system with auto-dismiss, fixed bottom-right positioning.
 * Provides ToastProvider context and useToast hook.
 *
 * @example
 * // Wrap your app with ToastProvider:
 * <ToastProvider>{children}</ToastProvider>
 *
 * // Use in any client component:
 * const { toast } = useToast();
 * toast({ type: "success", message: "Saved!" });
 */

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastOptions {
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toastStyles: Record<ToastType, string> = {
  success: "border-success/30 bg-success-muted",
  error: "border-danger/30 bg-danger-muted",
  info: "border-accent/30 bg-accent-muted",
};

const toastIcons: Record<ToastType, React.ReactElement> = {
  success: <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />,
  error: <AlertCircle className="h-5 w-5 text-danger flex-shrink-0" />,
  info: <Info className="h-5 w-5 text-accent flex-shrink-0" />,
};

const AUTO_DISMISS_MS: number = 3000;

export function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast: (id: string) => void = useCallback(
    (id: string): void => {
      setToasts((prev: ToastItem[]) =>
        prev.filter((t: ToastItem) => t.id !== id),
      );
    },
    [],
  );

  const toast: (options: ToastOptions) => void = useCallback(
    (options: ToastOptions): void => {
      const id: string = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newToast: ToastItem = { id, ...options };

      setToasts((prev: ToastItem[]) => [...prev, newToast]);

      setTimeout((): void => {
        removeToast(id);
      }, AUTO_DISMISS_MS);
    },
    [removeToast],
  );

  const contextValue: ToastContextValue = { toast };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((item: ToastItem) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2",
              toastStyles[item.type],
            )}
          >
            {toastIcons[item.type]}
            <p className="text-sm text-text flex-1">{item.message}</p>
            <button
              type="button"
              onClick={() => removeToast(item.id)}
              className="p-0.5 rounded text-text-muted hover:text-text transition-colors duration-150 cursor-pointer flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * 토스트 훅 -- ToastProvider 컨텍스트에서 토스트 함수를 가져옵니다.
 *
 * Hook to access the toast function from ToastProvider context.
 *
 * @returns toast 함수를 포함한 객체 (Object containing the toast function)
 * @throws ToastProvider 외부에서 호출 시 에러 (Error if used outside ToastProvider)
 */
export function useToast(): ToastContextValue {
  const context: ToastContextValue | null = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
