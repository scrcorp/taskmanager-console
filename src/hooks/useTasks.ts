/**
 * Task (work item, renamed from additional_tasks → issues → tasks) React Query 훅.
 *
 * CRUD + promote from issue_report.
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
  Task,
  TaskAttachment,
  TaskComment,
  TaskCreateRequest,
  TaskPromoteRequest,
  TaskTransitionRequest,
  TaskUpdateRequest,
  PaginatedResponse,
} from "@/types";

export interface TaskFilters {
  store_id?: string;
  status?: string;
  category?: string;
  page?: number;
  per_page?: number;
}

export const useTasks = (
  filters: TaskFilters = {},
): UseQueryResult<PaginatedResponse<Task>, Error> => {
  return useQuery({
    queryKey: ["tasks", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.store_id) params.store_id = filters.store_id;
      if (filters.status) params.status = filters.status;
      if (filters.category) params.category = filters.category;
      params.page = filters.page ?? 1;
      params.per_page = filters.per_page ?? 50;
      const res: AxiosResponse<PaginatedResponse<Task>> = await api.get(
        "/console/tasks",
        { params },
      );
      return res.data;
    },
  });
};

export const useTask = (taskId: string): UseQueryResult<Task, Error> => {
  return useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const res: AxiosResponse<Task> = await api.get(`/console/tasks/${taskId}`);
      return res.data;
    },
    enabled: !!taskId,
  });
};

export const useCreateTask = (): UseMutationResult<
  Task,
  Error,
  TaskCreateRequest
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Task, Error, TaskCreateRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<Task> = await api.post("/console/tasks", data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      success("Task created.");
    },
    onError: error("Couldn't create task"),
  });
};

export const useUpdateTask = (): UseMutationResult<
  Task,
  Error,
  { taskId: string; data: TaskUpdateRequest }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Task, Error, { taskId: string; data: TaskUpdateRequest }>({
    mutationFn: async ({ taskId, data }) => {
      const res: AxiosResponse<Task> = await api.put(`/console/tasks/${taskId}`, data);
      return res.data;
    },
    onSuccess: (_, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      success("Task updated.");
    },
    onError: error("Couldn't update task"),
  });
};

export const useDeleteTask = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (taskId) => {
      await api.delete(`/console/tasks/${taskId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      success("Task deleted.");
    },
    onError: error("Couldn't delete task"),
  });
};

/** Issue report → Task (work item) promote. */
export const usePromoteReportToTask = (): UseMutationResult<
  Task,
  Error,
  { reportId: string; data: TaskPromoteRequest }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Task, Error, { reportId: string; data: TaskPromoteRequest }>({
    mutationFn: async ({ reportId, data }) => {
      const res: AxiosResponse<Task> = await api.post(
        `/console/tasks/from-report/${reportId}`,
        data,
      );
      return res.data;
    },
    onSuccess: (_, { reportId }) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["report", reportId] });
      success("Task opened from report.");
    },
    onError: error("Couldn't open task"),
  });
};

/** Status 전이 (담당자 보고 / 매니저 승인·반려·reopen). */
export const useTransitionTask = (): UseMutationResult<
  Task,
  Error,
  { taskId: string; data: TaskTransitionRequest }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  const messages: Record<string, string> = {
    in_progress: "Task is in progress.",
    under_review: "Submitted — task is under review.",
    completed: "Task approved.",
    pending: "Task reset to pending.",
  };
  return useMutation<Task, Error, { taskId: string; data: TaskTransitionRequest }>({
    mutationFn: async ({ taskId, data }) => {
      const res: AxiosResponse<Task> = await api.post(
        `/console/tasks/${taskId}/transition`,
        data,
      );
      return res.data;
    },
    onSuccess: (task, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
      success(messages[task.status] ?? "Task updated.");
    },
    onError: error("Couldn't change task status"),
  });
};

export const useTaskComments = (taskId: string): UseQueryResult<TaskComment[], Error> => {
  return useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: async () => {
      const res: AxiosResponse<TaskComment[]> = await api.get(
        `/console/tasks/${taskId}/comments`,
      );
      return res.data;
    },
    enabled: !!taskId,
  });
};

export const useAddTaskComment = (): UseMutationResult<
  TaskComment,
  Error,
  { taskId: string; content: string; attachments?: TaskAttachment[] }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    TaskComment,
    Error,
    { taskId: string; content: string; attachments?: TaskAttachment[] }
  >({
    mutationFn: async ({ taskId, content, attachments }) => {
      const res: AxiosResponse<TaskComment> = await api.post(
        `/console/tasks/${taskId}/comments`,
        { content, attachments: attachments ?? [] },
      );
      return res.data;
    },
    onSuccess: (_, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
      success("Message sent.");
    },
    onError: error("Couldn't send message"),
  });
};
