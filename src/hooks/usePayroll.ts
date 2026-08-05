/**
 * Payroll React Query hooks — periods / preview / confirm / entries /
 * export / pay stub / events (Payroll v1 콘솔).
 *
 * 계약: server app/api/console/payroll.py + app/schemas/payroll.py.
 * collection 엔드포인트(periods/, events/)는 trailing slash 필수
 * (prod 307 redirect → CORS 붕괴 방지 — 프로젝트 규칙).
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import { parseApiError } from "@/lib/utils";
import {
  PAYROLL_ERROR_CODES,
  type ConfirmGateFailure,
  type EventAttribution,
  type PayPeriod,
  type PayrollEvent,
  type PayStubMeta,
  type PeriodConfirmResponse,
  type PeriodEntriesResponse,
  type PeriodPreviewResponse,
} from "@/types/payroll";

// ── 에러 파싱 헬퍼 (confirm 409 구조화 detail) ──────────────────────────

function errorDetail(err: unknown): Record<string, unknown> | null {
  const detail = (err as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    return detail as Record<string, unknown>;
  }
  return null;
}

/** 서버 구조화 에러 코드 (detail.code) 추출. */
export function getPayrollErrorCode(err: unknown): string | undefined {
  const code = errorDetail(err)?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * confirm 409 의 게이트 실패 목록 추출.
 * null = 게이트 실패 에러가 아님 (다른 에러 → 일반 에러 처리).
 */
export function getConfirmGateFailures(
  err: unknown,
): ConfirmGateFailure[] | null {
  const detail = errorDetail(err);
  if (!detail || detail.code !== PAYROLL_ERROR_CODES.CLOSE_GATES_FAILED) {
    return null;
  }
  const gates = detail.gates;
  return Array.isArray(gates) ? (gates as ConfirmGateFailure[]) : [];
}

function errStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/** 4xx 는 재시도 무의미 (권한/충돌/검증) — 그 외만 2회까지. */
function retryNon4xx(failureCount: number, err: Error): boolean {
  const status = errStatus(err);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

// ── Periods ────────────────────────────────────────────────────────────

/** 기간 목록 조회 범위 (일) — 약 12개 반월 기간. 서버가 지난 기간을 auto-ensure. */
const PERIOD_RANGE_DAYS = 180;

function rangeStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - PERIOD_RANGE_DAYS);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 매장의 pay period 목록 — 최근 ~6개월. end 는 서버가 store-tz 오늘로 기본 처리.
 * 응답은 start_date 오름차순 보장 위해 클라이언트에서 정렬.
 *
 * 매장 전환 시 직전 목록을 placeholder 로 유지 — 헤더의 기간 네비가 사라졌다
 * 나타나며 페이지가 리셋된 것처럼 보이는 것을 막는다 (호출 측은
 * isPlaceholderData 로 본문만 로딩 처리).
 */
export function usePayPeriods(
  storeId: string | null,
): UseQueryResult<PayPeriod[], Error> {
  return useQuery<PayPeriod[], Error>({
    queryKey: ["payroll", "periods", storeId],
    enabled: !!storeId,
    retry: retryNon4xx,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PayPeriod[]> => {
      const resp: AxiosResponse<PayPeriod[]> = await api.get(
        "/console/payroll/periods/",
        { params: { store_id: storeId, start: rangeStart() } },
      );
      return [...resp.data].sort((a, b) =>
        a.start_date.localeCompare(b.start_date),
      );
    },
  });
}

/**
 * open 기간 미리보기 — 직원별 계산 행 + validation 요약. confirmed 면 409.
 *
 * 게이트 이슈는 근태/시급 화면(새 탭)에서 고치고 돌아오는 동선이라, 창 포커스가
 * 돌아오면 stale 여부와 무관하게 다시 계산한다 — 고친 항목이 목록에 남아 있으면
 * 안 되기 때문.
 */
export function usePayrollPreview(
  periodId: string | null,
): UseQueryResult<PeriodPreviewResponse, Error> {
  return useQuery<PeriodPreviewResponse, Error>({
    queryKey: ["payroll", "preview", periodId],
    enabled: !!periodId,
    retry: retryNon4xx,
    refetchOnWindowFocus: "always",
    queryFn: async (): Promise<PeriodPreviewResponse> => {
      const resp: AxiosResponse<PeriodPreviewResponse> = await api.get(
        `/console/payroll/periods/${periodId}/preview`,
      );
      return resp.data;
    },
  });
}

/** confirmed 기간의 동결 entries (confirm 전이면 빈 목록). */
export function usePayPeriodEntries(
  periodId: string | null,
): UseQueryResult<PeriodEntriesResponse, Error> {
  return useQuery<PeriodEntriesResponse, Error>({
    queryKey: ["payroll", "entries", periodId],
    enabled: !!periodId,
    retry: retryNon4xx,
    queryFn: async (): Promise<PeriodEntriesResponse> => {
      const resp: AxiosResponse<PeriodEntriesResponse> = await api.get(
        `/console/payroll/periods/${periodId}/entries`,
      );
      return resp.data;
    },
  });
}

/**
 * 기간 확정 (동결). 409 게이트 실패는 호출 측(GateChecklist)이 구조화
 * 렌더하므로 여기서 모달을 띄우지 않는다 — getConfirmGateFailures 로 추출.
 */
export function useConfirmPayPeriod(): UseMutationResult<
  PeriodConfirmResponse,
  Error,
  { periodId: string }
> {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<PeriodConfirmResponse, Error, { periodId: string }>({
    mutationFn: async ({ periodId }): Promise<PeriodConfirmResponse> => {
      const resp: AxiosResponse<PeriodConfirmResponse> = await api.post(
        `/console/payroll/periods/${periodId}/confirm`,
      );
      return resp.data;
    },
    onSuccess: (data): void => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      success(
        `Pay period confirmed. ${data.entries.length} entr${data.entries.length === 1 ? "y" : "ies"} frozen.`,
      );
    },
    onError: (err): void => {
      // 게이트 실패(409)는 페이지가 체크리스트 카드에 인라인 렌더 — 모달 생략.
      if (getConfirmGateFailures(err) !== null) return;
      if (getPayrollErrorCode(err) === PAYROLL_ERROR_CODES.ALREADY_CONFIRMED) {
        // 다른 세션이 먼저 확정 — 목록/상태 새로고침으로 동결 뷰 전환.
        qc.invalidateQueries({ queryKey: ["payroll"] });
      }
      error("Couldn't confirm the pay period")(err);
    },
  });
}

