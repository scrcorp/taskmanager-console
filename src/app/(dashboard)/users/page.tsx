"use client";

/**
 * 스태프 목록 페이지 -- 사용자 관리 페이지입니다.
 * 필터링, 검색, 생성 기능을 제공합니다.
 *
 * Staff List Page -- User management page with filtering, search, and creation.
 * Supports filtering by store, role, and active status.
 */

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUrlParams } from "@/hooks/useUrlParams";
import { Plus, Search } from "lucide-react";
import { useUsers, useCreateUser } from "@/hooks/useUsers";
import { useStores } from "@/hooks/useStores";
import { useRoles } from "@/hooks/useRoles";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Badge, Modal, Select } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { formatDate, parseApiError } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { User, Store, Role } from "@/types";

/** 사용자 생성 폼 데이터 / User creation form data */
interface UserFormData {
  username: string;
  password: string;
  full_name: string;
  email: string;
  phone: string;
  role_id: string;
}

/** 필터 상태 인터페이스 / Filter state interface */
interface UserFilters {
  store_id: string;
  role_name: string;
  is_active: string;
  search: string;
}

/** 테이블 컬럼 타입 / Table column type */
interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

/** 초기 폼 상태 / Initial form state */
const INITIAL_FORM: UserFormData = {
  username: "",
  password: "",
  full_name: "",
  email: "",
  phone: "",
  role_id: "",
};

/** 초기 필터 상태 / Initial filter state */
const INITIAL_FILTERS: UserFilters = {
  store_id: "",
  role_name: "",
  is_active: "",
  search: "",
};

