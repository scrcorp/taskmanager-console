/**
 * Tips React Query hooks (콘솔 매니저용 — Stage A).
 *
 * 목록 조회 + 매니저 entry create/update + 매장 분배 조회.
 * 직원용 API 는 staff app 에서만 사용 (콘솔은 매니저 흐름).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  ManagerTipEntryCreate,
  ManagerTipEntryUpdate,
  StoreDistribution,
  TipEntry,
} from "@/types/tip";

interface ListEntriesParams {
  storeId: string;
  start: string; // YYYY-MM-DD
  end: string;
  employeeId?: string;
}

/** 매장 단위 entries — Review matrix 의 원천 데이터. */
export function useStoreTipEntries(
  params: ListEntriesParams | null,
): UseQueryResult<TipEntry[], Error> {
  return useQuery<TipEntry[], Error>({
    queryKey: ["tips", "entries", params],
    enabled: !!params,
    queryFn: async (): Promise<TipEntry[]> => {
      if (!params) return [];
      const resp: AxiosResponse<TipEntry[]> = await api.get(
        "/console/tips/entries",
        {
          params: {
            store_id: params.storeId,
            start: params.start,
            end: params.end,
            employee_id: params.employeeId,
          },
        },
      );
      return resp.data;
    },
  });
}

/** 매장 단위 분배 — Distributions 탭. */
export function useStoreTipDistributions(
  storeId: string | null,
  statusFilter?: "pending" | "accepted" | "auto_accepted",
  range?: { start: string; end: string },
): UseQueryResult<StoreDistribution[], Error> {
  return useQuery<StoreDistribution[], Error>({
    queryKey: ["tips", "distributions", storeId, statusFilter ?? "all", range],
    enabled: !!storeId,
    queryFn: async (): Promise<StoreDistribution[]> => {
      if (!storeId) return [];
      const resp: AxiosResponse<StoreDistribution[]> = await api.get(
        "/console/tips/distributions",
        {
          params: {
            store_id: storeId,
            status: statusFilter,
            start: range?.start,
            end: range?.end,
          },
        },
      );
      return resp.data;
    },
    refetchInterval: 60_000, // pending 자동 수락 카운트다운 위해 1분마다
  });
}

/** 매니저 누락 추가. */
export function useManagerCreateTipEntry(): UseMutationResult<
  TipEntry,
  Error,
  ManagerTipEntryCreate
> {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<TipEntry, Error, ManagerTipEntryCreate>({
    mutationFn: async (data: ManagerTipEntryCreate): Promise<TipEntry> => {
      const resp: AxiosResponse<TipEntry> = await api.post(
        "/console/tips/entries",
        data,
      );
      return resp.data;
    },
    onSuccess: (): void => {
      qc.invalidateQueries({ queryKey: ["tips"] });
      success("Tip entry added.");
    },
    onError: error("Couldn't add tip entry"),
  });
}

/** 매니저 수정 — comment 필수. */
export function useManagerUpdateTipEntry(): UseMutationResult<
  TipEntry,
  Error,
  { entryId: string; data: ManagerTipEntryUpdate }
> {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    TipEntry,
    Error,
    { entryId: string; data: ManagerTipEntryUpdate }
  >({
    mutationFn: async ({ entryId, data }): Promise<TipEntry> => {
      const resp: AxiosResponse<TipEntry> = await api.patch(
        `/console/tips/entries/${entryId}`,
        data,
      );
      return resp.data;
    },
    onSuccess: (): void => {
      qc.invalidateQueries({ queryKey: ["tips"] });
      success("Tip entry updated.");
    },
    onError: error("Couldn't update tip entry"),
  });
}


// ── Period dashboard ──────────────────────────────────────

export interface PeriodKPI {
  card_total: string;
  cash_total: string;
  distributed_total: string;
  reported_total: string;
  entries_count: number;
  distinct_employees: number;
}

export interface PeriodDailyRow {
  date: string;
  reported: string;
}

export interface PeriodEmployeeRow {
  employee_id: string;
  employee_name: string;
  card: string;
  cash: string;
  distributed: string;
  reported: string;
  entries: number;
}

