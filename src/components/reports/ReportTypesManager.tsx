"use client";

/**
 * Report Types (daily report 'periods') 관리 — org-default + store override.
 *
 * 한 매장(또는 org)에 적용되는 report type 목록을 enable/disable, 라벨/마감 규칙
 * 편집, 정렬, 커스텀 추가/삭제한다. effective(resolved) 목록을 표시하고,
 * 변경 시 owned row 면 PUT, 상속/내장이면 override 또는 materialize 한다.
 *
 * storeId 가 없으면 organization-default 를 관리하고, 있으면 그 매장 override.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Clock,
  Store as StoreIcon,
} from "lucide-react";

import {
  useEffectiveReportTypes,
  useEffectiveReportTypesForStores,
  useApplyReportTypeChange,
  useAddReportType,
  useDeleteReportType,
  useReorderReportTypes,
} from "@/hooks/useReportTypes";
import { useStores } from "@/hooks/useStores";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Modal,
  Switch,
  LoadingSpinner,
} from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { cn } from "@/lib/utils";
import {
  ReportPeriodStoresPanel,
  type StoreEffectiveEntry,
} from "@/components/reports/ReportPeriodStoresPanel";
import type { EffectiveReportType, Store } from "@/types";

interface Props {
  /** null/undefined = organization-default 관리. 설정 시 해당 매장 override. */
  storeId?: string | null;
}

interface FormState {
  code: string;
  label: string;
  time: string; // "HH:MM" or ""
  offset: number; // 0 = same day, 1 = next day
  is_active: boolean;
}

const EMPTY_FORM: FormState = { code: "", label: "", time: "", offset: 0, is_active: true };

function deadlineText(e: EffectiveReportType): string {
  if (!e.default_deadline_local_time) return "No deadline";
  const day = e.deadline_day_offset > 0 ? `+${e.deadline_day_offset}d ` : "";
  return `${day}${e.default_deadline_local_time}`;
}

