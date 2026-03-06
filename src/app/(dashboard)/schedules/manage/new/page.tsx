"use client";

/**
 * 스케줄 생성 페이지 -- 새 스케줄 초안을 작성합니다.
 *
 * Schedule creation page — create a new draft schedule by selecting
 * store, employee, shift, position, date, and optional time range.
 */

import React, { Suspense, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useUsers } from "@/hooks/useUsers";
import { useShifts } from "@/hooks/useShifts";
import { usePositions } from "@/hooks/usePositions";
import { useShiftPresets } from "@/hooks/useShiftPresets";
import { useCreateSchedule } from "@/hooks/useSchedules";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { parseApiError, todayInTimezone } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import type { Store, User, Shift, Position, ShiftPreset } from "@/types";

export default function NewSchedulePage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="p-6 text-text-muted">Loading...</div>}>
      <NewScheduleContent />
    </Suspense>
  );
}

function NewScheduleContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const tz = useTimezone();
  const createSchedule = useCreateSchedule();

  // URL 쿼리 파라미터에서 초기값 로드 — Pre-fill from query params
  const initialDate: string = searchParams.get("date") ?? todayInTimezone(tz);
  const initialStoreId: string = searchParams.get("store_id") ?? "";

  // 폼 상태 — Form state
  const [storeId, setStoreId] = useState<string>(initialStoreId);
  const [userId, setUserId] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>("");
  const [positionId, setPositionId] = useState<string>("");
  const [workDate, setWorkDate] = useState<string>(initialDate);
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // 데이터 로드 — Load data
  const { data: stores } = useStores();
  const { data: users } = useUsers();
  const { data: shifts } = useShifts(storeId || undefined);
  const { data: positions } = usePositions(storeId || undefined);
  const { data: shiftPresets } = useShiftPresets(storeId || "");

  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active),
    [stores],
  );

  const activeUsers: User[] = useMemo(
    () => (users ?? []).filter((u: User) => u.is_active),
    [users],
  );

  const sortedShifts: Shift[] = useMemo(
    () =>
      [...(shifts ?? [])].sort(
        (a: Shift, b: Shift) => a.sort_order - b.sort_order,
      ),
    [shifts],
  );

  const sortedPositions: Position[] = useMemo(
    () =>
      [...(positions ?? [])].sort(
        (a: Position, b: Position) => a.sort_order - b.sort_order,
      ),
    [positions],
  );

  // Filter presets by selected shift (if any)
  const filteredPresets: ShiftPreset[] = useMemo(() => {
    const all = (shiftPresets ?? []).filter((p: ShiftPreset) => p.is_active);
    if (!shiftId) return all;
    return all.filter((p: ShiftPreset) => p.shift_id === shiftId);
  }, [shiftPresets, shiftId]);

  /** 프리셋 선택 시 시작/종료 시간 자동 입력 — Auto-fill times from preset */
  const handlePresetSelect = useCallback(
    (presetId: string): void => {
      const preset = filteredPresets.find((p: ShiftPreset) => p.id === presetId);
      if (preset) {
        setStartTime(preset.start_time);
        setEndTime(preset.end_time);
        if (!shiftId && preset.shift_id) {
          setShiftId(preset.shift_id);
        }
      }
    },
    [filteredPresets, shiftId],
  );

  const canSubmit: boolean = !!storeId && !!userId && !!workDate;

  const handleSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      if (!canSubmit) return;

      try {
        const schedule = await createSchedule.mutateAsync({
          store_id: storeId,
          user_id: userId,
          shift_id: shiftId || null,
          position_id: positionId || null,
          work_date: workDate,
          start_time: startTime || null,
          end_time: endTime || null,
          note: note || null,
        });
        toast({ type: "success", message: "Schedule created!" });
        router.push(`/schedules/manage/${schedule.id}`);
      } catch (err) {
        toast({ type: "error", message: parseApiError(err, "Failed to create schedule.") });
      }
    },
    [
      canSubmit,
      storeId,
      userId,
      shiftId,
      positionId,
      workDate,
      startTime,
      endTime,
      note,
      createSchedule,
      toast,
      router,
    ],
  );

  // 매장 변경 시 시프트/포지션 초기화 — Reset shift/position when store changes
  const handleStoreChange = useCallback(
    (newStoreId: string): void => {
      setStoreId(newStoreId);
      setShiftId("");
      setPositionId("");
    },
    [],
  );

  return (
    <div>
      {/* 헤더 (Header) */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-text">New Schedule</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Create a new schedule draft
          </p>
        </div>
      </div>

      <Card padding="p-6" className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 매장 선택 (Store select) */}
          <div>
            <label
              htmlFor="store"
              className="block text-sm font-medium text-text mb-1.5"
            >
              Store <span className="text-danger">*</span>
            </label>
            <select
              id="store"
              value={storeId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                handleStoreChange(e.target.value)
              }
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
              required
            >
              <option value="">Select a store...</option>
              {activeStores.map((store: Store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>

          {/* 직원 선택 (Employee select) */}
          <div>
            <label
              htmlFor="user"
              className="block text-sm font-medium text-text mb-1.5"
            >
              Employee <span className="text-danger">*</span>
            </label>
            <select
              id="user"
              value={userId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setUserId(e.target.value)
              }
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
              required
            >
              <option value="">Select an employee...</option>
              {activeUsers.map((user: User) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({user.role_name})
                </option>
              ))}
            </select>
          </div>

          {/* 날짜 (Date) */}
          <div>
            <label
              htmlFor="work-date"
              className="block text-sm font-medium text-text mb-1.5"
            >
              Work Date <span className="text-danger">*</span>
            </label>
            <input
              id="work-date"
              type="date"
              value={workDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setWorkDate(e.target.value)
              }
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
              required
            />
          </div>

          {/* 시프트 + 포지션 (Shift + Position — optional) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="shift"
                className="block text-sm font-medium text-text mb-1.5"
              >
                Shift
              </label>
              <select
                id="shift"
                value={shiftId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setShiftId(e.target.value)
                }
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
                disabled={!storeId}
              >
                <option value="">None</option>
                {sortedShifts.map((shift: Shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="position"
                className="block text-sm font-medium text-text mb-1.5"
              >
                Position
              </label>
              <select
                id="position"
                value={positionId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setPositionId(e.target.value)
                }
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
                disabled={!storeId}
              >
                <option value="">None</option>
                {sortedPositions.map((pos: Position) => (
                  <option key={pos.id} value={pos.id}>
                    {pos.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 시프트 프리셋 (Shift Preset — optional, auto-fills time) */}
          {storeId && filteredPresets.length > 0 && (
            <div>
              <label
                htmlFor="preset"
                className="block text-sm font-medium text-text mb-1.5"
              >
                Shift Preset
              </label>
              <select
                id="preset"
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handlePresetSelect(e.target.value)
                }
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
                defaultValue=""
              >
                <option value="">Select a preset to auto-fill times...</option>
                {filteredPresets.map((preset: ShiftPreset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} ({preset.start_time} - {preset.end_time})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 시간 (Time range — optional) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="start-time"
                className="block text-sm font-medium text-text mb-1.5"
              >
                Start Time
              </label>
              <input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setStartTime(e.target.value)
                }
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label
                htmlFor="end-time"
                className="block text-sm font-medium text-text mb-1.5"
              >
                End Time
              </label>
              <input
                id="end-time"
                type="time"
                value={endTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEndTime(e.target.value)
                }
                className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* 메모 (Note — optional) */}
          <div>
            <label
              htmlFor="note"
              className="block text-sm font-medium text-text mb-1.5"
            >
              Note
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNote(e.target.value)
              }
              rows={3}
              placeholder="Optional note..."
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            />
          </div>

          {/* 제출 버튼 (Submit button) */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={createSchedule.isPending}
              disabled={!canSubmit}
            >
              <Save size={16} />
              Create Draft
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
