/**
 * Mutation result feedback — 사용자 행동 결과를 모달로 명확히 인지시키는 헬퍼.
 *
 * 내부 구현: imperative-modal 시스템 (useModal.alert) 위에 얹혀 동작.
 * 호출 측 (hook) 시그니처는 그대로 유지 — useMutationResult().success / .error.
 *
 * ============================================================
 *  TOAST vs MODAL — 시스템 전반 정책 (반드시 따를 것)
 * ============================================================
 *
 * MODAL (useModal.alert) — 자동 dismiss 안 됨, 사용자가 OK 눌러야 닫힘:
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

import { useModal } from "@/components/ui/imperative-modal";
import { describeApiError } from "@/lib/errorDisplay";

export function useMutationResult() {
  const modal = useModal();
  return {
    /** 성공 모달 — message 는 "Schedule created." 같은 문장형 */
    success: (message: string, options?: { title?: string; details?: string[] }) => {
      void modal.alert({
        type: "success",
        title: options?.title,
        message,
        details: options?.details,
      });
    },
    /**
     * 에러 모달 — action 은 "Couldn't create schedule" 같은 문장형.
     *
     * 표시기(`describeApiError`)를 거치므로 **500·미지 코드에서 `CODE · trace_id` 한 줄이
     * 자동으로 붙는다.** 이 경로가 콘솔 에러 표시의 대부분이라, 여기 한 곳만 바꿔도
     * "원인을 알 수 없는 실패"에 신고 단서가 생긴다.
     *
     * 배치는 모달로 고정한다 — 이 헬퍼의 계약이 원래 모달이고, 배치를 여기서 바꾸면
     * 48개 호출처의 UX 가 한꺼번에 달라진다. 배치를 쓰려는 화면은 `describeApiError` 를
     * 직접 호출해 `placement` 를 읽으면 된다.
     */
    error: (action: string) => (err: unknown) => {
      const display = describeApiError(err, {
        context: "action",
        fallback: "Unexpected error",
        placement: "toast",
      });
      void modal.alert({
        type: "error",
        title: action,
        message: display.message,
        details: display.hint ? [display.hint] : undefined,
        reference: display.reference ?? undefined,
      });
    },
    /** raw — 이미 가공한 메시지로 모달 직접 띄우기 */
    rawError: (message: string, options?: { title?: string; details?: string[] }) => {
      void modal.alert({
        type: "error",
        title: options?.title,
        message,
        details: options?.details,
      });
    },
  };
}
