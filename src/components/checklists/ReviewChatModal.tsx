"use client";

/**
 * 리뷰 채팅 모달 — 통합 타임라인 + 모달 내 O/X 판정 + 재제출 비교 뷰.
 *
 * 변경사항 (개선):
 * - 입력란 항상 활성 (reviewResult 조건 제거)
 * - 모달 상단에 O/X 판정 버튼 추가
 * - 재제출 시 이전 vs 새 사진 나란히 표시
 * - photo_urls 배열 지원
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Send, Paperclip, Loader2, Trash2, RotateCcw, CheckCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, Lightbox } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  useAddReviewContent,
  useDeleteReviewContent,
  usePresignedUrl,
  useUpsertItemReview,
  useDeleteItemReview,
} from "@/hooks/useChecklistInstances";
import { useAuthStore } from "@/stores/authStore";
import { parseApiError } from "@/lib/utils";
import type { ChecklistInstanceItem, ChecklistItemMessage } from "@/types";

type TimelineEvent =
  | { type: "initial_completion"; created_at: string; photoUrls: string[]; note: string | null }
  | { type: "review_change"; created_at: string; data: { id: string; old_result: string | null; new_result: string | null; changed_by_name: string | null; comment: string | null; created_at: string } }
  | { type: "comment"; created_at: string; data: ChecklistItemMessage; fileUrl?: string }
  | { type: "resubmission"; created_at: string; data: { id: string; note: string | null; submitted_at: string; photoUrls: string[] }; currentPhotoUrls: string[] };

interface ReviewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  itemIndex: number;
  itemTitle: string;
  reviewResult: string | null;
  item: ChecklistInstanceItem;
  onReviewChange?: () => void;
}

function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

function formatChatTime(isoString: string): string {
  const d = new Date(isoString);
  // e.g. "Mar 3, 6:24 PM"
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
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

function PhotoDisplay({ urls, onLightbox }: { urls: string[]; onLightbox: (src: string) => void }): React.ReactElement | null {
  if (urls.length === 0) return null;
  if (urls.length === 1) {
    const url = urls[0];
    return isVideo(url) ? (
      <video src={url} controls className="max-w-full max-h-[200px] rounded mx-auto" />
    ) : (
      <button type="button" onClick={() => onLightbox(url)} className="cursor-pointer block">
        <img src={url} alt="Evidence" className="max-w-full max-h-[200px] rounded mx-auto hover:opacity-80 transition-opacity" />
      </button>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1">
      {urls.slice(0, 4).map((url, i) => (
        <button key={url} type="button" onClick={() => onLightbox(url)} className="cursor-pointer block aspect-square overflow-hidden rounded relative">
          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
          {i === 3 && urls.length > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-bold rounded">
              +{urls.length - 3}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

export function ReviewChatModal({
  isOpen,
  onClose,
  instanceId,
  itemIndex,
  itemTitle,
  reviewResult,
  item,
  onReviewChange,
}: ReviewChatModalProps): React.ReactElement {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const addContent = useAddReviewContent();
  const deleteContent = useDeleteReviewContent();
  const presignedUrl = usePresignedUrl();
  const upsertReview = useUpsertItemReview();
  const deleteReview = useDeleteItemReview();

  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const timeline = useMemo(() => {
    const events: TimelineEvent[] = [];

    // Helper: get photos for a specific submission by context_id
    const allSubmissionFiles = item.files
      .filter((f) => f.context === "submission")
      .sort((a, b) => a.sort_order - b.sort_order);

    const getPhotosForSubmission = (subId: string) =>
      allSubmissionFiles.filter((f) => f.context_id === subId).map((f) => f.file_url);

    // Fallback: all submission photos (legacy items without context_id)
    const allSubmissionPhotoUrls = allSubmissionFiles.map((f) => f.file_url);

    // First submission = initial completion
    const firstSubmission = item.submissions[0] ?? null;
    if (firstSubmission) {
      const photos = getPhotosForSubmission(firstSubmission.id);
      events.push({
        type: "initial_completion",
        created_at: firstSubmission.submitted_at,
        photoUrls: photos.length > 0 ? photos : allSubmissionPhotoUrls,
        note: firstSubmission.note,
      });
    } else if (item.is_completed && item.completed_at) {
      events.push({
        type: "initial_completion",
        created_at: item.completed_at,
        photoUrls: allSubmissionPhotoUrls,
        note: null,
      });
    }

    // Resubmissions (version > 1) — each with its own photos
    for (const sub of item.submissions.slice(1)) {
      const subPhotos = getPhotosForSubmission(sub.id);
      events.push({
        type: "resubmission",
        created_at: sub.submitted_at,
        data: { id: sub.id, note: sub.note, submitted_at: sub.submitted_at, photoUrls: subPhotos },
        currentPhotoUrls: subPhotos,
      });
    }

    // Review log entries
    for (const log of item.reviews_log) {
      events.push({ type: "review_change", created_at: log.created_at, data: log });
    }

    // Chat messages (text) + chat files
    const chatFiles = item.files.filter((f) => f.context === "chat");
    for (const msg of item.messages) {
      // Find any chat file associated with this message via context_id
      const chatFile = chatFiles.find((f) => f.context_id === msg.id);
      events.push({ type: "comment", created_at: msg.created_at, data: msg, fileUrl: chatFile?.file_url });
    }

    events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return events;
  }, [item]);

  // Fetch fresh data (including latest messages) whenever modal opens
  useEffect(() => {
    if (isOpen) {
      queryClient.invalidateQueries({ queryKey: ["checklist-instances"] });
    }
  }, [isOpen, instanceId, queryClient]);

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
      await addContent.mutateAsync({ instanceId, itemIndex, type: "text", content: trimmed });
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
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const type = file.type.startsWith("video/") ? "video" : "photo";
      await addContent.mutateAsync({ instanceId, itemIndex, type, content: file_url });
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

  const handleReview = async (result: "pass" | "fail") => {
    if (isActing) return;
    setIsActing(true);
    try {
      if (reviewResult === result) {
        await deleteReview.mutateAsync({ instanceId, itemIndex });
      } else {
        await upsertReview.mutateAsync({ instanceId, itemIndex, result });
      }
      // Modal is open — refetch so timeline shows the review_change log entry
      queryClient.invalidateQueries({ queryKey: ["checklist-instances"] });
      onReviewChange?.();
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update review.") });
    } finally {
      setIsActing(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`Review — ${itemTitle}`} size="md" closeOnBackdrop={false}>
        {/* Review result + O/X buttons */}
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
          <span className="text-xs text-text-muted">Result:</span>
          {reviewResult ? (
            <span className={`text-sm font-bold ${resultColor(reviewResult)}`}>
              {resultLabel(reviewResult)}
            </span>
          ) : (
            <span className="text-xs text-text-muted italic">Unreviewed</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={isActing}
              onClick={() => handleReview("pass")}
              className={`w-8 h-8 rounded-md text-sm font-bold border-2 flex items-center justify-center transition-colors disabled:opacity-50 ${
                reviewResult === "pass"
                  ? "bg-success text-white border-success"
                  : "border-success/50 text-success hover:bg-success hover:text-white"
              }`}
              title="Pass"
            >
              O
            </button>
            <button
              type="button"
              disabled={isActing}
              onClick={() => handleReview("fail")}
              className={`w-8 h-8 rounded-md text-sm font-bold border-2 flex items-center justify-center transition-colors disabled:opacity-50 ${
                reviewResult === "fail"
                  ? "bg-danger text-white border-danger"
                  : "border-danger/50 text-danger hover:bg-danger hover:text-white"
              }`}
              title="Fail"
            >
              X
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="max-h-[380px] overflow-y-auto space-y-3 mb-4">
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
                    <PhotoDisplay urls={event.photoUrls} onLightbox={setLightboxSrc} />
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
                      {h.old_result && h.new_result ? (
                        <>
                          {" changed "}
                          <span className={resultColor(h.old_result)}>{resultLabel(h.old_result)}</span>
                          {" → "}
                          <span className={resultColor(h.new_result)}>{resultLabel(h.new_result)}</span>
                        </>
                      ) : h.new_result ? (
                        <>
                          {" reviewed as "}
                          <span className={resultColor(h.new_result)}>{resultLabel(h.new_result)}</span>
                        </>
                      ) : (
                        <>{" removed review"}</>
                      )}
                    </p>
                    {h.comment && (
                      <p className="text-[10px] text-text-secondary mt-0.5 italic">{h.comment}</p>
                    )}
                    <p className="text-[10px] text-text-muted mt-0.5">{formatChatTime(h.created_at)}</p>
                  </div>
                </div>
              );
            }

            if (event.type === "comment") {
              const c = event.data;
              const isMe = user?.id === c.author_id;
              const fileUrl = event.fileUrl ?? null;
              return (
                <div key={`c-${c.id}`} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                    <p className={`text-[10px] text-text-muted mb-0.5 ${isMe ? "text-right" : "text-left"}`}>
                      {c.author_name ?? "Unknown"}
                    </p>
                    <div className={`relative group rounded-lg px-3 py-2 ${isMe ? "bg-accent/10 text-text" : "bg-surface-hover text-text"}`}>
                      {fileUrl ? (
                        isVideo(fileUrl) ? (
                          <video src={fileUrl} controls className="max-w-full max-h-[200px] rounded" />
                        ) : (
                          <button type="button" onClick={() => setLightboxSrc(fileUrl)} className="cursor-pointer block">
                            <img src={fileUrl} alt="Review media" className="max-w-full max-h-[200px] rounded hover:opacity-80 transition-opacity" />
                          </button>
                        )
                      ) : c.content ? (
                        <p className="text-sm whitespace-pre-wrap break-words">{c.content}</p>
                      ) : null}
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
              const currUrls = event.currentPhotoUrls;
              return (
                <div key={`rs-${ch.id}`} className="flex justify-start">
                  <div className="bg-accent-muted rounded-lg px-4 py-2 max-w-[90%]">
                    <div className="flex items-center gap-1.5 text-xs text-accent mb-2">
                      <RotateCcw size={12} />
                      <span className="font-medium">Resubmitted</span>
                      <span className="text-[10px] text-text-muted ml-1">{formatChatTime(event.created_at)}</span>
                    </div>
                    {/* Previous submission note (struck through to indicate it was superseded) */}
                    {ch.note && (
                      <p className="text-xs text-text-muted line-through break-words mb-2">{ch.note}</p>
                    )}
                    {/* Current/latest photos */}
                    {currUrls.length > 0 && (
                      <div className="mt-1">
                        <p className="text-[10px] text-text-muted mb-1">Current submission</p>
                        <PhotoDisplay urls={currUrls} onLightbox={setLightboxSrc} />
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            return null;
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input area — always enabled */}
        <div className="flex items-end gap-2 border-t border-border pt-3">
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
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            disabled={!text.trim() || isSending}
            onClick={handleSendText}
            className="p-2 rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </Modal>

      {lightboxSrc && (
        <Lightbox isOpen onClose={() => setLightboxSrc(null)} src={lightboxSrc} />
      )}
    </>
  );
}
