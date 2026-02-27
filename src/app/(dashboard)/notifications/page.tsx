"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, ExternalLink, Mail, MailOpen } from "lucide-react";
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
} from "@/hooks";
import {
  Button,
  Card,
  Badge,
  Pagination,
  EmptyState,
  LoadingSpinner,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { timeAgo, parseApiError } from "@/lib/utils";
import type { Notification } from "@/types";

/** reference_type → admin 경로 매핑 */
function getNotificationHref(referenceType: string | null, referenceId: string | null): string | null {
  if (!referenceType || !referenceId) return null;
  switch (referenceType) {
    case "additional_task":
      return `/tasks/${referenceId}`;
    case "announcement":
      return `/announcements/${referenceId}`;
    case "schedule":
      return `/schedules/manage/${referenceId}`;
    case "attendance":
      return `/attendances/${referenceId}`;
    case "work_assignment":
      return `/schedules`;
    default:
      return null;
  }
}

/** 알림 페이지 — 알림 목록 조회, 읽음 처리, 전체 읽음 처리.
 *
 * Notifications page — list, mark read, and mark all read.
 */
export default function NotificationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [page, setPage] = useState<number>(1);
  const perPage: number = 20;

  const { data, isLoading } = useNotifications(page, perPage);
  const { data: unreadData } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const notifications: Notification[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = Math.max(1, Math.ceil(total / perPage));
  const unreadCount: number = unreadData ?? 0;

  /** 단일 알림을 읽음 처리합니다.
   *  Mark a single notification as read. */
  const handleMarkRead = (notificationId: string): void => {
    markRead.mutate(notificationId, {
      onError: (err) => toast({ type: "error", message: parseApiError(err, "읽음 처리 실패 (Mark read failed)") }),
    });
  };

  /** 모든 읽지 않은 알림을 읽음 처리합니다.
   *  Mark all unread notifications as read. */
  const handleMarkAllRead = (): void => {
    markAllRead.mutate(undefined, {
      onSuccess: () =>
        toast({ type: "success", message: "모든 알림이 읽음 처리되었습니다 (All marked as read)" }),
      onError: (err) => toast({ type: "error", message: parseApiError(err, "전체 읽음 처리 실패 (Mark all read failed)") }),
    });
  };

  /** 알림 타입에 따른 배지를 반환합니다.
   *  Return badge variant based on notification type. */
  const typeBadge = (type: string): { variant: "accent" | "warning" | "success" | "default"; label: string } => {
    switch (type) {
      case "assignment":
        return { variant: "accent", label: "Assignment" };
      case "task":
        return { variant: "warning", label: "Task" };
      case "announcement":
        return { variant: "success", label: "Notice" };
      default:
        return { variant: "default", label: type };
    }
  };

  return (
    <div>
      {/* ── 헤더 (Header) ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">Alerts</h1>
          {unreadCount > 0 && (
            <Badge variant="danger">{unreadCount} unread</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleMarkAllRead}
            isLoading={markAllRead.isPending}
          >
            <CheckCheck size={14} className="mr-1" />
            Mark All Read
          </Button>
        )}
      </div>

      {/* ── 알림 목록 (Notification list) ── */}
      {isLoading ? (
        <LoadingSpinner size="lg" className="mt-20" />
      ) : notifications.length === 0 ? (
        <EmptyState icon={<Bell className="h-10 w-10" />} message="No notifications yet" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n: Notification) => {
            const badge = typeBadge(n.type);
            const href = getNotificationHref(n.reference_type, n.reference_id);

            const handleClick = () => {
              if (!n.is_read) markRead.mutate(n.id);
              if (href) router.push(href);
            };

            return (
              <Card
                key={n.id}
                onClick={handleClick}
                className={`p-4 flex items-start gap-3 transition-colors ${
                  href ? "cursor-pointer hover:bg-surface-hover" : ""
                } ${
                  n.is_read
                    ? "opacity-60"
                    : "border-l-2 border-l-accent"
                }`}
              >
                {/* 아이콘 (Icon) */}
                <div className="mt-0.5">
                  {n.is_read ? (
                    <MailOpen size={16} className="text-text-muted" />
                  ) : (
                    <Mail size={16} className="text-accent" />
                  )}
                </div>

                {/* 내용 (Content) */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-xs text-text-muted">
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-text">{n.message}</p>
                  {href && (
                    <p className="text-xs text-accent mt-1 flex items-center gap-1">
                      <ExternalLink size={12} />
                      View details
                    </p>
                  )}
                </div>

                {/* 읽음 처리 버튼 (Mark read button) */}
                {!n.is_read && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                    className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-surface-hover transition-colors shrink-0"
                    title="Mark as read"
                  >
                    <Check size={16} />
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 페이지네이션 (Pagination) ── */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
