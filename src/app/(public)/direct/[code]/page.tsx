import { DirectSignupFlow } from "@/components/signup/DirectSignupFlow";

interface PageProps {
  params: Promise<{ code: string }>;
}

/**
 * Direct staff 가입 페이지 — /direct/{encoded}.
 *
 * 매니저가 신뢰하는 직원에게 별도로 공유하는 링크.
 * 폼/지원자 단계 없이 바로 staff 계정이 생성된다 (지원자 인박스 안 거침).
 */
export default async function DirectByCodePage({ params }: PageProps) {
  const { code } = await params;
  return <DirectSignupFlow encoded={code} />;
}
