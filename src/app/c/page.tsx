import { CompactDayView } from "@/components/compact/CompactDayView";

/**
 * `/c` — 스케줄(계획) + 근태(실제) 통합 Day 화면.
 *
 * 예전엔 여기서 첫 탭으로 리다이렉트했는데, 탭 구조를 없애면서 이 경로가 본체가 됐다.
 */
export default function CompactHomePage() {
  return <CompactDayView />;
}
