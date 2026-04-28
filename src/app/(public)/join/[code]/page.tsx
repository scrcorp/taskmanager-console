import { SignupFlow } from "@/components/signup/SignupFlow";

interface PageProps {
  params: Promise<{ code: string }>;
}

/**
 * 공개 가입 페이지 — /join/{encoded}.
 * encoded는 store.id (UUID)의 base64url 인코딩.
 */
export default async function JoinByCodePage({ params }: PageProps) {
  const { code } = await params;
  return <SignupFlow encoded={code} />;
}
