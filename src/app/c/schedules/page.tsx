import { redirect } from "next/navigation";
import { COMPACT_BASE_PATH } from "@/lib/compact";

/**
 * 옛 스케줄 탭 경로 — 통합 화면으로 보낸다.
 * 북마크/공유 링크가 죽지 않도록 남겨둔 리다이렉트다. 서버에서 바로 넘긴다
 * (클라이언트 리다이렉트는 헤더 매장 선택기의 URL 동기화와 경합한다).
 */
export default function CompactSchedulesRedirect() {
  redirect(COMPACT_BASE_PATH);
}
