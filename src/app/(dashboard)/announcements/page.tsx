"use client";

/**
 * 공지사항 목록 페이지 -- 공지사항을 관리하고 새 공지를 생성/편집/삭제합니다.
 *
 * Announcements list page with table view, pagination, create/edit modal, and delete confirmation.
 */

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUrlParams } from "@/hooks/useUrlParams";
import { Plus, Edit, Trash2 } from "lucide-react";
import {
  useAnnouncements,
  useCreateAnnouncement,
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
  Table,
  Modal,
  Badge,
  Pagination,
  ConfirmDialog,
  LoadingSpinner,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatDate, parseApiError } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { Announcement, Store } from "@/types";

const PER_PAGE: number = 20;

export default function AnnouncementsPage(): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tz = useTimezone();
  const canManageAnnouncements = hasPermission(PERMISSIONS.ANNOUNCEMENTS_CREATE);

  // -- Pagination state (URL-persisted) --
  const [urlParams, setUrlParams] = useUrlParams({ page: "1" });
  const page = Number(urlParams.page);

  // -- Modal state --
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState<string>("");
  const [formContent, setFormContent] = useState<string>("");
  const [formStoreId, setFormStoreId] = useState<string>("");

  // -- Delete state --
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // -- Data hooks --
  const { data: announcementsData, isLoading } = useAnnouncements(page, PER_PAGE);
  const { data: stores } = useStores();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  const announcements: Announcement[] = announcementsData?.items ?? [];
  const totalPages: number = announcementsData
    ? Math.ceil(announcementsData.total / announcementsData.per_page)
    : 1;

  const storeOptions: { value: string; label: string }[] = [
    { value: "", label: "All Stores" },
    ...(stores ?? []).map((b: Store) => ({ value: b.id, label: b.name })),
  ];

  /** 테이블 컬럼 정의 (Table column definitions) */
  const columns: {
    key: string;
    header: string;
    render?: (item: Announcement) => React.ReactNode;
    className?: string;
  }[] = [
    {
      key: "title",
      header: "Title",
      className: "min-w-[200px]",
    },
    {
      key: "store_name",
      header: "Store",
      render: (item: Announcement): React.ReactNode => (
        <Badge variant={item.store_name ? "accent" : "default"}>
          {item.store_name ?? "All"}
        </Badge>
      ),
    },
    {
      key: "created_by_name",
      header: "Author",
    },
    {
      key: "created_at",
      header: "Created",
      render: (item: Announcement): React.ReactNode => formatDate(item.created_at, tz),
    },
    ...(canManageAnnouncements
      ? [
          {
            key: "actions",
            header: "Actions",
            render: (item: Announcement): React.ReactNode => (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleOpenEdit(item);
                  }}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
                  title="Edit"
                >
                  <Edit size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    setDeleteId(item.id);
                  }}
                  className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger-muted transition-colors cursor-pointer"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  const handleRowClick: (item: Announcement) => void = useCallback(
    (item: Announcement): void => {
      router.push(`/announcements/${item.id}`);
    },
    [router],
  );

  const handleOpenCreate: () => void = useCallback((): void => {
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormStoreId("");
    setIsFormOpen(true);
  }, []);

  const handleOpenEdit: (item: Announcement) => void = useCallback(
    (item: Announcement): void => {
      setEditingId(item.id);
      setFormTitle(item.title);
      setFormContent(item.content);
      setFormStoreId(item.store_id ?? "");
      setIsFormOpen(true);
    },
    [],
  );

  const handleFormSubmit: () => void = useCallback((): void => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast({ type: "error", message: "Title and content are required." });
      return;
    }

    const payload: { title: string; content: string; store_id?: string | null } = {
      title: formTitle.trim(),
      content: formContent.trim(),
      store_id: formStoreId || null,
    };

    if (editingId) {
      updateAnnouncement.mutate(
        { id: editingId, ...payload },
        {
          onSuccess: (): void => {
            toast({ type: "success", message: "Notice updated successfully." });
            setIsFormOpen(false);
          },
          onError: (err): void => {
            toast({ type: "error", message: parseApiError(err, "Failed to update notice.") });
          },
        },
      );
    } else {
      createAnnouncement.mutate(payload, {
        onSuccess: (): void => {
          toast({ type: "success", message: "Notice created successfully." });
          setIsFormOpen(false);
        },
        onError: (err): void => {
          toast({ type: "error", message: parseApiError(err, "Failed to create notice.") });
        },
      });
    }
  }, [formTitle, formContent, formStoreId, editingId, createAnnouncement, updateAnnouncement, toast]);

  const handleDelete: () => void = useCallback((): void => {
    if (!deleteId) return;
    deleteAnnouncement.mutate(deleteId, {
      onSuccess: (): void => {
        toast({ type: "success", message: "Notice deleted successfully." });
        setDeleteId(null);
      },
      onError: (err): void => {
        toast({ type: "error", message: parseApiError(err, "Failed to delete notice.") });
      },
    });
  }, [deleteId, deleteAnnouncement, toast]);

  const isSubmitting: boolean = createAnnouncement.isPending || updateAnnouncement.isPending;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Notices</h1>
        {canManageAnnouncements && (
          <Button variant="primary" size="md" onClick={handleOpenCreate}>
            <Plus size={16} />
            New Notice
          </Button>
        )}
      </div>

      {/* Table */}
      <Card padding="p-0">
        <Table<Announcement>
          columns={columns}
          data={announcements}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          emptyMessage="No notices found."
        />
      </Card>

      {/* Pagination */}
      <div className="mt-4 flex justify-center">
        <Pagination page={page} totalPages={totalPages} onPageChange={(p: number) => setUrlParams({ page: String(p) })} />
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? "Edit Notice" : "New Notice"}
        size="md"
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
            <Button variant="secondary" size="sm" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleFormSubmit}
              isLoading={isSubmitting}
            >
              {editingId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Notice"
        message="Are you sure you want to delete this notice? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={deleteAnnouncement.isPending}
      />
    </div>
  );
}
