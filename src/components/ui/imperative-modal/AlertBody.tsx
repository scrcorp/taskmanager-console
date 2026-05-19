"use client";

/**
 * AlertBody — modal.alert() 프리셋의 본문 컴포넌트.
 *
 * 책임:
 *   - type 에 따른 아이콘/색 선택
 *   - message + details bullet + body (옵션) 렌더
 *   - OK 버튼 클릭 시 onClose() 호출 (= 모달 닫힘)
 *
 * 닫기 로직은 props.onClose 에 위임 — 이 컴포넌트는 Provider 의 close 콜백을
 * 직접 보관하지 않음. useModal 안에서 onClose 콜백으로 close(undefined) 를 wrap.
 *
 * UI 디자인은 기존 ResultModal.tsx 의 본문과 거의 동일 (시각적 일관성 위해).
 */

import type { ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Button } from "../Button";
import type { AlertProps } from "./types";

/**
 * type → (색, 아이콘) 매핑.
 * color 는 CSS var (Tailwind theme 색) 직접 참조.
 * 새 type 추가 시 여기 추가 + types.ts 의 AlertProps["type"] 도 같이 갱신.
 */
const styles = {
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
} as const;

interface AlertBodyProps extends AlertProps {
  /** 모달 닫기 콜백 — useModal 에서 close(undefined) 로 wrap 해서 주입 */
  onClose: () => void;
}

export function AlertBody({
  type = "info",
  message,
  details,
  body,
  closeLabel = "OK",
  onClose,
}: AlertBodyProps): ReactNode {
  const style = styles[type];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        {/* 아이콘 (좌측) */}
        <div className="mt-0.5 flex-shrink-0" style={{ color: style.color }}>
          {style.icon}
        </div>

        {/* 본문 영역 (우측) */}
        <div className="space-y-2 min-w-0">
          <p className="text-sm text-text leading-relaxed">{message}</p>

          {/* details bullet list — bulk 작업 부분 실패 등에서 사용 */}
          {details && details.length > 0 && (
            <ul className="list-disc list-inside text-xs text-text-secondary space-y-1">
              {details.map((d, i) => (
                <li key={i} className="leading-snug">
                  {d}
                </li>
              ))}
            </ul>
          )}

          {/* 임의 JSX 슬롯 (이미지 미리보기 등) */}
          {body}
        </div>
      </div>

      {/* OK 버튼 */}
      <div className="flex justify-end pt-2">
        <Button variant="primary" size="sm" onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
    </div>
  );
}
