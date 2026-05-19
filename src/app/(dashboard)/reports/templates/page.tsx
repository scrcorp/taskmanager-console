"use client";

/**
 * 통합 Report Templates 페이지 — Daily / Issue 탭.
 *
 * `?type=daily|issue` 와 동기화. 각 탭은 기존 templates page 를 그대로 렌더해
 * cross-link (`/reports?type=daily` ↔ `/reports/templates?type=daily`) 와 함께
 * 한 곳에서 모든 템플릿을 관리할 수 있게 한다.
 */

import React, { Suspense, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, FileText, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DailyReportTemplatesView } from "@/components/reports/DailyReportTemplatesView";
import { IssueTemplatesView } from "@/components/reports/IssueTemplatesView";

type TemplateTab = "daily" | "issue";

const TABS: {
  value: TemplateTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "daily", label: "Daily", icon: FileText },
  { value: "issue", label: "Issue", icon: AlertTriangle },
];

function ReportTemplatesPageBody(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawType = searchParams.get("type");
  const activeTab: TemplateTab = rawType === "issue" ? "issue" : "daily";

  // URL에 type 명시 안 됐으면 ?type=daily 로 즉시 명시
  useEffect(() => {
    if (rawType !== "daily" && rawType !== "issue") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("type", "daily");
      router.replace(`/reports/templates?${params.toString()}`, { scroll: false });
    }
  }, [rawType, router, searchParams]);

  const setTab = useCallback(
    (next: TemplateTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("type", next);
      router.replace(`/reports/templates?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const goToReports = () => router.push(`/reports?type=${activeTab}`);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-text">Report Templates</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Customize form templates for each report type.
          </p>
        </div>
        <Button variant="ghost" onClick={goToReports} className="gap-2">
          <ExternalLink className="w-4 h-4" />
          View reports
        </Button>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Template type"
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

      {/* Tab content — 기존 template page를 그대로 렌더. showHeader=false 로 자체 헤더는 숨기고 액션 버튼만 노출. */}
      <div role="tabpanel">
        {activeTab === "daily" ? (
          <DailyReportTemplatesView showHeader={false} />
        ) : (
          <IssueTemplatesView showHeader={false} />
        )}
      </div>
    </div>
  );
}

export default function ReportTemplatesPage(): React.ReactElement {
  return (
    <Suspense>
      <ReportTemplatesPageBody />
    </Suspense>
  );
}
