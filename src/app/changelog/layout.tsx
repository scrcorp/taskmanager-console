import Link from "next/link";

/**
 * 공개 changelog 셸 — hermesops.site/changelog 의 전체 폭 다크-토큰 레이아웃.
 *
 * (public) 그룹의 signup 폰-프레임 레이아웃을 상속하지 않도록 최상위 세그먼트에
 * 별도 배치한다. 루트 레이아웃의 Providers(React Query 등)는 그대로 적용된다.
 */
export default function ChangelogPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-bg text-text">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-5">
          <img
            src="/taskmanager_icon.png"
            alt=""
            className="h-7 w-7"
          />
          <Link href="/changelog" className="text-lg font-extrabold text-text">
            HTM
          </Link>
          <span className="text-text-muted">/</span>
          <span className="text-lg font-semibold text-text-secondary">
            What&apos;s New
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
