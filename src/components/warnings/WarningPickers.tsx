"use client";

import React, { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Modal, Input, LoadingSpinner } from "@/components/ui";
import { useWarnableUsers } from "@/hooks/useWarnings";
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
  const { data: users, isLoading } = useWarnableUsers();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const list = users ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (u) =>
        u.full_name.toLowerCase().includes(term) ||
        (u.employee_no ?? "").toLowerCase().includes(term) ||
        (u.store_name ?? "").toLowerCase().includes(term),
    );
  }, [users, q]);

  return (
    <Modal isOpen onClose={onClose} title="Select employee" size="md">
      <Input placeholder="Search by name, ID, or store…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-3 max-h-[52vh] overflow-y-auto -mx-1">
        {isLoading ? (
          <div className="py-10 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-text-muted">No employees you can warn.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((u) => (
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
          </div>
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
