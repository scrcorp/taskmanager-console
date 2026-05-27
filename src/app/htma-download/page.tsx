"use client";

/**
 * /htma-download — 매장 staff 공유용 public 단축 URL.
 *
 * `hermesops.site/htma-download` 진입 → no-auth public endpoint 로 최신 APK URL
 * 가져와서 자동 redirect (다운로드 시작). 로그인 필요 없음.
 * console host (`console.hermesops.site`) 에서는 middleware 가 차단.
 */

import { useEffect } from "react";
import { usePublicAttendanceLatestVersion } from "@/hooks/useAppVersions";

export default function HtmaDownloadPage() {
  const { data, error, isLoading } = usePublicAttendanceLatestVersion();

  useEffect(() => {
    if (data?.download_url) {
      window.location.href = data.download_url;
    }
  }, [data]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
      <div className="text-center">
        {error ? (
          <>
            <h1 className="text-[18px] font-semibold text-[var(--color-text)] mb-2">
              Couldn&apos;t fetch the latest APK
            </h1>
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              Please log in and try again, or contact your administrator.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[18px] font-semibold text-[var(--color-text)] mb-2">
              {isLoading ? "Preparing download..." : "Starting download..."}
            </h1>
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              {data ? `v${data.version}` : "Fetching latest version..."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
