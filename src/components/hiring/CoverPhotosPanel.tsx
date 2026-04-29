"use client";

import { useRef } from "react";
import { Plus, Star, Trash2, Image as ImageIcon } from "lucide-react";
import {
  useCoverPhotos,
  useDeleteCoverPhoto,
  useSetPrimaryPhoto,
  useUploadCoverPhoto,
} from "@/hooks/useHiring";
import { cn } from "@/lib/utils";

const MAX_COVER_PHOTOS = 8;

interface Props {
  storeId: string;
}

export function CoverPhotosPanel({ storeId }: Props) {
  const { data: photos = [], isLoading } = useCoverPhotos(storeId);
  const upload = useUploadCoverPhoto(storeId);
  const setPrimary = useSetPrimaryPhoto(storeId);
  const remove = useDeleteCoverPhoto(storeId);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(MAX_COVER_PHOTOS - photos.length, 0);
  const atLimit = remaining === 0;

  const handlePickFiles = async (files: FileList | null) => {
    if (!files) return;
    const acceptable = Array.from(files).slice(0, remaining);
    for (const file of acceptable) {
      try {
        await upload.mutateAsync({ file });
      } catch (err) {
        console.error("upload failed", err);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#E2E4EA] bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-semibold text-[#1A1D27]">
              Cover photos
              <span className="ml-2 text-[11.5px] font-medium text-[#94A3B8]">
                {photos.length} / {MAX_COVER_PHOTOS}
              </span>
            </h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[#64748B]">
              The primary photo is the hero on your signup page. Other photos
              show in a gallery below it. Up to {MAX_COVER_PHOTOS} photos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending || atLimit}
            title={atLimit ? `Maximum ${MAX_COVER_PHOTOS} photos reached.` : undefined}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#6C5CE7] px-3 py-2 text-[12px] font-medium text-white shadow-sm shadow-[rgba(108,92,231,0.25)] transition-colors hover:bg-[#5A4BD1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} />
            {upload.isPending ? "Uploading…" : atLimit ? "Limit reached" : "Upload"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handlePickFiles(e.target.files)}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {isLoading && (
            <div className="col-span-full text-center text-[12px] text-[#94A3B8]">
              Loading photos…
            </div>
          )}
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={cn(
                "group relative overflow-hidden rounded-xl ring-1 transition-all",
                photo.is_primary
                  ? "ring-2 ring-[#6C5CE7]"
                  : "ring-[#E2E4EA] hover:ring-[#94A3B8]",
              )}
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F0F1F5]">
                {photo.url ? (
                  <img
                    src={photo.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#94A3B8]">
                    <ImageIcon size={28} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1D27]/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                {photo.is_primary && (
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#6C5CE7] px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                    <Star size={10} fill="currentColor" />
                    Primary
                  </div>
                )}

                {!photo.is_primary && (
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setPrimary.mutate(photo.id)}
                      className="flex-1 rounded-md bg-white/95 px-2 py-1.5 text-[10.5px] font-medium text-[#1A1D27] backdrop-blur transition-colors hover:bg-white"
                    >
                      Set as primary
                    </button>
                    <button
                      type="button"
                      onClick={() => remove.mutate(photo.id)}
                      aria-label="Delete photo"
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white/95 text-[#EF4444] backdrop-blur transition-colors hover:bg-white"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-[#E2E4EA] px-2.5 py-1.5 text-[10.5px] text-[#64748B]">
                <span>{photo.uploaded_at?.slice(0, 10)}</span>
                <span>{Math.round((photo.size || 0) / 1024)} KB</span>
              </div>
            </div>
          ))}

          {!atLimit && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#CBD5E1] bg-[#F5F6FA] text-[#64748B] transition-colors hover:border-[#94A3B8] hover:bg-[#F0F1F5] hover:text-[#1A1D27]"
            >
              <ImageIcon size={28} />
              <span className="text-[12px] font-medium">Add photo</span>
              <span className="text-[10.5px] text-[#94A3B8]">JPG, PNG · max 5MB</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
