"use client";

/**
 * /schedules/log → /checklists/log 로 redirect.
 * Log 페이지가 체크리스트 섹션으로 이동됨.
 */

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ScheduleLogRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams.toString();
    router.replace(`/checklists/log${params ? `?${params}` : ""}`);
  }, [router, searchParams]);

  return null;
}
