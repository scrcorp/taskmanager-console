"use client";

/**
 * Super Owner 양도 form — modal.open 안에서 렌더됨.
 *
 * Owner 사용자 중 1명을 선택하고 현재 비밀번호로 본인 확인 → close({ target_user_id, current_password }).
 * 취소 시 close(null).
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui";
import { useUsers } from "@/hooks/useUsers";
import { ROLE_PRIORITY } from "@/lib/permissions";

export interface TransferSuperOwnerResult {
  target_user_id: string;
  current_password: string;
}

export function TransferSuperOwnerForm({
  close,
}: {
  close: (result: TransferSuperOwnerResult | null) => void;
}): React.ReactElement {
  const { data: users = [], isLoading } = useUsers({ is_active: true });
  const owners = users.filter((u) => u.role_priority === ROLE_PRIORITY.OWNER);

  const [targetId, setTargetId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!targetId) {
      setError("Select a new Super Owner.");
      return;
    }
    if (!password) {
      setError("Enter your current password.");
      return;
    }
    close({ target_user_id: targetId, current_password: password });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="text-sm text-text-secondary">
        Transferring Super Owner will demote you to Owner (assigned to all stores) and promote the selected Owner to Super Owner. You will be logged out after the transfer.
      </div>

      {isLoading ? (
        <div className="text-text-muted text-sm">Loading users…</div>
      ) : owners.length === 0 ? (
        <div className="bg-warning-muted text-warning text-sm rounded-lg px-4 py-3">
          No active Owners found. Promote a user to Owner first, then transfer.
        </div>
      ) : (
        <Select
          label="New Super Owner (current Owners)"
          value={targetId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetId(e.target.value)}
          options={owners.map((o) => ({
            value: o.id,
            label: `${o.full_name} (${o.username})`,
          }))}
          placeholder="Select Owner"
        />
      )}

      <Input
        type="password"
        label="Your current password"
        placeholder="Confirm with your password"
        value={password}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
      />

      {error && (
        <div className="bg-danger-muted text-danger text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="flex justify-end gap-2 mt-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => close(null)}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={owners.length === 0}
        >
          Transfer
        </Button>
      </div>
    </form>
  );
}
