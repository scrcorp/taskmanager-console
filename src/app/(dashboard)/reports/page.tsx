"use client";

/**
 * 통합 Reports 페이지 — Daily / Issue 탭으로 모든 report 타입 한 곳에서.
 *
 * 탭은 URL `?type=daily|issue` 와 동기화되어 깊은 링크 가능.
 * 각 탭 내용은 view 컴포넌트로 분리되어 있어 legacy `/daily-reports`,
 * `/reports/issues` 라우트와 동일한 코드를 공유한다.
 */

import React, { Suspense, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, FileText, Plus, Settings } from "lucide-react";

import { Button } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { DailyReportsListView } from "@/components/reports/DailyReportsListView";
import { IssueReportsListView } from "@/components/reports/IssueReportsListView";

type ReportTab = "daily" | "issue";

const TABS: { value: ReportTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "daily", label: "Daily", icon: FileText },
  { value: "issue", label: "Issue", icon: AlertTriangle },
];

function ReportsPageBody(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();

  const rawType = searchParams.get("type");
  const activeTab: ReportTab = rawType === "issue" ? "issue" : "daily";

  // URL에 type이 명시 안 됐으면 ?type=daily 로 즉시 명시 (deep link / 북마크 일관성)
  useEffect(() => {
    if (rawType !== "daily" && rawType !== "issue") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("type", "daily");
      router.replace(`/reports?${params.toString()}`, { scroll: false });
    }
  }, [rawType, router, searchParams]);

  const setTab = useCallback(
    (next: ReportTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("type", next);
      router.replace(`/reports?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const canCreateIssue = hasPermission(PERMISSIONS.REPORTS_CREATE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-text">Reports</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {activeTab === "daily"
              ? "Daily summaries submitted by store staff."
              : "Operational issues raised from stores. Track, comment, and resolve."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => router.push(`/reports/templates?type=${activeTab}`)}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            Manage templates
          </Button>
          {activeTab === "issue" && canCreateIssue && (
            <Button
              onClick={() => router.push("/reports/issues/new")}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Report an issue
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Report type"
        className="flex items-center gap-1 border-b border-border"
      >
        {TABS.map((t) => {
          const active = activeTab === t.value;
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — 헤더는 통합 페이지가 가지므로 view 헤더는 끈다 */}
      <div role="tabpanel">
        {activeTab === "daily" ? (
          <DailyReportsListView showHeader={false} filterKey="reports-daily" />
        ) : (
          <IssueReportsListView showHeader={false} />
        )}
      </div>
    </div>
  );
}

export default function ReportsPage(): React.ReactElement {
  return (
    <Suspense>
      <ReportsPageBody />
    </Suspense>
  );
}
