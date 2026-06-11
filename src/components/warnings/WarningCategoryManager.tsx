"use client";

/**
 * Warning category manager (v1.1) — Add / Hide / Delete per org.
 *
 * Rendered inside an imperative modal (`modal.open`). Visible categories on top;
 * hidden ones tucked into a collapsible section. `other` is a fixed system
 * category (always last, not hide/deletable). Owner only for mutations — the
 * server enforces it too; here we gate the controls via `isOwner`.
 *
 * Delete is a soft delete server-side; re-adding the same name revives it.
 * Theme-aware (semantic tokens) so it reads in both light and dark console.
 */
import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { useModal } from "@/components/ui/imperative-modal";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useWarningCategories,
  useCreateWarningCategory,
  useUpdateWarningCategory,
  useDeleteWarningCategory,
} from "@/hooks/useWarningCategories";
import type { WarningCategoryItem } from "@/types";

export function WarningCategoryManager() {
  const modal = useModal();
  const { isOwner } = usePermissions();
  const { data: cats = [], isLoading } = useWarningCategories();
  const createMut = useCreateWarningCategory();
  const updateMut = useUpdateWarningCategory();
  const deleteMut = useDeleteWarningCategory();

  const [newLabel, setNewLabel] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const visible = cats.filter((c) => !c.is_hidden);
  const hidden = cats.filter((c) => c.is_hidden);
  const busy = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  async function handleDelete(c: WarningCategoryItem) {
    const ok = await modal.confirm({
      title: "Delete category?",
      message: `"${c.label}" will be removed from the picker. Re-add the same name later to restore it (past warnings keep it).`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(c.id);
    } catch {
      /* hook shows the error modal */
    }
  }

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    try {
      await createMut.mutateAsync({ label });
      setNewLabel("");
    } catch {
      /* hook shows the error modal */
    }
  }

  function row(c: WarningCategoryItem) {
    return (
      <div
        key={c.id}
        className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0"
      >
        <span
          className={`flex-1 text-sm font-medium ${c.is_hidden ? "text-text-muted" : "text-text"}`}
        >
          {c.label}
          {c.is_system && (
            <span className="ml-2 text-[11px] font-normal text-text-muted">
              · system · always last
            </span>
          )}
        </span>
        {isOwner && !c.is_system && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => updateMut.mutate({ id: c.id, data: { is_hidden: !c.is_hidden } })}
              className="text-xs font-semibold px-2.5 py-1 rounded-md border border-border text-text-secondary hover:text-text hover:border-text-muted disabled:opacity-50"
            >
              {c.is_hidden ? "Show" : "Hide"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleDelete(c)}
              className="text-xs font-semibold px-2 py-1 rounded-md text-danger hover:bg-danger-muted disabled:opacity-50"
            >
              Delete
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: "70vh" }}>
      <p className="text-xs text-text-secondary mb-2">
        {visible.length} active · {hidden.length} hidden
        {!isOwner && " · read-only (Owner manages)"}
      </p>

      {/* list */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-text-secondary text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {visible.map(row)}

            {hidden.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowHidden((v) => !v)}
                  className="w-full flex items-center gap-1.5 py-2.5 text-xs font-bold text-text-secondary hover:text-text"
                >
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${showHidden ? "rotate-90" : ""}`}
                  />
                  Hidden ({hidden.length})
                </button>
                {showHidden && hidden.map(row)}
              </>
            )}
          </>
        )}
      </div>

      {/* add */}
      {isOwner && (
        <div className="flex gap-2 pt-3 mt-1 border-t border-border">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Add a category…"
            className="flex-1 text-sm bg-surface border border-border rounded-lg px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newLabel.trim() || busy}
            className="text-sm font-bold px-4 rounded-lg bg-accent text-white disabled:bg-surface disabled:text-text-muted"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
