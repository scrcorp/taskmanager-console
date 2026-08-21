"use client";

/**
 * 스태프 목록 페이지 -- 사용자 관리 페이지입니다.
 * 필터링, 검색, 생성 기능을 제공합니다.
 *
 * Staff List Page -- User management page with filtering, search, and creation.
 * Supports filtering by role and inactive toggle.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Layers, Copy, Check as CheckIcon, KeyRound, Download } from "lucide-react";
import { useUsers, useCreateUser, useCreateProvisionalUser } from "@/hooks/useUsers";
import { useWarningCounts } from "@/hooks/useWarnings";
import { useAvailabilityBulk } from "@/hooks/useAvailability";
import { AvailabilityStrip, WeekKey } from "@/components/availability/AvailabilityStrip";
import { AvailabilityEditModal } from "@/components/availability/AvailabilityEditModal";
import { WarnRangeFilter, WARN_MAX } from "@/components/warnings/WarnRangeFilter";
import { useRoles } from "@/hooks/useRoles";
import { useStores } from "@/hooks/useStores";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useSearchState } from "@/hooks/useSearchState";
import { displayName, searchHaystack } from "@/lib/staffLabel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Badge, Modal, Select, MultiSelectFilter } from "@/components/ui";
import type { Column } from "@/components/ui/Table";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { formatDate } from "@/lib/utils";
import api from "@/lib/api";
import { triggerBlobDownload, blobErrorMessage, filenameFromDisposition } from "@/lib/download";
import { useTimezone } from "@/hooks/useTimezone";
import { usePermissions } from "@/hooks/usePermissions";
import { useModal } from "@/components/ui/imperative-modal";
import { PinFinder } from "@/components/users/PinFinder";
import { PERMISSIONS, ROLE_PRIORITY } from "@/lib/permissions";
import { DAY_LABELS, fmtDay, toRoutine, AVAIL_COLORS } from "@/types";
import type { User, Role, Store, AvailabilityMember, AvailabilityDay } from "@/types";

/** comma-separated string → trimmed string array (used for URL-stored multi-selects) */
function csvToArr(v: string): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}
function arrToCsv(v: string[]): string | null {
  return v.length === 0 ? null : v.join(",");
}


/** 매장 배정 체크 상태 / Store assignment check state */
interface StoreCheck {
  is_work: boolean;
  is_manager: boolean;
}

/** 사용자 생성 폼 데이터 / User creation form data */
interface UserFormData {
  username: string;
  password: string;
  /** 이름 — first/middle/last. full_name 은 서버가 합성 */
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  role_id: string;
  hourly_rate: string;
  /** FOH/BOH 분류 — "" = 미지정 */
  department: "" | "FOH" | "BOH";
  store_checks: Record<string, StoreCheck>;
  /**
   * 미가입(유령) 직원으로 생성 — 아직 앱에 가입하지 않은 직원 자리.
   * 켜면 username/password 를 받지 않고(서버가 자동 생성) 인수 코드를 발급한다.
   */
  is_provisional: boolean;
}

/** 초기 폼 상태 / Initial form state */
const INITIAL_FORM: UserFormData = {
  username: "",
  password: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  phone: "",
  role_id: "",
  hourly_rate: "",
  department: "",
  store_checks: {},
  is_provisional: false,
};

/** Department 필터 옵션 — 값 "FOH" | "BOH" | "unassigned" */
const DEPARTMENT_FILTER_OPTIONS = [
  { id: "FOH", label: "FOH" },
  { id: "BOH", label: "BOH" },
  { id: "unassigned", label: "Unassigned" },
];

/**
 * Provisional(미가입) 필터 옵션.
 * - "all"  : 기본. 유령을 is_active 필터에서 면제해 정상 직원과 함께 보여준다.
 * - "only" : 유령만.
 * - "hide" : 가입 완료된 직원만.
 */
type ProvFilter = "all" | "only" | "hide";
const PROVISIONAL_FILTER_OPTIONS: { value: ProvFilter; label: string }[] = [
  { value: "all", label: "All (incl. provisional)" },
  { value: "only", label: "Provisional only" },
  { value: "hide", label: "Signed up only" },
];

