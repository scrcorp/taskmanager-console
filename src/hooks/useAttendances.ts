import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
  type QueryClient,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  Attendance,
  AttendanceBreakItem,
  AttendanceCorrection,
  AttendanceCorrectionRequest,
  AttendanceFilters,
  BreakSessionCreateRequest,
  BreakSessionUpdateRequest,
  QRCode,
  PaginatedResponse,
} from "@/types";

/**
 * 근태 기록 목록 조회 훅 -- 필터를 적용하여 근태 기록 목록을 가져옵니다.
 *
 * Custom hook to fetch paginated attendance records with optional filters.
 *
 * @param filters - 선택적 필터 (Optional filters for store, user, date, status, pagination)
 * @returns 근태 목록 쿼리 결과 (Attendance list query result)
 */
export const useAttendances = (
  filters: AttendanceFilters = {},
): UseQueryResult<PaginatedResponse<Attendance>, Error> => {
  const params: Record<string, string | number> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.user_id) params.user_id = filters.user_id;
  if (filters.work_date) params.work_date = filters.work_date;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.status) params.status = filters.status;
  if (filters.page) params.page = filters.page;
  if (filters.per_page) params.per_page = filters.per_page;

  return useQuery<PaginatedResponse<Attendance>, Error>({
    queryKey: ["attendances", params],
    queryFn: async (): Promise<PaginatedResponse<Attendance>> => {
      const response: AxiosResponse<PaginatedResponse<Attendance>> =
        await api.get("/console/attendances", { params });
      return response.data;
    },
  });
};

/**
 * 근태 기록 상세 조회 훅 -- 특정 근태 기록의 상세 정보 + 수정 이력을 가져옵니다.
 *
 * Custom hook to fetch a single attendance detail with correction history.
 *
 * @param id - 근태 ID (Attendance ID)
 * @returns 근태 상세 쿼리 결과 (Attendance detail query result)
 */
