/**
 * useCalendarData — SchedulesCalendarView가 사용하는 통합 데이터 훅.
 *
 * 서버에서 schedules + users + stores를 fetch한 뒤 mockup 형태로 변환하여 반환.
 * 로딩/에러 상태도 노출.
 */

import { useMemo } from "react";
import { useSchedules } from "@/hooks/useSchedules";
import { useUsers } from "@/hooks/useUsers";
import { useStores } from "@/hooks/useStores";
import {
  adaptScheduleToMockBlock,
  adaptStoreToMockStore,
  adaptUserToStaff,
} from "./adapters";
import type { Staff, ScheduleBlock, Store } from "./types";

export interface CalendarData {
  staff: Staff[];
  stores: Store[];
  schedules: ScheduleBlock[];
  isLoading: boolean;
  error: Error | null;
}

export interface UseCalendarDataParams {
  selectedStoreId: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
}

export function useCalendarData({
  selectedStoreId,
  dateFrom,
  dateTo,
}: UseCalendarDataParams): CalendarData {
  const usersQ = useUsers();
  const storesQ = useStores();
  const schedulesQ = useSchedules({
    store_id: selectedStoreId || undefined,
    date_from: dateFrom,
    date_to: dateTo,
    per_page: 500,
  });

  const staff = useMemo<Staff[]>(() => {
    const list = usersQ.data ?? [];
    return list.filter((u) => u.is_active).map(adaptUserToStaff);
  }, [usersQ.data]);

  const stores = useMemo<Store[]>(() => {
    const list = (storesQ.data ?? []) as Array<Parameters<typeof adaptStoreToMockStore>[0]>;
    if (!Array.isArray(list)) return [];
    return list.map(adaptStoreToMockStore);
  }, [storesQ.data]);

  const schedules = useMemo<ScheduleBlock[]>(() => {
    const items = schedulesQ.data?.items ?? [];
    if (!Array.isArray(items)) return [];
    return items.map((s) => adaptScheduleToMockBlock(s, selectedStoreId));
  }, [schedulesQ.data, selectedStoreId]);

  const isLoading = usersQ.isLoading || storesQ.isLoading || schedulesQ.isLoading;
  const error = (usersQ.error ?? storesQ.error ?? schedulesQ.error) as Error | null;

  return { staff, stores, schedules, isLoading, error };
}
