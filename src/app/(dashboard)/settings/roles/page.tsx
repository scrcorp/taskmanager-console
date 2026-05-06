"use client";

/**
 * Roles & Permissions — manage permission matrix per role.
 *
 * Access: roles:read required. Editing: only roles with lower priority than yours.
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Shield, Check, Minus, Save, ChevronDown, ChevronRight } from "lucide-react";
import { useRoles, useAllPermissions, useRolePermissions, useUpdateRolePermissions } from "@/hooks";
import { usePermissions } from "@/hooks/usePermissions";
import { ROLE_PRIORITY, PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useResultModal } from "@/components/ui/ResultModal";
import { parseApiError } from "@/lib/utils";
import type { PermissionItem } from "@/hooks/usePermissionAdmin";

interface ResourceGroup {
  resource: string;
  label: string;
  permissions: PermissionItem[];
}

const RESOURCE_LABELS: Record<string, string> = {
  stores: "Stores",
  users: "Staff",
  roles: "Roles",
  schedules: "Schedules",
  schedule_history: "Schedule History",
  schedule_settings: "Schedule Settings",
  notices: "Notices",
  checklists: "Checklists",
  checklist_review: "Checklist Review",
  checklist_log: "Checklist Log",
  tasks: "Tasks",
  evaluations: "Evaluations",
  daily_reports: "Daily Reports",
  dashboard: "Dashboard",
  inventory: "Inventory",
  cost: "Cost (Hourly Rate)",
  org: "Organization",
};

const RESOURCE_ORDER = [
  "dashboard", "stores", "users", "roles",
  "schedules", "schedule_history", "schedule_settings",
  "checklists", "checklist_review", "checklist_log",
  "tasks", "notices", "evaluations", "daily_reports",
  "inventory", "cost", "org",
];

function priorityLabel(p: number): string {
  if (p <= ROLE_PRIORITY.OWNER) return "Owner";
  if (p <= ROLE_PRIORITY.GM) return "GM";
  if (p <= ROLE_PRIORITY.SV) return "SV";
  return "Staff";
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    read: "View", create: "Create", update: "Edit", delete: "Delete",
    approve: "Approve", cancel: "Cancel", revert: "Revert",
    manage: "Manage", reset_password: "Reset Password",
  };
  return labels[action] ?? action;
}

export default function RolesPermissionsPage(): React.ReactElement {
  const { hasPermission } = usePermissions();

  if (!hasPermission(PERMISSIONS.ROLES_READ)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary">You do not have permission to view this page.</p>
      </div>
    );
  }

  return <RolesPermissionsContent />;
}

function RolesPermissionsContent(): React.ReactElement {
  const { showSuccess, showError } = useResultModal();
  const { priority: myPriority } = usePermissions();
  const rolesQ = useRoles();
  const permissionsQ = useAllPermissions();
  const updateMutation = useUpdateRolePermissions();

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const rolePermsQ = useRolePermissions(selectedRoleId ?? undefined);
  const [checkedCodes, setCheckedCodes] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set());

  // Owner는 권한 체크를 bypass하므로 매트릭스에서 제외
  const sortedRoles = useMemo(() => {
    if (!rolesQ.data) return [];
    return [...rolesQ.data]
      .filter((r) => r.priority > ROLE_PRIORITY.OWNER)
      .sort((a, b) => a.priority - b.priority);
  }, [rolesQ.data]);

  useEffect(() => {
    if (sortedRoles.length > 0 && !selectedRoleId) {
      const first = sortedRoles.find((r) => r.priority > myPriority) ?? sortedRoles[0];
      setSelectedRoleId(first.id);
    }
  }, [sortedRoles, selectedRoleId, myPriority]);

  useEffect(() => {
    if (rolePermsQ.data) {
      setCheckedCodes(new Set(rolePermsQ.data.map((p) => p.code)));
      setIsDirty(false);
    }
  }, [rolePermsQ.data]);

  const resourceGroups: ResourceGroup[] = useMemo(() => {
    if (!permissionsQ.data) return [];
    const groupMap = new Map<string, ResourceGroup>();
    for (const p of permissionsQ.data) {
      if (!groupMap.has(p.resource)) {
        groupMap.set(p.resource, {
          resource: p.resource,
          label: RESOURCE_LABELS[p.resource] ?? p.resource,
          permissions: [],
        });
      }
      groupMap.get(p.resource)!.permissions.push(p);
    }
    return RESOURCE_ORDER
      .filter((r) => groupMap.has(r))
      .map((r) => groupMap.get(r)!)
      .concat(
        Array.from(groupMap.values()).filter((g) => !RESOURCE_ORDER.includes(g.resource))
      );
  }, [permissionsQ.data]);

  const selectedRole = sortedRoles.find((r) => r.id === selectedRoleId);
  const canEdit = selectedRole ? selectedRole.priority > myPriority : false;

  const togglePermission = useCallback((code: string) => {
    setCheckedCodes((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
    setIsDirty(true);
  }, []);

  const toggleResource = useCallback((group: ResourceGroup, allChecked: boolean) => {
    setCheckedCodes((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        allChecked ? next.delete(p.code) : next.add(p.code);
      }
      return next;
    });
    setIsDirty(true);
  }, []);

  const toggleExpand = useCallback((resource: string) => {
    setExpandedResources((prev) => {
      const next = new Set(prev);
      next.has(resource) ? next.delete(resource) : next.add(resource);
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!selectedRoleId) return;
    try {
      await updateMutation.mutateAsync({
        roleId: selectedRoleId,
        permissionCodes: Array.from(checkedCodes),
      });
      setIsDirty(false);
      showSuccess("Permissions updated.");
    } catch (err) {
      showError(parseApiError(err, "Failed to update permissions."));
    }
  };

  if (rolesQ.isLoading || permissionsQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Roles & Permissions</h1>
        {canEdit && isDirty && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={updateMutation.isPending}
          >
            <Save className="h-4 w-4 mr-1.5" />
            Save Changes
          </Button>
        )}
      </div>

      <div className="flex gap-6">
        {/* Role list */}
        <div className="w-52 shrink-0 space-y-1">
          {sortedRoles.map((role) => {
            const isSelected = role.id === selectedRoleId;
            const isEditable = role.priority > myPriority;
            const roleName = role.name.replace(/_/g, " ");
            return (
              <button
                key={role.id}
                onClick={() => { setSelectedRoleId(role.id); setIsDirty(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                  isSelected
                    ? "bg-accent text-white shadow-sm"
                    : "text-text hover:bg-surface-hover"
                }`}
              >
                <Shield className={`h-4 w-4 shrink-0 ${isSelected ? "text-white/80" : "text-text-muted"}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate capitalize">{roleName}</div>
                  <div className={`text-[11px] ${isSelected ? "text-white/60" : "text-text-muted"}`}>
                    {priorityLabel(role.priority)}
                    {!isEditable && " · Read-only"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Permission matrix */}
        <div className="flex-1 min-w-0">
          {rolePermsQ.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <div className="space-y-1">
              {resourceGroups.map((group) => {
                const checkedCount = group.permissions.filter((p) => checkedCodes.has(p.code)).length;
                const allChecked = checkedCount === group.permissions.length;
                const someChecked = checkedCount > 0;
                const isExpanded = expandedResources.has(group.resource);

                return (
                  <div key={group.resource} className="bg-card border border-border rounded-lg overflow-hidden">
                    {/* Resource header */}
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:bg-surface-hover/50 transition-colors"
                      onClick={() => toggleExpand(group.resource)}
                    >
                      {/* Toggle checkbox */}
                      <button
                        className="shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canEdit) toggleResource(group, allChecked);
                        }}
                        disabled={!canEdit}
                      >
                        <div className={`w-[18px] h-[18px] rounded flex items-center justify-center transition-colors ${
                          allChecked ? "bg-accent"
                            : someChecked ? "bg-accent/40"
                              : "bg-surface border border-border"
                        } ${!canEdit ? "opacity-40" : ""}`}>
                          {allChecked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                          {someChecked && !allChecked && <Minus className="h-3 w-3 text-white" strokeWidth={3} />}
                        </div>
                      </button>

                      {/* Resource label + count */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm font-semibold text-text">{group.label}</span>
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                          allChecked ? "bg-accent/15 text-accent"
                            : someChecked ? "bg-warning-muted text-warning"
                              : "bg-surface text-text-muted"
                        }`}>
                          {checkedCount}/{group.permissions.length}
                        </span>
                      </div>

                      {/* Collapsed preview — pill toggles */}
                      {!isExpanded && (
                        <div className="flex gap-1 shrink-0">
                          {group.permissions.map((p) => {
                            const isChecked = checkedCodes.has(p.code);
                            return (
                              <button
                                key={p.code}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canEdit) togglePermission(p.code);
                                }}
                                disabled={!canEdit}
                                title={p.description ?? actionLabel(p.action)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide transition-all ${
                                  isChecked
                                    ? "bg-accent text-white"
                                    : "bg-surface text-text-muted/50"
                                } ${!canEdit ? "opacity-40 cursor-default" : "cursor-pointer hover:scale-105"}`}
                              >
                                {actionLabel(p.action)}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Expand icon */}
                      <div className="shrink-0 text-text-muted">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </div>

                    {/* Expanded — individual permissions */}
                    {isExpanded && (
                      <div className="border-t border-border">
                        {group.permissions.map((p) => {
                          const isChecked = checkedCodes.has(p.code);
                          return (
                            <label
                              key={p.code}
                              className={`flex items-center gap-3 pl-11 pr-4 py-2.5 transition-colors cursor-pointer ${
                                canEdit ? "hover:bg-surface-hover/30" : "cursor-default"
                              } ${isChecked ? "" : "opacity-60"}`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => canEdit && togglePermission(p.code)}
                                disabled={!canEdit}
                                className="sr-only"
                              />
                              <div className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 transition-colors ${
                                isChecked
                                  ? "bg-accent"
                                  : "bg-surface border border-border"
                              } ${!canEdit ? "opacity-40" : ""}`}>
                                {isChecked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-text">{actionLabel(p.action)}</span>
                                {p.description && (
                                  <span className="text-xs text-text-muted ml-2">{p.description}</span>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Bottom save bar */}
              {canEdit && (
                <div className="flex items-center justify-between px-4 py-3 bg-card border border-border rounded-lg mt-2">
                  <p className="text-xs text-text-muted">
                    {checkedCodes.size} of {permissionsQ.data?.length ?? 0} permissions enabled
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSave}
                    disabled={!isDirty}
                    isLoading={updateMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-1.5" />
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