export default function UsersPage(): React.ReactElement {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const tz = useTimezone();
  const canManageUsers = hasPermission(PERMISSIONS.USERS_CREATE);
  // PIN 도구는 남의 PIN 값을 보여주므로 clockin_pin:read 권한자에게만 노출.
  const canSeePins = hasPermission(PERMISSIONS.CLOCKIN_PIN_READ);
  const modal = useModal();

  const openPinFinder = useCallback((): void => {
    void modal.open(() => <PinFinder />, { title: "PIN finder", size: "lg" });
  }, [modal]);

  /** URL + localStorage 영속 필터 — 상세 페이지 다녀와도, 새로고침/재로그인 후에도 복원 */
  const [params, setParams] = usePersistedFilters("users", {
    q: "",
    staff: "",
    role: "",
    store: "",
    dept: "",
    email: "all",
    wlo: "0",
    whi: "5",
    sort: "",
    dir: "asc",
    inactive: "",
    prov: "all",
  });
  // 검색 입력은 useSearchState 가 담당한다 — 입력값(즉시)과 URL 커밋(디바운스)을 분리해
  // 글자 하나마다 router.replace 가 돌지 않게 한다. IME 조합 중 커밋도 막는다.
  const search = useSearchState({
    param: { value: params.q, commit: (v) => setParams({ q: v || null }) },
  });
  const searchQuery = search.committed;
  const selectedStaffIds = useMemo(() => csvToArr(params.staff), [params.staff]);
  const selectedRoles = useMemo(() => csvToArr(params.role), [params.role]);
  const selectedDepartments = useMemo(() => csvToArr(params.dept), [params.dept]);
  const selectedStoreIds = useMemo(() => csvToArr(params.store), [params.store]);
  // Warnings 개수 범위 필터 [warnLo, warnHi] (0..5, 5 = "5+"). [0,5] = 필터 없음.
  const warnLo = Math.min(WARN_MAX, Math.max(0, Number(params.wlo) || 0));
  const warnHi = Math.min(WARN_MAX, Math.max(0, params.whi === "" ? WARN_MAX : Number(params.whi)));
  const warnFilterActive = !(warnLo === 0 && warnHi === WARN_MAX);
  const emailFilter = (params.email || "all") as "all" | "verified" | "unverified";
  const sortKey: string | null = params.sort || null;
  const sortDirection = (params.dir || "asc") as "asc" | "desc";
  const showInactive = params.inactive === "1";
  const provFilter = (params.prov || "all") as ProvFilter;

  const toggleStaffId = useCallback((id: string) => {
    setParams({ staff: arrToCsv(selectedStaffIds.includes(id) ? selectedStaffIds.filter((x) => x !== id) : [...selectedStaffIds, id]) });
  }, [selectedStaffIds, setParams]);
  const toggleRole = useCallback((r: string) => {
    setParams({ role: arrToCsv(selectedRoles.includes(r) ? selectedRoles.filter((x) => x !== r) : [...selectedRoles, r]) });
  }, [selectedRoles, setParams]);
  const toggleStoreId = useCallback((id: string) => {
    setParams({ store: arrToCsv(selectedStoreIds.includes(id) ? selectedStoreIds.filter((x) => x !== id) : [...selectedStoreIds, id]) });
  }, [selectedStoreIds, setParams]);
  const toggleDepartment = useCallback((d: string) => {
    setParams({ dept: arrToCsv(selectedDepartments.includes(d) ? selectedDepartments.filter((x) => x !== d) : [...selectedDepartments, d]) });
  }, [selectedDepartments, setParams]);
  const setEmailFilter = useCallback((v: "all" | "verified" | "unverified") => {
    setParams({ email: v === "all" ? null : v });
  }, [setParams]);
  const setProvFilter = useCallback((v: ProvFilter) => {
    setParams({ prov: v === "all" ? null : v });
  }, [setParams]);
  const setWarnRange = useCallback((lo: number, hi: number) => {
    setParams({ wlo: String(lo), whi: String(hi) });
  }, [setParams]);
  const clearWarnRange = useCallback(() => setParams({ wlo: null, whi: null }), [setParams]);

  /** ephemeral UI state — 모달, 드롭다운 열림 */
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  /** 외부 클릭 + ESC 시 드롭다운 닫기 */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      // 필터바 밖 클릭 → 모든 드롭다운 닫기
      if (filterRef.current && !filterRef.current.contains(target)) {
        setOpenFilter(null);
        return;
      }
      // 필터바 안이지만 검색영역 밖 클릭 → staff 드롭다운만 닫기
      if (searchRef.current && !searchRef.current.contains(target)) {
        setOpenFilter((prev) => prev === "staff" ? null : prev);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenFilter(null);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  /** 데이터 훅 / Data hooks */
  // 유령(미가입) 계정은 is_active=false 라 서버 기본 필터에서 빠진다.
  // 스태프 목록에서는 기본으로 보여야 하므로 include_provisional 을 켠다.
  const userFilters = useMemo(
    () => ({
      ...(selectedStoreIds.length > 0 ? { store_ids: selectedStoreIds } : {}),
      ...(provFilter === "only"
        ? { provisional_only: true }
        : provFilter === "all"
          ? { include_provisional: true }
          : {}),
    }),
    [selectedStoreIds, provFilter],
  );
  const { data: users, isLoading: usersLoading } = useUsers(userFilters);
  const { data: roles } = useRoles();
  const { data: storesData } = useStores();
  const stores: Store[] = useMemo(() => storesData ?? [], [storesData]);

  // 직원별 경고 갯수 (Warnings 칼럼) — warnings:read 있을 때만 조회.
  const canSeeWarnings = hasPermission(PERMISSIONS.WARNINGS_READ);
  const { data: warnCounts } = useWarningCounts(canSeeWarnings);
  const warnMap = useMemo(
    () => new Map((warnCounts ?? []).map((c) => [c.user_id, c])),
    [warnCounts],
  );
  const createUser = useCreateUser();
  const createProvisionalUser = useCreateProvisionalUser();

  /** Staff xlsx export — 현재 store 필터(userFilters.store_ids)를 그대로 반영 */
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const handleExport = useCallback(async (): Promise<void> => {
    setIsExporting(true);
    try {
      const storeCsv = userFilters.store_ids?.join(",");
      const resp = await api.get("/console/users/export", {
        responseType: "blob",
        params: storeCsv ? { store_ids: storeCsv } : undefined,
      });
      const dispo = (resp.headers as Record<string, unknown>)["content-disposition"];
      const filename = filenameFromDisposition(
        typeof dispo === "string" ? dispo : undefined,
        "staff_export.xlsx",
      );
      triggerBlobDownload(
        new Blob([resp.data as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename,
      );
    } catch (err) {
      const msg = await blobErrorMessage(
        err,
        "The export could not be generated. Try again after reloading.",
      );
      void modal.alert({ type: "error", title: "Couldn't download the export", message: msg });
    } finally {
      setIsExporting(false);
    }
  }, [userFilters, modal]);

  /** 생성 직후 인수 코드를 보여주는 결과 모달 상태 */
  const [claimResult, setClaimResult] = useState<{ name: string; code: string } | null>(null);
  const [claimCopied, setClaimCopied] = useState<boolean>(false);
  const copyClaimCode = useCallback(async (code: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setClaimCopied(true);
      window.setTimeout(() => setClaimCopied(false), 2000);
    } catch {
      // 클립보드 접근 불가(비 HTTPS 등) — 코드가 화면에 크게 보이므로 수동 복사 가능
    }
  }, []);

  // 직원별 주간 근무 가용성 (Work Availability 칼럼) — availability:read 있을 때만 조회.
  const canSeeAvailability = hasPermission(PERMISSIONS.AVAILABILITY_READ);
  const canManageAvailability = hasPermission(PERMISSIONS.AVAILABILITY_MANAGE);
  const { data: availData } = useAvailabilityBulk(undefined, canSeeAvailability);
  const availMap = useMemo(
    () => new Map((availData ?? []).map((m: AvailabilityMember) => [m.user_id, m])),
    [availData],
  );

  // 가용성 hover 팝오버 + 편집 모달 상태
  const [availHover, setAvailHover] = useState<{
    member: AvailabilityMember;
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [availEdit, setAvailEdit] = useState<{ userId: string; name: string } | null>(null);

  const handleToggleInactive = useCallback((checked: boolean) => {
    setParams({ inactive: checked ? "1" : null });
  }, [setParams]);

  /** 생성 모달 상태 / Create modal state */
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<UserFormData>(INITIAL_FORM);

  /** 안전한 목록 추출 / Safe list extraction */
  const userList: User[] = useMemo(
    () => (Array.isArray(users) ? users : []),
    [users],
  );
  const roleList: Role[] = useMemo(
    () => (Array.isArray(roles) ? roles : []),
    [roles],
  );

  /** Inactive 사용자 수 / Inactive user count */
  const inactiveCount: number = useMemo(
    // 유령은 항상 is_active=false 지만 "비활성 직원"이 아니므로 세지 않는다.
    () => userList.filter((u: User) => !u.is_active && !u.is_provisional).length,
    [userList],
  );

  /** 목록에 유령이 하나라도 있는지 — Status 컬럼 노출 판단용 */
  const hasProvisional: boolean = useMemo(
    () => userList.some((u: User) => u.is_provisional),
    [userList],
  );

  /** 정렬 핸들러 */
  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setParams({ dir: sortDirection === "asc" ? "desc" : "asc" });
    } else {
      setParams({ sort: key, dir: "asc" });
    }
  }, [sortKey, sortDirection, setParams]);

  /** 필터링 + 정렬된 사용자 목록 / Filtered and sorted user list */
  const filteredUsers: User[] = useMemo(() => {
    let result: User[] = userList;

    // Staff 멀티셀렉트 필터
    if (selectedStaffIds.length > 0) {
      result = result.filter((user: User) => selectedStaffIds.includes(user.id));
    }

    // 검색 필터
    const search = searchQuery.trim();
    if (search) {
      const query: string = search.toLowerCase();
      result = result.filter(
        (user: User) =>
          user.full_name.toLowerCase().includes(query) ||
          user.username.toLowerCase().includes(query) ||
          (user.email && user.email.toLowerCase().includes(query)),
      );
    }

    // 역할 멀티 필터
    if (selectedRoles.length > 0) {
      result = result.filter(
        (user: User) => selectedRoles.includes(user.role_name),
      );
    }

    // Department 멀티 필터 — 미지정(null)은 "unassigned" 로 매칭
    if (selectedDepartments.length > 0) {
      result = result.filter(
        (user: User) => selectedDepartments.includes(user.department ?? "unassigned"),
      );
    }

    // Email verified 필터
    if (emailFilter === "verified") {
      result = result.filter((user: User) => user.email_verified);
    } else if (emailFilter === "unverified") {
      result = result.filter((user: User) => !user.email_verified);
    }

    // Provisional 필터 (클라이언트측 보강 — 서버 파라미터와 일치시킨다)
    if (provFilter === "only") {
      result = result.filter((user: User) => user.is_provisional);
    } else if (provFilter === "hide") {
      result = result.filter((user: User) => !user.is_provisional);
    }

    // Inactive 필터: 체크 해제 시 Active만 표시.
    // 유령은 is_active=false 지만 정상 관리 대상이므로 면제한다.
    if (!showInactive) {
      result = result.filter((user: User) => user.is_active || user.is_provisional);
    }

    // Warnings 개수 범위 필터 — 유효(active, 미철회) 경고 수가 [warnLo, warnHi] 안.
    // warnHi === WARN_MAX 면 상한 없음("5+"). [0,5] 이면 위에서 warnFilterActive=false 라 스킵.
    if (warnFilterActive) {
      result = result.filter((user: User) => {
        const n = warnMap.get(user.id)?.active ?? 0;
        return n >= warnLo && (warnHi >= WARN_MAX ? true : n <= warnHi);
      });
    }

    // 정렬
    if (sortKey === "warnings") {
      result = [...result].sort((a: User, b: User) => {
        const av = warnMap.get(a.id)?.active ?? 0;
        const bv = warnMap.get(b.id)?.active ?? 0;
        return sortDirection === "asc" ? av - bv : bv - av;
      });
    } else if (sortKey) {
      result = [...result].sort((a: User, b: User) => {
        const aVal = (a as unknown as Record<string, unknown>)[sortKey];
        const bVal = (b as unknown as Record<string, unknown>)[sortKey];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === "boolean" && typeof bVal === "boolean") {
          return sortDirection === "asc"
            ? (aVal === bVal ? 0 : aVal ? -1 : 1)
            : (aVal === bVal ? 0 : aVal ? 1 : -1);
        }
        if (typeof aVal === "string" && typeof bVal === "string") {
          return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortDirection === "asc" ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
      });
    } else if (showInactive) {
      // 정렬키 없을 때만 active-first 기본 정렬
      result = [...result].sort((a: User, b: User) => {
        if (a.is_active === b.is_active) return a.full_name.localeCompare(b.full_name);
        return a.is_active ? -1 : 1;
      });
    }

    return result;
  }, [userList, searchQuery, selectedStaffIds, selectedRoles, selectedDepartments, emailFilter, showInactive, provFilter, sortKey, sortDirection, warnFilterActive, warnLo, warnHi, warnMap]);

  /**
   * Staff 드롭다운에 그릴 후보 — 검색어로 좁힌 뒤 상한만큼만 그린다.
   * 이전에는 JSX 안에서 매 렌더 전 직원(수백 명) 버튼을 다시 만들었다.
   */
  const STAFF_DROPDOWN_LIMIT = 100;
  const staffDropdownMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return userList;
    return userList.filter((u) => searchHaystack(u).includes(q));
  }, [userList, searchQuery]);
  const staffDropdownVisible = useMemo(
    () => staffDropdownMatches.slice(0, STAFF_DROPDOWN_LIMIT),
    [staffDropdownMatches],
  );

  const totalFilterCount = selectedStaffIds.length + selectedRoles.length + selectedDepartments.length + selectedStoreIds.length + (warnFilterActive ? 1 : 0) + (emailFilter !== "all" ? 1 : 0) + (provFilter !== "all" ? 1 : 0);

  /**
   * 생성 폼 유효성 — 유령 모드에서는 username/password 를 받지 않으므로 검증에서 제외.
   * 유령은 이름·역할·매장만 필수(매장은 서버 기본값 허용이라 UI 필수는 이름+역할).
   */
  const createFormValid: boolean = createForm.is_provisional
    ? Boolean(createForm.first_name.trim() && createForm.role_id)
    : Boolean(
        createForm.username.trim() &&
          createForm.password.trim() &&
          createForm.first_name.trim() &&
          createForm.last_name.trim() &&
          createForm.role_id,
      );

  /** 사용자 생성 핸들러 / Handle user creation */
  const handleCreate = useCallback(async (): Promise<void> => {
    if (!createFormValid) return;

    // --- 미가입(유령) 직원 생성 -------------------------------------------
    if (createForm.is_provisional) {
      const fullName = [createForm.first_name, createForm.middle_name, createForm.last_name]
        .map((p) => p.trim())
        .filter(Boolean)
        .join(" ");
      const storeIds = Object.entries(createForm.store_checks)
        .filter(([, v]) => v.is_work || v.is_manager)
        .map(([storeId]) => storeId);
      const rate = createForm.hourly_rate.trim();
      try {
        const created = await createProvisionalUser.mutateAsync({
          full_name: fullName,
          role_id: createForm.role_id,
          store_ids: storeIds,
          department: createForm.department || undefined,
          hourly_rate: rate ? Number(rate) : null,
        });
        setIsCreateOpen(false);
        setCreateForm(INITIAL_FORM);
        if (created.claim_code) {
          setClaimCopied(false);
          setClaimResult({ name: created.full_name || fullName, code: created.claim_code });
        }
      } catch {
        // hook 자동 모달
      }
      return;
    }

    try {
      const store_assignments = Object.entries(createForm.store_checks)
        .filter(([, v]) => v.is_work || v.is_manager)
        .map(([storeId, v]) => ({
          store_id: storeId,
          is_manager: v.is_manager,
          is_work_assignment: v.is_work,
        }));
      const parsedRate = createForm.hourly_rate.trim();
      await createUser.mutateAsync({
        username: createForm.username.trim(),
        password: createForm.password,
        first_name: createForm.first_name.trim(),
        middle_name: createForm.middle_name.trim() || undefined,
        last_name: createForm.last_name.trim() || undefined,
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        role_id: createForm.role_id,
        hourly_rate: parsedRate ? Number(parsedRate) : null,
        department: createForm.department || undefined,
        store_assignments: store_assignments.length > 0 ? store_assignments : undefined,
      });
      setIsCreateOpen(false);
      setCreateForm(INITIAL_FORM);
    } catch {
      // hook 자동 모달
    }
  }, [createForm, createFormValid, createUser, createProvisionalUser]);

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
  const columns: Column<User>[] = useMemo(() => {
    const cols: Column<User>[] = [
      {
        key: "no",
        header: "No",
        className: "w-12",
        render: (_: User, index: number) => (
          <span className="text-text-muted text-xs">{index + 1}</span>
        ),
      },
      {
        key: "full_name",
        header: "Full Name",
        sortable: true,
        render: (user: User) => (
          <div>
            <p className="font-medium text-text flex items-center gap-2 flex-wrap">
              {user.full_name}
              {user.is_provisional && (
                <Badge variant="warning">NOT SIGNED UP</Badge>
              )}
            </p>
            {!user.is_provisional && (
              <p className="text-xs text-text-muted">@{user.username}</p>
            )}
          </div>
        ),
      },
      {
        key: "role_name",
        header: "Role",
        sortable: true,
        render: (user: User) => (
          <Badge variant={getRoleBadgeVariant(user.role_name)}>
            {user.role_name}
          </Badge>
        ),
      },
      {
        key: "department",
        header: "Department",
        sortable: true,
        render: (user: User) =>
          user.department ? (
            <Badge variant={user.department === "FOH" ? "info" : "warning"}>
              {user.department}
            </Badge>
          ) : (
            <span className="text-text-muted text-xs">—</span>
          ),
      },
      {
        key: "employee_no",
        header: "Employee No.",
        sortable: true,
        render: (user: User) =>
          user.employee_no ? (
            <span className="text-text-secondary text-sm tabular-nums">{user.employee_no}</span>
          ) : (
            <span className="text-text-muted text-xs">—</span>
          ),
      },
      {
        key: "email",
        header: "Email",
        sortable: true,
        hideOnMobile: true,
        render: (user: User) => (
          <span className="text-text-secondary text-sm flex items-center gap-1.5">
            {user.email || "-"}
            {user.email && (
              user.email_verified
                ? <span title="Verified" className="text-success text-xs">✓</span>
                : <span title="Not verified" className="text-warning text-xs">!</span>
            )}
          </span>
        ),
      },
    ];

    // Status 컬럼은 Show Inactive 켜졌을 때, 또는 유령이 섞여 있을 때 표시
    if (showInactive || hasProvisional) {
      cols.push({
        key: "is_active",
        header: "Status",
        render: (user: User) =>
          // 유령은 is_active=false 지만 "Inactive"가 아니라 "아직 가입 안 함"이다.
          user.is_provisional ? (
            <Badge variant="warning">Not signed up</Badge>
          ) : (
            <Badge variant={user.is_active ? "success" : "danger"}>
              {user.is_active ? "Active" : "Inactive"}
            </Badge>
          ),
      });
    }

    // Warnings 갯수 칼럼 — warnings:read 있을 때만. active 수 기준 색.
    if (canSeeWarnings) {
      cols.push({
        key: "warnings",
        header: "Warnings",
        sortable: true,
        render: (user: User) => {
          const c = warnMap.get(user.id);
          const valid = c?.active ?? 0; // 유효(미철회) 경고 수
          if (valid === 0) {
            return <span className="text-text-muted text-xs tabular-nums">0</span>;
          }
          const cls =
            valid >= 3
              ? "bg-danger-muted text-danger"
              : "bg-warning-muted text-warning";
          return (
            <span
              title={`${valid} active · ${c?.total ?? valid} total (incl. retracted)`}
              className={`inline-flex h-6 min-w-[26px] items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${cls}`}
            >
              {valid}
            </span>
          );
        },
      });
    }

    // Work Availability 칼럼 — availability:read 있을 때만. 7-tile 주간 스트립.
    // hover → 요일별 시간 + 최근 변경 팝오버, click → 편집 모달.
    if (canSeeAvailability) {
      cols.push({
        key: "availability",
        header: (
          <span className="inline-flex flex-col gap-1 normal-case">
            <span className="uppercase">Work Availability</span>
            <WeekKey />
          </span>
        ),
        render: (user: User) => {
          const member = availMap.get(user.id);
          const routine: AvailabilityDay[] = toRoutine(member?.days);
          return (
            <div
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg -mx-1 px-1 py-0.5 hover:bg-accent-muted/40"
              onClick={(e) => {
                e.stopPropagation();
                setAvailHover(null);
                setAvailEdit({ userId: user.id, name: displayName(user) });
              }}
              onMouseEnter={(e) =>
                member &&
                setAvailHover({ member, name: displayName(user), x: e.clientX, y: e.clientY })
              }
              onMouseMove={(e) =>
                setAvailHover((h) =>
                  h && h.member.user_id === user.id ? { ...h, x: e.clientX, y: e.clientY } : h,
                )
              }
              onMouseLeave={() => setAvailHover(null)}
            >
              <AvailabilityStrip routine={routine} />
            </div>
          );
        },
      });
    }

    cols.push({
      key: "created_at",
      header: "Created",
      sortable: true,
      hideOnMobile: true,
      render: (user: User) => (
        <span className="text-text-muted text-xs">
          {formatDate(user.created_at, tz)}
        </span>
      ),
    });

    return cols;
  }, [getRoleBadgeVariant, tz, showInactive, hasProvisional, canSeeWarnings, warnMap, canSeeAvailability, availMap]);

  /** 고유 역할 이름 목록 / Unique role names from users */
  const uniqueRoleNames: string[] = useMemo(() => {
    const names: Set<string> = new Set(
      userList.map((user: User) => user.role_name),
    );
    return Array.from(names).sort();
  }, [userList]);

  /**
   * Inactive 행 스타일 / Inactive row styling.
   * 유령(미가입)은 흐리게 처리하지 않는다 — 비활성 직원과 달리 정상 관리 대상.
   */
  const getRowClassName = useCallback(
    (user: User): string => (user.is_active || user.is_provisional ? "" : "opacity-50"),
    [],
  );

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
        <div className="flex items-center gap-2">
          {/* Staff xlsx export — 현재 store 필터 반영. 시급/급여 컬럼은 서버가 아예 제외 */}
          <Button
            variant="secondary"
            onClick={() => void handleExport()}
            isLoading={isExporting}
            disabled={isExporting}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          {/* PIN 도구 — 번호가 비었는지 확인하고 그 자리에서 고치거나 지운다. */}
          {canSeePins && (
            <Button variant="secondary" onClick={openPinFinder}>
              <KeyRound className="h-4 w-4" />
              PIN
            </Button>
          )}
          {canManageUsers && (
            <>
              <Button
                variant="secondary"
                onClick={() => router.push("/users/bulk/edit")}
              >
                <Layers className="h-4 w-4" />
                Bulk Edit
              </Button>
              <Button
                variant="primary"
                onClick={() => setIsCreateOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Staff
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div ref={filterRef} className="bg-surface border border-border rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search + Staff dropdown */}
          <div ref={searchRef} className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted z-10" />
            <input
              type="text"
              placeholder="Search..."
              value={search.value}
              {...search.imeProps}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { search.onChange(e); setOpenFilter("staff"); }}
              onFocus={() => setOpenFilter("staff")}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpenFilter(null); } }}
              className={`w-48 rounded-lg border border-border bg-bg pl-8 pr-3 py-1.5 text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent ${selectedStaffIds.length > 0 ? "pr-8" : ""}`}
            />
            {selectedStaffIds.length > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-accent text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {selectedStaffIds.length}
              </span>
            )}
            {openFilter === "staff" && (
              <div className="absolute top-full left-0 mt-1.5 w-[300px] bg-surface border border-border rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden">
                <div className="max-h-[280px] overflow-y-auto py-1">
                  {/* "All" 옵션 — 클릭 시 이 섹션의 모든 선택 해제. 검색 중에는 숨김 (검색 결과가 우선) */}
                  {searchQuery.trim() === "" && (
                    <button
                      type="button"
                      onClick={() => setParams({ staff: null })}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors ${selectedStaffIds.length === 0 ? "bg-accent-muted" : "hover:bg-surface-hover"}`}
                    >
                      <span className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${selectedStaffIds.length === 0 ? "bg-accent border-accent" : "border-border"}`}>
                        {selectedStaffIds.length === 0 && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 5 4.5 7.5 8 3" /></svg>
                        )}
                      </span>
                      <span className="flex-1 font-semibold text-text">All</span>
                    </button>
                  )}
                  {staffDropdownMatches.length === 0 && (
                    <p className="px-3 py-4 text-center text-[13px] text-text-muted">No matching staff found.</p>
                  )}
                  {staffDropdownMatches.length > staffDropdownVisible.length && (
                    <p className="px-3 py-2 text-[11px] text-text-muted border-b border-border">
                      Showing first {STAFF_DROPDOWN_LIMIT} of {staffDropdownMatches.length} — type to narrow.
                    </p>
                  )}
                  {staffDropdownVisible.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleStaffId(u.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors ${selectedStaffIds.includes(u.id) ? "bg-accent-muted" : "hover:bg-surface-hover"}`}
                      >
                        <span className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${selectedStaffIds.includes(u.id) ? "bg-accent border-accent" : "border-border"}`}>
                          {selectedStaffIds.includes(u.id) && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 5 4.5 7.5 8 3" /></svg>
                          )}
                        </span>
                        <span className="flex-1 font-medium text-text">{displayName(u)}</span>
                        <span className="text-[10px] text-text-muted uppercase">{u.role_name}</span>
                      </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Role + Store multi-select — 공통 MultiSelectFilter 컴포넌트 사용. */}
          <MultiSelectFilter
            label="Role"
            options={uniqueRoleNames.map((r) => ({ id: r, label: r }))}
            selected={selectedRoles}
            onToggle={toggleRole}
            onClearAll={() => setParams({ role: null })}
            width={200}
            open={openFilter === "role"}
            onOpenChange={(o) => setOpenFilter(o ? "role" : null)}
          />

          <MultiSelectFilter
            label="Department"
            options={DEPARTMENT_FILTER_OPTIONS}
            selected={selectedDepartments}
            onToggle={toggleDepartment}
            onClearAll={() => setParams({ dept: null })}
            width={200}
            open={openFilter === "department"}
            onOpenChange={(o) => setOpenFilter(o ? "department" : null)}
          />

          <MultiSelectFilter
            label="Store"
            options={stores.map((s: Store) => ({ id: s.id, label: s.name }))}
            selected={selectedStoreIds}
            onToggle={toggleStoreId}
            onClearAll={() => setParams({ store: null })}
            width={240}
            open={openFilter === "store"}
            onOpenChange={(o) => setOpenFilter(o ? "store" : null)}
          />

          {/* Warnings count range filter (dual-handle 0..5+) — only for warnings:read */}
          {canSeeWarnings && (
            <WarnRangeFilter
              lo={warnLo}
              hi={warnHi}
              open={openFilter === "warns"}
              onOpenChange={(o) => setOpenFilter(o ? "warns" : null)}
              onChange={setWarnRange}
              onClear={clearWarnRange}
            />
          )}

          {/* Email Verified filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenFilter(openFilter === "email" ? null : "email")}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border flex items-center gap-1.5 transition-colors ${
                emailFilter !== "all"
                  ? "bg-accent-muted text-accent border-accent/30"
                  : "bg-surface text-text-secondary border-border hover:border-text-muted hover:text-text"
              } ${openFilter === "email" ? "ring-2 ring-accent/20" : ""}`}
            >
              Email
              {emailFilter !== "all" && (
                <span className="bg-accent text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">1</span>
              )}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform ${openFilter === "email" ? "rotate-180" : ""}`}><polyline points="2.5 4 5 6.5 7.5 4" /></svg>
            </button>
            {openFilter === "email" && (
              <div className="absolute top-full left-0 mt-1.5 w-[160px] bg-surface border border-border rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden py-1">
                {(["all", "verified", "unverified"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setEmailFilter(value); setOpenFilter(null); }}
                    className={`w-full px-3 py-2 text-[13px] text-left transition-colors ${emailFilter === value ? "bg-accent-muted text-accent font-medium" : "text-text hover:bg-surface-hover"}`}
                  >
                    {value === "all" ? "All" : value === "verified" ? "Verified" : "Unverified"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Provisional (미가입) filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenFilter(openFilter === "prov" ? null : "prov")}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border flex items-center gap-1.5 transition-colors ${
                provFilter !== "all"
                  ? "bg-accent-muted text-accent border-accent/30"
                  : "bg-surface text-text-secondary border-border hover:border-text-muted hover:text-text"
              } ${openFilter === "prov" ? "ring-2 ring-accent/20" : ""}`}
            >
              Provisional
              {provFilter !== "all" && (
                <span className="bg-accent text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">1</span>
              )}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform ${openFilter === "prov" ? "rotate-180" : ""}`}><polyline points="2.5 4 5 6.5 7.5 4" /></svg>
            </button>
            {openFilter === "prov" && (
              <div className="absolute top-full left-0 mt-1.5 w-[200px] bg-surface border border-border rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden py-1">
                {PROVISIONAL_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setProvFilter(opt.value); setOpenFilter(null); }}
                    className={`w-full px-3 py-2 text-[13px] text-left transition-colors ${provFilter === opt.value ? "bg-accent-muted text-accent font-medium" : "text-text hover:bg-surface-hover"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Show Inactive */}
          <label className="flex items-center gap-2 cursor-pointer text-[12px] text-text-secondary hover:text-text transition-colors select-none ml-auto">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleToggleInactive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent cursor-pointer"
            />
            Inactive
            {inactiveCount > 0 && <span className="text-text-muted text-[10px]">({inactiveCount})</span>}
          </label>

          {/* Clear All */}
          {(searchQuery || totalFilterCount > 0) && (
            <button
              type="button"
              onClick={() => { setParams({ q: null, staff: null, role: null, store: null, email: null, dept: null, prov: null }); setOpenFilter(null); }}
              className="text-[12px] text-text-muted hover:text-danger flex items-center gap-1 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="9" y1="3" x2="3" y2="9" /><line x1="3" y1="3" x2="9" y2="9" /></svg>
              Clear
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {totalFilterCount > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-border flex-wrap">
            <span className="text-[11px] text-text-muted mr-1">Active:</span>
            {provFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-muted text-accent rounded-full text-[11px] font-semibold">
                {PROVISIONAL_FILTER_OPTIONS.find((o) => o.value === provFilter)?.label ?? provFilter}
                <button type="button" onClick={() => setProvFilter("all")} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
              </span>
            )}
            {emailFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-muted text-accent rounded-full text-[11px] font-semibold">
                {emailFilter === "verified" ? "Email Verified" : "Email Unverified"}
                <button type="button" onClick={() => setEmailFilter("all")} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
              </span>
            )}
            {selectedStaffIds.map((id) => {
              const u = userList.find((x) => x.id === id);
              if (!u) return null;
              return (
                <span key={`u${id}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-muted text-accent rounded-full text-[11px] font-semibold">
                  {displayName(u)}
                  <button type="button" onClick={() => toggleStaffId(id)} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
                </span>
              );
            })}
            {selectedRoles.map((r) => (
              <span key={`r${r}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-muted text-accent rounded-full text-[11px] font-semibold">
                {r}
                <button type="button" onClick={() => toggleRole(r)} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
              </span>
            ))}
            {selectedDepartments.map((d) => (
              <span key={`d${d}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-muted text-accent rounded-full text-[11px] font-semibold">
                {DEPARTMENT_FILTER_OPTIONS.find((x) => x.id === d)?.label ?? d}
                <button type="button" onClick={() => toggleDepartment(d)} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
              </span>
            ))}
            {selectedStoreIds.map((id) => {
              const s = stores.find((st) => st.id === id);
              return (
                <span key={`s${id}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-muted text-accent rounded-full text-[11px] font-semibold">
                  {s?.name ?? id}
                  <button type="button" onClick={() => toggleStoreId(id)} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Users Table */}
      <Table<User>
        columns={columns}
        data={filteredUsers}
        isLoading={usersLoading}
        onRowClick={handleRowClick}
        emptyMessage="No staff members found."
        rowClassName={showInactive ? getRowClassName : undefined}
        sortKey={sortKey ?? undefined}
        sortDirection={sortDirection}
        onSort={handleSort}
      />

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateForm(INITIAL_FORM);
        }}
        title={createForm.is_provisional ? "Add Provisional Staff" : "Add Staff Member"}
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
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
              isLoading={createUser.isPending || createProvisionalUser.isPending}
              disabled={!createFormValid}
            >
              Create
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 미가입(유령) 토글 — 켜면 로그인 정보 없이 이름·역할·매장만으로 자리를 만든다 */}
          <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createForm.is_provisional}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCreateForm((prev: UserFormData) => ({
                  ...prev,
                  is_provisional: e.target.checked,
                  // 유령이면 로그인 정보는 쓰지 않으므로 비운다
                  username: e.target.checked ? "" : prev.username,
                  password: e.target.checked ? "" : prev.password,
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer"
            />
            <span>
              <span className="block text-sm font-medium text-text">
                Not signed up yet (provisional)
              </span>
              <span className="block text-xs text-text-muted mt-0.5">
                Creates a placeholder for someone who hasn&apos;t signed up yet. No
                username or password — you&apos;ll get a claim code to hand them
                instead. They can be scheduled right away.
              </span>
            </span>
          </label>

          {!createForm.is_provisional && (
            <>
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
            </>
          )}
          <Input
            label="First Name"
            placeholder="Enter first name"
            value={createForm.first_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                first_name: e.target.value,
              }))
            }
          />
          <Input
            label="Middle Name (optional)"
            placeholder="Enter middle name"
            value={createForm.middle_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                middle_name: e.target.value,
              }))
            }
          />
          <Input
            label={createForm.is_provisional ? "Last Name (optional)" : "Last Name"}
            placeholder="Enter last name"
            value={createForm.last_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                last_name: e.target.value,
              }))
            }
          />
          {/* 유령은 아직 계정이 없으므로 연락처는 본인이 가입할 때 입력한다 */}
          {!createForm.is_provisional && (
            <>
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
            </>
          )}
          <Select
            label="Role"
            options={[
              { value: "", label: "Select a role" },
              // super_owner(org 최상위, priority < OWNER)는 직원 생성 시 부여 불가 → 제외
              ...roleList
                .filter((role: Role) => role.priority >= ROLE_PRIORITY.OWNER)
                .map((role: Role) => ({
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
          <Select
            label="Department (optional)"
            options={[
              { value: "", label: "Unassigned" },
              { value: "FOH", label: "FOH (Front of House)" },
              { value: "BOH", label: "BOH (Back of House)" },
            ]}
            value={createForm.department}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                department: e.target.value as "" | "FOH" | "BOH",
              }))
            }
          />
          <Input
            label="Hourly Rate (optional)"
            type="number"
            min={0}
            step={0.01}
            placeholder="Leave empty to use store/org default"
            value={createForm.hourly_rate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: UserFormData) => ({
                ...prev,
                hourly_rate: e.target.value,
              }))
            }
          />
          {stores.length > 0 && (() => {
            const selectedRole = roleList.find((r) => r.id === createForm.role_id);
            const selectedRolePriority = selectedRole?.priority ?? ROLE_PRIORITY.STAFF;
            const canManage = selectedRolePriority <= ROLE_PRIORITY.SV;
            return (
              <div>
                <label className="mb-2 block text-sm font-medium text-text">
                  Store Assignments
                </label>
                <div className="space-y-1 rounded border border-border bg-surface p-2">
                  <div className="grid grid-cols-[1fr_70px_70px] gap-2 px-2 pb-1 text-xs text-text-muted">
                    <span>Store</span>
                    <span className="text-center">Work</span>
                    <span className="text-center">Manager</span>
                  </div>
                  {stores.map((store) => {
                    const check = createForm.store_checks[store.id] ?? { is_work: false, is_manager: false };
                    return (
                      <div key={store.id} className="grid grid-cols-[1fr_70px_70px] items-center gap-2 rounded px-2 py-1 hover:bg-surface-hover">
                        <span className="text-sm text-text">{store.name}</span>
                        <input
                          type="checkbox"
                          className="mx-auto"
                          checked={check.is_work}
                          onChange={(e) =>
                            setCreateForm((prev: UserFormData) => ({
                              ...prev,
                              store_checks: {
                                ...prev.store_checks,
                                [store.id]: { ...check, is_work: e.target.checked },
                              },
                            }))
                          }
                        />
                        <input
                          type="checkbox"
                          className="mx-auto disabled:cursor-not-allowed disabled:opacity-40"
                          checked={check.is_manager}
                          disabled={!canManage}
                          title={canManage ? undefined : "Only SV/GM/Owner can be a manager"}
                          onChange={(e) =>
                            setCreateForm((prev: UserFormData) => ({
                              ...prev,
                              store_checks: {
                                ...prev.store_checks,
                                [store.id]: { ...check, is_manager: e.target.checked },
                              },
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>

      {/* Claim code result modal — 유령 생성 직후 인수 코드를 크게 보여준다 */}
      <Modal
        isOpen={claimResult !== null}
        onClose={() => setClaimResult(null)}
        title="Provisional staff added"
        footer={
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setClaimResult(null)}>
              Done
            </Button>
          </div>
        }
      >
        {claimResult && (
          <div className="space-y-4">
            <p className="text-sm text-text">
              <span className="font-semibold">{claimResult.name}</span> was added as a
              provisional staff member.
            </p>
            <div className="rounded-xl border border-accent/30 bg-accent-muted px-4 py-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
                Claim code
              </p>
              <p className="text-3xl md:text-4xl font-extrabold tracking-[0.2em] text-accent font-mono break-all">
                {claimResult.code}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => void copyClaimCode(claimResult.code)}
              >
                {claimCopied ? (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy code
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-text-secondary">
              Give this code to the employee. They enter it when signing up to take
              over this account.
            </p>
          </div>
        )}
      </Modal>

      {/* Work Availability hover popover — fixed so the table doesn't clip it */}
      {availHover && (
        <div
          className="pointer-events-none fixed z-[70]"
          style={{
            left: Math.min(availHover.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 250),
            top: Math.min(availHover.y + 14, (typeof window !== "undefined" ? window.innerHeight : 800) - 280),
          }}
        >
          <div className="w-60 rounded-xl border border-border bg-surface p-3 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-bold text-text">{availHover.name}</span>
              <span className="text-[11px] text-text-muted">click to edit</span>
            </div>
            <ul className="space-y-1">
              {toRoutine(availHover.member.days).map((d: AvailabilityDay, i: number) => (
                <li key={i} className="flex items-center justify-between text-[12px]">
                  <span className="text-text-secondary">{DAY_LABELS[i]}</span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{
                      color:
                        d.state === "off"
                          ? "var(--color-text-muted)"
                          : d.state === "range"
                            ? AVAIL_COLORS.range
                            : AVAIL_COLORS.full,
                    }}
                  >
                    {fmtDay(d)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-border pt-2 text-[11px] text-text-muted">
              {availHover.member.updated_at
                ? `Last updated ${formatDate(availHover.member.updated_at, tz)}`
                : "Not set yet"}
            </div>
          </div>
        </div>
      )}

      {/* Work Availability edit modal */}
      <AvailabilityEditModal
        userId={availEdit?.userId ?? null}
        userName={availEdit?.name ?? ""}
        canManage={canManageAvailability}
        onClose={() => setAvailEdit(null)}
      />
    </div>
  );
}