export interface PeriodDashboard {
  store_id: string;
  start_date: string;
  end_date: string;
  status: "open" | "confirmed";
  confirmed_at: string | null;
  confirmed_by: string | null;
  override_reason: string | null;
  kpi: PeriodKPI;
  daily: PeriodDailyRow[];
  per_employee: PeriodEmployeeRow[];
}

export function usePeriodDashboard(
  storeId: string | null,
  dateInCycle: string,
): UseQueryResult<PeriodDashboard, Error> {
  return useQuery<PeriodDashboard, Error>({
    queryKey: ["tips", "period-dashboard", storeId, dateInCycle],
    enabled: !!storeId,
    queryFn: async () => {
      const resp = await api.get<PeriodDashboard>("/console/tips/periods/dashboard", {
        params: { store_id: storeId, date_in_cycle: dateInCycle },
      });
      return resp.data;
    },
  });
}

export function useConfirmPeriod(): UseMutationResult<
  PeriodDashboard,
  Error,
  { storeId: string; dateInCycle: string }
> {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<PeriodDashboard, Error, { storeId: string; dateInCycle: string }>({
    mutationFn: async ({ storeId, dateInCycle }) => {
      const resp = await api.post<PeriodDashboard>("/console/tips/periods/confirm", {}, {
        params: { store_id: storeId, date_in_cycle: dateInCycle },
      });
      return resp.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tips"] });
      success("Cycle confirmed. 4070 forms generated.");
    },
    onError: error("Couldn't confirm cycle"),
  });
}

export function useForceClosePeriod(): UseMutationResult<
  PeriodDashboard,
  Error,
  { storeId: string; dateInCycle: string; reason: string }
> {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    PeriodDashboard,
    Error,
    { storeId: string; dateInCycle: string; reason: string }
  >({
    mutationFn: async ({ storeId, dateInCycle, reason }) => {
      const resp = await api.post<PeriodDashboard>(
        "/console/tips/periods/force-close",
        { reason },
        { params: { store_id: storeId, date_in_cycle: dateInCycle } },
      );
      return resp.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tips"] });
      success("Cycle force-closed.");
    },
    onError: error("Couldn't force-close cycle"),
  });
}


// ── Audit logs ────────────────────────────────────────────

export interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  comment: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export function useAuditLogs(
  filters: {
    store_id?: string;
    entity_type?: string;
    action?: string;
    actor_id?: string;
  } = {},
): UseQueryResult<AuditLogRow[], Error> {
  return useQuery<AuditLogRow[], Error>({
    queryKey: ["tips", "audit-logs", filters],
    queryFn: async () => {
      const resp = await api.get<AuditLogRow[]>("/console/tips/audit-logs", {
        params: { ...filters, limit: 200 },
      });
      return resp.data;
    },
  });
}


// ── 4070 Forms ────────────────────────────────────────────

export interface Form4070 {
  id: string;
  employee_id: string;
  employee_name: string | null;
  period_id: string;
  period_start: string;
  period_end: string;
  store_id: string;
  store_name: string | null;
  pdf_key: string | null;
  pdf_url: string | null;
  reported_cash: string;
  reported_card: string;
  paid_out: string;
  net_tips: string;
  status: "generated" | "downloaded" | "signed" | "unsigned";
  generated_at: string;
  signed_at: string | null;
  signature_image_key: string | null;
  signature_url: string | null;
}

export function useStoreForms(
  storeId: string | null,
  dateInCycle: string,
): UseQueryResult<Form4070[], Error> {
  return useQuery<Form4070[], Error>({
    queryKey: ["tips", "forms", storeId, dateInCycle],
    enabled: !!storeId,
    queryFn: async () => {
      const resp = await api.get<Form4070[]>("/console/tips/forms", {
        params: { store_id: storeId, date_in_cycle: dateInCycle },
      });
      return resp.data;
    },
  });
}

export function useRemindUnsigned(): UseMutationResult<
  { sent: boolean },
  Error,
  string
> {
  const { success, error } = useMutationResult();
  return useMutation<{ sent: boolean }, Error, string>({
    mutationFn: async (formId) => {
      const resp = await api.post<{ sent: boolean }>(
        `/console/tips/forms/${formId}/remind`,
      );
      return resp.data;
    },
    onSuccess: () => success("Reminder sent."),
    onError: error("Couldn't send reminder"),
  });
}
