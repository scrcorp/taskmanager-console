/**
 * Contacts React Query hooks — `/api/v1/console/contacts`.
 *
 * 계약: docs/99_inbox/2026-08-14-연락처-API계약.md
 *
 * 경로 주의 (reference_fastapi_trailing_slash):
 *   collection 인 `/console/contacts/` 는 **trailing slash 필수**다. 빼면 prod 에서
 *   307 리다이렉트가 http 로 다운그레이드되며 CORS POST 가 깨진다.
 *   반대로 `/console/contacts/tags`, `/console/contacts/requests` 같은 정적 하위 경로는
 *   서버가 slash 없이 등록하므로 붙이면 안 된다.
 *
 * Mutation 결과 모달은 `useMutationResult` 가 자동으로 띄운다. 호출 측에서
 * success/error 를 다시 띄우지 말 것.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type UseQueryResult,
  type UseMutationResult,
  type QueryClient,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  Contact,
  ContactCreate,
  ContactUpdate,
  ContactDeleteRequest,
  ContactDeleteResult,
  ContactFilters,
  ContactTagSuggestion,
  ContactChangeRequest,
  ContactRequestCreate,
  ContactRequestFilters,
  ContactRequestApprove,
  ContactRequestApproveResult,
  ContactRequestReject,
  PaginatedResponse,
} from "@/types";

/** collection 경로 — trailing slash 를 지우지 말 것. */
const COLLECTION = "/console/contacts/";
const TAGS = "/console/contacts/tags";
const REQUESTS = "/console/contacts/requests";

// ─── Query keys ─────────────────────────────────────────────────────────────

const KEYS = {
  all: ["contacts"] as const,
  list: (filters: ContactFilters) => ["contacts", "list", filters] as const,
  detail: (id: string) => ["contacts", "detail", id] as const,
  tags: (q: string) => ["contacts", "tags", q] as const,
  requests: (filters: ContactRequestFilters) => ["contact-requests", filters] as const,
  myRequests: (filters: ContactRequestFilters) => ["contact-requests", "mine", filters] as const,
};

/** 연락처가 바뀌면 목록·태그 사용횟수·신청 목록이 전부 흔들린다. 통째로 무효화한다. */
function invalidateContacts(qc: QueryClient, contactId?: string | null): void {
  qc.invalidateQueries({ queryKey: KEYS.all });
  qc.invalidateQueries({ queryKey: ["contact-requests"] });
  if (contactId) qc.invalidateQueries({ queryKey: KEYS.detail(contactId) });
}

// ─── 연락처 조회 ─────────────────────────────────────────────────────────────

/**
 * 연락처 목록/검색.
 *
 * `q` 하나로 이름·회사·이메일·메모·태그·전화번호를 OR 부분일치한다(서버가 처리).
 * 검색어는 호출 측에서 디바운스해서 넘길 것.
 */
