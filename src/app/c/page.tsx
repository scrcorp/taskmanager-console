import { redirect } from "next/navigation";
import { COMPACT_TABS } from "@/components/compact/tabs";

/**
 * `/c` → 첫 탭으로. 서버에서 바로 넘긴다.
 *
 * 클라이언트 리다이렉트로 하면 헤더 매장 선택기의 URL 동기화(router.replace)와 경합해서
 * `/c` 에 갇힌다. 권한이 없는 경우는 레이아웃의 Forbidden 화면이 받고, 하단 탭바로 이동하면 된다.
 */
export default function CompactHomePage() {
  redirect(COMPACT_TABS[0].href);
}
