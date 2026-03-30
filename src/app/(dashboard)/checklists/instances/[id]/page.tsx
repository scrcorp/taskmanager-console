"use client";

/**
 * 체크리스트 인스턴스 상세 페이지.
 *
 * Removes the old redirect to /checklists.
 * Renders ChecklistInstanceDetail with a back button → /checklists/progress.
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useChecklistInstance } from "@/hooks/useChecklistInstances";
import { ChecklistInstanceDetail } from "@/components/checklists/ChecklistInstanceDetail";

export default function ChecklistInstanceDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : undefined;

  const { data: instance, isLoading, error, refetch } = useChecklistInstance(id);

  return (
    <div className="flex flex-col gap-4">
      {/* 뒤로 가기 버튼 */}
      <button
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors w-fit cursor-pointer bg-transparent border-none p-0"
        onClick={() => router.push("/checklists/progress")}
      >
        <ArrowLeft size={16} />
        Back to Progress & Review
      </button>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">
          Loading…
        </div>
      )}

      {/* 에러 상태 */}
      {error && !isLoading && (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">
          <div className="text-sm font-semibold text-text-secondary">Failed to load checklist</div>
          <div className="text-xs mt-1">{error.message}</div>
        </div>
      )}

      {/* 인스턴스 상세 */}
      {instance && !isLoading && (
        <ChecklistInstanceDetail
          instance={instance}
          onRefetch={() => refetch()}
        />
      )}
    </div>
  );
}
