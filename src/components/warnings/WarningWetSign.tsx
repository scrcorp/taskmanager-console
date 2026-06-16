"use client";

import React, { useEffect, useRef, useState } from "react";
import { Upload, FileText, Download, RefreshCw, ExternalLink, ChevronDown } from "lucide-react";
import type { Warning } from "@/types";
import { Button, LoadingSpinner } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { cn } from "@/lib/utils";
import { useUploadSignedPdf, fetchSignedPdfUrl } from "@/hooks/useWarnings";
import { buildWarningFilename } from "./filename";

// Mirrors the server limit (hiring 20MB constant reused server-side).
const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Validate a picked file is a PDF within the size limit; returns an error string or null. */
function validatePdf(file: File): string | null {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return "Please choose a PDF file.";
  if (file.size > MAX_PDF_BYTES) return "That PDF is larger than 20 MB. Please upload a smaller scan.";
  return null;
}

// ── Upload control (file picker + drag-drop) ────────────────────────────────
interface UploadProps {
  warningId: string;
  /** Optional document-signed date the uploader can record (YYYY-MM-DD). */
  defaultSignedOn?: string;
  /** Visual variant: a full drop zone (no PDF yet) or a compact "Replace" button. */
  variant?: "dropzone" | "replace";
}

export function WetUploadControl({
  warningId,
  defaultSignedOn,
  variant = "dropzone",
}: UploadProps): React.ReactElement {
  const modal = useModal();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [signedOn, setSignedOn] = useState(defaultSignedOn ?? "");
  const uploadMut = useUploadSignedPdf();

  async function handleFile(file: File): Promise<void> {
    const err = validatePdf(file);
    if (err) {
      void modal.alert({ type: "error", message: err });
      return;
    }
    try {
      await uploadMut.mutateAsync({
        warningId,
        file,
        signedOn: signedOn || undefined,
      });
    } catch {
      // hook surfaces the error (incl. 403 if the gate were bypassed)
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const hidden = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void handleFile(file);
      }}
    />
  );

  if (variant === "replace") {
    return (
      <>
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          isLoading={uploadMut.isPending}
          className="gap-1.5"
        >
          <RefreshCw className="h-4 w-4" />
          Replace
        </Button>
        {hidden}
      </>
    );
  }

  return (
    // 컴팩트한 한 줄 — 영역 어디든 PDF 를 드롭하면 처리(드래그 시 강조). 클릭은 버튼.
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2.5 transition-colors",
        dragging ? "border-accent bg-accent-muted" : "border-border bg-surface",
      )}
    >
      <Button
        variant="primary"
        onClick={() => inputRef.current?.click()}
        isLoading={uploadMut.isPending}
        className="gap-1.5"
      >
        <Upload className="h-4 w-4" />
        Upload signed PDF
      </Button>
      <span className="text-xs text-text-muted">or drop a PDF here — up to 20 MB</span>
      <label className="ml-auto flex items-center gap-2 text-xs text-text-secondary">
        <span className="whitespace-nowrap">Date signed on paper</span>
        <input
          type="date"
          value={signedOn}
          max={defaultSignedOn || undefined}
          onChange={(e) => setSignedOn(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1 text-text"
        />
      </label>
      {hidden}
    </div>
  );
}

// ── Signed PDF card (preview + download + replace) ──────────────────────────
interface CardProps {
  warning: Warning;
  /** Resolve a category code → live label (org categories). */
  categoryLabel?: (code: string) => string | undefined;
  /** Whether the current user may replace the uploaded scan. */
  canReplace: boolean;
}

export function SignedPdfCard({
  warning,
  categoryLabel,
  canReplace,
}: CardProps): React.ReactElement {
  const modal = useModal();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false); // 미리보기는 기본 접힘 — 펼칠 때만 표시
  const filename = buildWarningFilename(warning, categoryLabel);

  // The signed-PDF endpoint needs the auth header, so we fetch the bytes via the
  // authed client and wrap them in a blob: URL for the <iframe>. Re-fetch when
  // the warning updates (replace) so the preview reflects the latest scan.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setLoading(true);
    (async () => {
      try {
        url = await fetchSignedPdfUrl(warning.id);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setBlobUrl(url);
      } catch {
        if (!cancelled) setBlobUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [warning.id, warning.wet_uploaded_at]);

  async function handleDownload(): Promise<void> {
    try {
      const url = blobUrl ?? (await fetchSignedPdfUrl(warning.id));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (!blobUrl) URL.revokeObjectURL(url);
    } catch {
      void modal.alert({ type: "error", message: "Couldn't download the signed PDF." });
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-card overflow-hidden">
      {/* 헤더(탭) 전체 클릭 = 미리보기 펼치기/접기. 액션 버튼은 전파 차단(토글 안 됨). */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <FileText className="h-4 w-4 text-accent" />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-text">Signed PDF</div>
          <div className="truncate text-xs text-text-muted">{filename}</div>
        </div>
        <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {blobUrl && (
            <Button
              variant="ghost"
              onClick={() => window.open(blobUrl, "_blank", "noopener")}
              className="gap-1.5"
            >
              <ExternalLink className="h-4 w-4" />
              Open
            </Button>
          )}
          <Button variant="secondary" onClick={() => void handleDownload()} className="gap-1.5">
            <Download className="h-4 w-4" />
            Download
          </Button>
          {canReplace && <WetUploadControl warningId={warning.id} variant="replace" />}
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", expanded && "rotate-180")}
        />
      </div>
      {expanded && (
        <div className="h-[520px] bg-[#525659]">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : blobUrl ? (
            <iframe src={blobUrl} title="Signed warning PDF" className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/80">
              Couldn&apos;t load the preview. Try downloading the PDF instead.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
