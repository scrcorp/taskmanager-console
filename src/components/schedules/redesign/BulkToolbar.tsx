"use client";

/**
 * BulkToolbar — 벌크 모드 액션 바.
 *
 * Add/Edit 모드 토글 + 액션 버튼 + Deselect/Undo/Redo/Clear All + Save/Cancel.
 */

type SelectionMode = "add" | "edit";

interface BulkToolbarProps {
  selectionMode: SelectionMode;
  selectedCellCount: number;
  selectedBlockCount: number;
  previewCount: number;    // 현재 preview 엔트리 수
  isSaving: boolean;
  onModeChange: (mode: SelectionMode) => void;
  onApply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeselectAll: () => void;
  onClearAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function BulkToolbar({
  selectionMode,
  selectedCellCount,
  selectedBlockCount,
  previewCount,
  isSaving,
  onModeChange,
  onApply,
  onEdit,
  onDelete,
  onDeselectAll,
  onClearAll,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSave,
  onCancel,
}: BulkToolbarProps) {
  const count = selectionMode === "add" ? selectedCellCount : selectedBlockCount;

  return (
    <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-[var(--color-surface)] border border-[var(--color-accent)]/40 rounded-xl">
      {/* Mode toggle */}
      <div className="flex bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5 shrink-0">
        {(["add", "edit"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${
              selectionMode === m
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            }`}
          >
            {m === "add" ? "Add" : "Edit"}
          </button>
        ))}
      </div>

      {/* Selection info */}
      <span className="text-[12px] text-[var(--color-text-secondary)] shrink-0 min-w-[80px]">
        {count > 0 ? (
          <span className="text-[var(--color-text)] font-semibold">{count} selected</span>
        ) : (
          <span>Click cells to select</span>
        )}
      </span>

      {/* Mode-specific actions */}
      {selectionMode === "add" ? (
        <button
          type="button"
          onClick={onApply}
          disabled={selectedCellCount === 0}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          + Add to {selectedCellCount || 0} cells
        </button>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            disabled={selectedBlockCount === 0}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Edit {selectedBlockCount > 0 ? `(${selectedBlockCount})` : ""}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={selectedBlockCount === 0}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="w-px h-5 bg-[var(--color-border)] mx-1 shrink-0" />

      {/* Middle: preview count + selection controls */}
      <div className="flex items-center gap-1 shrink-0">
        {previewCount > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-semibold shrink-0">
            {previewCount} preview{previewCount !== 1 ? "s" : ""}
          </span>
        )}
        <button
          type="button"
          onClick={onDeselectAll}
          disabled={count === 0}
          className="px-2.5 py-1.5 rounded-lg text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Deselect All
        </button>
        <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </button>
        <button type="button" onClick={onClearAll}
          className="px-2.5 py-1.5 rounded-lg text-[12px] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] transition-colors">
          Clear All
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-[var(--color-border)] mx-1 shrink-0" />

      {/* Save / Cancel — always visible */}
      <div className="flex items-center gap-1.5 ml-auto shrink-0">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={previewCount === 0 || isSaving}
          className="px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-success)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? "Saving…" : `Save ${previewCount > 0 ? `(${previewCount})` : ""}`}
        </button>
      </div>
    </div>
  );
}
