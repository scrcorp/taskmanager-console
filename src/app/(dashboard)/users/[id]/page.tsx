"use client";

/**
 * 스태프 상세 페이지 -- 사용자 프로필, 수정, 활성/비활성 토글, 삭제, 매장 할당을 관리합니다.
 *
 * Staff Detail Page -- Manages user profile, editing, active toggle,
 * deletion, and store memberships.
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronLeft,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Store as StoreIcon,
} from "lucide-react";
import {
  useUser,
  useUpdateUser,
  useToggleUserActive,
  useDeleteUser,
  useUserStores,
  useSyncUserStores,
} from "@/hooks/useUsers";
import { useStores } from "@/hooks/useStores";
import { useRoles } from "@/hooks/useRoles";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, Modal, Select, ConfirmDialog } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { formatDate, parseApiError } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { User, Store, Role, UserStoreAssignment } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Type Definitions                                                          */
/* -------------------------------------------------------------------------- */

/** 사용자 수정 폼 데이터 / User edit form data */
interface UserEditFormData {
  full_name: string;
  email: string;
  phone: string;
  role_id: string;
}

/** 매장 배정 체크박스 상태 */
interface StoreCheckState {
  is_manager: boolean;
  is_work: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const INITIAL_EDIT_FORM: UserEditFormData = {
  full_name: "",
  email: "",
  phone: "",
  role_id: "",
};

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export default function UserDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams();
  const userId: string = params.id as string;
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tz = useTimezone();
  const canManageUsers = hasPermission(PERMISSIONS.USERS_UPDATE);

  /* ---- Data hooks -------------------------------------------------------- */
  const { data: user, isLoading: userLoading } = useUser(userId);
  const { data: userStores, isLoading: storesLoading } =
    useUserStores(userId);
  const { data: allStores } = useStores();
  const { data: roles } = useRoles();

  /* ---- Mutation hooks ---------------------------------------------------- */
  const updateUser = useUpdateUser();
  const toggleActive = useToggleUserActive();
  const deleteUser = useDeleteUser();
  const syncUserStores = useSyncUserStores();

  /* ---- Edit modal state -------------------------------------------------- */
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [editForm, setEditForm] =
    useState<UserEditFormData>(INITIAL_EDIT_FORM);

