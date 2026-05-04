/**
 * Mutation result feedback — 사용자 행동 결과를 모달로 명확히 인지시키는 헬퍼.
 *
 * ============================================================
 *  TOAST vs MODAL — 시스템 전반 정책 (반드시 따를 것)
 * ============================================================
 *
 * MODAL (ResultModal/AppModal) — 자동 dismiss 안 됨, 사용자가 OK 눌러야 닫힘:
 *   - 사용자가 명시적으로 트리거한 mutation 결과 (생성/수정/삭제/확정/취소/제출 등)
 *   - 폼 제출 결과 (입력값 손실 위험 있는 흐름)
 *   - 권한/인증/세션 만료 오류
 *   - 네트워크/서버 오류 (사용자가 재시도해야 하는 경우)
 *   - bulk 작업 결과 (특히 부분 실패 — details 표시)
 *   - 영구 변경 / 데이터 손실 / 결제 / 송신 / 게시
 *   - 회원가입/로그인 결과
 *
 * TOAST — 자동 사라짐, 가벼운 정보용:
 *   - 비명시적 자동 동작 결과 (auto-save, 백그라운드 sync 결과)
 *   - 임시 상태 변경 (예: "Copied to clipboard", "Sort applied")
 *   - 광학적 reorder 등 즉시 시각 피드백 동반된 micro 작업
 *
 * 사용:
 *   const { success, error } = useMutationResult();
 *   useMutation({
 *     mutationFn,
 *     onSuccess: () => success("Schedule created."),
 *     onError: error("Couldn't create schedule"),
 *   });
 */

import { useResultModal } from "@/components/ui/ResultModal";
import { parseApiError } from "@/lib/utils";

export function useMutationResult() {
  const { showSuccess, showError } = useResultModal();
  return {
    /** 성공 모달 — message 는 "Schedule created." 같은 문장형 */
    success: (message: string, options?: { title?: string; details?: string[] }) => {
      showSuccess(message, options);
    },
    /** 에러 모달 — action 은 "Couldn't create schedule" 같은 문장형 */
    error: (action: string) => (err: unknown) => {
      const detail = parseApiError(err, "Unexpected error");
      showError(detail, { title: action });
    },
    /** raw — 이미 가공한 메시지로 모달 직접 띄우기 */
    rawError: (message: string, options?: { title?: string; details?: string[] }) => {
      showError(message, options);
    },
  };
}
