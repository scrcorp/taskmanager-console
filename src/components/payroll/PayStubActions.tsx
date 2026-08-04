"use client";

import { Download, FileText } from "lucide-react";
import { useModal } from "@/components/ui/imperative-modal";
import {
  useDownloadPayStub,
  usePayStubPreview,
  type PayStubTarget,
} from "@/hooks/usePayroll";

/** 미리보기 blob URL 유지 시간 — 그 뒤 해제(메모리 회수). */
const STUB_URL_TTL_MS = 10 * 60 * 1000;

interface Props {
  target: PayStubTarget;
  /** 다운로드 버튼 aria-label 에 쓸 직원 이름 */
  memberName: string;
}

/**
 * 직원 행의 pay stub 액션 — [미리보기] + [다운로드 아이콘].
 * 확정 기간의 동결 entry 와 미확정 기간의 draft 를 같은 UI 로 다룬다
 * (draft 는 서버가 DRAFT 배너 + _DRAFT 파일명으로 내려준다).
 *
 * 행마다 자기 mutation 을 들고 있어 진행 표시가 그 행에만 걸린다.
 */
export function PayStubActions({ target, memberName }: Props) {
  const previewMut = usePayStubPreview();
  const downloadMut = useDownloadPayStub();
  const modal = useModal();

  const isDraft = target.kind === "draft";
  const label = isDraft ? "Draft stub" : "Pay stub";

  /**
   * 새 탭 미리보기 — 탭은 클릭 시점에 동기로 열어야 팝업 차단에 안 걸린다.
   * blob URL 은 잠시 뒤 해제한다 (그 전까지는 탭 새로고침 가능).
   */
  const onPreview = async (): Promise<void> => {
    const win = window.open("", "_blank");
    try {
      const { url } = await previewMut.mutateAsync(target);
      if (win) {
        win.location.href = url;
      } else {
        void modal.alert({
          type: "error",
          message:
            "The preview tab was blocked by your browser. Allow pop-ups for " +
            "this site, or use the download button instead.",
        });
      }
      window.setTimeout(() => URL.revokeObjectURL(url), STUB_URL_TTL_MS);
    } catch {
      // 생성 실패 — hook 이 에러 모달을 띄운다. 빈 탭은 닫아준다.
      win?.close();
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => void onPreview()}
        disabled={previewMut.isPending}
        title={
          isDraft
            ? "Preview a draft pay stub (not final until the period is confirmed)"
            : "Preview the pay stub"
        }
        className="flex items-center gap-1 rounded-lg border border-[#E2E4EA] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#6C5CE7] hover:border-[#CBD2DA] hover:bg-[#F5F6FA] disabled:opacity-50"
      >
        <FileText size={12} />
        {previewMut.isPending ? "Opening..." : label}
      </button>
      <button
        type="button"
        onClick={() => downloadMut.mutate(target)}
        disabled={downloadMut.isPending}
        aria-label={`Download ${label.toLowerCase()} for ${memberName}`}
        title="Download PDF"
        className="rounded-lg border border-[#E2E4EA] p-1.5 text-[#64748B] hover:border-[#CBD2DA] hover:bg-[#F5F6FA] hover:text-[#1A1D27] disabled:opacity-50"
      >
        <Download size={13} />
      </button>
    </div>
  );
}
