import { ChangelogDetailClient } from "@/components/changelog/ChangelogDetailClient";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * 대시보드 "What's New" 상세 — console.hermesops.site/whats-new/{slug}.
 */
export default async function DashboardWhatsNewDetailPage({
  params,
}: PageProps) {
  const { slug } = await params;
  return <ChangelogDetailClient slug={slug} backPath="/whats-new" />;
}
