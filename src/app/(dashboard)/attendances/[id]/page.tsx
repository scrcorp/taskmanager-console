"use client";

/**
 * 근태 상세 페이지 -- 근태 기록 상세 조회 + 수정 폼 + 수정 이력.
 *
 * Attendance detail page — view attendance record details,
 * submit corrections, and view correction history.
 */

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Coffee,
  Edit2,
  LogIn,
  LogOut,
  MapPin,
  User,
  History,
} from "lucide-react";
import { useAttendance, useCorrectAttendance } from "@/hooks";
import { useTimezone } from "@/hooks/useTimezone";
import type { AttendanceCorrection } from "@/types";
import {
  Button,
  Card,
  Badge,
  Modal,
  Input,
  Select,
  LoadingSpinner,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatFixedDate, timeAgo, parseApiError } from "@/lib/utils";

/** 상태별 배지 색상 매핑 -- Status badge variant mapping */
const statusBadge: Record<
  string,
  { label: string; variant: "success" | "warning" | "default" }
> = {
  clocked_in: { label: "Clocked In", variant: "success" },
  on_break: { label: "On Break", variant: "warning" },
  clocked_out: { label: "Clocked Out", variant: "default" },
};

/** 분을 시:분 형식으로 변환합니다.
 *  Convert minutes to h:mm format. */
function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "-";
  const h: number = Math.floor(minutes / 60);
  const m: number = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** 수정 가능한 필드 옵션 -- Correctable field options */
const correctionFields = [
  { value: "clock_in", label: "Clock In" },
  { value: "clock_out", label: "Clock Out" },
  { value: "break_start", label: "Break Start" },
  { value: "break_end", label: "Break End" },
];

