"use client";

/**
 * ApplyToSelectedModal — 선택된 셀에 preview 스케줄을 일괄 추가하는 모달.
 *
 * Preview 기반: 서버 호출 없이 PreviewEntry[] 반환 → 그리드에서 미리보기.
 * Work Role 선택 시 기본 시간 자동 적용 (ScheduleEditModal과 동일 로직).
 * Custom 보호: 행별로 수동 수정한 값은 전역 변경 시 유지.
 * Reset 버튼: 행별 커스텀을 기본값으로 되돌림.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { User, WorkRole, Store } from "@/types";

export interface PreviewEntry {
  tempId: string;
  userId: string;
  storeId: string;
  workRoleId: string | null;
  workRoleName: string | null;
  workDate: string;
  startTime: string;
  endTime: string;
  breakStartTime: string | null;
  breakEndTime: string | null;
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

let tempCounter = 0;
function nextTempId() { return `preview-${++tempCounter}-${Date.now()}`; }

interface SelectedCell {
  key: string;
  userId: string;
  date: string;
}

interface RowState {
  workRoleId: string;
  startTime: string;
  endTime: string;
  breakStartTime: string;
  breakEndTime: string;
  isCustom: boolean; // 사용자가 이 행을 직접 수정했는지
}

interface ApplyToSelectedModalProps {
  open: boolean;
  selectedCells: Set<string>;
  users: User[];
  workRoles: WorkRole[];
  stores: Store[];
  storeId: string;
  onApply: (entries: PreviewEntry[]) => void;
  onClose: () => void;
}

function workRoleLabel(wr: WorkRole): string {
  return wr.name || `${wr.shift_name ?? ""} - ${wr.position_name ?? ""}`.replace(/^[\s-]+|[\s-]+$/g, "") || "Unnamed role";
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

/** Work Role에서 기본 시간 추출 (HH:MM 5자리 slice) */
function wrDefaultStart(wr: WorkRole | undefined): string {
  return wr?.default_start_time?.slice(0, 5) ?? "";
}
function wrDefaultEnd(wr: WorkRole | undefined): string {
  return wr?.default_end_time?.slice(0, 5) ?? "";
}
function wrDefaultBreakStart(wr: WorkRole | undefined): string {
  return wr?.break_start_time?.slice(0, 5) ?? "";
}
function wrDefaultBreakEnd(wr: WorkRole | undefined): string {
  return wr?.break_end_time?.slice(0, 5) ?? "";
}

