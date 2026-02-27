"use client";

/**
 * 체크리스트 인스턴스 상세 페이지 -- 인스턴스의 전체 항목, 완료 상태, 리뷰를 표시합니다.
 *
 * Checklist instance detail page showing full item list with completion data
 * and per-item review controls.
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useChecklistInstance } from "@/hooks/useChecklistInstances";
import { Button, LoadingSpinner, EmptyState } from "@/components/ui";
import { ChecklistInstanceDetail } from "@/components/checklists/ChecklistInstanceDetail";

export default function ChecklistInstanceDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();

  const instanceId: string = params.id as string;
  const { data: instance, isLoading } = useChecklistInstance(instanceId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft size={16} />
          Back
        </Button>
        <EmptyState message="Checklist instance not found." />
      </div>
    );
  }

  return (
    <div>
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => router.back()}
      >
        <ChevronLeft size={16} />
        Back to Checklist Instances
      </Button>

      <ChecklistInstanceDetail instance={instance} />
    </div>
  );
}
