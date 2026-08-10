import { redirect } from "next/navigation";
import { COMPACT_BASE_PATH } from "@/lib/compact";

/** 옛 근태 탭 경로 — 통합 화면으로 보낸다. */
export default function CompactAttendancesRedirect() {
  redirect(COMPACT_BASE_PATH);
}
