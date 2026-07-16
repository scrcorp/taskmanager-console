"use client";

/**
 * 리뷰 스레드 — 통합 타임라인 + 메시지 입력 + (옵션) O/X 판정.
 *
 * `ReviewChatModal` 의 본문을 분리한 재사용 컴포넌트.
 * - 모달(`ReviewChatModal`)에서는 O/X 헤더 포함 + 열릴 때 하단 스크롤.
 * - 인라인 펼침(`ChecklistItemRow`)에서는 O/X 헤더 없이 타임라인 + 입력만.
 *
 * 타임라인 구성: 최초 완료 → 재제출 → 리뷰 변경 로그 → 댓글, 시간순 정렬.
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Send, Paperclip, Loader2, Trash2, RotateCcw, CheckCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Lightbox, TimeWatermark } from "@/components/ui";
import {
  useAddReviewContent,
  useDeleteReviewContent,
  usePresignedUrl,
  useUpsertItemReview,
  useDeleteItemReview,
} from "@/hooks/useChecklistInstances";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { toReviewPhotos, photoWatermarkTime, type ReviewPhoto } from "@/lib/photos";
import type { ChecklistInstanceItem, ChecklistItemMessage } from "@/types";

type TimelineEvent =
  | { type: "initial_completion"; created_at: string; photos: ReviewPhoto[]; note: string | null }
  | { type: "review_change"; created_at: string; data: { id: string; old_result: string | null; new_result: string | null; changed_by_name: string | null; comment: string | null; created_at: string } }
  | { type: "comment"; created_at: string; data: ChecklistItemMessage; file?: ReviewPhoto }
  | { type: "resubmission"; created_at: string; data: { id: string; note: string | null; submitted_at: string }; currentPhotos: ReviewPhoto[] };

interface ReviewThreadProps {
  instanceId: string;
  itemIndex: number;
  item: ChecklistInstanceItem;
  reviewResult: string | null;
  /** store/org 타임존 — 사진 워터마크 시각 변환용. */
  timezone?: string;
  onReviewChange?: () => void;
  /** O/X 판정 헤더 표시 여부. 모달=true, 인라인=false (행에 이미 O/X 있음). */
  showReviewControls?: boolean;
  /** 마운트 시 타임라인을 하단으로 스크롤. 모달=true, 인라인=false. */
  autoScrollOnMount?: boolean;
  className?: string;
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