export default function AttendanceDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const tz = useTimezone();

  const { data: attendance, isLoading } = useAttendance(id);
  const correctAttendance = useCorrectAttendance();

  const [showCorrect, setShowCorrect] = useState<boolean>(false);
  const [correctField, setCorrectField] = useState<string>("clock_in");
  const [correctValue, setCorrectValue] = useState<string>("");
  const [correctReason, setCorrectReason] = useState<string>("");

  /** 수정 모달을 열고 초기화합니다.
   *  Open correction modal and reset form. */
  const openCorrect = (): void => {
    setCorrectField("clock_in");
    setCorrectValue("");
    setCorrectReason("");
    setShowCorrect(true);
  };

  /** 수정 요청을 서버에 제출합니다.
   *  Submit correction to server. */
  const handleCorrect = (): void => {
    if (!correctValue || !correctReason) {
      toast({ type: "error", message: "All fields are required" });
      return;
    }
    correctAttendance.mutate(
      {
        id,
        data: {
          field_name: correctField,
          corrected_value: correctValue,
          reason: correctReason,
        },
      },
      {
        onSuccess: () => {
          toast({
            type: "success",
            message: "근태가 수정되었습니다 (Attendance corrected)",
          });
          setShowCorrect(false);
        },
        onError: (err) =>
          toast({ type: "error", message: parseApiError(err, "수정 실패 (Correction failed)") }),
      },
    );
  };

  if (isLoading) return <LoadingSpinner size="lg" className="mt-32" />;
  if (!attendance) {
    return (
      <div className="text-center py-20 text-text-secondary">
        근태 기록을 찾을 수 없습니다 (Attendance record not found)
      </div>
    );
  }

  const badge = statusBadge[attendance.status] ?? statusBadge.clocked_in;
  const corrections: AttendanceCorrection[] = attendance.corrections ?? [];

  return (
    <div>
      {/* 헤더 (Header) */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/attendances")}
          className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl md:text-2xl font-extrabold flex-1 min-w-0 truncate">Attendance Detail</h1>
        <Button variant="secondary" size="sm" onClick={openCorrect}>
          <Edit2 size={14} className="mr-1" /> Correct
        </Button>
      </div>

      {/* 상세 카드 (Detail card) */}
      <Card className="p-6 space-y-5">
        {/* 배지 행 (Badge row) */}
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        {/* 메타 정보 그리드 (Meta info grid) */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <User size={12} className="inline mr-1" />
              Employee
            </div>
            <div className="text-text font-medium">
              {attendance.user_name || "Unknown"}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <MapPin size={12} className="inline mr-1" />
              Store
            </div>
            <div className="text-text">
              {attendance.store_name || "Unknown"}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Calendar size={12} className="inline mr-1" />
              Work Date
            </div>
            <div className="text-text">
              {formatFixedDate(attendance.work_date)}
            </div>
          </div>
        </div>

        {/* 시간 정보 (Time details) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-3 border-t border-border">
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <LogIn size={12} className="inline mr-1" />
              Clock In
            </div>
            <div className="text-text">
              {attendance.clock_in
                ? formatDateTime(attendance.clock_in, tz)
                : "-"}
            </div>
            {attendance.clock_in_timezone && (
              <div className="text-[10px] text-text-muted">
                {attendance.clock_in_timezone}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Coffee size={12} className="inline mr-1" />
              Break Start
            </div>
            <div className="text-text">
              {attendance.break_start
                ? formatDateTime(attendance.break_start, tz)
                : "-"}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Coffee size={12} className="inline mr-1" />
              Break End
            </div>
            <div className="text-text">
              {attendance.break_end
                ? formatDateTime(attendance.break_end, tz)
                : "-"}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <LogOut size={12} className="inline mr-1" />
              Clock Out
            </div>
            <div className="text-text">
              {attendance.clock_out
                ? formatDateTime(attendance.clock_out, tz)
                : "-"}
            </div>
            {attendance.clock_out_timezone && (
              <div className="text-[10px] text-text-muted">
                {attendance.clock_out_timezone}
              </div>
            )}
          </div>
        </div>

        {/* 합계 (Totals) */}
        <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t border-border">
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Clock size={12} className="inline mr-1" />
              Total Work Time
            </div>
            <div className="text-text font-semibold text-lg">
              {formatMinutes(attendance.total_work_minutes)}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Coffee size={12} className="inline mr-1" />
              Total Break Time
            </div>
            <div className="text-text font-semibold text-lg">
              {formatMinutes(attendance.total_break_minutes)}
            </div>
          </div>
        </div>

        {/* 메모 (Note) */}
        {attendance.note && (
          <div className="pt-3 border-t border-border">
            <div className="text-xs text-text-muted mb-1">Note</div>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">
              {attendance.note}
            </p>
          </div>
        )}
      </Card>

      {/* 수정 이력 섹션 (Correction History Section) */}
      <Card className="p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <History size={16} className="text-text-secondary" />
          <h2 className="text-lg font-bold">Correction History</h2>
          {corrections.length > 0 && (
            <Badge variant="accent">{corrections.length}</Badge>
          )}
        </div>

        {corrections.length === 0 ? (
          <div className="text-sm text-text-muted py-4">
            No corrections have been made.
          </div>
        ) : (
          <div className="space-y-3">
            {corrections.map((correction: AttendanceCorrection) => (
              <div
                key={correction.id}
                className="p-3 rounded-lg bg-surface-hover border border-border"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="accent">{correction.field_name}</Badge>
                    <span className="text-xs text-text-muted">
                      by {correction.corrected_by_name || "Unknown"}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {timeAgo(correction.created_at)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-text-muted">Original</div>
                    <div className="text-text-secondary">
                      {correction.original_value || "(empty)"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted">Corrected</div>
                    <div className="text-text">
                      {correction.corrected_value}
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-xs text-text-muted">Reason</div>
                  <p className="text-sm text-text-secondary">
                    {correction.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 수정 모달 (Correction Modal) */}
      <Modal
        isOpen={showCorrect}
        onClose={() => setShowCorrect(false)}
        title="Correct Attendance"
      >
        <div className="space-y-4">
          <Select
            label="Field"
            value={correctField}
            onChange={(e) => setCorrectField(e.target.value)}
            options={correctionFields}
          />
          <Input
            label="Corrected Value (ISO datetime)"
            type="datetime-local"
            value={correctValue}
            onChange={(e) => setCorrectValue(e.target.value)}
          />
          <Input
            label="Reason"
            value={correctReason}
            onChange={(e) => setCorrectReason(e.target.value)}
            placeholder="Why is this correction needed?"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowCorrect(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCorrect}
              isLoading={correctAttendance.isPending}
            >
              Submit Correction
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
