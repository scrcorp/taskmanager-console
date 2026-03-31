"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WorkRolesPanel } from "@/components/schedules/WorkRolesPanel";
import { useStore } from "@/hooks/useStores";
import { useWorkRoles } from "@/hooks/useWorkRoles";

export default function WorkRolesPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.id as string;

  const { data: store } = useStore(storeId);
  const { data: workRoles } = useWorkRoles(storeId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push(`/stores/${storeId}?tab=work-roles`)}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold text-text">Work Roles</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {store?.name ?? "Store"} · {(workRoles ?? []).length} roles
          </p>
        </div>
      </div>

      <WorkRolesPanel storeId={storeId} />
    </div>
  );
}