function PhotoDisplay({
  photos,
  timezone,
  onLightbox,
}: {
  photos: ReviewPhoto[];
  timezone?: string;
  onLightbox: (photo: ReviewPhoto) => void;
}): React.ReactElement | null {
  if (photos.length === 0) return null;
  if (photos.length === 1) {
    const photo = photos[0];
    return isVideo(photo.url) ? (
      <video src={photo.url} controls className="max-w-full max-h-[200px] rounded mx-auto" />
    ) : (
      <button type="button" onClick={() => onLightbox(photo)} className="cursor-pointer block relative">
        <img src={photo.thumbUrl} alt="Evidence" className="max-w-full max-h-[200px] rounded mx-auto hover:opacity-80 transition-opacity" />
        <TimeWatermark time={photoWatermarkTime(photo)} timezone={timezone} />
      </button>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1">
      {photos.slice(0, 4).map((photo, i) => {
        const isOverflow = i === 3 && photos.length > 4;
        return (
          <button key={photo.url} type="button" onClick={() => onLightbox(photo)} className="cursor-pointer block aspect-square overflow-hidden rounded relative">
            <img src={photo.thumbUrl} alt={`Photo ${i + 1}`} className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
            {!isOverflow && <TimeWatermark time={photoWatermarkTime(photo)} timezone={timezone} />}
            {isOverflow && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-bold rounded">
                +{photos.length - 3}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ReviewThread({
  instanceId,
  itemIndex,
  item,
  reviewResult,
  timezone,
  onReviewChange,
  showReviewControls = false,
  autoScrollOnMount = false,
  className,
}: ReviewThreadProps): React.ReactElement {
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
  const [lightboxPhoto, setLightboxPhoto] = useState<ReviewPhoto | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const timeline = useMemo(() => {
    const events: TimelineEvent[] = [];

    // Helper: get photos for a specific submission by context_id
    const allSubmissionFiles = item.files
      .filter((f) => f.context === "submission")
      .sort((a, b) => a.sort_order - b.sort_order);

    const getPhotosForSubmission = (subId: string): ReviewPhoto[] =>
      toReviewPhotos(allSubmissionFiles.filter((f) => f.context_id === subId));

    // Fallback: all submission photos (legacy items without context_id)
    const allSubmissionPhotos = toReviewPhotos(allSubmissionFiles);

    // First submission = initial completion
    const firstSubmission = item.submissions[0] ?? null;
    if (firstSubmission) {
      const photos = getPhotosForSubmission(firstSubmission.id);
      events.push({
        type: "initial_completion",
        created_at: firstSubmission.submitted_at,
        photos: photos.length > 0 ? photos : allSubmissionPhotos,
        note: firstSubmission.note,
      });
    } else if (item.is_completed && item.completed_at) {
      events.push({
        type: "initial_completion",
        created_at: item.completed_at,
        photos: allSubmissionPhotos,
        note: null,
      });
    }

    // Resubmissions (version > 1) — each with its own photos
    for (const sub of item.submissions.slice(1)) {
      const subPhotos = getPhotosForSubmission(sub.id);
      events.push({
        type: "resubmission",
        created_at: sub.submitted_at,
        data: { id: sub.id, note: sub.note, submitted_at: sub.submitted_at },
        currentPhotos: subPhotos,
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
      const file = chatFile ? toReviewPhotos([chatFile])[0] : undefined;
      events.push({ type: "comment", created_at: msg.created_at, data: msg, file });
    }

    events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return events;
  }, [item]);

  // Fetch fresh data (including latest messages) on mount (modal open / inline expand)
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["checklist-instances"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoScrollOnMount) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScrollOnMount, timeline.length]);

  const handleSendText = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    try {
      await addContent.mutateAsync({ instanceId, itemIndex, type: "text", content: trimmed });
      setText("");
    } catch {
      // hook handles error modal
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
    } catch {
      // hook handles error modal
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (contentId: string) => {
    try {
      await deleteContent.mutateAsync({ instanceId, itemIndex, contentId });
    } catch {
      // hook handles error modal
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
      queryClient.invalidateQueries({ queryKey: ["checklist-instances"] });
      onReviewChange?.();
    } catch {
      // hook handles error modal
    } finally {
      setIsActing(false);
    }
  };

  return (
    <>
      <div className={cn("flex flex-col", className)}>
        {/* Review result + O/X buttons (optional) */}
        {showReviewControls && (
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
        )}

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
                    <PhotoDisplay photos={event.photos} timezone={timezone} onLightbox={setLightboxPhoto} />
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
              const file = event.file ?? null;
              return (
                <div key={`c-${c.id}`} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                    <p className={`text-[10px] text-text-muted mb-0.5 ${isMe ? "text-right" : "text-left"}`}>
                      {c.author_name ?? "Unknown"}
                    </p>
                    <div className={`relative group rounded-lg px-3 py-2 ${isMe ? "bg-accent/10 text-text" : "bg-surface-hover text-text"}`}>
                      {file ? (
                        isVideo(file.url) ? (
                          <video src={file.url} controls className="max-w-full max-h-[200px] rounded" />
                        ) : (
                          <button type="button" onClick={() => setLightboxPhoto(file)} className="cursor-pointer block relative">
                            <img src={file.thumbUrl} alt="Review media" className="max-w-full max-h-[200px] rounded hover:opacity-80 transition-opacity" />
                            <TimeWatermark time={photoWatermarkTime(file)} timezone={timezone} />
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
              const currPhotos = event.currentPhotos;
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
                    {currPhotos.length > 0 && (
                      <div className="mt-1">
                        <p className="text-[10px] text-text-muted mb-1">Current submission</p>
                        <PhotoDisplay photos={currPhotos} timezone={timezone} onLightbox={setLightboxPhoto} />
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
      </div>

      {lightboxPhoto && (
        <Lightbox
          isOpen
          onClose={() => setLightboxPhoto(null)}
          urls={[lightboxPhoto.url]}
          captureTimes={[photoWatermarkTime(lightboxPhoto)]}
          captureSources={[lightboxPhoto.captureSource]}
          timezone={timezone}
        />
      )}
    </>
  );
}
