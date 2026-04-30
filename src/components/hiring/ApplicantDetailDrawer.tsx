"use client";

import { useEffect, useState } from "react";
import {
  X,
  Download,
  Ban,
  Check,
  AlertTriangle,
  ExternalLink,
  Eye,
  Clock,
} from "lucide-react";
import {
  useApplicationDetail,
  useBlockApplication,
  useHireApplication,
  usePatchApplication,
  useUnblockApplication,
  useUnhireApplication,
  type ApplicationStage,
} from "@/hooks/useHiring";
import api from "@/lib/api";

interface Props {
  storeId: string;
  applicationId: string;
  onClose: () => void;
  /** 풀페이지 모드 — 새 탭에서 열렸을 때 backdrop/뉴탭 버튼 숨김. 기본 false (drawer). */
  fullPage?: boolean;
}

const STAGE_OPTIONS: { value: ApplicationStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "interview", label: "Interview" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function ApplicantDetailDrawer({ storeId, applicationId, onClose, fullPage = false }: Props) {
  const { data, isLoading, error } = useApplicationDetail(applicationId);
  const patch = usePatchApplication(storeId);
  const hire = useHireApplication(storeId);
  const unhire = useUnhireApplication(storeId);
  const block = useBlockApplication(storeId);
  const unblock = useUnblockApplication(storeId);

  const [scoreInput, setScoreInput] = useState<string>("");
  const [blockReason, setBlockReason] = useState<string>("");
  const [showBlockBox, setShowBlockBox] = useState(false);
  const [usernameOverride, setUsernameOverride] = useState<string>("");
  const [showHireDialog, setShowHireDialog] = useState(false);
  const [hireUsername, setHireUsername] = useState<string>("");
  const [hireError, setHireError] = useState<string | null>(null);
  const [showUnhireDialog, setShowUnhireDialog] = useState(false);
  const [unhireError, setUnhireError] = useState<string | null>(null);

  const handleUnhire = async () => {
    setUnhireError(null);
    try {
      await unhire.mutateAsync(applicationId);
      setShowUnhireDialog(false);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: { message?: string } } } };
      setUnhireError(err.response?.data?.detail?.message ?? "Unhire failed.");
    }
  };

  const handleStageChange = (stage: ApplicationStage) => {
    patch.mutate({ applicationId, patch: { stage } });
  };

  const handleSetScore = () => {
    const v = parseInt(scoreInput, 10);
    if (Number.isNaN(v)) return;
    patch.mutate({ applicationId, patch: { score: v } });
    setScoreInput("");
  };

  const [pendingUserId, setPendingUserId] = useState<string>("");
  const [pendingPin, setPendingPin] = useState<string>("");

  const openHireDialog = async () => {
    setHireUsername(data?.candidate.username ?? "");
    setHireError(null);
    const uuid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
    setPendingUserId(uuid);
    setPendingPin("");
    setShowHireDialog(true);
    // PIN preview fetch
    try {
      const res = await api.get(`/admin/hiring/stores/${storeId}/preview-pin`);
      setPendingPin(res.data?.clockin_pin ?? "");
    } catch {
      setPendingPin("");
    }
  };

  const confirmHire = async () => {
    setHireError(null);
    try {
      const finalUsername = hireUsername.trim();
      await hire.mutateAsync({
        applicationId,
        usernameOverride:
          finalUsername && finalUsername !== data?.candidate.username
            ? finalUsername
            : undefined,
        userId: pendingUserId || undefined,
        clockinPin: pendingPin || undefined,
      });
      setShowHireDialog(false);
      onClose();
    } catch (e) {
      const err = e as {
        response?: { data?: { detail?: { code?: string; message?: string } } };
      };
      const detail = err.response?.data?.detail;
      if (detail?.code === "username_taken") {
        setHireError(
          `Username "${hireUsername}" is already in use in this organization. Try a different one.`,
        );
        setHireUsername((u) => (u || data?.candidate.username || "") + "_2");
      } else {
        setHireError(`Hire failed: ${detail?.message ?? detail?.code ?? "unknown"}`);
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
    <div
      className={
        fullPage
          ? "flex min-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[#E2E4EA]"
          : "fixed inset-0 z-50 flex justify-end bg-black/30"
      }
      onClick={fullPage ? undefined : onClose}
    >
      <div
        className={
          fullPage
            ? "flex flex-1 flex-col overflow-hidden bg-white"
            : "flex h-full w-full max-w-[640px] flex-col overflow-hidden bg-white shadow-2xl"
        }
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
          <div className="flex items-center gap-1">
            {!fullPage && (
              <a
                href={`/hiring/applications/${applicationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F0F1F5]"
                title="Open in new tab"
              >
                <ExternalLink size={16} />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F0F1F5]"
              title={fullPage ? "Back" : "Close"}
            >
              <X size={18} />
            </button>
          </div>
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
                <dt className="text-[#94A3B8]">ID</dt>
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
                <ul className="mt-2 space-y-2">
                  {data.data.attachments.map((att, i) => (
                    <AttachmentRow
                      key={i}
                      att={att}
                      onDownload={() =>
                        downloadAttachment(att.file_key, att.file_name)
                      }
                    />
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

            {/* Audit log — stage/score/notes 변경 이력 */}
            {data.audit_log && data.audit_log.length > 0 && (
              <div className="rounded-2xl border border-[#E2E4EA] bg-white p-4">
                <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  <Clock size={12} /> Activity
                </h3>
                <ul className="mt-2 space-y-2">
                  {data.audit_log.map((entry, i) => (
                    <li
                      key={i}
                      className="border-l-2 border-[#E2E4EA] pl-3 text-[11.5px]"
                    >
                      <p className="text-[#1A1D27]">
                        <span className="font-medium">{entry.by_full_name}</span>{" "}
                        <span className="text-[#64748B]">
                          {entry.action === "stage" &&
                            `changed stage: ${String(entry.before)} → ${String(entry.after)}`}
                          {entry.action === "score" &&
                            `set score: ${entry.before ?? "—"} → ${entry.after ?? "—"}`}
                          {entry.action === "notes" && "updated notes"}
                          {entry.action === "interview_at" && (
                            <>
                              scheduled interview:{" "}
                              {entry.after
                                ? String(entry.after).replace("T", " ").slice(0, 16)
                                : "—"}
                            </>
                          )}
                        </span>
                      </p>
                      {entry.note && (
                        <p className="mt-0.5 text-[10.5px] italic text-[#64748B]">
                          {entry.note}
                        </p>
                      )}
                      <p className="text-[10.5px] text-[#94A3B8]">
                        {entry.at.replace("T", " ").slice(0, 16)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* History — 같은 매장 이전 application 시도들 */}
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
                {data.stage === "hired" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUnhireError(null);
                      setShowUnhireDialog(true);
                    }}
                    disabled={unhire.isPending}
                    className="rounded-lg border border-[#EF4444] bg-white px-4 py-1.5 text-[12.5px] font-semibold text-[#EF4444] hover:bg-[rgba(239,68,68,0.06)] disabled:opacity-50"
                  >
                    Undo hire
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openHireDialog}
                    disabled={hire.isPending}
                    className="rounded-lg bg-[#00B894] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#00997A] disabled:opacity-50"
                  >
                    {hire.isPending ? "Hiring…" : "Hire — create staff account"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unhire confirmation modal */}
      {showUnhireDialog && data && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !unhire.isPending && setShowUnhireDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-[#1A1D27]">
              Undo hire?
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#64748B]">
              This will:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] leading-relaxed text-[#1A1D27]">
              <li>Remove this staff from this store&apos;s roster</li>
              <li>Move the application back to <span className="font-semibold">Reviewing</span></li>
            </ul>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[#94A3B8]">
              The user account itself stays (so they keep access to any other
              stores they&apos;re assigned to). To delete the account entirely,
              do it from the Staff page.
            </p>
            {unhireError && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
                {unhireError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnhireDialog(false)}
                disabled={unhire.isPending}
                className="rounded-lg border border-[#E2E4EA] bg-white px-4 py-2 text-[13px] font-medium text-[#64748B] hover:bg-[#F0F1F5] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnhire}
                disabled={unhire.isPending}
                className="rounded-lg bg-[#EF4444] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#DC2626] disabled:opacity-50"
              >
                {unhire.isPending ? "Undoing…" : "Undo hire"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hire confirmation modal */}
      {showHireDialog && data && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !hire.isPending && setShowHireDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-[#1A1D27]">
              Hire this applicant?
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#64748B]">
              A new staff account will be created and assigned to this store.
              The applicant will be able to log in immediately. This cannot be
              undone from this screen.
            </p>

            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 rounded-lg border border-[#E2E4EA] bg-[#F5F6FA] p-3 text-[12.5px]">
              {/* 1) 누구 — 사람 정체성 */}
              <dt className="text-[#94A3B8]">Name</dt>
              <dd className="text-[#1A1D27]">{data.candidate.full_name}</dd>
              <dt className="text-[#94A3B8]">Email</dt>
              <dd className="break-all text-[#1A1D27]">{data.candidate.email}</dd>
              {/* 2) 어떤 자격으로 — 권한 */}
              <dt className="text-[#94A3B8]">Role</dt>
              <dd className="text-[#1A1D27]">Staff</dd>
              {/* 3) 로그인 / 출퇴근 자격증명 */}
              <dt className="text-[#94A3B8]">Login ID</dt>
              <dd className="font-mono text-[#1A1D27]">
                {hireUsername || data.candidate.username}
              </dd>
              <dt className="text-[#94A3B8]">PIN</dt>
              <dd className="font-mono text-[#1A1D27]">
                {pendingPin ? (
                  <span className="tracking-[0.2em]">{pendingPin}</span>
                ) : (
                  <span className="text-[#94A3B8]">…</span>
                )}
              </dd>
            </dl>

            {hireError && (
              <>
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
                  {hireError}
                </p>
                <label className="mt-3 block text-[11.5px] font-medium text-[#64748B]">
                  New Login ID
                </label>
                <input
                  value={hireUsername}
                  onChange={(e) => setHireUsername(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#E2E4EA] px-3 py-2 text-[13px] outline-none focus:border-[#6C5CE7]"
                />
                <p className="mt-0.5 text-[10.5px] text-[#94A3B8]">
                  The applicant&apos;s sign-up ID conflicts with an existing
                  staff. Pick a different ID for their staff account.
                </p>
              </>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowHireDialog(false)}
                disabled={hire.isPending}
                className="rounded-lg border border-[#E2E4EA] bg-white px-4 py-2 text-[13px] font-medium text-[#64748B] hover:bg-[#F0F1F5] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmHire}
                disabled={hire.isPending || !hireUsername.trim()}
                className="rounded-lg bg-[#00B894] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#00997A] disabled:opacity-50"
              >
                {hire.isPending ? "Hiring…" : "Confirm hire"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AttachmentInfo {
  slot_id: string;
  label: string;
  file_key: string;
  file_name: string;
  file_size: number;
  mime_type: string;
}

function AttachmentRow({
  att,
  onDownload,
}: {
  att: AttachmentInfo;
  onDownload: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const isImage = att.mime_type?.startsWith("image/");
  const isPdf = att.mime_type === "application/pdf";

  // 이미지는 thumbnail용으로 mount 시 자동 fetch
  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    (async () => {
      const url = await fetchUrl();
      if (!cancelled) setPreviewUrl(url);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att.file_key, isImage]);

  const fetchUrl = async (): Promise<string | null> => {
    try {
      const res = await api.get(`/admin/storage/sign-download`, {
        params: { key: att.file_key },
      });
      return res.data?.url ?? res.data?.download_url ?? null;
    } catch {
      return null;
    }
  };

  const ensureUrl = async () => {
    if (previewUrl) return previewUrl;
    setLoading(true);
    try {
      const url = await fetchUrl();
      setPreviewUrl(url);
      return url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="rounded-lg border border-[#E2E4EA] bg-white p-2.5">
      <div className="flex items-center gap-2.5">
        {isImage && previewUrl ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-[#F0F1F5]"
            title="Click to enlarge"
          >
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </button>
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-[#F0F1F5] text-[10px] font-semibold uppercase text-[#94A3B8]">
            {isPdf ? "PDF" : (att.mime_type?.split("/")[1] ?? "FILE").slice(0, 4)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-medium text-[#94A3B8]">{att.label}</p>
          <p className="truncate text-[12.5px] text-[#1A1D27]">
            {att.file_name}{" "}
            <span className="text-[10.5px] text-[#94A3B8]">
              · {Math.round(att.file_size / 1024)} KB
            </span>
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-1">
          {(isImage || isPdf) && (
            <button
              type="button"
              onClick={async () => {
                const url = await ensureUrl();
                if (url) setOpen(true);
              }}
              disabled={loading}
              className="flex items-center gap-1 rounded-md border border-[#E2E4EA] bg-white px-2 py-1 text-[11px] font-medium text-[#64748B] hover:bg-[#F0F1F5] disabled:opacity-50"
              title="Preview"
            >
              <Eye size={12} />
              {loading ? "…" : "Preview"}
            </button>
          )}
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1 rounded-md border border-[#E2E4EA] bg-white px-2 py-1 text-[11px] font-medium text-[#64748B] hover:bg-[#F0F1F5]"
          >
            <Download size={12} />
            Download
          </button>
        </div>
      </div>

      {/* Preview overlay */}
      {open && previewUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
          <div
            className="flex h-full max-h-[90vh] w-full max-w-[1100px] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {isImage ? (
              <img
                src={previewUrl}
                alt={att.file_name}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            ) : isPdf ? (
              <iframe
                src={previewUrl}
                title={att.file_name}
                className="h-full w-full rounded-lg bg-white"
              />
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}
