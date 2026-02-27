"use client";

/**
 * 미디어 업로드 컴포넌트 — presigned URL을 사용하여 이미지/영상을 업로드합니다.
 *
 * Media upload component using presigned URL for direct image/video upload.
 */

import React, { useRef, useState } from "react";
import { Paperclip, X, Loader2, Film } from "lucide-react";
import { usePresignedUrl } from "@/hooks/useChecklistInstances";

interface ImageUploadProps {
  value?: string | null;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  /** compact 모드: 아이콘 버튼만 표시 */
  compact?: boolean;
}

function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

export function ImageUpload({
  value,
  onUpload,
  onRemove,
  compact = false,
}: ImageUploadProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const presignedUrl = usePresignedUrl();

  const handleFile = async (file: File) => {
    setUploading(true);
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

      onUpload(file_url);
    } catch {
      // error handled by mutation state
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (value) {
    return (
      <div className="relative inline-block">
        {isVideo(value) ? (
          <div className="w-20 h-20 rounded-lg border border-border bg-surface flex items-center justify-center">
            <Film size={24} className="text-text-muted" />
          </div>
        ) : (
          <img
            src={value}
            alt="Uploaded"
            className="w-20 h-20 object-cover rounded-lg border border-border"
          />
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center hover:bg-danger/80"
          >
            <X size={10} />
          </button>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="p-1 rounded-md text-text-muted hover:text-text-secondary disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Paperclip size={14} />
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Paperclip size={12} />
        )}
        {uploading ? "Uploading..." : "Attach"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </>
  );
}
