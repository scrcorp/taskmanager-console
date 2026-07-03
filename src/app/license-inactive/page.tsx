"use client";

/**
 * org 접근 차단 화면 — 라이센스 정지 / 본인 밴(access revoked) 등.
 *
 * /me 는 차단돼도 200 으로 current_org_block_reason + organizations 를 준다. 이 화면은 그걸 읽어
 *   - 차단 사유(코드)별 안내
 *   - 현재 org 이름 + 코드
 *   - 접근 가능한 다른 소속 org 로 전환(switch-org)
 *   - 로그인 페이지로
 * 를 보여준다. (dashboard) 그룹 밖 독립 페이지 — org-scoped 호출을 하지 않아 403 루프가 없다.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldOff, ArrowRightLeft } from "lucide-react";
import api from "@/lib/api";
import { clearTokens, setTokens } from "@/lib/auth";
import type { UserMe, OrgMembership } from "@/types";

const REASON_TITLE: Record<string, string> = {
  ORG_LICENSE_INACTIVE: "License inactive",
  ORG_ACCESS_REVOKED: "Access revoked",
};
const REASON_DESC: Record<string, string> = {
  ORG_LICENSE_INACTIVE:
    "This organization's license is currently suspended, so access is temporarily unavailable.",
  ORG_ACCESS_REVOKED:
    "Your access to this organization has been revoked by an administrator.",
};

export default function LicenseInactivePage(): React.ReactElement {
  const router = useRouter();
  const [me, setMe] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    api
      .get("/auth/me")
      .then((r) => {
        const data = r.data as UserMe;
        // 실제로는 차단 아님 → 대시보드로
        if (data.current_org_accessible !== false) {
          window.location.href = "/";
          return;
        }
        setMe(data);
      })
      .catch(() => {
        clearTokens();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const goLogin = () => {
    clearTokens();
    router.push("/login");
  };

  const switchTo = async (orgId: string) => {
    setSwitching(true);
    try {
      const r = await api.post("/auth/switch-org", { organization_id: orgId });
      setTokens(r.data.access_token, r.data.refresh_token);
      window.location.href = "/";
    } catch {
      setSwitching(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const reason = me?.current_org_block_reason ?? "ORG_LICENSE_INACTIVE";
  const title = REASON_TITLE[reason] ?? "Access unavailable";
  const desc = REASON_DESC[reason] ?? "Access is currently unavailable.";
  const others: OrgMembership[] = (me?.organizations ?? []).filter(
    (o) => o.accessible && o.organization_id !== me?.organization_id,
  );

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-2xl p-8 border border-border text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-danger-muted flex items-center justify-center">
              <ShieldOff className="w-9 h-9 text-danger" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-text mb-2">{title}</h1>
          <p className="text-text-secondary text-sm mb-6 leading-relaxed">{desc}</p>

          <div className="rounded-xl border border-border bg-bg/40 p-4 mb-6 text-left">
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-text-muted">Organization</span>
              <span className="text-sm font-semibold text-text">
                {me?.organization_name ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-text-muted">Code</span>
              <span className="text-sm font-mono font-semibold text-text tracking-wider">
                {me?.company_code ?? "—"}
              </span>
            </div>
          </div>

          {others.length > 0 && (
            <div className="mb-6 text-left">
              <div className="text-xs text-text-muted mb-2">Switch to another organization</div>
              <div className="flex flex-col gap-2">
                {others.map((o) => (
                  <button
                    key={o.organization_id}
                    type="button"
                    disabled={switching}
                    onClick={() => switchTo(o.organization_id)}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
                  >
                    <span className="font-semibold">{o.organization_name}</span>
                    <ArrowRightLeft className="w-4 h-4 text-text-secondary" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-text-secondary text-sm mb-6 leading-relaxed">
            For inquiries, please contact{" "}
            <span className="font-semibold text-text">hello@tigersplus.com</span>.
          </p>

          <button
            type="button"
            onClick={goLogin}
            className="w-full py-3 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-light transition-colors"
          >
            Go to login
          </button>
        </div>
      </div>
    </div>
  );
}