export default function UsersPage(): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tz = useTimezone();
  const canManageUsers = hasPermission(PERMISSIONS.USERS_CREATE);

  /** 데이터 훅 / Data hooks */
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: stores } = useStores();
  const { data: roles } = useRoles();
  const createUser = useCreateUser();

  /** 필터 상태 (URL-persisted) / Filter state */
  const [urlParams, setUrlParams] = useUrlParams({ role: "", active: "", search: "" });
  const filters: UserFilters = {
    store_id: "",
    role_name: urlParams.role,
    is_active: urlParams.active,
    search: urlParams.search,
  };

  /** 생성 모달 상태 / Create modal state */
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<UserFormData>(INITIAL_FORM);

  /** 안전한 목록 추출 / Safe list extraction */
  const userList: User[] = useMemo(
    () => (Array.isArray(users) ? users : []),
    [users],
  );
  const storeList: Store[] = useMemo(
    () => (Array.isArray(stores) ? stores : []),
    [stores],
  );
  const roleList: Role[] = useMemo(
    () => (Array.isArray(roles) ? roles : []),
    [roles],
  );

  /** 필터링된 사용자 목록 / Filtered user list */
  const filteredUsers: User[] = useMemo(() => {
    let result: User[] = userList;

    if (filters.search.trim()) {
      const query: string = filters.search.toLowerCase();
      result = result.filter(
        (user: User) =>
          user.full_name.toLowerCase().includes(query) ||
          user.username.toLowerCase().includes(query) ||
          (user.email && user.email.toLowerCase().includes(query)),
      );
    }

    if (filters.role_name) {
      result = result.filter(
        (user: User) => user.role_name === filters.role_name,
      );
    }

    if (filters.is_active !== "") {
      const isActive: boolean = filters.is_active === "true";
      result = result.filter((user: User) => user.is_active === isActive);
    }

    return result;
  }, [userList, filters]);

  /** 사용자 생성 핸들러 / Handle user creation */
  const handleCreate = useCallback(async (): Promise<void> => {
    if (
      !createForm.username.trim() ||
      !createForm.password.trim() ||
      !createForm.full_name.trim() ||
      !createForm.role_id
    )
      return;
    try {
      await createUser.mutateAsync({
        username: createForm.username.trim(),
        password: createForm.password,
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        role_id: createForm.role_id,
      });
      toast({ type: "success", message: "Staff member created successfully!" });
      setIsCreateOpen(false);
      setCreateForm(INITIAL_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create staff member.") });
    }
  }, [createForm, createUser, toast]);

  /** 행 클릭으로 상세 페이지 이동 / Navigate to detail on row click */
  const handleRowClick = useCallback(
    (user: User): void => {
      router.push(`/users/${user.id}`);
    },
    [router],
  );

  /** 역할 뱃지 변형 결정 / Determine role badge variant */
  const getRoleBadgeVariant = useCallback(
    (roleName: string): "accent" | "warning" | "info" | "default" => {
      const name: string = roleName.toLowerCase();
      if (name === "owner") return "accent";
      if (name === "general_manager") return "warning";
      if (name === "supervisor") return "info";
      return "default";
    },
    [],
  );

  /** 테이블 컬럼 정의 / Table column definitions */
  const columns: Column<User>[] = useMemo(
    () => [
      {
        key: "full_name",
        header: "Full Name",
        render: (user: User) => (
          <div>
            <p className="font-medium text-text">{user.full_name}</p>
            <p className="text-xs text-text-muted">@{user.username}</p>
          </div>
        ),
      },
      {
        key: "role_name",
        header: "Role",
        render: (user: User) => (
          <Badge variant={getRoleBadgeVariant(user.role_name)}>
            {user.role_name}
          </Badge>
        ),
      },
      {
        key: "email",
        header: "Email",
        hideOnMobile: true,
        render: (user: User) => (
          <span className="text-text-secondary text-sm">
            {user.email || "-"}
          </span>
        ),
      },
      {
        key: "is_active",
        header: "Status",
        render: (user: User) => (
          <Badge variant={user.is_active ? "success" : "danger"}>
            {user.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        key: "created_at",
        header: "Created",
        hideOnMobile: true,
        render: (user: User) => (
          <span className="text-text-muted text-xs">
            {formatDate(user.created_at, tz)}
          </span>
        ),
      },
    ],
    [getRoleBadgeVariant, tz],
  );

  /** 고유 역할 이름 목록 / Unique role names from users */
  const uniqueRoleNames: string[] = useMemo(() => {
    const names: Set<string> = new Set(
      userList.map((user: User) => user.role_name),
    );
    return Array.from(names).sort();
  }, [userList]);

  if (usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Staff</h1>
        {canManageUsers && (
          <Button
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add Staff
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row flex-wrap md:items-end gap-3 mb-4">
        {/* Search */}
        <div className="w-full md:w-64">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search staff..."
              value={filters.search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setUrlParams({ search: e.target.value })
              }
              className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            />
          </div>
        </div>

        {/* Role Filter */}
        <div className="w-full md:w-44">
          <Select
            label="Role"
            options={[
              { value: "", label: "All Roles" },
              ...uniqueRoleNames.map((roleName: string) => ({
                value: roleName,
                label: roleName,
              })),
            ]}
            value={filters.role_name}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setUrlParams({ role: e.target.value })
            }
          />
        </div>

        {/* Active Status Filter */}
        <div className="w-full md:w-40">
          <Select
            label="Status"
            options={[
              { value: "", label: "All Status" },
              { value: "true", label: "Active" },
              { value: "false", label: "Inactive" },
            ]}
            value={filters.is_active}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setUrlParams({ active: e.target.value })
            }
          />
        </div>

        {/* Clear Filters */}
        {(filters.search || filters.role_name || filters.is_active) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUrlParams({ role: null, active: null, search: null })}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Users Table */}
      <Table<User>
        columns={columns}
        data={filteredUsers}
        isLoading={usersLoading}
        onRowClick={handleRowClick}
        emptyMessage="No staff members found."
      />

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateForm(INITIAL_FORM);
        }}
        title="Add Staff Member"
      >
        <div className="space-y-4">
          <Input
            label="Username"
            placeholder="Enter username"
            value={createForm.username}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                username: e.target.value,
              }))
            }
          />
          <Input
            label="Password"
            type="password"
            placeholder="Enter password"
            value={createForm.password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                password: e.target.value,
              }))
            }
          />
          <Input
            label="Full Name"
            placeholder="Enter full name"
            value={createForm.full_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                full_name: e.target.value,
              }))
            }
          />
          <Input
            label="Email (optional)"
            type="email"
            placeholder="Enter email"
            value={createForm.email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                email: e.target.value,
              }))
            }
          />
          <Input
            label="Phone (optional)"
            type="tel"
            placeholder="Enter phone number"
            value={createForm.phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                phone: e.target.value,
              }))
            }
          />
          <Select
            label="Role"
            options={[
              { value: "", label: "Select a role" },
              ...roleList.map((role: Role) => ({
                value: role.id,
                label: role.name,
              })),
            ]}
            value={createForm.role_id}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                role_id: e.target.value,
              }))
            }
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateOpen(false);
                setCreateForm(INITIAL_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={createUser.isPending}
              disabled={
                !createForm.username.trim() ||
                !createForm.password.trim() ||
                !createForm.full_name.trim() ||
                !createForm.role_id
              }
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