export const useContacts = (
  filters: ContactFilters = {},
): UseQueryResult<PaginatedResponse<Contact>, Error> => {
  return useQuery<PaginatedResponse<Contact>, Error>({
    queryKey: KEYS.list(filters),
    queryFn: async (): Promise<PaginatedResponse<Contact>> => {
      const res: AxiosResponse<PaginatedResponse<Contact>> = await api.get(COLLECTION, {
        params: {
          ...(filters.q ? { q: filters.q } : {}),
          ...(filters.tag ? { tag: filters.tag } : {}),
          ...(filters.store_id ? { store_id: filters.store_id } : {}),
          sort: filters.sort ?? "name",
          page: filters.page ?? 1,
          per_page: filters.per_page ?? 20,
        },
      });
      return res.data;
    },
    // 검색어/페이지가 바뀌는 동안 표가 비어 깜빡이지 않도록 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  });
};

/** 연락처 상세 (`pending_request_count` 가 채워져 온다). */
export const useContact = (
  id: string | undefined,
): UseQueryResult<Contact, Error> => {
  return useQuery<Contact, Error>({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async (): Promise<Contact> => {
      const res: AxiosResponse<Contact> = await api.get(`${COLLECTION}${id}`);
      return res.data;
    },
    enabled: !!id,
  });
};

/**
 * 태그 자동완성 / 필터 옵션.
 *
 * `q` 는 **prefix** 검색이다(부분일치 아님). 빈 문자열이면 사용 횟수 상위 목록.
 */
export const useContactTags = (
  q: string = "",
  limit: number = 20,
): UseQueryResult<ContactTagSuggestion[], Error> => {
  return useQuery<ContactTagSuggestion[], Error>({
    queryKey: KEYS.tags(q),
    queryFn: async (): Promise<ContactTagSuggestion[]> => {
      const res: AxiosResponse<ContactTagSuggestion[]> = await api.get(TAGS, {
        params: { ...(q ? { q } : {}), limit },
      });
      return res.data;
    },
  });
};

// ─── 연락처 쓰기 (contacts:create / update / delete) ─────────────────────────

/** 연락처 등록 — `contacts:create` 필요. */
export const useCreateContact = (): UseMutationResult<Contact, Error, ContactCreate> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Contact, Error, ContactCreate>({
    mutationFn: async (data: ContactCreate): Promise<Contact> => {
      const res: AxiosResponse<Contact> = await api.post(COLLECTION, data);
      return res.data;
    },
    onSuccess: (): void => {
      invalidateContacts(qc);
      success("Contact added.");
    },
    onError: error("Couldn't add contact"),
  });
};

/** 연락처 수정 — `contacts:update` 필요. PUT 전체 치환, `reason` 필수. */
export const useUpdateContact = (): UseMutationResult<
  Contact,
  Error,
  { id: string; data: ContactUpdate }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Contact, Error, { id: string; data: ContactUpdate }>({
    mutationFn: async ({ id, data }): Promise<Contact> => {
      const res: AxiosResponse<Contact> = await api.put(`${COLLECTION}${id}`, data);
      return res.data;
    },
    onSuccess: (_updated, variables): void => {
      invalidateContacts(qc, variables.id);
      success("Contact updated.");
    },
    onError: error("Couldn't update contact"),
  });
};

/**
 * 연락처 삭제 — `contacts:delete` 필요. soft delete 이며 사유가 필수라
 * 본문(body)을 실어 보낸다 (axios delete 는 `data` 로 넘겨야 한다).
 */
export const useDeleteContact = (): UseMutationResult<
  ContactDeleteResult,
  Error,
  { id: string; reason: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ContactDeleteResult, Error, { id: string; reason: string }>({
    mutationFn: async ({ id, reason }): Promise<ContactDeleteResult> => {
      const body: ContactDeleteRequest = { reason };
      const res: AxiosResponse<ContactDeleteResult> = await api.delete(
        `${COLLECTION}${id}`,
        { data: body },
      );
      return res.data;
    },
    onSuccess: (result, variables): void => {
      invalidateContacts(qc, variables.id);
      // 삭제로 무효화된 신청이 있으면 그것까지 말해준다 (조용한 부수효과 금지).
      success(
        result.superseded_request_count > 0
          ? `Contact deleted. ${result.superseded_request_count} pending request(s) were closed.`
          : "Contact deleted.",
      );
    },
    onError: error("Couldn't delete contact"),
  });
};

// ─── 변경 신청 (D4) ──────────────────────────────────────────────────────────