// ── 파일 다운로드 (xlsx export / pay stub PDF) ─────────────────────────

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** blob 응답 에러 → 메시지 (에러 바디가 Blob 이라 JSON 을 직접 읽어야 함). */
async function blobErrorMessage(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { detail?: unknown };
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        return parsed.detail;
      }
      if (parsed.detail && typeof parsed.detail === "object") {
        const m = (parsed.detail as { message?: unknown }).message;
        if (typeof m === "string" && m.trim()) return m;
      }
    } catch {
      // blob 이 JSON 이 아니면 fallback 경로로
    }
  }
  return parseApiError(err, fallback);
}

/**
 * 기간 xlsx export 다운로드 (payroll:export).
 * 확정 기간은 동결본, open 기간은 draft (서버가 배너 행 + payroll_draft_… 파일명을
 * 내려준다) — 파일명은 Content-Disposition 을 그대로 따른다.
 */
export function useExportPeriod(): UseMutationResult<
  void,
  Error,
  { periodId: string }
> {
  const { rawError } = useMutationResult();
  return useMutation<void, Error, { periodId: string }>({
    mutationFn: async ({ periodId }): Promise<void> => {
      const resp = await api.get(`/console/payroll/periods/${periodId}/export`, {
        responseType: "blob",
      });
      const dispo = (resp.headers as Record<string, unknown>)[
        "content-disposition"
      ];
      const filename =
        (typeof dispo === "string"
          ? /filename="?([^";]+)"?/.exec(dispo)?.[1]
          : undefined) ?? "payroll_export.xlsx";
      triggerBlobDownload(
        new Blob([resp.data as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename,
      );
    },
    onError: (err): void => {
      void blobErrorMessage(
        err,
        "The export could not be generated. Try again after reloading.",
      ).then((msg) => rawError(msg, { title: "Couldn't download the export" }));
    },
  });
}

/**
 * pay stub 대상.
 * - entry: 확정 기간의 동결 entry (정식 명세서)
 * - draft: 미확정 기간의 직원 1명 (서버가 DRAFT 배너 + _DRAFT 파일명으로 생성)
 */
export type PayStubTarget =
  | { kind: "entry"; entryId: string }
  | { kind: "draft"; periodId: string; userId: string };

