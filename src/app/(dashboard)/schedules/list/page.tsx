"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Legacy list page — Overview 페이지의 List 뷰로 리다이렉트.
 */
export default function ScheduleListRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/schedules");
  }, [router]);
  return null;
}
