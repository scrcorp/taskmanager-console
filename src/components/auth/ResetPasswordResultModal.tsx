"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * 비밀번호 초기화 결과 모달 — 임시 비밀번호를 한 번만 표시합니다.
 *
 * 보안: 모달 닫으면 임시 비밀번호를 다시 확인할 수 없음.
 * 직원 이메일로도 자동 발송됨.
 */

interface ResetPasswordResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  temporaryPassword: string;
  employeeName: string;
  employeeEmail: string | null;
}

export function ResetPasswordResultModal({
  isOpen,
  onClose,
  temporaryPassword,
  employeeName,
  employeeEmail,
}: ResetPasswordResultModalProps): React.ReactElement | null {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Password Reset Successfully" size="sm">
      <div className="space-y-4">
        {/* 성공 아이콘 */}
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center text-success text-2xl">
            ✓
          </div>
        </div>

        <p className="text-sm text-text-secondary text-center">
          A temporary password has been generated for{" "}
          <strong className="text-text">{employeeName}</strong>.
        </p>

        {/* 임시 비밀번호 박스 */}
        <div className="bg-warning/10 border border-warning/30 rounded-lg px-5 py-4 text-center">
          <p className="text-xs text-text-secondary mb-2">Temporary Password</p>
          <p className="text-2xl font-extrabold text-warning tracking-[3px] font-mono">
            {temporaryPassword}
          </p>
          <p className="text-xs text-text-muted mt-2">
            This password is shown only once.
            {employeeEmail && ` It has also been sent to ${employeeEmail}.`}
          </p>
        </div>

        {/* 안내 메시지 */}
        <div className="bg-surface rounded-lg p-3 text-xs text-text-secondary space-y-1.5">
          <p>✓ Employee has been logged out from all devices.</p>
          <p>✓ A password change recommendation will be shown on their next login.</p>
          {!employeeEmail && (
            <p className="text-warning">
              ⚠ No email on file. Please share the temporary password verbally.
            </p>
          )}
          {employeeEmail && (
            <p className="text-text-muted">
              ⚠ If the employee cannot access their email, share the temporary password verbally.
            </p>
          )}
        </div>

        <div className="flex justify-center pt-1">
          <Button variant="primary" size="sm" onClick={onClose} className="min-w-[120px]">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
