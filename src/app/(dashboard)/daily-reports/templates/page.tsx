"use client";

/**
 * Legacy route — `/daily-reports/templates`.
 *
 * 통합 `/reports/templates?type=daily` 와 동등. View 컴포넌트는
 * `@/components/reports/DailyReportTemplatesView` 에 있다.
 */

import { DailyReportTemplatesView } from "@/components/reports/DailyReportTemplatesView";

export default function DailyReportTemplatesPage(): React.ReactElement {
  return <DailyReportTemplatesView showHeader />;
}
