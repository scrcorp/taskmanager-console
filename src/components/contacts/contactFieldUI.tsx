"use client";

/**
 * Contacts — 값 한 줄을 보여주는 공용 조각들.
 *
 * 목록의 펼침·상세 모달·hover 팝오버가 **같은 모양**을 쓰게 하려고 한 곳에 모았다.
 * 같은 정보가 화면마다 다르게 보이면 읽는 사람이 매번 다시 배워야 한다.
 *
 * 규칙 (설계 §2-5 / §2-6 / §2-6b):
 *  - 클릭 대상은 **줄 전체**다. 작은 아이콘을 조준하게 하지 않는다.
 *  - 링크만 예외 — 누르면 액션(새 탭/여기서 열기/복사)을 고르게 한다. 링크는 복사보다
 *    여는 경우가 많아서 바로 복사해버리면 대개 헛손질이 된다.
 *  - 긴 값은 칸을 뚫지 않고 줄바꿈, 라벨은 잘라내고 전체는 title 로.
 */

import React, { useState } from "react";
import { Check, Copy, ExternalLink, Link2, Mail, Phone } from "lucide-react";

import { Button } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";

/** 채널 종류 — 아이콘/라벨/정렬을 이 키 하나로 맞춘다. */
export type ContactChannel = "phone" | "email" | "link";

export const CHANNEL_META: Record<
  ContactChannel,
  { label: string; Icon: typeof Phone }
> = {
  phone: { label: "Phone", Icon: Phone },
  email: { label: "Email", Icon: Mail },
  link: { label: "Links", Icon: Link2 },
};

/**
 * 저장된 원문 → 실제로 열 수 있는 URL.
 *
 * 저장은 사용자가 적은 그대로 둔다(`order.sysco.com`). 스킴은 **여는 시점에만** 붙인다 —
 * 저장 때 고쳐 쓰면 사용자가 적은 것과 저장된 것이 달라지고 되돌릴 수도 없다.
 */
export function httpUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** 클립보드 복사 — 보안 컨텍스트가 아니면 textarea 폴백. */
async function copyText(value: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

/** 섹션 헤더 — 아이콘 + 라벨 + 개수. 팝오버·펼침·상세가 공유한다. */
export function SectionHead({
  channel,
  label,
  count,
  highlighted = false,
}: {
  channel?: ContactChannel;
  label?: string;
  count?: number;
  highlighted?: boolean;
}): React.ReactElement {
  const meta = channel ? CHANNEL_META[channel] : null;
  const Icon = meta?.Icon;
  return (
    <div
      className={`mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider ${
        highlighted ? "text-accent" : "text-text-muted"
      }`}
    >
      {Icon && <Icon size={13} />}
      <span>{label ?? meta?.label}</span>
      {count !== undefined && count > 1 && <span className="ml-auto">{count}</span>}
    </div>
  );
}

/**
 * 값 한 줄 — 누르면 복사된다(줄 전체가 대상).
 *
 * 복사되면 줄이 초록으로 바뀌었다 돌아온다. 조용히 성공하면 됐는지 알 수 없다.
 * `readOnly` 는 hover 팝오버용 — 떠 있는 판은 마우스가 도달하기 전에 사라지므로
 * 누를 수 있는 것처럼 보이게 두지 않는다.
 */
export function CopyLine({
  value,
  label,
  muted = false,
  readOnly = false,
}: {
  value: string;
  label?: string | null;
  muted?: boolean;
  readOnly?: boolean;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    try {
      await copyText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // 복사 실패는 조용히 넘기지 않는다 — 값은 화면에 그대로 있으니 직접 선택하면 된다.
      window.alert("Couldn't copy. Select the text and copy it manually.");
    }
  }

  if (readOnly) {
    return (
      <div className="flex min-w-0 items-baseline gap-2 py-0.5">
        <span className={`min-w-0 break-all ${muted ? "text-text-secondary" : "font-medium text-text"}`}>
          {value}
        </span>
        {label && (
          <span className="shrink truncate text-[11px] uppercase tracking-wide text-text-muted" title={label}>
            {label}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => void handleCopy(e)}
      title="Click to copy"
      className={`-mx-2 flex w-[calc(100%+1rem)] min-w-0 items-baseline gap-2 rounded-lg px-2 py-1 text-left transition-colors ${
        copied ? "bg-success-muted" : "hover:bg-surface-hover"
      }`}
    >
      <span
        className={`min-w-0 break-all ${
          copied ? "text-success" : muted ? "text-text-secondary" : "font-medium text-text"
        }`}
      >
        {value}
      </span>
      {label && (
        <span className="shrink truncate text-[11px] uppercase tracking-wide text-text-muted" title={label}>
          {label}
        </span>
      )}
      <span className={`ml-auto shrink-0 ${copied ? "text-success" : "text-text-muted"}`}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </span>
    </button>
  );
}

/** 링크 액션 모달 본문 — 새 탭 / 여기서 열기 / 복사. */
function LinkActions({
  url,
  label,
  onClose,
}: {
  url: string;
  label: string | null;
  onClose: () => void;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {label || "Link"}
        </p>
        <p className="mt-0.5 break-all text-sm font-medium text-accent">{url}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => {
            window.open(httpUrl(url), "_blank", "noopener,noreferrer");
            onClose();
          }}
          className="justify-start"
        >
          <ExternalLink size={15} /> Open in a new tab
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            window.location.href = httpUrl(url);
          }}
          className="justify-start"
        >
          Open here
        </Button>
        <Button
          variant="secondary"
          className="justify-start"
          onClick={() => {
            void copyText(url).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        &ldquo;Open here&rdquo; leaves Contacts in this tab.
      </p>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** 링크 한 줄 — 누르면 무엇을 할지 고르는 모달이 뜬다. */
export function LinkLine({
  url,
  label,
  readOnly = false,
}: {
  url: string;
  label?: string | null;
  readOnly?: boolean;
}): React.ReactElement {
  const modal = useModal();

  if (readOnly) {
    return (
      <div className="flex min-w-0 items-baseline gap-2 py-0.5">
        <span className="min-w-0 break-all font-medium text-accent">{url}</span>
        {label && (
          <span className="shrink truncate text-[11px] uppercase tracking-wide text-text-muted" title={label}>
            {label}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      title="Click for link actions"
      onClick={(e) => {
        e.stopPropagation();
        void modal.open(
          ({ close }) => (
            <LinkActions url={url} label={label ?? null} onClose={() => close()} />
          ),
          { title: "Link", size: "sm" },
        );
      }}
      className="-mx-2 flex w-[calc(100%+1rem)] min-w-0 items-baseline gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-accent-muted"
    >
      <span className="min-w-0 break-all font-medium text-accent">{url}</span>
      {label && (
        <span className="shrink truncate text-[11px] uppercase tracking-wide text-text-muted" title={label}>
          {label}
        </span>
      )}
      <span className="ml-auto shrink-0 text-text-muted">
        <ExternalLink size={13} />
      </span>
    </button>
  );
}
