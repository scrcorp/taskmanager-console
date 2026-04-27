"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useChangePassword } from "@/hooks/usePassword";
import { setTokens } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { parseApiError } from "@/lib/utils";

/**
 * 비밀번호 변경 모달 — 현재 비밀번호 확인 후 새 비밀번호로 변경.
 *
 * 성공 시:
 * - 서버에서 받은 새 토큰 쌍으로 localStorage 갱신 (현재 세션 유지)
 * - Toast "Password changed successfully"
 * - 모달 닫기
 */

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({
  isOpen,
  onClose,
}: ChangePasswordModalProps): React.ReactElement | null {
  const { toast } = useToast();
  const changePassword = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleClose = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPasswordError("");
    setSuccess(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPasswordError("");

    if (newPassword !== confirmPassword) {
      toast({ type: "error", message: "New passwords do not match." });
      return;
    }

    if (newPassword.length < 1) {
      toast({ type: "error", message: "New password is required." });
      return;
    }

    try {
      const result = await changePassword.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      });
      // 새 토큰으로 교체 (현재 세션 유지)
      setTokens(result.access_token, result.refresh_token);
      setSuccess(true);
    } catch (err) {
      const msg = parseApiError(err, "Failed to change password.");
      if (msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("wrong")) {
        setCurrentPasswordError("Current password is incorrect.");
      } else {
        toast({ type: "error", message: msg });
      }
    }
  };

  const isDisabled =
    !currentPassword || !newPassword || !confirmPassword || changePassword.isPending;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={success ? "" : "Change Password"} size="sm" closeOnBackdrop={false}>
      {success ? (
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 className="text-lg font-bold text-text mb-1">Password Changed</h3>
          <p className="text-sm text-text-secondary mb-1">Your password has been changed successfully.</p>
          <p className="text-xs text-text-muted mb-6">All other devices have been logged out.</p>
          <Button variant="primary" size="sm" onClick={handleClose} className="min-w-[100px]">
            Done
          </Button>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-text-secondary">
          Enter your current password and set a new one.
        </p>

        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-1.5">
            Current Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setCurrentPasswordError("");
            }}
            placeholder="Enter current password"
            className={`w-full px-4 py-2.5 rounded-lg border bg-surface text-text text-sm outline-none focus:border-accent transition-colors ${
              currentPasswordError ? "border-danger" : "border-border"
            }`}
          />
          {currentPasswordError && (
            <p className="mt-1 text-xs text-danger">{currentPasswordError}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-1.5">
            New Password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-1.5">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            className={`w-full px-4 py-2.5 rounded-lg border bg-surface text-text text-sm outline-none focus:border-accent transition-colors ${
              confirmPassword && newPassword !== confirmPassword
                ? "border-danger"
                : "border-border"
            }`}
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="mt-1 text-xs text-danger">Passwords do not match.</p>
          )}
        </div>

        <p className="text-xs text-text-muted">
          After changing your password, all other devices will be logged out.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={changePassword.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={changePassword.isPending}
            disabled={isDisabled}
          >
            Change Password
          </Button>
        </div>
      </form>
      )}
    </Modal>
  );
}
