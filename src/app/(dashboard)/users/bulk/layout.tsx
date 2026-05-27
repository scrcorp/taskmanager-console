"use client";

/**
 * Bulk 직원 관리 공용 레이아웃 — [Edit Existing | Add New] 탭.
 * edit/add 페이지가 이 layout 을 공유한다.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const TABS = [
  { href: "/users/bulk/edit", label: "Edit Existing" },
  { href: "/users/bulk/add", label: "Add New" },
];

export default function BulkLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();

  return (
    <div>
      <Link
        href="/users"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text transition-colors mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Staff
      </Link>
      <h1 className="text-2xl font-extrabold text-text mb-4">Bulk Staff Management</h1>

      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
