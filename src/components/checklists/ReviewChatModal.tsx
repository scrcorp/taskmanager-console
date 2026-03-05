"use client";

/**
 * 리뷰 채팅 모달 — 통합 타임라인으로 확장.
 *
 * 표시 유형:
 * 1. 최초 완료: 시스템 메시지 (completed_at + photo + note)
 * 2. 리뷰 결과 변경: 시스템 메시지 (history[])
 * 3. 코멘트 (관리자/Staff): 채팅 버블 (contents[])
 * 4. 재제출: 시스템 메시지 (completion_history[])
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Send, Paperclip, Loader2, Trash2, RotateCcw, CheckCircle } from "lucide-react";
import { Modal, Lightbox } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAddReviewContent, useDeleteReviewContent, usePresignedUrl } from "@/hooks/useChecklistInstances";
import { useAuthStore } from "@/stores/authStore";
import { parseApiError } from "@/lib/utils";
import type { ReviewContent, ReviewHistoryItem, CompletionHistoryItem } from "@/types";

type TimelineEvent =
  | { type: "initial_completion"; created_at: string; photoUrl: string | null; note: string | null }
  | { type: "review_change"; created_at: string; data: ReviewHistoryItem }
  | { type: "comment"; created_at: string; data: ReviewContent }
  | { type: "resubmission"; created_at: string; data: CompletionHistoryItem };

interface ReviewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  itemIndex: number;
  itemTitle: string;
  reviewResult: string | null;
  contents: ReviewContent[];
  reviewHistory: ReviewHistoryItem[];
  completionHistory: CompletionHistoryItem[];
  completedAt: string | null;
  photoUrl: string | null;
  note: string | null;
}

function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

function formatChatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resultLabel(result: string): string {
  if (result === "pass") return "O";
  if (result === "fail") return "X";
  if (result === "pending_re_review") return "Re-review";
  return "△";
}

function resultColor(result: string): string {
  if (result === "pass") return "text-success";
  if (result === "fail") return "text-danger";
  if (result === "pending_re_review") return "text-accent";
  return "text-warning";
}

export function ReviewChatModal({
  isOpen,
  onClose,
  instanceId,
  itemIndex,
  itemTitle,
  reviewResult,
  contents,
  reviewHistory,
  completionHistory,
  completedAt,
  photoUrl,
  note,
}: ReviewChatModalProps): React.ReactElement {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const addContent = useAddReviewContent();
  const deleteContent = useDeleteReviewContent();
  const presignedUrl = usePresignedUrl();

  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Build unified timeline
  const timeline = useMemo(() => {
    const events: TimelineEvent[] = [];

    // Initial completion
    if (completedAt) {
      events.push({
        type: "initial_completion",
        created_at: completedAt,
        photoUrl,
        note,
      });
    }

    // Review history
    for (const h of reviewHistory) {
      events.push({ type: "review_change", created_at: h.created_at, data: h });
    }

    // Comments
    for (const c of contents) {
      events.push({ type: "comment", created_at: c.created_at, data: c });
    }

    // Resubmissions
    for (const ch of completionHistory) {
      events.push({ type: "resubmission", created_at: ch.created_at, data: ch });
    }

    // Sort by created_at
    events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return events;
  }, [completedAt, photoUrl, note, reviewHistory, contents, completionHistory]);

  // 스크롤 하단 유지
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [isOpen, timeline.length]);

  const handleSendText = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      await addContent.mutateAsync({
        instanceId,
        itemIndex,
        type: "text",
        content: trimmed,
      });
      setText("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to send.") });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { upload_url, file_url } = await presignedUrl.mutateAsync({
        filename: file.name,
        content_type: file.type,
      });
      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      const type = file.type.startsWith("video/") ? "video" : "photo";
      await addContent.mutateAsync({
        instanceId,
        itemIndex,
        type,
        content: file_url,
      });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to upload.") });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (contentId: string) => {
    try {
      await deleteContent.mutateAsync({ instanceId, itemIndex, contentId });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete.") });
    }
  };

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title={`Review — ${itemTitle}`} size="md">
      {/* 현재 리뷰 결과 표시 */}
      {reviewResult && (
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
          <span className="text-xs text-text-muted">Result:</span>
          <span className={`text-sm font-bold ${resultColor(reviewResult)}`}>
            {resultLabel(reviewResult)}
          </span>
        </div>
      )}

      {/* 통합 타임라인 */}
      <div className="max-h-[400px] overflow-y-auto space-y-3 mb-4">
        {timeline.length === 0 && (
          <p className="text-sm text-text-muted text-center py-8">No activity yet.</p>
        )}
        {timeline.map((event, i) => {
          if (event.type === "initial_completion") {
            return (
              <div key={`init-${i}`} className="flex justify-start">
                <div className="bg-success-muted rounded-lg px-4 py-2 max-w-[80%]">
                  <div className="flex items-center gap-1.5 text-xs text-success mb-1">
                    <CheckCircle size={12} />
                    <span className="font-medium">Completed</span>
                  </div>
                  {event.photoUrl && (
                    <div className="my-1">
                      {isVideo(event.photoUrl) ? (
                        <video src={event.photoUrl} controls className="max-w-full max-h-[120px] rounded mx-auto" />
                      ) : (
                        <button type="button" onClick={() => setLightboxSrc(event.photoUrl)} className="cursor-pointer">
                          <img src={event.photoUrl} alt="Evidence" className="max-w-full max-h-[120px] rounded mx-auto hover:opacity-80 transition-opacity" />
                        </button>
                      )}
                    </div>
                  )}
                  {event.note && (
                    <p className="text-xs text-text-secondary mt-1 break-words">{event.note}</p>
                  )}
                  <p className="text-[10px] text-text-muted mt-1 text-right">{formatChatTime(event.created_at)}</p>
                </div>
              </div>
            );
          }

          if (event.type === "review_change") {
            const h = event.data;
            return (
              <div key={`rh-${h.id}`} className="flex justify-center">
                <div className="bg-surface-hover rounded-lg px-4 py-1.5 text-center">
                  <p className="text-xs text-text-secondary">
                    <span className="font-medium">{h.changed_by_name ?? "Unknown"}</span>
                    {h.old_result ? (
                      <>
                        {" changed "}
                        <span className={resultColor(h.old_result)}>{resultLabel(h.old_result)}</span>
                        {" → "}
                        <span className={resultColor(h.new_result)}>{resultLabel(h.new_result)}</span>
                      </>
                    ) : (
                      <>
                        {" reviewed as "}
                        <span className={resultColor(h.new_result)}>{resultLabel(h.new_result)}</span>
                      </>
                    )}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">{formatChatTime(h.created_at)}</p>
                </div>
              </div>
            );
          }

          if (event.type === "comment") {
            const c = event.data;
            const isMe = user?.id === c.author_id;
            return (
              <div key={`c-${c.id}`} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                  <p className={`text-[10px] text-text-muted mb-0.5 ${isMe ? "text-right" : "text-left"}`}>
                    {c.author_name ?? "Unknown"}
                  </p>
                  <div className={`relative group rounded-lg px-3 py-2 ${
                    isMe ? "bg-accent/10 text-text" : "bg-surface-hover text-text"
                  }`}>
                    {c.type === "text" ? (
                      <p className="text-sm whitespace-pre-wrap break-words">{c.content}</p>
                    ) : c.type === "video" || isVideo(c.content) ? (
                      <video src={c.content} controls className="max-w-full max-h-[200px] rounded" />
                    ) : (
                      <button type="button" onClick={() => setLightboxSrc(c.content)} className="cursor-pointer">
                        <img src={c.content} alt="Review media" className="max-w-full max-h-[200px] rounded hover:opacity-80 transition-opacity" />
                      </button>
                    )}
                    {isMe && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="absolute -top-1 -right-1 hidden group-hover:flex w-5 h-5 rounded-full bg-danger text-white items-center justify-center"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                  <p className={`text-[10px] text-text-muted mt-0.5 ${isMe ? "text-right" : "text-left"}`}>
                    {formatChatTime(c.created_at)}
                  </p>
                </div>
              </div>
            );
          }

          if (event.type === "resubmission") {
            const ch = event.data;
            return (
              <div key={`rs-${ch.id}`} className="flex justify-start">
                <div className="bg-accent-muted rounded-lg px-4 py-2 max-w-[80%]">
                  <div className="flex items-center gap-1.5 text-xs text-accent mb-1">
                    <RotateCcw size={12} />
                    <span className="font-medium">Resubmitted</span>
                  </div>
                  <p className="text-[10px] text-text-muted mb-1">Previous submission ({formatChatTime(ch.submitted_at)})</p>
                  {ch.photo_url && (
                    <div className="my-1">
                      {isVideo(ch.photo_url) ? (
                        <video src={ch.photo_url} controls className="max-w-full max-h-[100px] rounded mx-auto opacity-60" />
                      ) : (
                        <button type="button" onClick={() => setLightboxSrc(ch.photo_url)} className="cursor-pointer">
                          <img src={ch.photo_url} alt="Previous evidence" className="max-w-full max-h-[100px] rounded mx-auto opacity-60 hover:opacity-80 transition-opacity" />
                        </button>
                      )}
                    </div>
                  )}
                  {ch.note && (
                    <p className="text-xs text-text-muted line-through break-words">{ch.note}</p>
                  )}
                  <p className="text-[10px] text-text-muted mt-1 text-right">{formatChatTime(ch.created_at)}</p>
                </div>
              </div>
            );
          }

          return null;
        })}
        <div ref={chatEndRef} />
      </div>

      {/* 입력 영역 — 리뷰가 있을 때만 표시 */}
      {reviewResult && (
        <div className="flex items-end gap-2 border-t border-border pt-3">
          {/* 파일 첨부 */}
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          {/* 텍스트 입력 */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {/* 전송 */}
          <button
            type="button"
            disabled={!text.trim() || isSending}
            onClick={handleSendText}
            className="p-2 rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      )}
    </Modal>

    {lightboxSrc && (
      <Lightbox
        isOpen
        onClose={() => setLightboxSrc(null)}
        src={lightboxSrc}
      />
    )}
  </>
  );
}