  /* ---- Delete dialog state ----------------------------------------------- */
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);

  /* ---- Role change confirmation state ----------------------------------- */
  const [isRoleChangeOpen, setIsRoleChangeOpen] = useState<boolean>(false);

  /* ---- Store membership state -------------------------------------------- */
  const [storeChecks, setStoreChecks] = useState<Record<string, StoreCheckState>>({});
  const [isStoreEditing, setIsStoreEditing] = useState<boolean>(false);
  const [unmanageConfirm, setUnmanageConfirm] = useState<{ storeId: string; storeName: string } | null>(null);

  /* ---- Derived data ------------------------------------------------------ */

  const allStoreList: Store[] = useMemo(
    () => (Array.isArray(allStores) ? allStores : []),
    [allStores],
  );

  const roleList: Role[] = useMemo(
    () => (Array.isArray(roles) ? roles : []),
    [roles],
  );

  /** 사용자 role priority (기본 999 = 권한 없음) */
  const userRolePriority: number = useMemo(() => {
    if (!user) return 999;
    const role = roleList.find((r: Role) => r.name === user.role_name);
    return role?.priority ?? 999;
  }, [user, roleList]);

  const isStaff = userRolePriority >= 40;
  const isSV = userRolePriority === 30;

  /** 서버 상태 기반 초기 체크 상태 생성 */
  const serverCheckState: Record<string, StoreCheckState> = useMemo(() => {
    const state: Record<string, StoreCheckState> = {};
    if (!Array.isArray(userStores)) return state;
    for (const us of userStores) {
      state[us.id] = { is_manager: us.is_manager, is_work: true };
    }
    return state;
  }, [userStores]);

  /** 서버 데이터가 바뀌면 로컬 상태 초기화 */
  useEffect(() => {
    if (!isStoreEditing) {
      setStoreChecks(serverCheckState);
    }
  }, [serverCheckState, isStoreEditing]);

  /** 관리매장 체크 수 */
  const managerCount: number = useMemo(
    () => Object.values(storeChecks).filter((s) => s.is_manager).length,
    [storeChecks],
  );

  /** 변경사항 있는지 */
  const hasChanges: boolean = useMemo(() => {
    const currentIds = new Set(Object.keys(storeChecks).filter((id) => storeChecks[id].is_work));
    const serverIds = new Set(Object.keys(serverCheckState));
    if (currentIds.size !== serverIds.size) return true;
    for (const id of currentIds) {
      if (!serverIds.has(id)) return true;
      if (storeChecks[id].is_manager !== (serverCheckState[id]?.is_manager ?? false)) return true;
    }
    for (const id of serverIds) {
      if (!currentIds.has(id)) return true;
    }
    return false;
  }, [storeChecks, serverCheckState]);

  /* ======================================================================== */
  /*  Handlers                                                                */
  /* ======================================================================== */

  /** 수정 모달 열기 / Open edit modal */
  const handleOpenEdit = useCallback((): void => {
    if (!user) return;
    setEditForm({
      full_name: user.full_name,
      email: user.email || "",
      phone: user.phone || "",
      role_id: "",
    });
    setIsEditOpen(true);
  }, [user]);

  /** 사용자 수정 저장 (역할 변경 확인 포함) / Save user edits (with role change check) */
  const handleSaveClick = useCallback((): void => {
    if (!editForm.full_name.trim()) return;
    if (editForm.role_id && user) {
      const currentRole = roleList.find((r: Role) => r.name === user.role_name);
      if (currentRole && editForm.role_id !== currentRole.id) {
        setIsRoleChangeOpen(true);
        return;
      }
    }
    handleUpdate();
  }, [editForm, user, roleList]);

  /** 사용자 수정 저장 / Save user edits */
  const handleUpdate = useCallback(async (): Promise<void> => {
    if (!editForm.full_name.trim()) return;
    try {
      const payload: {
        id: string;
        full_name: string;
        email?: string;
        phone?: string;
        role_id?: string;
      } = {
        id: userId,
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
      };
      if (editForm.role_id) {
        payload.role_id = editForm.role_id;
      }
      await updateUser.mutateAsync(payload);
      toast({ type: "success", message: "Staff member updated successfully!" });
      setIsEditOpen(false);
      setIsRoleChangeOpen(false);
      setEditForm(INITIAL_EDIT_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update staff member.") });
    }
  }, [userId, editForm, updateUser, toast]);

  /** 활성/비활성 토글 / Toggle active status */
  const handleToggleActive = useCallback(async (): Promise<void> => {
    try {
      await toggleActive.mutateAsync({
        id: userId,
        is_active: !user?.is_active,
      });
      toast({
        type: "success",
        message: user?.is_active
          ? "Staff member deactivated."
          : "Staff member activated.",
      });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to toggle active status.") });
    }
  }, [userId, user, toggleActive, toast]);

  /** 사용자 삭제 / Delete user */
  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      await deleteUser.mutateAsync(userId);
      toast({ type: "success", message: "Staff member deleted successfully!" });
      router.push("/users");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete staff member.") });
    }
  }, [userId, deleteUser, toast, router]);

  /** 관리 체크박스 토글 */
  const handleManagerToggle = useCallback((storeId: string, storeName: string, checked: boolean): void => {
    if (checked) {
      // 관리매장 체크 → 근무매장 자동 체크
      setStoreChecks((prev) => ({
        ...prev,
        [storeId]: { is_manager: true, is_work: true },
      }));
    } else {
      // 관리매장 해제 → confirmation
      setUnmanageConfirm({ storeId, storeName });
    }
  }, []);

  /** 관리매장 해제 확정 — 근무매장도 함께 제거 */
  const handleUnmanageWithRemove = useCallback((): void => {
    if (!unmanageConfirm) return;
    setStoreChecks((prev) => {
      const next = { ...prev };
      delete next[unmanageConfirm.storeId];
      return next;
    });
    setUnmanageConfirm(null);
  }, [unmanageConfirm]);

  /** 관리매장 해제 확정 — 근무매장은 유지 */
  const handleUnmanageKeepWork = useCallback((): void => {
    if (!unmanageConfirm) return;
    setStoreChecks((prev) => ({
      ...prev,
      [unmanageConfirm.storeId]: { is_manager: false, is_work: true },
    }));
    setUnmanageConfirm(null);
  }, [unmanageConfirm]);

  /** 근무 체크박스 토글 */
  const handleWorkToggle = useCallback((storeId: string, checked: boolean): void => {
    setStoreChecks((prev) => {
      if (checked) {
        return {
          ...prev,
          [storeId]: { is_manager: prev[storeId]?.is_manager ?? false, is_work: true },
        };
      } else {
        // 근무 해제
        const next = { ...prev };
        delete next[storeId];
        return next;
      }
    });
  }, []);

  /** 매장 배정 저장 */
  const handleSaveStores = useCallback(async (): Promise<void> => {
    const assignments = Object.entries(storeChecks)
      .filter(([, v]) => v.is_work)
      .map(([storeId, v]) => ({
        store_id: storeId,
        is_manager: v.is_manager,
      }));
    try {
      await syncUserStores.mutateAsync({ userId, assignments });
      toast({ type: "success", message: "Store assignments updated." });
      setIsStoreEditing(false);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update store assignments.") });
    }
  }, [userId, storeChecks, syncUserStores, toast]);

  /** 매장 배정 취소 */
  const handleCancelStores = useCallback((): void => {
    setStoreChecks(serverCheckState);
    setIsStoreEditing(false);
  }, [serverCheckState]);

  /** 역할 뱃지 변형 결정 / Determine role badge variant */
  const getRoleBadgeVariant = useCallback(
    (roleName: string): "accent" | "warning" | "default" => {
      const name: string = roleName.toLowerCase();
      if (name.includes("admin") || name.includes("super")) return "accent";
      if (name.includes("manager")) return "warning";
      return "default";
    },
    [],
  );

  /* ======================================================================== */
  /*  Loading & Error States                                                  */
  /* ======================================================================== */

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">Staff member not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push("/users")}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Staff
        </Button>
      </div>
    );
  }

  /* ======================================================================== */
  /*  Render                                                                  */
  /* ======================================================================== */

  return (
    <div>
      {/* Back Navigation */}
      <button
        type="button"
        onClick={() => router.push("/users")}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text transition-colors mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Staff
      </button>

      {/* User Profile Card */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4 md:gap-5">
            {/* Avatar */}
            <div className="flex items-center justify-center h-12 w-12 md:h-16 md:w-16 rounded-full bg-accent-muted text-accent text-lg md:text-xl font-bold flex-shrink-0">
              {user.full_name.charAt(0).toUpperCase()}
            </div>

            {/* User Info */}
            <div>
              <div className="flex items-center gap-2 md:gap-3 mb-1 flex-wrap">
                <h1 className="text-xl md:text-2xl font-extrabold text-text">
                  {user.full_name}
                </h1>
                <Badge variant={getRoleBadgeVariant(user.role_name)}>
                  {user.role_name}
                </Badge>
                <Badge variant={user.is_active ? "success" : "danger"}>
                  {user.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-sm text-text-muted mb-3">
                @{user.username}
              </p>

              {/* Detail Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                <div>
                  <span className="text-xs text-text-muted block">
                    Email
                  </span>
                  <span className="text-sm text-text-secondary flex items-center gap-1.5">
                    {user.email || "-"}
                    {user.email && (
                      user.email_verified
                        ? <span className="text-xs text-success" title="Verified">✓ Verified</span>
                        : <span className="text-xs text-warning" title="Not verified">Not verified</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-text-muted block">
                    Phone
                  </span>
                  <span className="text-sm text-text-secondary">
                    {user.phone || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-text-muted block">
                    Created
                  </span>
                  <span className="text-sm text-text-secondary">
                    {formatDate(user.created_at, tz)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {canManageUsers && (
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <Button variant="secondary" size="sm" onClick={handleOpenEdit}>
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleActive}
                isLoading={toggleActive.isPending}
              >
                {user.is_active ? (
                  <>
                    <ToggleRight className="h-4 w-4" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-4 w-4" />
                    Activate
                  </>
                )}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setIsDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Store Assignments Section */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text">
            Store Assignments
          </h2>
          {canManageUsers && !isStoreEditing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsStoreEditing(true)}
            >
              <Edit className="h-4 w-4" />
              Edit
            </Button>
          )}
          {canManageUsers && isStoreEditing && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCancelStores}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveStores}
                isLoading={syncUserStores.isPending}
                disabled={!hasChanges}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        {storesLoading ? (
          <div className="flex items-center justify-center h-16">
            <LoadingSpinner size="sm" />
          </div>
        ) : allStoreList.length === 0 ? (
          <div className="text-center py-6">
            <StoreIcon className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-muted">
              No stores in this organization.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">Store</th>
                  <th className="text-center py-2 px-3 font-medium text-text-secondary w-24">Manager</th>
                  <th className="text-center py-2 px-3 font-medium text-text-secondary w-24">Work</th>
                </tr>
              </thead>
              <tbody>
                {allStoreList.map((store: Store) => {
                  const check = storeChecks[store.id];
                  const isManaged = check?.is_manager ?? false;
                  const isWork = check?.is_work ?? false;

                  // 관리 체크박스 disabled 조건
                  const managerDisabled =
                    !isStoreEditing ||
                    isStaff ||
                    (isSV && !isManaged && managerCount >= 1);

                  // 근무 체크박스 disabled 조건
                  const workDisabled =
                    !isStoreEditing ||
                    isManaged; // 관리매장이면 근무 자동

                  return (
                    <tr
                      key={store.id}
                      className="border-b border-border last:border-b-0 hover:bg-surface/50 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center h-7 w-7 rounded-md bg-accent-muted text-accent">
                            <StoreIcon className="h-3.5 w-3.5" />
                          </div>
                          <span className="font-medium text-text">{store.name}</span>
                          {!store.is_active && (
                            <Badge variant="danger">Inactive</Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isManaged}
                          disabled={managerDisabled}
                          onChange={(e) => handleManagerToggle(store.id, store.name, e.target.checked)}
                          className="h-4 w-4 rounded border-border text-accent focus:ring-accent disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isWork}
                          disabled={workDisabled}
                          onChange={(e) => handleWorkToggle(store.id, e.target.checked)}
                          className="h-4 w-4 rounded border-border text-accent focus:ring-accent disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Role-specific hints */}
        {isStoreEditing && (
          <div className="mt-3 text-xs text-text-muted">
            {isStaff && "Staff can only be assigned to work stores."}
            {isSV && "Supervisor can manage only one store."}
            {!isStaff && !isSV && userRolePriority <= 20 && "GM can manage multiple stores."}
          </div>
        )}
      </div>

      {/* Recent Schedules Section (Placeholder) */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-text mb-4">
          Recent Schedules
        </h2>
        <div className="text-center py-6">
          <p className="text-sm text-text-muted">
            Recent schedule history will be displayed here.
          </p>
        </div>
      </div>

      {/* ================================================================== */}
      {/*  Modals & Dialogs                                                  */}
      {/* ================================================================== */}

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditForm(INITIAL_EDIT_FORM);
        }}
        title="Edit Staff Member"
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            placeholder="Enter full name"
            value={editForm.full_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((prev: UserEditFormData) => ({
                ...prev,
                full_name: e.target.value,
              }))
            }
          />
          <Input
            label="Email (optional)"
            type="email"
            placeholder="Enter email"
            value={editForm.email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((prev: UserEditFormData) => ({
                ...prev,
                email: e.target.value,
              }))
            }
          />
          <Input
            label="Phone (optional)"
            type="tel"
            placeholder="Enter phone number"
            value={editForm.phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((prev: UserEditFormData) => ({
                ...prev,
                phone: e.target.value,
              }))
            }
          />
          <Select
            label="Role (optional - leave empty to keep current)"
            options={[
              { value: "", label: "Keep current role" },
              ...roleList.map((role: Role) => ({
                value: role.id,
                label: role.name,
              })),
            ]}
            value={editForm.role_id}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setEditForm((prev: UserEditFormData) => ({
                ...prev,
                role_id: e.target.value,
              }))
            }
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsEditOpen(false);
                setEditForm(INITIAL_EDIT_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveClick}
              isLoading={updateUser.isPending}
              disabled={!editForm.full_name.trim()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Role Change Confirmation */}
      <ConfirmDialog
        isOpen={isRoleChangeOpen}
        onClose={() => setIsRoleChangeOpen(false)}
        onConfirm={handleUpdate}
        title="Change Role"
        message="Changing the role will affect this user's permissions and store access. Are you sure?"
        confirmLabel="Change Role"
        isLoading={updateUser.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Staff Member"
        message={`Are you sure you want to delete "${user.full_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteUser.isPending}
      />

      {/* Unmanage Store Confirmation — 관리매장 해제 시 근무매장 유지 여부 */}
      {unmanageConfirm && (
        <Modal
          isOpen={true}
          onClose={() => setUnmanageConfirm(null)}
          title="Remove Management"
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              &quot;{unmanageConfirm.storeName}&quot; management role will be removed.
              Do you also want to remove the schedule?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setUnmanageConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleUnmanageKeepWork}
              >
                Keep Work
              </Button>
              <Button
                variant="danger"
                onClick={handleUnmanageWithRemove}
              >
                Remove Both
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
