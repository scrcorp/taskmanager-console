"use client";

/**
 * Contacts — 조직 전화번호부.
 *
 * 한 탭 안에 세 화면을 둔다(설계 N2):
 *   - Directory   : 리스트/검색 (P1)
 *   - Requests    : 신청 처리 (P2, 쓰기 권한자에게만 노출)
 *   - My requests : 내가 낸 신청의 상태 확인 (P2, N4)
 *
 * 설계 SoT: docs/99_inbox/2026-08-14-연락처(Contacts)-기능-설계.md
 * API 계약: docs/99_inbox/2026-08-14-연락처-API계약.md
 */

import React from "react";
import { Plus } from "lucide-react";

import { Button, Tabs } from "@/components/ui";
import { ContactsDirectory } from "@/components/contacts/ContactsDirectory";
import { ContactRequestsPanel } from "@/components/contacts/ContactRequestsPanel";
import { MyContactRequestsPanel } from "@/components/contacts/MyContactRequestsPanel";
import { useContactActions } from "@/components/contacts/useContactActions";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";

export default function ContactsPage(): React.ReactElement {
  const actions = useContactActions();
  // 쓰기 권한이 하나라도 있으면 처리할 신청이 생길 수 있다 (종류별 판정은 패널 안에서).
  const canReviewRequests = actions.canCreate || actions.canUpdate || actions.canDelete;

  const [view, setView] = usePersistedFilters("contacts.view", { tab: "directory" });
  const tabs = [
    { key: "directory", label: "Directory" },
    ...(canReviewRequests ? [{ key: "requests", label: "Requests" }] : []),
    { key: "mine", label: "My requests" },
  ];
  // 저장된 탭이 지금 권한으로는 없는 탭일 수 있다 (권한 회수 등) → Directory 로 되돌린다.
  const activeTab = tabs.some((t) => t.key === view.tab) ? view.tab : "directory";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Contacts</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Vendors, partners and emergency numbers your organization shares
          </p>
        </div>
        <Button onClick={() => void actions.startCreate()} disabled={actions.busy}>
          <Plus size={15} />
          {actions.canCreate ? "Add contact" : "Request new contact"}
        </Button>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={(key) => setView({ tab: key })} />

      {activeTab === "directory" && <ContactsDirectory actions={actions} />}
      {activeTab === "requests" && canReviewRequests && <ContactRequestsPanel />}
      {activeTab === "mine" && <MyContactRequestsPanel />}
    </div>
  );
}
