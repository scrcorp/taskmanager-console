"use client";

import { useState } from "react";
import { useAuditLogs, type AuditLogRow } from "@/hooks/useTips";
import { cn } from "@/lib/utils";

const ENTITY_LABELS: Record<string, string> = {
  tip_entry: "Entry",
  tip_distribution: "Distribution",
  tip_period: "Period",
  form_4070: "4070 Form",
};

const ACTION_ICONS: Record<string, string> = {
  create: "+",
  update: "✎",
  delete: "✕",
  accept: "✓",
  auto_accept: "◯",
  confirm: "🔒",
  force_close: "⚠",
  sign: "✒",
};

const ACTION_VERBS: Record<string, string> = {
  create: "created",
  update: "edited",
  delete: "deleted",
  accept: "accepted",
  auto_accept: "auto-accepted",
  confirm: "confirmed",
  force_close: "force-closed",
  sign: "signed",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface HistoryProps {
  storeId?: string;
}

export function HistoryPanel({ storeId }: HistoryProps) {
  const [entityType, setEntityType] = useState<string>("");
  const [action, setAction] = useState<string>("");

  const { data: logs = [], isLoading } = useAuditLogs({
    store_id: storeId || undefined,
    entity_type: entityType || undefined,
    action: action || undefined,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="rounded-lg border border-[#E2E4EA] bg-white px-2.5 py-1.5 text-[12px]"
        >
          <option value="">All entities</option>
          <option value="tip_entry">Entries</option>
          <option value="tip_distribution">Distributions</option>
          <option value="tip_period">Periods</option>
          <option value="form_4070">4070 Forms</option>
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-lg border border-[#E2E4EA] bg-white px-2.5 py-1.5 text-[12px]"
        >
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="accept">Accept</option>
          <option value="auto_accept">Auto-accept</option>
          <option value="confirm">Confirm</option>
          <option value="force_close">Force-close</option>
          <option value="sign">Sign</option>
        </select>
        <span className="ml-auto text-[11px] text-[#94A3B8]">
          Last {logs.length} entries
        </span>
      </div>

      {isLoading ? (
        <p className="rounded-xl border border-[#E2E4EA] bg-white p-6 text-center text-[13px] text-[#94A3B8]">
          Loading audit logs...
        </p>
      ) : logs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E2E4EA] bg-white p-6 text-center text-[13px] text-[#94A3B8]">
          No audit log entries matching filter.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {logs.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LogRow({ log }: { log: AuditLogRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!(log.before || log.after || log.comment);
  return (
    <li className="rounded-lg border border-[#E2E4EA] bg-white">
      <button
        type="button"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left",
          hasDetail ? "cursor-pointer hover:bg-[#FAFBFC]" : "cursor-default",
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F0F1F5] text-[12px] font-bold text-[#6C5CE7]">
          {ACTION_ICONS[log.action] ?? "•"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-[#1A1D27]">
            <span className="font-semibold">{log.actor_name || "system"}</span>{" "}
            <span className="text-[#64748B]">
              {ACTION_VERBS[log.action] ?? log.action}
            </span>{" "}
            <span className="rounded bg-[#F0F1F5] px-1.5 py-0.5 text-[10px] font-medium text-[#64748B]">
              {ENTITY_LABELS[log.entity_type] || log.entity_type}
            </span>
          </p>
          {log.comment && (
            <p className="mt-0.5 text-[11px] italic text-[#94A3B8]">
              &ldquo;{log.comment}&rdquo;
            </p>
          )}
        </div>
        <span className="text-[11px] text-[#94A3B8]">
          {formatTime(log.created_at)}
        </span>
      </button>
      {expanded && hasDetail && (
        <div className="grid grid-cols-2 gap-3 border-t border-[#E2E4EA] bg-[#F5F6FA] p-3 text-[11px]">
          <div>
            <p className="mb-1 font-semibold uppercase text-[#94A3B8]">Before</p>
            <pre className="overflow-x-auto rounded bg-white px-2 py-1.5 text-[10px] text-[#64748B]">
              {log.before ? JSON.stringify(log.before, null, 2) : "—"}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-semibold uppercase text-[#94A3B8]">After</p>
            <pre className="overflow-x-auto rounded bg-white px-2 py-1.5 text-[10px] text-[#64748B]">
              {log.after ? JSON.stringify(log.after, null, 2) : "—"}
            </pre>
          </div>
        </div>
      )}
    </li>
  );
}