export function ApplyToSelectedModal({
  open,
  selectedCells,
  users,
  workRoles,
  stores,
  storeId,
  onApply,
  onClose,
}: ApplyToSelectedModalProps) {
  const cells: SelectedCell[] = Array.from(selectedCells).map((key) => {
    const [userId, date] = key.split(":") as [string, string];
    return { key, userId, date };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.userId.localeCompare(b.userId));

  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());
  const [globalWorkRole, setGlobalWorkRole] = useState("");
  const [globalStart, setGlobalStart] = useState("");
  const [globalEnd, setGlobalEnd] = useState("");
  const [globalBreakStart, setGlobalBreakStart] = useState("");
  const [globalBreakEnd, setGlobalBreakEnd] = useState("");

  const storeName = stores.find((s) => s.id === storeId)?.name ?? "Store";
  const activeWorkRoles = workRoles.filter((wr) => wr.is_active);

  // 초기화
  useEffect(() => {
    if (open) {
      setUnchecked(new Set());
      setRows(new Map());
      setGlobalWorkRole("");
      setGlobalStart("");
      setGlobalEnd("");
    }
  }, [open]);

  const headerCheckRef = useRef<HTMLInputElement>(null);
  const checkedCount = cells.filter((c) => !unchecked.has(c.key)).length;

  useEffect(() => {
    if (!headerCheckRef.current) return;
    const allChecked = unchecked.size === 0 && cells.length > 0;
    const allUnchecked = unchecked.size === cells.length;
    headerCheckRef.current.indeterminate = !allChecked && !allUnchecked;
    headerCheckRef.current.checked = allChecked;
  }, [unchecked, cells.length]);

  const getRow = useCallback((key: string): RowState => {
    return rows.get(key) ?? { workRoleId: "", startTime: "", endTime: "", breakStartTime: "", breakEndTime: "", isCustom: false };
  }, [rows]);

  function setRowField(key: string, field: keyof RowState, value: string | boolean) {
    setRows((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { workRoleId: "", startTime: "", endTime: "", breakStartTime: "", breakEndTime: "", isCustom: false };
      next.set(key, { ...cur, [field]: value, isCustom: true });
      return next;
    });
  }

  /** Work Role 변경 시 기본 시간 자동 적용 (ScheduleEditModal 동일 로직) */
  function setRowWorkRole(key: string, wrId: string) {
    setRows((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { workRoleId: "", startTime: "", endTime: "", breakStartTime: "", breakEndTime: "", isCustom: false };
      const wr = activeWorkRoles.find((w) => w.id === wrId);
      next.set(key, {
        ...cur,
        workRoleId: wrId,
        // 시간이 아직 비어있거나 custom 아닌 경우에만 기본값 적용
        startTime: (!cur.isCustom || !cur.startTime) ? wrDefaultStart(wr) || cur.startTime : cur.startTime,
        endTime: (!cur.isCustom || !cur.endTime) ? wrDefaultEnd(wr) || cur.endTime : cur.endTime,
        breakStartTime: (!cur.isCustom || !cur.breakStartTime) ? wrDefaultBreakStart(wr) || cur.breakStartTime : cur.breakStartTime,
        breakEndTime: (!cur.isCustom || !cur.breakEndTime) ? wrDefaultBreakEnd(wr) || cur.breakEndTime : cur.breakEndTime,
        isCustom: true,
      });
      return next;
    });
  }

  /** 전역 Work Role 변경 → custom이 아닌 모든 행에 적용 + 기본시간 자동채움 */
  function applyGlobalWorkRole(wrId: string) {
    setGlobalWorkRole(wrId);
    const wr = activeWorkRoles.find((w) => w.id === wrId);
    setRows((prev) => {
      const next = new Map(prev);
      for (const c of cells) {
        if (unchecked.has(c.key)) continue;
        const cur = next.get(c.key);
        if (cur?.isCustom) continue; // custom 행 건드리지 않음
        next.set(c.key, {
          workRoleId: wrId,
          startTime: wrDefaultStart(wr),
          endTime: wrDefaultEnd(wr),
          breakStartTime: wrDefaultBreakStart(wr),
          breakEndTime: wrDefaultBreakEnd(wr),
          isCustom: false,
        });
      }
      return next;
    });
    // 전역 시간도 work role 기본값으로 업데이트
    if (wr) {
      setGlobalStart(wrDefaultStart(wr));
      setGlobalEnd(wrDefaultEnd(wr));
      setGlobalBreakStart(wrDefaultBreakStart(wr));
      setGlobalBreakEnd(wrDefaultBreakEnd(wr));
    }
  }

  /** 전역 시간 변경 → custom이 아닌 행만 적용 */
  function applyGlobalTime(field: "startTime" | "endTime" | "breakStartTime" | "breakEndTime", value: string) {
    if (field === "startTime") setGlobalStart(value);
    else if (field === "endTime") setGlobalEnd(value);
    else if (field === "breakStartTime") setGlobalBreakStart(value);
    else if (field === "breakEndTime") setGlobalBreakEnd(value);
    setRows((prev) => {
      const next = new Map(prev);
      for (const c of cells) {
        if (unchecked.has(c.key)) continue;
        const cur = next.get(c.key);
        if (cur?.isCustom) continue;
        const base = cur ?? { workRoleId: globalWorkRole, startTime: globalStart, endTime: globalEnd, breakStartTime: "", breakEndTime: "", isCustom: false };
        next.set(c.key, { ...base, [field]: value });
      }
      return next;
    });
  }

  /** 행 Reset → isCustom 해제, 전역 값으로 되돌림 */
  function resetRow(key: string) {
    const wr = activeWorkRoles.find((w) => w.id === globalWorkRole);
    setRows((prev) => {
      const next = new Map(prev);
      next.set(key, {
        workRoleId: globalWorkRole,
        startTime: globalStart || wrDefaultStart(wr),
        endTime: globalEnd || wrDefaultEnd(wr),
        breakStartTime: wrDefaultBreakStart(wr),
        breakEndTime: wrDefaultBreakEnd(wr),
        isCustom: false,
      });
      return next;
    });
  }

  function toggleRow(key: string) {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (unchecked.size === 0) setUnchecked(new Set(cells.map((c) => c.key)));
    else setUnchecked(new Set());
  }

  function handleApply() {
    const entries: PreviewEntry[] = cells
      .filter((c) => !unchecked.has(c.key))
      .map((c) => {
        const row = getRow(c.key);
        const wr = activeWorkRoles.find((w) => w.id === row.workRoleId);
        return {
          tempId: nextTempId(),
          userId: c.userId,
          storeId,
          workRoleId: row.workRoleId || null,
          workRoleName: wr ? workRoleLabel(wr) : null,
          workDate: c.date,
          startTime: row.startTime || globalStart || "09:00",
          endTime: row.endTime || globalEnd || "18:00",
          breakStartTime: row.breakStartTime || null,
          breakEndTime: row.breakEndTime || null,
        };
      })
      .filter((e) => e.startTime && e.endTime);
    if (entries.length === 0) return;
    onApply(entries);
  }

  // 모든 checked 행에 startTime + endTime이 설정되어야 Add 가능
  const checkedRows = cells.filter((c) => !unchecked.has(c.key));
  const allConfigured = checkedRows.length > 0 && checkedRows.every((c) => {
    const row = getRow(c.key);
    return (row.startTime || globalStart) && (row.endTime || globalEnd);
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-[min(940px,96vw)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--color-text)]">Add Schedules</h2>
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
              {cells.length} cells · <span className="text-[var(--color-accent)] font-semibold">{storeName}</span> · Preview until saved
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" /></svg>
          </button>
        </div>

        {/* Global override row */}
        <div className="px-5 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-[var(--color-text-secondary)] shrink-0 w-[80px]">Apply to all:</span>
          <select
            value={globalWorkRole}
            onChange={(e) => applyGlobalWorkRole(e.target.value)}
            className="flex-1 min-w-[120px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)]"
          >
            <option value="">— Work Role —</option>
            {activeWorkRoles.map((wr) => (
              <option key={wr.id} value={wr.id}>{workRoleLabel(wr)}</option>
            ))}
          </select>
          <select value={globalStart} onChange={(e) => applyGlobalTime("startTime", e.target.value)}
            className="w-[80px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] shrink-0">
            <option value="">Start</option>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-[var(--color-text-muted)] text-[11px] shrink-0">→</span>
          <select value={globalEnd} onChange={(e) => applyGlobalTime("endTime", e.target.value)}
            className="w-[80px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] shrink-0">
            <option value="">End</option>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-[var(--color-text-muted)] text-[11px] shrink-0">Break:</span>
          <select value={globalBreakStart} onChange={(e) => { setGlobalBreakStart(e.target.value); applyGlobalTime("breakStartTime", e.target.value); }}
            className="w-[80px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] shrink-0">
            <option value="">—</option>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-[var(--color-text-muted)] text-[11px] shrink-0">→</span>
          <select value={globalBreakEnd} onChange={(e) => { setGlobalBreakEnd(e.target.value); applyGlobalTime("breakEndTime", e.target.value); }}
            className="w-[80px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] shrink-0">
            <option value="">—</option>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[40px_1fr_120px_80px_16px_80px_80px_16px_80px_32px] items-center gap-2 px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="flex items-center justify-center">
            <input ref={headerCheckRef} type="checkbox" onChange={toggleAll} className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer" />
          </div>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Staff / Date</span>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Work Role</span>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Start</span>
          <span />
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">End</span>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Break</span>
          <span />
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide" />
          <span />
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1">
          {cells.map((c) => {
            const isUnchecked = unchecked.has(c.key);
            const user = users.find((u) => u.id === c.userId);
            const row = getRow(c.key);

            return (
              <div
                key={c.key}
                className={`grid grid-cols-[40px_1fr_120px_80px_16px_80px_80px_16px_80px_32px] items-center gap-2 px-5 py-2.5 border-b border-[var(--color-border)] last:border-0 transition-opacity ${isUnchecked ? "opacity-40" : ""}`}
              >
                <div className="flex items-center justify-center">
                  <input type="checkbox" checked={!isUnchecked} onChange={() => toggleRow(c.key)} className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer" />
                </div>
                {/* Staff + Date */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] flex items-center justify-center text-[10px] font-bold shrink-0">
                    {getInitials(user?.full_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-[var(--color-text)] truncate">{user?.full_name ?? user?.username ?? "?"}</span>
                      {row.isCustom && <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-semibold shrink-0">Custom</span>}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">{fmtDate(c.date)}</div>
                  </div>
                </div>
                {/* Work Role */}
                <select
                  value={row.workRoleId}
                  onChange={(e) => setRowWorkRole(c.key, e.target.value)}
                  disabled={isUnchecked}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed truncate"
                >
                  <option value="">— Role —</option>
                  {activeWorkRoles.map((wr) => (
                    <option key={wr.id} value={wr.id}>{workRoleLabel(wr)}</option>
                  ))}
                </select>
                {/* Start */}
                <select
                  value={row.startTime}
                  onChange={(e) => setRowField(c.key, "startTime", e.target.value)}
                  disabled={isUnchecked}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed"
                >
                  <option value="">Start</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-[var(--color-text-muted)] text-[10px] text-center">→</span>
                {/* End */}
                <select
                  value={row.endTime}
                  onChange={(e) => setRowField(c.key, "endTime", e.target.value)}
                  disabled={isUnchecked}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed"
                >
                  <option value="">End</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {/* Break */}
                <select
                  value={row.breakStartTime}
                  onChange={(e) => setRowField(c.key, "breakStartTime", e.target.value)}
                  disabled={isUnchecked}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed"
                >
                  <option value="">—</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-[var(--color-text-muted)] text-[10px] text-center">→</span>
                <select
                  value={row.breakEndTime}
                  onChange={(e) => setRowField(c.key, "breakEndTime", e.target.value)}
                  disabled={isUnchecked}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed"
                >
                  <option value="">—</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {/* Reset */}
                {row.isCustom && !isUnchecked ? (
                  <button
                    type="button"
                    onClick={() => resetRow(c.key)}
                    title="Reset to defaults"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                    </svg>
                  </button>
                ) : <div />}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--color-border)]">
          <span className="text-[12px] text-[var(--color-text-secondary)]">
            {checkedCount} of {cells.length} will be added as preview
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!allConfigured}
              title={!allConfigured && checkedCount > 0 ? "Set start and end time for all rows" : undefined}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add {checkedCount} to preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
