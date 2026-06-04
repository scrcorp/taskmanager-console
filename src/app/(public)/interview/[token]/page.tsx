import { InterviewSchedulePage } from "@/components/interview/InterviewSchedulePage";

interface PageProps {
  params: Promise<{ token: string }>;
}

/** 공개 인터뷰 시간 선택 페이지 — /interview/{token} (이메일 토큰 링크, 로그인 없음). */
export default async function InterviewTokenPage({ params }: PageProps) {
  const { token } = await params;
  return <InterviewSchedulePage token={token} />;
}
