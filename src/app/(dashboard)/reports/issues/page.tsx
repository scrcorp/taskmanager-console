"use client";

/**
 * Legacy route — `/reports/issues`.
 *
 * 통합 `/reports?type=issue` 와 동등. 헤더 포함 standalone 뷰 사용.
 */

import { IssueReportsListView } from "@/components/reports/IssueReportsListView";

export default function IssuesPage(): React.ReactElement {
  return <IssueReportsListView showHeader />;
}
