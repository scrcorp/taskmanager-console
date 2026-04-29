"use client";

import { useState } from "react";
import { X, Download, Ban, Check, AlertTriangle } from "lucide-react";
import {
  useApplicationDetail,
  useBlockApplication,
  useHireApplication,
  usePatchApplication,
  useUnblockApplication,
  type ApplicationStage,
} from "@/hooks/useHiring";
import api from "@/lib/api";

interface Props {
  storeId: string;
  applicationId: string;
  onClose: () => void;
}

const STAGE_OPTIONS: { value: ApplicationStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "interview", label: "Interview" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function ApplicantDetailDrawer({ storeId, applicationId, onClose }: Props) {
  const { data, isLoading, error } = useApplicationDetail(applicationId);
  const patch = usePatchApplication(storeId);
  const hire = useHireApplication(storeId);
  const block = useBlockApplication(storeId);
  const unblock = useUnblockApplication(storeId);

  const [scoreInput, setScoreInput] = useState<string>("");
  const [blockReason, setBlockReason] = useState<string>("");
  const [showBlockBox, setShowBlockBox] = useState(false);
  const [usernameOverride, setUsernameOverride] = useState<string>("");

  const handleStageChange = (stage: ApplicationStage) => {
    patch.mutate({ applicationId, patch: { stage } });
  };

  const handleSetScore = () => {
    const v = parseInt(scoreInput, 10);
    if (Number.isNaN(v)) return;
    patch.mutate({ applicationId, patch: { score: v } });
    setScoreInput("");
  };

  const handleHire = async () => {
    try {
      await hire.mutateAsync({
        applicationId,
        usernameOverride: usernameOverride || undefined,
      });
      alert("Hired. Staff account created.");
      onClose();
    } catch (e) {
      const err = e as {
        response?: { data?: { detail?: { code?: string; message?: string } } };
      };
      const detail = err.response?.data?.detail;
      if (detail?.code === "username_taken") {
        const next = window.prompt(
          "Username already exists in this organization. Enter a different username:",
          (data?.candidate.username ?? "") + "_2",
        );
        if (next) {
          setUsernameOverride(next);
          await hire.mutateAsync({ applicationId, usernameOverride: next });
          onClose();
        }
      } else {
        alert(`Hire failed: ${detail?.message ?? detail?.code ?? "unknown"}`);
      }
    }
  };

  const handleBlock = async () => {
    await block.mutateAsync({ applicationId, reason: blockReason });
    setShowBlockBox(false);
    setBlockReason("");
  };

  const handleUnblock = async () => {
    await unblock.mutateAsync(applicationId);
  };

  const downloadAttachment = async (fileKey: string, fileName: string) => {
    try {
      // 가장 단순 — file_key를 그대로 url로 노출하는 storage endpoint가 있다면 사용.
      // 없으면 서버에 인증된 download endpoint 추가가 필요. 일단 file_key를 보여주는 것으로 충분.
      const res = await api.get(`/admin/storage/sign-download`, {
        params: { key: fileKey },
      });
      const url = res.data?.url ?? res.data?.download_url;
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
      } else {
        alert("Download URL not available.");
      }
    } catch {
      alert("Download not available in this environment. File key:\n" + fileKey);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[640px] flex-col overflow-hidden bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E4EA] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Applicant
            </p>
            <h2 className="mt-0.5 text-[16px] font-semibold text-[#1A1D27]">
              {data?.candidate.full_name ?? "…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F0F1F5]"
          >
            <X size={18} />
          </button>
        </div>

        {isLoading || !data ? (
          <div className="flex-1 px-5 py-10 text-center text-[12px] text-[#94A3B8]">
            {error ? "Failed to load applicant." : "Loading…"}
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto bg-[#F5F6FA] p-5">
            {data.is_blocked && (
              <div className="flex items-start gap-3 rounded-xl border border-[#EF4444]/30 bg-[rgba(239,68,68,0.06)] p-3">
                <AlertTriangle className="mt-0.5 flex-shrink-0 text-[#EF4444]" size={18} />
                <div className="flex-1">
                  <p className="text-[12.5px] font-semibold text-[#EF4444]">
                    Blocked from this store
                  </p>
                  {data.block?.reason && (
                    <p className="mt-0.5 text-[11.5px] text-[#64748B]">
                      Reason: {data.block.reason}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleUnblock}
                  className="rounded-md border border-[#E2E4EA] bg-white px-2.5 py-1 text-[11px] font-medium text-[#64748B] hover:bg-[#F0F1F5]"
                >
                  Unblock
                </button>
              </div>
            )}

            {/* Profile */}
            <div className="rounded-2xl border border-[#E2E4EA] bg-white p-4">
              <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Profile
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
                <dt className="text-[#94A3B8]">Username</dt>
                <dd className="text-[#1A1D27]">{data.candidate.username}</dd>
                <dt className="text-[#94A3B8]">Email</dt>
                <dd className="break-all text-[#1A1D27]">
                  {data.candidate.email}
                  {data.candidate.email_verified && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-[#00B894]">
                      <Check size={10} /> verified
                    </span>
                  )}
                </dd>
                {data.candidate.phone && (
                  <>
                    <dt className="text-[#94A3B8]">Phone</dt>
                    <dd className="text-[#1A1D27]">{data.candidate.phone}</dd>
                  </>
                )}
                <dt className="text-[#94A3B8]">Submitted</dt>
                <dd className="text-[#1A1D27]">{data.submitted_at.replace("T", " ").slice(0, 16)}</dd>
                <dt className="text-[#94A3B8]">Attempt</dt>
                <dd className="text-[#1A1D27]">#{data.attempt_no}</dd>
              </dl>
            </div>

            {/* Answers */}
            {data.data.answers.length > 0 && (
              <div className="rounded-2xl border border-[#E2E4EA] bg-white p-4">
                <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Answers
                </h3>
                <ul className="mt-2 space-y-2.5">
                  {data.data.answers.map((ans, i) => (
                    <li key={i}>
                      <p className="text-[11px] font-medium text-[#94A3B8]">{ans.label}</p>
                      <p className="mt-0.5 break-words text-[13px] text-[#1A1D27]">
                        {Array.isArray(ans.value)
                          ? ans.value.join(", ")
                          : ans.value === null || ans.value === ""
                          ? "—"
                          : String(ans.value)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Attachments */}
            {data.data.attachments.length > 0 && (
              <div className="rounded-2xl border border-[#E2E4EA] bg-white p-4">
                <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Attachments
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {data.data.attachments.map((att, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E4EA] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-[11.5px] font-medium text-[#94A3B8]">
                          {att.label}
                        </p>
                        <p className="truncate text-[12.5px] text-[#1A1D27]">
                          {att.file_name}{" "}
                          <span className="text-[10.5px] text-[#94A3B8]">
                            · {Math.round(att.file_size / 1024)} KB
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadAttachment(att.file_key, att.file_name)}
                        className="flex items-center gap-1.5 rounded-md border border-[#E2E4EA] bg-white px-2.5 py-1 text-[11.5px] font-medium text-[#64748B] hover:bg-[#F0F1F5]"
                      >
                        <Download size={12} />
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stage */}
            <div className="rounded-2xl border border-[#E2E4EA] bg-white p-4">
              <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Stage
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STAGE_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => handleStageChange(s.value)}
                    disabled={data.stage === s.value || data.stage === "hired"}
                    className={[
                      "rounded-md px-2.5 py-1 text-[11.5px] font-medium ring-1",
                      data.stage === s.value
                        ? "bg-[#6C5CE7] text-white ring-[#6C5CE7]"
                        : "bg-white text-[#64748B] ring-[#E2E4EA] hover:bg-[#F0F1F5]",
                    ].join(" ")}
                  >
                    {s.label}
                  </button>
                ))}
                <span
                  className={[
                    "rounded-md px-2.5 py-1 text-[11.5px] font-semibold ring-1",
                    data.stage === "hired"
                      ? "bg-[#00B894] text-white ring-[#00B894]"
                      : "bg-[#F0F1F5] text-[#94A3B8] ring-[#E2E4EA]",
                  ].join(" ")}
                >
                  Hired (use button below)
                </span>
              </div>

              {/* Score */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[11.5px] text-[#64748B]">Score:</span>
                <span className="text-[12.5px] font-mono text-[#1A1D27]">
                  {data.score ?? "—"}
                </span>
                <input
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  type="number"
                  placeholder="0–100"
                  className="ml-2 w-20 rounded border border-[#E2E4EA] px-1.5 py-0.5 text-[11.5px] outline-none focus:border-[#6C5CE7]"
                />
                <button
                  type="button"
                  onClick={handleSetScore}
                  className="rounded border border-[#E2E4EA] bg-white px-2 py-0.5 text-[11px] hover:bg-[#F0F1F5]"
                >
                  Set
                </button>
              </div>
            </div>

            {/* History */}
            {data.history.length > 0 && (
              <div className="rounded-2xl border border-[#E2E4EA] bg-white p-4">
                <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Previous applications to this store
                </h3>
                <ul className="mt-2 space-y-1 text-[11.5px]">
                  {data.history.map((h) => (
                    <li
                      key={h.id}
                      className="flex justify-between text-[#64748B]"
                    >
                      <span>
                        #{h.attempt_no} · {h.submitted_at.slice(0, 10)}
                      </span>
                      <span className="text-[#94A3B8]">{h.stage}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        {data && (
          <div className="border-t border-[#E2E4EA] bg-white px-5 py-3">
            {showBlockBox ? (
              <div className="flex items-center gap-2">
                <input
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Block reason (only visible to admins)"
                  className="flex-1 rounded-lg border border-[#E2E4EA] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#EF4444]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleBlock}
                  className="rounded-lg bg-[#EF4444] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#DC2626]"
                >
                  Confirm block
                </button>
                <button
                  type="button"
                  onClick={() => setShowBlockBox(false)}
                  className="rounded-lg border border-[#E2E4EA] bg-white px-3 py-1.5 text-[12px] font-medium text-[#64748B] hover:bg-[#F0F1F5]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                {!data.is_blocked ? (
                  <button
                    type="button"
                    onClick={() => setShowBlockBox(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-[#E2E4EA] bg-white px-3 py-1.5 text-[12px] font-medium text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)]"
                  >
                    <Ban size={14} />
                    Block from this store
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={handleHire}
                  disabled={data.stage === "hired" || hire.isPending}
                  className="rounded-lg bg-[#00B894] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#00997A] disabled:opacity-50"
                >
                  {data.stage === "hired"
                    ? "Already hired"
                    : hire.isPending
                    ? "Hiring…"
                    : "Hire — create staff account"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
