"use client";

/**
 * Console modal to view & edit one staff member's weekly work availability.
 *
 * Loads the member's current week + edit history (useStaffAvailability), lets a
 * manager set each day Off / Time / Full (AvailabilityDayEditor), and saves the
 * whole week via PUT (useSaveAvailability). When the viewer lacks
 * `availability:manage` the editor is read-only and Save is hidden.
 *
 * Edit history lives behind a "View history" link (top-right) that opens a
 * second modal. There, entries are grouped by save (group key = created_at;
 * every row from one save shares it): groups shown newest-first, each a
 * collapsible section (header = save time + source), day-change lines within a
 * group sorted ascending Sun→Sat.
 *
 * Result modals fire from the save hook — this component does not re-show them.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Modal, Button } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useModal } from "@/components/ui/imperative-modal";
import {
  useStaffAvailability,
  useSaveAvailability,
  usePresets,
} from "@/hooks/useAvailability";
import { useTimezone } from "@/hooks/useTimezone";
import { formatDateTime, cn } from "@/lib/utils";
import {
  toRoutine,
  toDaysInput,
  validateRoutine,
  AVAIL_COLORS,
  type AvailabilityDay,
  type AvailabilityHistory,
} from "@/types";
import { AvailabilityDayEditor } from "./AvailabilityDayEditor";
import { AvailabilityPresetPicker } from "./AvailabilityPresetPicker";

interface Props {
  /** Target staff member. `null` closes the modal. */
  userId: string | null;
  userName: string;
  /** When false, the editor is read-only and Save is hidden. */
  canManage: boolean;
  onClose: () => void;
}

const SOURCE_LABEL: Record<AvailabilityHistory["source"], string> = {
  console_manager: "Manager",
  staff_self: "Staff (self)",
};

/** Compose a human line for a history entry when the server sends no description. */
function historyText(h: AvailabilityHistory): string {
  if (h.description) return h.description;
  const s = h.snapshot;
  const when =
    s.state === "full"
      ? "Full day"
      : s.state === "range" && s.start && s.end
        ? `${s.start}–${s.end}`
        : "Off";
  return `Availability set to ${when}`;
}

/** One save's worth of history rows (all share a `created_at` group key). */
interface HistoryGroup {
  key: string;
  created_at: string;
  source: AvailabilityHistory["source"];
  actorName: string | null;
  entries: AvailabilityHistory[];
}

/**
 * Group flat history rows by save (created_at). Groups come out newest-first;
 * rows within each group are sorted ascending by day_of_week (Sun→Sat, nulls last).
 */
function groupHistory(history: AvailabilityHistory[]): HistoryGroup[] {
  const map = new Map<string, AvailabilityHistory[]>();
  for (const h of history) {
    const arr = map.get(h.created_at);
    if (arr) arr.push(h);
    else map.set(h.created_at, [h]);
  }
  const groups: HistoryGroup[] = Array.from(map.entries()).map(([key, entries]) => ({
    key,
    created_at: key,
    source: entries[0].source,
    actorName: entries[0].actor_name,
    entries: [...entries].sort(
      (a, b) => (a.day_of_week ?? 99) - (b.day_of_week ?? 99),
    ),
  }));
  // newest save first (ISO timestamps sort lexicographically)
  groups.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return groups;
}

export function AvailabilityEditModal({
  userId,
  userName,
  canManage,
  onClose,
}: Props): React.ReactElement | null {
  const tz = useTimezone();
  const modal = useModal();
  const open = userId !== null;
  const { data, isLoading } = useStaffAvailability(userId ?? undefined, open);
  const { data: presets } = usePresets(open && canManage);
  const save = useSaveAvailability(userId ?? "");

  const [routine, setRoutine] = useState<AvailabilityDay[]>(() => toRoutine(undefined));
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Re-seed the local routine whenever a new member's data arrives.
  const serverDays = data?.member.days;
  useEffect(() => {
    setRoutine(toRoutine(serverDays));
  }, [serverDays]);

  // Close the nested history modal + reset its expansion when the member changes.
  useEffect(() => {
    setShowHistory(false);
    setExpanded({});
  }, [userId]);

  const history = useMemo(() => data?.history ?? [], [data]);
  const groups = useMemo(() => groupHistory(history), [history]);

  if (!open) return null;

  function change(day: number, value: AvailabilityDay): void {
    setRoutine((prev) => {
      const next = [...prev];
      next[day] = value;
      return next;
    });
  }

  async function handleSave(): Promise<void> {
    const err = validateRoutine(routine);
    if (err) {
      void modal.alert({ type: "error", message: err });
      return;
    }
    try {
      await save.mutateAsync(toDaysInput(routine));
      onClose();
    } catch {
      // save hook fires its own error modal
    }
  }

  function toggleGroup(key: string, isDefaultOpen: boolean): void {
    setExpanded((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? isDefaultOpen),
    }));
  }

  return (
    <>
      <Modal
        isOpen={open}
        onClose={onClose}
        title={`Work availability — ${userName}`}
        size="lg"
        closeOnBackdrop={false}
        // While the nested history modal is open, ESC should close only that one.
        closeOnEscape={!showHistory}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {canManage ? "Cancel" : "Close"}
            </Button>
            {canManage && (
              <Button variant="primary" onClick={handleSave} isLoading={save.isPending}>
                Save Changes
              </Button>
            )}
          </div>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Intro + top-right "View history" link */}
            <div className="flex items-start justify-between gap-3">
              <p className="text-[12px] text-text-secondary">
                Set each day:{" "}
                <b>Off</b>, a{" "}
                <b style={{ color: AVAIL_COLORS.range }}>time range</b>, or{" "}
                <b style={{ color: AVAIL_COLORS.full }}>Full</b> day. Week starts Sunday.
              </p>
              <button
                type="button"
                onClick={() => setShowHistory(true)}
                className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-text-muted underline-offset-2 transition-colors hover:text-accent hover:underline cursor-pointer"
              >
                View history
              </button>
            </div>

            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <AvailabilityPresetPicker
                  presets={presets ?? []}
                  onApply={setRoutine}
                />
                <span className="text-[11px] text-text-muted">
                  applies a saved default to all 7 days
                </span>
              </div>
            )}

            <AvailabilityDayEditor routine={routine} onChange={change} disabled={!canManage} />
          </div>
        )}
      </Modal>

      {/* Change history — grouped by save, newest first, each collapsible */}
      <Modal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        title="Change history"
        size="md"
      >
        {groups.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-text-muted">
            No changes recorded yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map((g, idx) => {
              const isOpen = expanded[g.key] ?? idx === 0;
              return (
                <li
                  key={g.key}
                  className="overflow-hidden rounded-xl border border-border bg-bg/40"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.key, idx === 0)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover cursor-pointer"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-text-muted transition-transform",
                        isOpen ? "rotate-0" : "-rotate-90",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-text">
                        {formatDateTime(g.created_at, tz)}
                      </span>
                      <span className="block text-[11px] text-text-muted">
                        {g.actorName ?? SOURCE_LABEL[g.source] ?? g.source}
                        {g.actorName ? ` · ${SOURCE_LABEL[g.source] ?? g.source}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-semibold tabular-nums text-text-muted">
                      {g.entries.length} {g.entries.length === 1 ? "change" : "changes"}
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="space-y-1.5 border-t border-border px-3 py-2.5">
                      {g.entries.map((h, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px]">
                          <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/50" />
                          <span className="text-text">{historyText(h)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}
