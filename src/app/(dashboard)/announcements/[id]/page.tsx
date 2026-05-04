"use client";

/**
 * 공지사항 상세 페이지 -- 공지사항 전체 내용을 표시하고 편집/삭제 기능을 제공합니다.
 *
 * Announcement detail page showing full content with edit and delete actions.
 */

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Edit, Trash2 } from "lucide-react";
import {
  useAnnouncement,
  useAnnouncementReads,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
} from "@/hooks/useAnnouncements";
import { useStores } from "@/hooks/useStores";
import {
  Button,
  Input,
  Select,
  Textarea,
  Card,
  Badge,
  Modal,
  ConfirmDialog,
  LoadingSpinner,
  EmptyState,
} from "@/components/ui";
import { useResultModal } from "@/components/ui/ResultModal";
import { formatDate, parseApiError } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import type { Announcement, Store } from "@/types";

export default function AnnouncementDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const { showSuccess, showError } = useResultModal();
  const tz = useTimezone();

  const announcementId: string = params.id as string;
  const { data: announcement, isLoading } = useAnnouncement(announcementId);
  const { data: reads } = useAnnouncementReads(announcementId);
  const { data: stores } = useStores();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  // -- Edit modal state --
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [formTitle, setFormTitle] = useState<string>("");
  const [formContent, setFormContent] = useState<string>("");
  const [formStoreId, setFormStoreId] = useState<string>("");

  // -- Delete state --
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);

  const storeOptions: { value: string; label: string }[] = [
    { value: "", label: "All Stores" },
    ...(stores ?? []).map((b: Store) => ({ value: b.id, label: b.name })),
  ];

  const handleOpenEdit: () => void = useCallback((): void => {
    if (!announcement) return;
    setFormTitle(announcement.title);
    setFormContent(announcement.content);
    setFormStoreId(announcement.store_id ?? "");
    setIsEditOpen(true);
  }, [announcement]);

  const handleEditSubmit: () => void = useCallback((): void => {
    if (!formTitle.trim() || !formContent.trim()) {
      showError("Title and content are required.");
      return;
    }

    updateAnnouncement.mutate(
      {
        id: announcementId,
        title: formTitle.trim(),
        content: formContent.trim(),
        store_id: formStoreId || null,
      },
      {
        onSuccess: (): void => {
          showSuccess("Notice updated successfully.");
          setIsEditOpen(false);
        },
        onError: (err): void => {
          showError(parseApiError(err, "Failed to update notice."));
        },
      },
    );
  }, [announcementId, formTitle, formContent, formStoreId, updateAnnouncement, showSuccess, showError]);

  const handleDelete: () => void = useCallback((): void => {
    deleteAnnouncement.mutate(announcementId, {
      onSuccess: (): void => {
        showSuccess("Notice deleted successfully.");
        router.push("/announcements");
      },
      onError: (err): void => {
        showError(parseApiError(err, "Failed to delete notice."));
      },
    });
  }, [announcementId, deleteAnnouncement, showSuccess, showError, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!announcement) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/announcements")}>
          <ChevronLeft size={16} />
          Back to Notices
        </Button>
        <EmptyState message="Notice not found." />
      </div>
    );
  }

  return (
    <div>
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => router.push("/announcements")}
      >
        <ChevronLeft size={16} />
        Back to Notices
      </Button>

      {/* Detail Card */}
      <Card>
        {/* Header with actions */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-text mb-2">
              {announcement.title}
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-text-secondary">
                {announcement.created_by_name ?? "Unknown"}
              </span>
              <span className="text-xs text-text-muted">
                {formatDate(announcement.created_at, tz)}
              </span>
              <Badge variant={announcement.store_name ? "accent" : "default"}>
                {announcement.store_name ?? "All Stores"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={handleOpenEdit}>
              <Edit size={14} />
              Edit
            </Button>
            <Button variant="danger" size="sm" onClick={() => setIsDeleteOpen(true)}>
              <Trash2 size={14} />
              Delete
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="border-t border-border pt-6">
          <div className="prose prose-invert max-w-none">
            {announcement.content.split("\n").map((paragraph: string, index: number) => (
              <p key={index} className="text-sm text-text leading-relaxed mb-3">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </Card>

      {/* Read Status */}
      <Card className="mt-4">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold text-text">Read Status</h2>
          <Badge variant="accent">{reads?.length ?? 0} read</Badge>
        </div>
        {reads && reads.length > 0 ? (
          <ul className="divide-y divide-border">
            {reads.map((read) => (
              <li key={read.user_id} className="flex items-center justify-between py-2">
                <span className="text-sm text-text">{read.user_name}</span>
                <span className="text-xs text-text-muted">{formatDate(read.read_at, tz)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No one has read this notice yet.</p>
        )}
      </Card>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Notice"
        size="md"
        closeOnBackdrop={false}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Title"
            value={formTitle}
            placeholder="Enter notice title"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormTitle(e.target.value)
            }
          />
          <Textarea
            label="Content"
            value={formContent}
            placeholder="Enter notice content"
            rows={6}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setFormContent(e.target.value)
            }
          />
          <Select
            label="Target Store (optional)"
            options={storeOptions}
            value={formStoreId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setFormStoreId(e.target.value)
            }
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSubmit}
              isLoading={updateAnnouncement.isPending}
            >
              Update
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Notice"
        message="Are you sure you want to delete this notice? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={deleteAnnouncement.isPending}
      />
    </div>
  );
}
