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
import { useResultModal } from "@/components/ui/ResultModal";
import { parseApiError } from "@/lib/utils";
import type { AdditionalTask, PaginatedResponse, TaskEvidence } from "@/types";

/** 추가 작업 목록 필터 타입 (Task list filter type) */
interface TaskFilters {
  store_id?: string;
  status?: "pending" | "in_progress" | "completed";
  priority?: "normal" | "urgent";
  page?: number;
  per_page?: number;
}

/**
 * 추가 작업 목록 조회 훅 -- 필터와 페이지네이션을 지원하는 작업 목록을 가져옵니다.
 *
 * Custom hook to fetch paginated additional tasks with filters.
 *
 * @param filters - 필터 파라미터 (Filter parameters)
 * @returns 작업 목록 쿼리 결과 (Paginated task list query result)
 */
export const useTasks = (
  filters: TaskFilters = {},
): UseQueryResult<PaginatedResponse<AdditionalTask>, Error> => {
  const params: Record<string, string | number> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.status) params.status = filters.status;
  if (filters.priority) params.priority = filters.priority;
  if (filters.page) params.page = filters.page;
  if (filters.per_page) params.per_page = filters.per_page;

  return useQuery<PaginatedResponse<AdditionalTask>, Error>({
    queryKey: ["tasks", params],
    queryFn: async (): Promise<PaginatedResponse<AdditionalTask>> => {
      const response: AxiosResponse<PaginatedResponse<AdditionalTask>> =
        await api.get("/admin/additional-tasks", { params });
      return response.data;
    },
  });
};

/**
 * 추가 작업 상세 조회 훅 -- 특정 작업의 상세 정보를 가져옵니다.
 *
 * Custom hook to fetch a single task detail.
 *
 * @param id - 작업 ID (Task ID)
 * @returns 작업 상세 쿼리 결과 (Task detail query result)
 */
export const useTask = (
  id: string | undefined,
): UseQueryResult<AdditionalTask, Error> => {
  return useQuery<AdditionalTask, Error>({
    queryKey: ["tasks", id],
    queryFn: async (): Promise<AdditionalTask> => {
      const response: AxiosResponse<AdditionalTask> = await api.get(
        `/admin/additional-tasks/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
};

/** 추가 작업 생성 요청 데이터 타입 (Task creation request data type) */
interface CreateTaskData {
  title: string;
  description?: string;
  store_id?: string | null;
  priority: "normal" | "urgent";
  due_date?: string | null;
  assignee_ids?: string[];
}

/**
 * 추가 작업 생성 훅 -- 새 작업을 생성하고 목록을 갱신합니다.
 *
 * Mutation hook to create a new task and invalidate the list.
 *
 * @returns 작업 생성 뮤테이션 결과 (Task creation mutation result)
 */
export const useCreateTask = (): UseMutationResult<
  AdditionalTask,
  Error,
  CreateTaskData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  return useMutation<AdditionalTask, Error, CreateTaskData>({
    mutationFn: async (data: CreateTaskData): Promise<AdditionalTask> => {
      const response: AxiosResponse<AdditionalTask> = await api.post(
        "/admin/additional-tasks",
        data,
      );
      return response.data;
    },
    onSuccess: (newTask: AdditionalTask): void => {
      queryClient.setQueriesData<PaginatedResponse<AdditionalTask>>(
        { queryKey: ["tasks"] },
        (old) => {
          if (!old || !Array.isArray(old?.items)) return old;
          return { ...old, items: [newTask, ...old.items], total: old.total + 1 };
        },
      );
      showSuccess("Task created.");
    },
    onError: (err) => {
      showError(parseApiError(err, "Unexpected error"), { title: "Couldn't create task" });
    },
  });
};



/** 추가 작업 수정 요청 데이터 타입 (Task update request data type) */
interface UpdateTaskData {
  id: string;
  title?: string;
  description?: string;
  store_id?: string | null;
  priority?: "normal" | "urgent";
  status?: "pending" | "in_progress" | "completed";
  due_date?: string | null;
  assignee_ids?: string[];
}

/**
 * 추가 작업 수정 훅 -- 기존 작업을 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to update an existing task and invalidate related queries.
 *
 * @returns 작업 수정 뮤테이션 결과 (Task update mutation result)
 */
export const useUpdateTask = (): UseMutationResult<
  AdditionalTask,
  Error,
  UpdateTaskData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  return useMutation<AdditionalTask, Error, UpdateTaskData>({
    mutationFn: async ({
      id,
      ...data
    }: UpdateTaskData): Promise<AdditionalTask> => {
      const response: AxiosResponse<AdditionalTask> = await api.put(
        `/admin/additional-tasks/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updated: AdditionalTask, variables: UpdateTaskData): void => {
      queryClient.setQueriesData<PaginatedResponse<AdditionalTask>>(
        { queryKey: ["tasks"] },
        (old) => {
          if (!old || !Array.isArray(old?.items)) return old;
          return { ...old, items: old.items.map((t) => (t.id === variables.id ? updated : t)) };
        },
      );
      queryClient.setQueryData<AdditionalTask>(["tasks", variables.id], updated);
      showSuccess("Task updated.");
    },
    onError: (err) => {
      showError(parseApiError(err, "Unexpected error"), { title: "Couldn't update task" });
    },
  });
};

/**
 * 추가 작업 삭제 훅 -- 작업을 삭제하고 목록을 갱신합니다.
 *
 * Mutation hook to delete a task and invalidate the list.
 *
 * @returns 작업 삭제 뮤테이션 결과 (Task deletion mutation result)
 */
export const useDeleteTask = (): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/additional-tasks/${id}`);
    },
    onSuccess: (_: void, id: string): void => {
      queryClient.setQueriesData<PaginatedResponse<AdditionalTask>>(
        { queryKey: ["tasks"] },
        (old) => {
          if (!old || !Array.isArray(old?.items)) return old;
          return { ...old, items: old.items.filter((t) => t.id !== id), total: old.total - 1 };
        },
      );
      showSuccess("Task deleted.");
    },
    onError: (err) => {
      showError(parseApiError(err, "Unexpected error"), { title: "Couldn't delete task" });
    },
  });
};

/**
 * 업무 증빙 목록 조회 훅 -- 특정 업무의 증빙 목록을 가져옵니다.
 *
 * Custom hook to fetch task evidences for a specific task.
 *
 * @param taskId - 업무 ID (Task ID)
 * @returns 증빙 목록 쿼리 결과 (Task evidence list query result)
 */
export const useTaskEvidences = (
  taskId: string | undefined,
): UseQueryResult<TaskEvidence[], Error> => {
  return useQuery<TaskEvidence[], Error>({
    queryKey: ["tasks", taskId, "evidences"],
    queryFn: async (): Promise<TaskEvidence[]> => {
      const response: AxiosResponse<TaskEvidence[]> = await api.get(
        `/admin/additional-tasks/${taskId}/evidences`,
      );
      return response.data;
    },
    enabled: !!taskId,
  });
};