export const useAttendance = (
  id: string | undefined,
): UseQueryResult<Attendance, Error> => {
  return useQuery<Attendance, Error>({
    queryKey: ["attendances", id],
    queryFn: async (): Promise<Attendance> => {
      const response: AxiosResponse<Attendance> = await api.get(
        `/console/attendances/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
};

/**
 * 근태 수정 훅 -- 근태 기록 필드를 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to correct an attendance record field and invalidate queries.
 *
 * @returns 근태 수정 뮤테이션 결과 (Attendance correction mutation result)
 */
export const useCorrectAttendance = (): UseMutationResult<
  AttendanceCorrection,
  Error,
  { id: string; data: AttendanceCorrectionRequest }
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    AttendanceCorrection,
    Error,
    { id: string; data: AttendanceCorrectionRequest }
  >({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: AttendanceCorrectionRequest;
    }): Promise<AttendanceCorrection> => {
      const response: AxiosResponse<AttendanceCorrection> = await api.patch(
        `/console/attendances/${id}/correct`,
        data,
      );
      return response.data;
    },
    onSuccess: (_: AttendanceCorrection, variables): void => {
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
      queryClient.invalidateQueries({
        queryKey: ["attendances", variables.id],
      });
      success("Attendance corrected.");
    },
    onError: error("Couldn't correct attendance"),
  });
};

/**
 * Break 세션 추가 훅. 성공 시 attendance 쿼리 invalidate.
 * Add a new break session via admin correction. Invalidates attendance queries on success.
 */
export const useAddBreakSession = (): UseMutationResult<
  AttendanceBreakItem,
  Error,
  { attendanceId: string; data: BreakSessionCreateRequest }
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    AttendanceBreakItem,
    Error,
    { attendanceId: string; data: BreakSessionCreateRequest }
  >({
    mutationFn: async ({ attendanceId, data }) => {
      const res: AxiosResponse<AttendanceBreakItem> = await api.post(
        `/console/attendances/${attendanceId}/breaks`,
        data,
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
      queryClient.invalidateQueries({
        queryKey: ["attendances", variables.attendanceId],
      });
      success("Break added.");
    },
    onError: error("Couldn't add break"),
  });
};

/**
 * Break 세션 수정 훅.
 * Update a break session via admin correction.
 */
export const useUpdateBreakSession = (): UseMutationResult<
  AttendanceBreakItem,
  Error,
  { attendanceId: string; breakId: string; data: BreakSessionUpdateRequest }
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    AttendanceBreakItem,
    Error,
    { attendanceId: string; breakId: string; data: BreakSessionUpdateRequest }
  >({
    mutationFn: async ({ attendanceId, breakId, data }) => {
      const res: AxiosResponse<AttendanceBreakItem> = await api.patch(
        `/console/attendances/${attendanceId}/breaks/${breakId}`,
        data,
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
      queryClient.invalidateQueries({
        queryKey: ["attendances", variables.attendanceId],
      });
      success("Break updated.");
    },
    onError: error("Couldn't update break"),
  });
};

/**
 * Break 세션 삭제 훅.
 * Delete a break session via admin correction.
 */
export const useDeleteBreakSession = (): UseMutationResult<
  void,
  Error,
  { attendanceId: string; breakId: string }
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, { attendanceId: string; breakId: string }>({
    mutationFn: async ({ attendanceId, breakId }) => {
      await api.delete(`/console/attendances/${attendanceId}/breaks/${breakId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
      queryClient.invalidateQueries({
        queryKey: ["attendances", variables.attendanceId],
      });
      success("Break deleted.");
    },
    onError: error("Couldn't delete break"),
  });
};

/**
 * 매장 QR 코드 조회 훅 -- 매장의 활성 QR 코드를 가져옵니다.
 *
 * Custom hook to fetch the active QR code for a store.
 *
 * @param storeId - 매장 ID (Store ID)
 * @returns QR 코드 쿼리 결과 (QR code query result)
 */
export const useStoreQRCode = (
  storeId: string | undefined,
): UseQueryResult<QRCode, Error> => {
  return useQuery<QRCode, Error>({
    queryKey: ["qr-codes", storeId],
    queryFn: async (): Promise<QRCode> => {
      const response: AxiosResponse<QRCode> = await api.get(
        `/console/stores/${storeId}/qr-codes`,
      );
      return response.data;
    },
    enabled: !!storeId,
  });
};

/**
 * QR 코드 생성 훅 -- 매장의 새 QR 코드를 생성합니다.
 *
 * Mutation hook to generate a new QR code for a store.
 *
 * @returns QR 코드 생성 뮤테이션 결과 (QR code creation mutation result)
 */
export const useCreateQRCode = (): UseMutationResult<
  QRCode,
  Error,
  string
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<QRCode, Error, string>({
    mutationFn: async (storeId: string): Promise<QRCode> => {
      const response: AxiosResponse<QRCode> = await api.post(
        `/console/stores/${storeId}/qr-codes`,
      );
      return response.data;
    },
    onSuccess: (newQR: QRCode): void => {
      queryClient.invalidateQueries({
        queryKey: ["qr-codes", newQR.store_id],
      });
      success("QR code created.");
    },
    onError: error("Couldn't create QR code"),
  });
};

/**
 * QR 코드 재생성 훅 -- 기존 QR 코드를 재생성합니다.
 *
 * Mutation hook to regenerate a QR code.
 *
 * @returns QR 코드 재생성 뮤테이션 결과 (QR code regeneration mutation result)
 */
export const useRegenerateQRCode = (): UseMutationResult<
  QRCode,
  Error,
  string
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<QRCode, Error, string>({
    mutationFn: async (qrId: string): Promise<QRCode> => {
      const response: AxiosResponse<QRCode> = await api.post(
        `/console/qr-codes/${qrId}/regenerate`,
      );
      return response.data;
    },
    onSuccess: (_newQR: QRCode): void => {
      queryClient.invalidateQueries({ queryKey: ["qr-codes"] });
      success("Regenerated.");
    },
    onError: error("Couldn't regenerate QR code"),
  });
};
