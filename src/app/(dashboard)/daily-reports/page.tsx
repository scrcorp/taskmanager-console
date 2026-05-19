"use client";

/**
 * Legacy route — `/daily-reports`.
 *
 * 통합 `/reports?type=daily` 와 동등.
 */

import { DailyReportsListView } from "@/components/reports/DailyReportsListView";

export default function DailyReportsPage(): React.ReactElement {
  return <DailyReportsListView showHeader />;
}
