"use client";

import { useMemo, useRef, useState } from "react";
import { Copy, Check, Download, Printer } from "lucide-react";
import { encodeUuid } from "@/lib/url-encoding";
import { useSetAcceptingSignups } from "@/hooks/useHiring";
import { useStore } from "@/hooks/useStores";
import { QrCanvas, type QrCanvasHandle } from "./QrCanvas";

interface Props {
  storeId: string;
}

export function LinkAndQrPanel({ storeId }: Props) {
  const { data: store } = useStore(storeId);
  const setAccepting = useSetAcceptingSignups(storeId);

  const origin = useMemo(() => {
    const explicit = process.env.NEXT_PUBLIC_SIGNUP_BASE_URL;
    return (
      (explicit && explicit.replace(/\/$/, "")) ||
      (typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://hermesops.site")
    );
  }, []);
  const url = useMemo(
    () => (store ? `${origin}/join/${encodeUuid(store.id)}` : ""),
    [store, origin],
  );
  const directUrl = useMemo(
    () => (store ? `${origin}/direct/${encodeUuid(store.id)}` : ""),
    [store, origin],
  );

  const [copied, setCopied] = useState(false);
  const [directCopied, setDirectCopied] = useState(false);
  const accepting = (store as { accepting_signups?: boolean } | undefined)?.accepting_signups ?? true;
  const qrRef = useRef<QrCanvasHandle>(null);
  const directQrRef = useRef<QrCanvasHandle>(null);

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store";

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const handleCopyDirect = async () => {
    if (!directUrl) return;
    try {
      await navigator.clipboard.writeText(directUrl);
      setDirectCopied(true);
      setTimeout(() => setDirectCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const handleDownload = async (kind: "signup" | "direct" = "signup") => {
    if (!store) return;
    const ref = kind === "direct" ? directQrRef : qrRef;
    const blob = await ref.current?.toPngBlob();
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${kind}-qr-${slugify(store.name)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const handlePrint = (kind: "signup" | "direct" = "signup") => {
    if (!store) return;
    const ref = kind === "direct" ? directQrRef : qrRef;
    const dataUrl = ref.current?.toPngDataUrl();
    if (!dataUrl) return;
    const targetUrl = kind === "direct" ? directUrl : url;
    const eyebrowLabel =
      kind === "direct" ? "Direct staff signup" : "New hire signup";
    const leadCopy =
      kind === "direct"
        ? "Trusted staff only. Scanning this skips the applicant review and adds you to the team immediately."
        : "Scan this QR code with your phone camera to apply. Takes about 2 minutes.";
    const w = window.open("", "_blank", "width=860,height=1180");
    if (!w) return;
    const escapedName = store.name.replace(/[<>&]/g, (c) =>
      c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
    );
    const escapedUrl = targetUrl.replace(/[<>&]/g, (c) =>
      c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
    );
    w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${eyebrowLabel} QR · ${escapedName}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    html, body { margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, sans-serif; color: #1A1D27; }
    .poster { display: flex; flex-direction: column; align-items: center; padding: 32px 24px; text-align: center; }
    .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: #6C5CE7; }
    h1 { font-size: 32px; font-weight: 700; margin: 8px 0 4px; letter-spacing: -0.01em; }
    p.lead { font-size: 14px; color: #64748B; margin: 0 0 32px; max-width: 480px; line-height: 1.5; }
    .qr-wrap { padding: 24px; background: #F5F6FA; border-radius: 24px; }
    img.qr { display: block; width: 360px; height: 360px; border-radius: 12px; background: #fff; }
    .scan-hint { margin-top: 24px; font-size: 16px; font-weight: 600; }
    .url { margin-top: 12px; font-family: ui-monospace, monospace; font-size: 11px; color: #64748B; word-break: break-all; max-width: 540px; }
    .footer { margin-top: 28px; font-size: 11px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="poster">
    <div class="eyebrow">${eyebrowLabel}</div>
    <h1>${escapedName}</h1>
    <p class="lead">${leadCopy}</p>
    <div class="qr-wrap"><img class="qr" src="${dataUrl}" alt="Signup QR code" /></div>
    <div class="scan-hint">Scan with your phone camera</div>
    <div class="url">${escapedUrl}</div>
    <div class="footer">hermesops · powered by TaskManager</div>
  </div>
  <script>
    (function () {
      var closed = false;
      function done() { if (closed) return; closed = true; window.close(); }
      window.addEventListener('load', function () {
        window.addEventListener('afterprint', done);
        // Safari 등 afterprint를 못 잡는 브라우저용 폴백
        var mq = window.matchMedia('print');
        if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { if (!e.matches) done(); });
        setTimeout(function () { window.print(); }, 200);
      });
    })();
  </script>
</body>
</html>`);
    w.document.close();
  };

  if (!store) {
    return (
      <div className="rounded-2xl border border-[#E2E4EA] bg-white p-6 text-[13px] text-[#94A3B8]">
        Loading store…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status + accept toggle */}
      <div className="flex items-center justify-between rounded-2xl border border-[#E2E4EA] bg-white p-4">
        <div className="flex items-center gap-3">
          <div
            className={
              accepting
                ? "flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(0,184,148,0.1)] text-[#00B894]"
                : "flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0F1F5] text-[#94A3B8]"
            }
          >
            {accepting ? <Check size={20} /> : <Copy size={20} />}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#1A1D27]">
              {accepting ? "Accepting signups" : "Signups paused"}
            </p>
            <p className="mt-0.5 text-[12px] text-[#64748B]">
              {accepting
                ? "New hires can register through this link."
                : "Anyone visiting the link sees a paused message."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAccepting.mutate(!accepting)}
          disabled={setAccepting.isPending}
          className={
            accepting
              ? "relative h-6 w-11 flex-shrink-0 rounded-full bg-[#00B894] transition-colors disabled:opacity-60"
              : "relative h-6 w-11 flex-shrink-0 rounded-full bg-[#CBD5E1] transition-colors disabled:opacity-60"
          }
          aria-pressed={accepting}
        >
          <span
            className={
              accepting
                ? "absolute left-[22px] top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                : "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
            }
          />
        </button>
      </div>

      {/* Signup link card — link + dedicated QR */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3 rounded-2xl border border-[#E2E4EA] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-[#1A1D27]">
                Signup link
                <span className="ml-2 rounded-full bg-[rgba(108,92,231,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#5A4BD1] ring-1 ring-[rgba(108,92,231,0.25)]">
                  Applicant review
                </span>
              </h3>
              <p className="mt-0.5 text-[12px] text-[#64748B]">
                Share this URL with new hires. They land in your Applicants
                inbox first.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 overflow-hidden rounded-lg bg-[#F5F6FA] px-3 py-2.5 text-[12px] ring-1 ring-[#E2E4EA]">
              <span className="truncate font-mono text-[#1A1D27]">{url}</span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C5CE7] px-3.5 py-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#5A4BD1]"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="rounded-lg bg-[rgba(108,92,231,0.08)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#5A4BD1] ring-1 ring-[rgba(108,92,231,0.15)]">
            People who apply through this link land in your{" "}
            <span className="font-semibold">Applicants</span> inbox at{" "}
            <span className="font-semibold">{store.name}</span>. They become
            Staff only after you Hire them.
          </div>
        </div>

        <div className="rounded-2xl border border-[#6C5CE7]/30 bg-white p-5 ring-1 ring-[rgba(108,92,231,0.15)]">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-[#1A1D27]">
              Signup QR
            </h3>
            <span className="rounded-full bg-[rgba(108,92,231,0.12)] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-[#5A4BD1]">
              Applicant
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[#64748B]">
            Scan → applies to {store.name}.
          </p>
          <div className="mt-3 flex items-center justify-center rounded-xl bg-[#F5F6FA] p-4">
            <QrCanvas ref={qrRef} data={url} size={180} margin={2} />
          </div>
          <div className="mt-3 space-y-1.5">
            <button
              type="button"
              onClick={() => handleDownload("signup")}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1A1D27] px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#22252F]"
            >
              <Download size={14} />
              Download PNG
            </button>
            <button
              type="button"
              onClick={() => handlePrint("signup")}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#E2E4EA] bg-white px-3 py-2 text-[12px] font-medium text-[#64748B] transition-colors hover:bg-[#F0F1F5]"
            >
              <Printer size={14} />
              Print poster
            </button>
          </div>
        </div>
      </div>

      {/* Direct staff link card — link + dedicated QR */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3 rounded-2xl border border-[#E2E4EA] bg-white p-5">
          <div>
            <h3 className="text-[14px] font-semibold text-[#1A1D27]">
              Direct staff link
              <span className="ml-2 rounded-full bg-[rgba(0,184,148,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#00997A] ring-1 ring-[rgba(0,184,148,0.25)]">
                Skip review
              </span>
            </h3>
            <p className="mt-0.5 text-[12px] text-[#64748B]">
              Use only for trusted staff. Sign-ups become Staff immediately
              without going through the Applicants inbox.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 overflow-hidden rounded-lg bg-[#F5F6FA] px-3 py-2.5 text-[12px] ring-1 ring-[#E2E4EA]">
              <span className="truncate font-mono text-[#1A1D27]">
                {directUrl}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyDirect}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#00B894] bg-white px-3.5 py-2.5 text-[12px] font-medium text-[#00997A] transition-colors hover:bg-[rgba(0,184,148,0.06)]"
            >
              {directCopied ? <Check size={14} /> : <Copy size={14} />}
              {directCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="rounded-lg bg-[rgba(0,184,148,0.08)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#00997A] ring-1 ring-[rgba(0,184,148,0.15)]">
            <span className="font-semibold">Warning:</span> anyone who scans
            this becomes a Staff member at{" "}
            <span className="font-semibold">{store.name}</span> immediately.
            Don&apos;t post in public spaces.
          </div>
        </div>

        <div className="rounded-2xl border border-[#00B894]/30 bg-white p-5 ring-1 ring-[rgba(0,184,148,0.15)]">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-[#1A1D27]">
              Direct staff QR
            </h3>
            <span className="rounded-full bg-[rgba(0,184,148,0.12)] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-[#00997A]">
              Trusted
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[#64748B]">
            Scan → instant staff at {store.name}.
          </p>
          <div className="mt-3 flex items-center justify-center rounded-xl bg-[rgba(0,184,148,0.06)] p-4">
            <QrCanvas
              ref={directQrRef}
              data={directUrl}
              size={180}
              margin={2}
            />
          </div>
          <div className="mt-3 space-y-1.5">
            <button
              type="button"
              onClick={() => handleDownload("direct")}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00B894] px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#00A380]"
            >
              <Download size={14} />
              Download PNG
            </button>
            <button
              type="button"
              onClick={() => handlePrint("direct")}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#E2E4EA] bg-white px-3 py-2 text-[12px] font-medium text-[#64748B] transition-colors hover:bg-[#F0F1F5]"
            >
              <Printer size={14} />
              Print poster
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