/** 처리 대기 신청 목록 (승인자용). 처리 권한이 없으면 서버가 빈 페이지를 준다. */
export const useContactRequests = (
  filters: ContactRequestFilters = {},
): UseQueryResult<PaginatedResponse<ContactChangeRequest>, Error> => {
  return useQuery<PaginatedResponse<ContactChangeRequest>, Error>({
    queryKey: KEYS.requests(filters),
    queryFn: async (): Promise<PaginatedResponse<ContactChangeRequest>> => {
      const res: AxiosResponse<PaginatedResponse<ContactChangeRequest>> = await api.get(
        REQUESTS,
        {
          params: {
            status: filters.status ?? "pending",
            ...(filters.request_type ? { request_type: filters.request_type } : {}),
            page: filters.page ?? 1,
            per_page: filters.per_page ?? 20,
          },
        },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
  });
};

/** 내가 낸 신청 목록 — 상태/반려 사유 확인용 (N4). */
export const useMyContactRequests = (
  filters: ContactRequestFilters = {},
): UseQueryResult<PaginatedResponse<ContactChangeRequest>, Error> => {
  return useQuery<PaginatedResponse<ContactChangeRequest>, Error>({
    queryKey: KEYS.myRequests(filters),
    queryFn: async (): Promise<PaginatedResponse<ContactChangeRequest>> => {
      const res: AxiosResponse<PaginatedResponse<ContactChangeRequest>> = await api.get(
        `${REQUESTS}/mine`,
        {
          params: {
            status: filters.status ?? "all",
            page: filters.page ?? 1,
            per_page: filters.per_page ?? 20,
          },
        },
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
  });
};

/** 신청 생성 — `contacts:read` 만 있으면 가능. */
export const useCreateContactRequest = (): UseMutationResult<
  ContactChangeRequest,
  Error,
  ContactRequestCreate
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ContactChangeRequest, Error, ContactRequestCreate>({
    mutationFn: async (data: ContactRequestCreate): Promise<ContactChangeRequest> => {
      const res: AxiosResponse<ContactChangeRequest> = await api.post(REQUESTS, data);
      return res.data;
    },
    onSuccess: (): void => {
      qc.invalidateQueries({ queryKey: ["contact-requests"] });
      success("Request submitted. Someone with edit access will review it.");
    },
    onError: error("Couldn't submit request"),
  });
};

/** 내 신청 취소. */
export const useCancelContactRequest = (): UseMutationResult<
  ContactChangeRequest,
  Error,
  string
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ContactChangeRequest, Error, string>({
    mutationFn: async (requestId: string): Promise<ContactChangeRequest> => {
      const res: AxiosResponse<ContactChangeRequest> = await api.post(
        `${REQUESTS}/${requestId}/cancel`,
      );
      return res.data;
    },
    onSuccess: (): void => {
      qc.invalidateQueries({ queryKey: ["contact-requests"] });
      success("Request cancelled.");
    },
    onError: error("Couldn't cancel request"),
  });
};

/** 신청 승인 — 종류별 쓰기 권한 필요. `payload` 를 주면 수정 후 반영. */
export const useApproveContactRequest = (): UseMutationResult<
  ContactRequestApproveResult,
  Error,
  { requestId: string; data?: ContactRequestApprove }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    ContactRequestApproveResult,
    Error,
    { requestId: string; data?: ContactRequestApprove }
  >({
    mutationFn: async ({ requestId, data }): Promise<ContactRequestApproveResult> => {
      const res: AxiosResponse<ContactRequestApproveResult> = await api.post(
        `${REQUESTS}/${requestId}/approve`,
        data ?? {},
      );
      return res.data;
    },
    onSuccess: (result): void => {
      invalidateContacts(qc, result.contact?.id);
      success("Request approved and applied.");
    },
    onError: error("Couldn't approve request"),
  });
};

/** 신청 반려 — 사유 필수. */
export const useRejectContactRequest = (): UseMutationResult<
  ContactChangeRequest,
  Error,
  { requestId: string; reason: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ContactChangeRequest, Error, { requestId: string; reason: string }>({
    mutationFn: async ({ requestId, reason }): Promise<ContactChangeRequest> => {
      const body: ContactRequestReject = { reason };
      const res: AxiosResponse<ContactChangeRequest> = await api.post(
        `${REQUESTS}/${requestId}/reject`,
        body,
      );
      return res.data;
    },
    onSuccess: (): void => {
      qc.invalidateQueries({ queryKey: ["contact-requests"] });
      success("Request rejected.");
    },
    onError: error("Couldn't reject request"),
  });
};
