import { ChangelogDetailClient } from "@/components/changelog/ChangelogDetailClient";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * 공개 changelog 상세 페이지 — hermesops.site/changelog/{slug}.
 */
export default async function PublicChangelogDetailPage({ params }: PageProps) {
  const { slug } = await params;
  return <ChangelogDetailClient slug={slug} backPath="/changelog" />;
}
