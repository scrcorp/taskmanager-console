"use client";

/**
 * Attendance Devices 설정 페이지 —
 *   1) 서비스별 Access Code(공유 6자리) 표시 및 회전
 *   2) 등록된 태블릿(AttendanceDevice) 목록 / rename / revoke
 *
 * Attendance Devices settings page — manages the shared 6-digit access code
 * (used during tablet enrollment) and the list of registered store tablets.
 *
 * 권한: 진입 `attendance_devices:read`, 수정 `attendance_devices:update`.
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Tablet,
  KeyRound,
  RefreshCw,
  Copy,
  Edit,
  Check,
  X as CloseIcon,
  Trash2,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useAttendanceDevices,
  useUpdateAttendanceDevice,
  useRevokeAttendanceDevice,
  useAccessCode,
  useRotateAccessCode,
} from "@/hooks/useAttendanceDevices";
import { useTimezone } from "@/hooks/useTimezone";
import { Button } from "@/components/ui/Button";
import { Badge, ConfirmDialog } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { useResultModal } from "@/components/ui/ResultModal";
import { formatDate, formatDateTimeSeconds, parseApiError } from "@/lib/utils";
import type { AttendanceDevice } from "@/types";

const ATTENDANCE_SERVICE_KEY = "attendance";

export default function AttendanceDevicesSettingsPage(): React.ReactElement {
  const { hasPermission } = usePermissions();

  if (!hasPermission(PERMISSIONS.ATTENDANCE_DEVICES_READ)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return <AttendanceDevicesContent />;
}

function AttendanceDevicesContent(): React.ReactElement {
  const { toast } = useToast();
  const { showSuccess, showError } = useResultModal();
  const { hasPermission } = usePermissions();
  const tz = useTimezone();
  const canUpdate = hasPermission(PERMISSIONS.ATTENDANCE_DEVICES_UPDATE);

  /* ---- Access code ------------------------------------------------------- */
  const { data: accessCode, isLoading: codeLoading } = useAccessCode(
    ATTENDANCE_SERVICE_KEY,
  );
  const rotateCode = useRotateAccessCode();
  const [isRotateConfirmOpen, setIsRotateConfirmOpen] =
    useState<boolean>(false);
  const [codeCopied, setCodeCopied] = useState<boolean>(false);

  /* ---- Devices ----------------------------------------------------------- */
  const { data: devices, isLoading: devicesLoading } = useAttendanceDevices();
  const updateDevice = useUpdateAttendanceDevice();
  const revokeDevice = useRevokeAttendanceDevice();

  const deviceList: AttendanceDevice[] = useMemo(
    () => (Array.isArray(devices) ? devices : []),
    [devices],
  );

  /* ---- Inline rename state ---------------------------------------------- */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");

  /* ---- Revoke confirmation ---------------------------------------------- */
  const [revokeTarget, setRevokeTarget] = useState<AttendanceDevice | null>(
    null,
  );

  /* ======================================================================= */
  /*  Handlers                                                               */
  /* ======================================================================= */

  const handleRotateCode = useCallback(async (): Promise<void> => {
    try {
      await rotateCode.mutateAsync(ATTENDANCE_SERVICE_KEY);
      setIsRotateConfirmOpen(false);
      showSuccess("Access code rotated.");
    } catch (err) {
      showError(parseApiError(err, "Failed to rotate access code."));
    }
  }, [rotateCode, showSuccess, showError]);

  const handleCopyCode = useCallback(async (code: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      toast({ type: "success", message: "Access code copied to clipboard." });
      window.setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      toast({ type: "error", message: "Failed to copy access code." });
    }
  }, [toast]);

  const handleStartRename = useCallback(
    (device: AttendanceDevice): void => {
      setRenamingId(device.id);
      setRenameValue(device.device_name ?? "");
    },
    [],
  );

  const handleCancelRename = useCallback((): void => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const handleSaveRename = useCallback(async (): Promise<void> => {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) {
      showError("Device name cannot be empty.");
      return;
    }
    try {
      await updateDevice.mutateAsync({ id: renamingId, device_name: name });
      showSuccess("Device renamed.");
      setRenamingId(null);
      setRenameValue("");
    } catch (err) {
      showError(parseApiError(err, "Failed to rename device."));
    }
  }, [renamingId, renameValue, updateDevice, showSuccess, showError]);

  const handleRevoke = useCallback(async (): Promise<void> => {
    if (!revokeTarget) return;
    try {
      await revokeDevice.mutateAsync(revokeTarget.id);
      showSuccess("Device revoked.");
      setRevokeTarget(null);
    } catch (err) {
      showError(parseApiError(err, "Failed to revoke device."));
    }
  }, [revokeTarget, revokeDevice, showSuccess, showError]);

  /* ======================================================================= */
  /*  Render                                                                 */
  /* ======================================================================= */

  const codeValue = accessCode?.code ?? "";

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-text mb-6">
        Attendance Devices
      </h1>

      {/* Access Code Card */}
      <div className="bg-card border border-border rounded-xl p-6 max-w-2xl mb-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-text">Enrollment Access Code</h2>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Enter this 6-digit code on the tablet to enroll it as an attendance
          device for your organization.
        </p>

        {codeLoading ? (
          <div className="flex items-center justify-center h-16">
            <LoadingSpinner size="sm" />
          </div>
        ) : accessCode ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 py-3 bg-surface rounded-lg">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleCopyCode(codeValue)}
                  className="flex items-center gap-2 text-2xl font-extrabold tracking-[0.3em] text-text hover:text-accent transition-colors"
                  title="Click to copy"
                >
                  {codeValue || "—"}
                  {codeCopied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <Badge variant={accessCode.source === "env" ? "accent" : "default"}>
                  {accessCode.source === "env" ? "Env" : "Auto"}
                </Badge>
              </div>
              {canUpdate && (
                <span
                  title={
                    accessCode.source === "env"
                      ? "Env-managed codes cannot be rotated from UI"
                      : "Rotate code"
                  }
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsRotateConfirmOpen(true)}
                    disabled={accessCode.source === "env"}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Rotate
                  </Button>
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-text-muted">Rotated at</p>
                <p className="text-text-secondary">
                  {accessCode.rotated_at
                    ? formatDate(accessCode.rotated_at, tz)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Created at</p>
                <p className="text-text-secondary">
                  {formatDate(accessCode.created_at, tz)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No access code configured.</p>
        )}
      </div>

      {/* Devices Card */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Tablet className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-text">Registered Devices</h2>
        </div>

        {devicesLoading ? (
          <div className="flex items-center justify-center h-24">
            <LoadingSpinner size="sm" />
          </div>
        ) : deviceList.length === 0 ? (
          <div className="text-center py-10">
            <Tablet className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-muted">
              No devices registered yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">
                    Device Name
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">
                    Store
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">
                    Registered
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">
                    Last Seen
                  </th>
                  {canUpdate && (
                    <th className="text-right py-2 px-3 font-medium text-text-secondary w-36">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {deviceList.map((device) => {
                  const isRenaming = renamingId === device.id;
                  return (
                    <tr
                      key={device.id}
                      className="border-b border-border last:border-b-0 hover:bg-surface/50 transition-colors"
                    >
                      <td className="py-3 px-3">
                        {isRenaming ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleSaveRename();
                                }
                                if (e.key === "Escape") handleCancelRename();
                              }}
                              className="w-48 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <span className="font-medium text-text">
                            {device.device_name ?? (
                              <span className="text-text-muted italic">
                                (unnamed)
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        {device.store_name}
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        {formatDateTimeSeconds(device.registered_at, tz)}
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        {device.last_seen_at
                          ? formatDateTimeSeconds(device.last_seen_at, tz)
                          : "—"}
                      </td>
                      {canUpdate && (
                        <td className="py-3 px-3">
                          <div className="flex justify-end items-center gap-2">
                            {isRenaming ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveRename()}
                                  disabled={updateDevice.isPending}
                                  className="p-1.5 rounded text-success hover:bg-success-muted transition-colors disabled:opacity-50"
                                  title="Save"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelRename}
                                  disabled={updateDevice.isPending}
                                  className="p-1.5 rounded text-text-muted hover:text-text hover:bg-surface transition-colors disabled:opacity-50"
                                  title="Cancel"
                                >
                                  <CloseIcon className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartRename(device)}
                                  className="p-1.5 rounded text-text-secondary hover:text-accent hover:bg-surface transition-colors"
                                  title="Rename"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRevokeTarget(device)}
                                  className="p-1.5 rounded text-text-secondary hover:text-danger hover:bg-danger-muted transition-colors"
                                  title="Revoke"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rotate Access Code confirmation */}
      <ConfirmDialog
        isOpen={isRotateConfirmOpen}
        onClose={() => setIsRotateConfirmOpen(false)}
        onConfirm={handleRotateCode}
        title="Rotate Access Code"
        message="Rotating the code will immediately invalidate the current code. Any pending tablet enrollments will need the new code. Continue?"
        confirmLabel="Rotate"
        isLoading={rotateCode.isPending}
      />

      {/* Revoke device confirmation */}
      <ConfirmDialog
        isOpen={revokeTarget != null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke Device"
        message={
          revokeTarget
            ? `Revoke "${revokeTarget.device_name ?? "(unnamed)"}" at ${revokeTarget.store_name}? This tablet will no longer be able to record attendance until re-enrolled.`
            : ""
        }
        confirmLabel="Revoke"
        isLoading={revokeDevice.isPending}
      />
    </div>
  );
}