function stubPath(target: PayStubTarget): string {
  return target.kind === "entry"
    ? `/console/payroll/entries/${target.entryId}/stub`
    : `/console/payroll/periods/${target.periodId}/users/${target.userId}/stub`;
}

/** stub 생성(멱등) → PDF blob + 정식 파일명. 미리보기/다운로드 공용 경로. */
async function fetchPayStub(
  target: PayStubTarget,
): Promise<{ blob: Blob; filename: string }> {
  const path = stubPath(target);
  const gen: AxiosResponse<PayStubMeta> = await api.post(path);
  const resp = await api.get(path, { responseType: "blob" });
  return {
    blob: new Blob([resp.data as BlobPart], { type: "application/pdf" }),
    filename: gen.data.filename || "pay_stub.pdf",
  };
}

/** pay stub 생성(멱등) 후 PDF 다운로드 (서버가 준 파일명 그대로). */
export function useDownloadPayStub(): UseMutationResult<
  void,
  Error,
  PayStubTarget
> {
  const { rawError } = useMutationResult();
  return useMutation<void, Error, PayStubTarget>({
    mutationFn: async (target): Promise<void> => {
      const { blob, filename } = await fetchPayStub(target);
      triggerBlobDownload(blob, filename);
    },
    onError: (err): void => {
      void blobErrorMessage(
        err,
        "The pay stub could not be generated. Try again after reloading.",
      ).then((msg) => rawError(msg, { title: "Couldn't download the pay stub" }));
    },
  });
}

/**
 * 미리보기용 pay stub — PDF blob URL 을 만들어 돌려준다.
 * 다운로드 URL 을 직접 열 수 없어서(Authorization 헤더가 필요) blob 을 받아
 * object URL 로 새 탭에 띄운다. 탭 열기는 팝업 차단 때문에 호출 측이 클릭
 * 시점에 동기로 하고, 여기서는 URL 만 만든다.
 */
export function usePayStubPreview(): UseMutationResult<
  { url: string; filename: string },
  Error,
  PayStubTarget
> {
  const { rawError } = useMutationResult();
  return useMutation<{ url: string; filename: string }, Error, PayStubTarget>({
    mutationFn: async (target) => {
      const { blob, filename } = await fetchPayStub(target);
      return { url: URL.createObjectURL(blob), filename };
    },
    onError: (err): void => {
      void blobErrorMessage(
        err,
        "The pay stub could not be generated. Try again after reloading.",
      ).then((msg) => rawError(msg, { title: "Couldn't open the pay stub" }));
    },
  });
}

// ── Events (귀책 태깅 — 금액 없는 운영 페이로드) ────────────────────────

/** store + 기간의 payroll 이벤트 목록. 조회 권한: schedules:update (서버). */
export function usePayrollEvents(
  storeId: string | null,
  start: string | null,
  end: string | null,
): UseQueryResult<PayrollEvent[], Error> {
  return useQuery<PayrollEvent[], Error>({
    queryKey: ["payroll", "events", storeId, start, end],
    enabled: !!storeId && !!start && !!end,
    retry: retryNon4xx,
    queryFn: async (): Promise<PayrollEvent[]> => {
      const resp: AxiosResponse<PayrollEvent[]> = await api.get(
        "/console/payroll/events/",
        { params: { store_id: storeId, start, end } },
      );
      return resp.data;
    },
  });
}

/**
 * 이벤트 귀책 태그 (staff | management). 드롭다운 즉시 반영이 시각 피드백이라
 * 성공은 토스트 급 — 캐시 직접 갱신으로 조용히 반영, 실패만 모달.
 */
export function useTagPayrollEvent(): UseMutationResult<
  PayrollEvent,
  Error,
  { eventId: string; attribution: EventAttribution }
> {
  const qc = useQueryClient();
  const { error } = useMutationResult();
  return useMutation<
    PayrollEvent,
    Error,
    { eventId: string; attribution: EventAttribution }
  >({
    mutationFn: async ({ eventId, attribution }): Promise<PayrollEvent> => {
      const resp: AxiosResponse<PayrollEvent> = await api.post(
        `/console/payroll/events/${eventId}/tag`,
        { attribution },
      );
      return resp.data;
    },
    onSuccess: (updated): void => {
      qc.setQueriesData<PayrollEvent[]>(
        { queryKey: ["payroll", "events"] },
        (old) => old?.map((e) => (e.id === updated.id ? updated : e)),
      );
    },
    onError: error("Couldn't tag the event"),
  });
}
