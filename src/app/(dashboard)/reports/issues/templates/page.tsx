"use client";

/**
 * Legacy route — `/reports/issues/templates`.
 *
 * 통합 `/reports/templates?type=issue` 와 동등. View 컴포넌트는
 * `@/components/reports/IssueTemplatesView` 에 있다.
 */

import { IssueTemplatesView } from "@/components/reports/IssueTemplatesView";

export default function IssueTemplatesPage(): React.ReactElement {
  return <IssueTemplatesView showHeader />;
}