export function ReportTypesManager({ storeId }: Props): React.ReactElement {
  const modal = useModal();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.REPORT_TYPES_MANAGE);

  const scope: "org" | "store" = storeId ? "store" : "org";
  const scopeStoreId: string | null = storeId ?? null;

  const { data: effective, isLoading } = useEffectiveReportTypes(storeId ?? undefined);
  const applyChange = useApplyReportTypeChange();
  const addType = useAddReportType();
  const deleteType = useDeleteReportType();
  const reorder = useReorderReportTypes();

  const list: EffectiveReportType[] = useMemo(() => effective ?? [], [effective]);
  const allOwned = useMemo(
    () => list.length > 0 && list.every((e) => e.scope === scope && !!e.id),
    [list, scope],
  );

  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // ── Cross-store assignment (org scope only) ──────────────────────────
  // org Report Periods 화면에서만: 각 period 를 펼쳐 모든 매장의 enable/disable
  // 를 한 번에 관리한다. store scope 에선 비활성(빈 배열로 쿼리 스킵).
  const isOrgScope = scope === "org";
  const { data: storesData } = useStores();
  const activeStores: Store[] = useMemo(
    () =>
      isOrgScope ? (storesData ?? []).filter((s) => s.is_active) : [],
    [storesData, isOrgScope],
  );
  const storeQueries = useEffectiveReportTypesForStores(
    activeStores.map((s) => s.id),
  );
  const storeEntries: StoreEffectiveEntry[] = useMemo(
    () =>
      activeStores.map((store, i) => ({
        store,
        list: storeQueries[i]?.data ?? [],
        isLoading: storeQueries[i]?.isLoading ?? false,
      })),
    [activeStores, storeQueries],
  );
  const storesLoading = useMemo(
    () => storeEntries.some((e) => e.isLoading),
    [storeEntries],
  );
  const totalStores = activeStores.length;

  /** 한 period code 를 enable 한 활성 매장 수 (effective is_active=true). */
  const usageCount = useCallback(
    (code: string): number =>
      storeEntries.reduce((n, entry) => {
        const item = entry.list.find((e) => e.code === code);
        return n + (item?.is_active ? 1 : 0);
      }, 0),
    [storeEntries],
  );

  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((code: string) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const owned = useCallback(
    (e: EffectiveReportType): boolean => e.scope === scope && !!e.id,
    [scope],
  );

  const handleToggleActive = useCallback(
    async (e: EffectiveReportType) => {
      setBusyCode(e.code);
      try {
        await applyChange.mutateAsync({
          scope,
          storeId: scopeStoreId,
          target: e,
          change: { is_active: !e.is_active },
          effectiveList: list,
        });
      } catch {
        // hook 자동 모달
      } finally {
        setBusyCode(null);
      }
    },
    [applyChange, scope, scopeStoreId, list],
  );

  const handleReorder = useCallback(
    async (index: number, dir: -1 | 1) => {
      const next = index + dir;
      if (next < 0 || next >= list.length) return;
      // allOwned 일 때만 /reorder 사용 (모든 행이 현재 scope row).
      const a = list[index];
      const b = list[next];
      if (!a.id || !b.id) return;
      try {
        await reorder.mutateAsync([
          { id: a.id, sort_order: b.sort_order },
          { id: b.id, sort_order: a.sort_order },
        ]);
      } catch {
        // hook 자동 모달
      }
    },
    [list, reorder],
  );

  const openAdd = useCallback(() => {
    setEditingCode(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  }, []);

  const openEdit = useCallback((e: EffectiveReportType) => {
    setEditingCode(e.code);
    setForm({
      code: e.code,
      label: e.label,
      time: e.default_deadline_local_time ?? "",
      offset: e.deadline_day_offset,
      is_active: e.is_active,
    });
    setIsFormOpen(true);
  }, []);

  const handleSubmitForm = useCallback(async () => {
    const label = form.label.trim();
    if (!label) {
      void modal.alert({ type: "error", message: "Label is required." });
      return;
    }
    const time = form.time.trim() || null;
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      void modal.alert({ type: "error", message: "Deadline must be HH:MM (24h)." });
      return;
    }
    try {
      if (editingCode) {
        const target = list.find((e) => e.code === editingCode);
        if (!target) return;
        await applyChange.mutateAsync({
          scope,
          storeId: scopeStoreId,
          target,
          change: {
            label,
            default_deadline_local_time: time,
            deadline_day_offset: form.offset,
            is_active: form.is_active,
          },
          effectiveList: list,
        });
      } else {
        const code = form.code.trim().toLowerCase().replace(/\s+/g, "_");
        if (!code) {
          void modal.alert({ type: "error", message: "Code is required." });
          return;
        }
        if (list.some((e) => e.code === code)) {
          void modal.alert({ type: "error", message: "That code already exists." });
          return;
        }
        await addType.mutateAsync({
          scope,
          storeId: scopeStoreId,
          data: {
            code,
            label,
            is_active: true,
            default_deadline_local_time: time,
            deadline_day_offset: form.offset,
          },
          effectiveList: list,
        });
      }
      setIsFormOpen(false);
      setForm(EMPTY_FORM);
      setEditingCode(null);
    } catch {
      // hook 자동 모달
    }
  }, [form, editingCode, list, applyChange, addType, scope, scopeStoreId, modal]);

  const handleDelete = useCallback(
    async (e: EffectiveReportType) => {
      if (!e.id) return;
      const isOverride = scope === "store" && e.scope === "store";
      const ok = await modal.confirm({
        title: isOverride ? "Reset to organization default" : "Delete report type",
        message: isOverride
          ? `Remove the store override for "${e.label}" and fall back to the organization default?`
          : `Delete "${e.label}"? Existing reports keep their data, but this type will no longer be available.`,
        confirmLabel: isOverride ? "Reset" : "Delete",
        variant: "danger",
      });
      if (!ok) return;
      deleteType.mutate(e.id);
    },
    [modal, deleteType, scope],
  );

  const busy = applyChange.isPending || addType.isPending || reorder.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-text">Report Periods</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {scope === "store"
              ? "Periods staff can file daily reports for at this store. Overrides organization defaults."
              : "Organization-wide daily report periods. Stores can override these."}
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd} disabled={busy}>
            <Plus className="h-4 w-4 mr-1" />
            Add period
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : list.length === 0 ? (
        <Card padding="p-8">
          <p className="text-sm text-text-muted text-center">No report periods configured.</p>
        </Card>
      ) : (
        <Card padding="p-0">
          <ul className="divide-y divide-border">
            {list.map((e, idx) => {
              const expanded = expandedCodes.has(e.code);
              return (
              <li key={e.code}>
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Expand cross-store panel (org scope only) */}
                  {isOrgScope && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(e.code)}
                      className="text-text-muted hover:text-text transition-colors"
                      aria-label={expanded ? "Collapse stores" : "Expand stores"}
                      aria-expanded={expanded}
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          expanded && "rotate-90",
                        )}
                      />
                    </button>
                  )}

                  {/* Reorder */}
                  {canManage && allOwned && (
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => handleReorder(idx, -1)}
                        disabled={idx === 0 || busy}
                        className="text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReorder(idx, 1)}
                        disabled={idx === list.length - 1 || busy}
                        className="text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Label + code */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-text">{e.label}</span>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted">
                        {e.code}
                      </span>
                      {e.scope === "store" ? (
                        <Badge variant="accent">Store</Badge>
                      ) : (
                        <Badge variant="default">Org</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {deadlineText(e)}
                      </span>
                      {isOrgScope && totalStores > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(e.code)}
                          className="flex items-center gap-1.5 hover:text-accent transition-colors"
                          title="Manage which stores use this period"
                        >
                          <StoreIcon className="h-3 w-3" />
                          {storesLoading
                            ? `Used by …/${totalStores} stores`
                            : `Used by ${usageCount(e.code)}/${totalStores} stores`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active toggle */}
                  <Switch
                    checked={e.is_active}
                    onCheckedChange={() => handleToggleActive(e)}
                    disabled={!canManage || busyCode === e.code || busy}
                    variant="success"
                    label={e.is_active ? "Enabled" : "Disabled"}
                  />

                  {/* Edit / delete */}
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
                        disabled={busy}
                        className="text-text-muted hover:text-accent transition-colors disabled:opacity-50"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {owned(e) && (
                        <button
                          type="button"
                          onClick={() => handleDelete(e)}
                          disabled={busy}
                          className="text-text-muted hover:text-danger transition-colors disabled:opacity-50"
                          title={scope === "store" ? "Reset to org default" : "Delete"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Cross-store assignment panel */}
                {isOrgScope && expanded && (
                  <ReportPeriodStoresPanel
                    periodCode={e.code}
                    storeEntries={storeEntries}
                    isLoading={storesLoading}
                    canManage={canManage}
                  />
                )}
              </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Add / edit modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingCode ? "Edit report period" : "Add report period"}
        closeOnBackdrop={false}
      >
        <div className="space-y-4">
          {!editingCode && (
            <div>
              <Input
                label="Code"
                value={form.code}
                onChange={(ev) => setForm((p) => ({ ...p, code: ev.target.value }))}
                placeholder="e.g. brunch"
              />
              <p className="text-xs text-text-muted mt-1">
                Lowercase identifier, no spaces.
              </p>
            </div>
          )}
          <Input
            label="Label"
            value={form.label}
            onChange={(ev) => setForm((p) => ({ ...p, label: ev.target.value }))}
            placeholder="e.g. Brunch"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Deadline time (HH:MM)"
              value={form.time}
              onChange={(ev) => setForm((p) => ({ ...p, time: ev.target.value }))}
              placeholder="optional, e.g. 23:00"
            />
            <Select
              label="Deadline day"
              value={String(form.offset)}
              onChange={(ev) => setForm((p) => ({ ...p, offset: Number(ev.target.value) }))}
              options={[
                { value: "0", label: "Same day" },
                { value: "1", label: "Next day" },
              ]}
            />
          </div>
          <p className="text-xs text-text-muted">
            Leave the deadline time empty for no deadline. Deadlines use the store time zone.
          </p>
          {editingCode && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-text">Enabled</p>
                <p className="text-xs text-text-muted">
                  Disabled periods can&apos;t be used to file new reports.
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                variant="success"
                aria-label="Enabled"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitForm} disabled={busy}>
              {busy ? "Saving..." : editingCode ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
