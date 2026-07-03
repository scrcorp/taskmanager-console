"use client";

/**
 * 라이센스 비활성 화면 — org 라이센스가 정지/만료된 경우.
 *
 * api 인터셉터가 서버의 403 { detail: { code: "ORG_LICENSE_INACTIVE" } } 를 감지하면
 * 이 페이지로 하드 리다이렉트한다(무한 로딩 대신 명확한 안내). (dashboard) 그룹 밖의
 * 독립 페이지라 인증 월/사이드바 없이 렌더된다.
 */

import { useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { clearTokens } from "@/lib/auth";

export default function LicenseInactivePage(): React.ReactElement {
  const router = useRouter();

  const goLogin = () => {
    clearTokens();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-2xl p-8 border border-border text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-danger-muted flex items-center justify-center">
              <ShieldOff className="w-9 h-9 text-danger" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-text mb-2">
            Organization license inactive
          </h1>
          <p className="text-text-secondary text-sm mb-8 leading-relaxed">
            This organization&apos;s license is currently suspended, so access is
            temporarily unavailable.
            <br />
            Please contact the platform administrator to restore access.
          </p>
          <button
            type="button"
            onClick={goLogin}
            className="w-full py-3 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-light transition-colors mb-3"
          >
            Go to login
          </button>
          <a
            href="mailto:support@hermesops.site"
            className="block text-sm text-text-secondary hover:text-text underline"
          >
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}
