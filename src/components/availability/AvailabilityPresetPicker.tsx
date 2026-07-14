"use client";

/**
 * Preset controls for the availability editors:
 *   - "Apply preset…" dropdown — applies a saved weekly template to all 7 days.
 *   - Optional "Save as preset" (Setup page only) — names the current week and
 *     persists it as an org custom preset via `useCreatePreset`.
 *
 * Presets come from `usePresets()`; applying a preset just calls `onApply` with
 * a dense routine — the parent owns the routine and its dirty state.
 */
import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useCreatePreset } from "@/hooks/useAvailability";
import { toRoutine, toDaysInput, type AvailabilityDay, type Preset } from "@/types";

interface Props {
  presets: Preset[];
  /** Apply a preset's week as a dense 7-slot routine. */
  onApply: (routine: AvailabilityDay[]) => void;
  /** Show the "Save as preset" control (Setup page). Requires `currentRoutine`. */
  showSaveAs?: boolean;
  /** The routine to persist when saving a new preset. */
  currentRoutine?: AvailabilityDay[];
  disabled?: boolean;
}

const SELECT_CLS =
  "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary hover:border-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-40 cursor-pointer";
const BTN_CLS =
  "inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-surface-hover disabled:opacity-40";

export function AvailabilityPresetPicker({
  presets,
  onApply,
  showSaveAs = false,
  currentRoutine,
  disabled = false,
}: Props): React.ReactElement {
  const createPreset = useCreatePreset();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  function apply(id: string): void {
    const p = presets.find((x) => x.id === id);
    if (p) onApply(toRoutine(p.days));
  }

  async function saveAs(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || !currentRoutine) return;
    try {
      await createPreset.mutateAsync({ name: trimmed, days: toDaysInput(currentRoutine) });
      setNaming(false);
      setName("");
    } catch {
      // create hook fires its own error modal
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={SELECT_CLS}
        value=""
        disabled={disabled}
        onChange={(e) => {
          apply(e.target.value);
          e.target.value = "";
        }}
      >
        <option value="">Apply preset…</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {showSaveAs &&
        (naming ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preset name"
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveAs();
                if (e.key === "Escape") {
                  setNaming(false);
                  setName("");
                }
              }}
              className="w-32 rounded-lg border border-border bg-bg px-2 py-1.5 text-[12px] text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              className="rounded-lg bg-accent px-2.5 py-1.5 text-[12px] font-bold text-white hover:bg-accent-hover disabled:opacity-40"
              disabled={!name.trim() || createPreset.isPending}
              onClick={() => void saveAs()}
            >
              Save
            </button>
            <button
              type="button"
              className={BTN_CLS}
              onClick={() => {
                setNaming(false);
                setName("");
              }}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className={BTN_CLS}
            disabled={disabled}
            onClick={() => setNaming(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Save as preset
          </button>
        ))}
    </div>
  );
}
