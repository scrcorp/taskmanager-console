"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { Modal } from "@/components/ui";
import { useInfiniteWarnableUsers } from "@/hooks/useWarnings";
import { useUsers } from "@/hooks/useUsers";
import { useDebounce } from "@/hooks/useDebounce";
import { ROLE_PRIORITY } from "@/lib/permissions";
import type { WarnableUser, WarnableUserStore } from "@/types";

/** Searchable picker of employees the current user may warn (strictly-lower authority). */
export function EmployeePickerModal({
  current,
  onClose,
  onSelect,
}: {
  current: string | null;
  onClose: () => void;
  onSelect: (user: WarnableUser) => void;
}): React.ReactElement {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q.trim(), 300);

  const { data, isLoading, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteWarnableUsers(debouncedQ);

  const list = useMemo<WarnableUser[]>(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  // "Searching…" while a debounced query is in flight (first load shows "Loading…").
  const searching = isFetching && !isLoading && !isFetchingNextPage;

  // Infinite scroll — fetch the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "100px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, list.length]);

  return (
    <Modal isOpen onClose={onClose} title="Select employee" size="md">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or ID…"
          autoFocus
          className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-muted">Searching…</span>
        )}
      </div>
      <div className="space-y-1 max-h-[52vh] overflow-y-auto -mx-1">
        {isLoading && <div className="py-10 text-center text-sm text-text-muted">Loading…</div>}
        {!isLoading &&
          list.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onSelect(u);
                onClose();
              }}
              className="w-full text-left px-2.5 py-2.5 hover:bg-surface-hover rounded-md flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text truncate">{u.full_name}</div>
                <div className="text-xs text-text-muted truncate">
                  {u.role_name}
                  {u.store_name ? ` · ${u.store_name}` : ""}
                  {u.employee_no ? ` · ID ${u.employee_no}` : ""}
                </div>
              </div>
              {current === u.id && <Check className="h-4 w-4 text-accent shrink-0" />}
            </button>
          ))}
        {!isLoading && list.length === 0 && (
          <div className="py-10 text-center text-sm text-text-muted">
            {debouncedQ ? "No employees found." : "No one you can warn yet."}
          </div>
        )}
        {!isLoading && list.length > 0 && (
          <>
            <div ref={sentinelRef} className="h-px" />
            {isFetchingNextPage && (
              <div className="py-2 text-center text-[12px] text-text-muted">Loading more…</div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Pick one of the selected employee's stores. */
export function StorePickerModal({
  stores,
  current,
  onClose,
  onSelect,
}: {
  stores: WarnableUserStore[];
  current: string | null;
  onClose: () => void;
  onSelect: (storeId: string, storeName: string) => void;
}): React.ReactElement {
  return (
    <Modal isOpen onClose={onClose} title="Select store" size="sm">
      {stores.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-muted">Select an employee first.</div>
      ) : (
        <div className="divide-y divide-border -mx-1">
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onSelect(s.id, s.name);
                onClose();
              }}
              className="w-full text-left px-2.5 py-2.5 hover:bg-surface-hover rounded-md flex items-center justify-between gap-3"
            >
              <span className="text-sm font-medium text-text truncate">{s.name}</span>
              {current === s.id && <Check className="h-4 w-4 text-accent shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/**
 * Pick the issuing manager (GM+). Owner-only feature — lets an Owner record a
 * warning on behalf of another manager. Managers are few, so this loads the org
 * users once and filters client-side (no pagination). The server validates the
 * chosen manager outranks the subject on submit.
 */
export function ManagerPickerModal({
  current,
  onClose,
  onSelect,
}: {
  current: string | null;
  onClose: () => void;
  onSelect: (id: string, name: string) => void;
}): React.ReactElement {
  const { data: users, isLoading } = useUsers();
  const [q, setQ] = useState("");

  const managers = useMemo(() => {
    const list = (users ?? []).filter((u) => u.is_active && u.role_priority <= ROLE_PRIORITY.GM);
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((u) => u.full_name.toLowerCase().includes(term));
  }, [users, q]);

  return (
    <Modal isOpen onClose={onClose} title="Select issuing manager" size="md">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search managers…"
          autoFocus
          className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
        />
      </div>
      <div className="space-y-1 max-h-[52vh] overflow-y-auto -mx-1">
        {isLoading && <div className="py-10 text-center text-sm text-text-muted">Loading…</div>}
        {!isLoading &&
          managers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onSelect(u.id, u.full_name);
                onClose();
              }}
              className="w-full text-left px-2.5 py-2.5 hover:bg-surface-hover rounded-md flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text truncate">{u.full_name}</div>
                <div className="text-xs text-text-muted truncate">{u.role_name}</div>
              </div>
              {current === u.id && <Check className="h-4 w-4 text-accent shrink-0" />}
            </button>
          ))}
        {!isLoading && managers.length === 0 && (
          <div className="py-10 text-center text-sm text-text-muted">No managers found.</div>
        )}
      </div>
    </Modal>
  );
}
