"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ApplicantDetailDrawer } from "@/components/hiring/ApplicantDetailDrawer";
import { useApplicationDetail } from "@/hooks/useHiring";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * 지원자 상세 페이지 — drawer를 풀페이지로 띄움.
 * 새 탭으로 열거나 URL로 직접 접근 가능.
 */
export default function ApplicationDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  // detail로 store_id 알아내기
  const { data } = useApplicationDetail(id);

  if (!data) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center text-[13px] text-[#94A3B8]">
        Loading…
      </div>
    );
  }

  return (
    <ApplicantDetailDrawer
      storeId={data.store_id}
      applicationId={id}
      onClose={() => {
        if (window.history.length > 1) router.back();
        else router.push("/hiring");
      }}
      fullPage
    />
  );
}
