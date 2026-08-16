"use client";

/**
 * Directory — 연락처 리스트/검색 (P1).
 *
 * 검색어 하나로 이름·회사·전화·이메일·태그·메모를 전부 훑는다(서버가 OR 부분일치).
 * 여기에 태그 필터·매장 필터·정렬·페이지네이션을 얹었다.
 *
 * 행을 누르면 상세 모달이 열리고, 거기서 수정/삭제(권한 없으면 신청)로 이어진다.
 */

import React, { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Search, X } from "lucide-react";

import { useContacts, useContactTags } from "@/hooks/useContacts";
import { useDebounce } from "@/hooks/useDebounce";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useStores } from "@/hooks/useStores";
import { Badge, Input, Pagination, Select, Table } from "@/components/ui";
import type { Column } from "@/components/ui/Table";
import { useModal } from "@/components/ui/imperative-modal";
import { describeApiError } from "@/lib/errorDisplay";
import { CONTACT_STORE_SHARED } from "@/types";
import type { Contact, ContactFilters, ContactPhone, ContactSort } from "@/types";
import { ContactDetailModal, type ContactDetailAction } from "./ContactDetailModal";
import { highlight, matchedFirst, matchesTerm } from "./contactHighlight";
import { visibilityLabel } from "./visibilityLabel";
import type { ContactActions } from "./useContactActions";

const PER_PAGE = 20;

const SORT_OPTIONS: { value: ContactSort; label: string }[] = [
  { value: "name", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "created_at", label: "Newest first" },
  { value: "updated_at", label: "Recently updated" },
];

/** 정렬값이 계약에 없는 값으로 복원되면(구버전 저장분 등) 기본값으로 되돌린다. */
function parseSort(value: string): ContactSort {
  const known = SORT_OPTIONS.some((o) => o.value === value);
  return known ? (value as ContactSort) : "name";
}

/** 대표 번호를 먼저, 나머지는 원래 순서대로. */
function orderPhones(phones: ContactPhone[]): ContactPhone[] {
  return [...phones].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}

/**
 * 전화번호 셀 — 대표 번호를 크게, 나머지는 아래 작게 (라벨이 있으면 함께).
 *
 * 검색어에 걸린 번호는 앞으로 당기고 강조한다 — 대표번호가 아닌 번호로 검색해 놓고
 * 왜 걸렸는지 안 보이면 결과를 신뢰하기 어렵다 (확장 U1).
 */
function PhoneCell({
  phones,
  term,
}: {
  phones: ContactPhone[];
  term: string;
}): React.ReactElement {
  if (phones.length === 0) {
    return <span className="text-sm text-text-muted">—</span>;
  }
  const [primary, ...rest] = matchedFirst(orderPhones(phones), term, (p) => p.number);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <span className="whitespace-nowrap text-sm font-medium text-text">
          {highlight(primary.number, term, { phone: true })}
        </span>
        {primary.label && (
          <span className="text-[11px] uppercase tracking-wide text-text-muted">
            {primary.label}
          </span>
        )}
      </div>
      {rest.map((p) => (
        <div key={p.id} className="flex items-baseline gap-1.5">
          <span className="whitespace-nowrap text-xs text-text-secondary">
            {highlight(p.number, term, { phone: true })}
          </span>
          {p.label && (
            <span className="text-[10px] uppercase tracking-wide text-text-muted">{p.label}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * 태그 칩 — 3개까지 보여주고 나머지는 +N.
 *
 * 검색 중이면 **걸린 태그를 맨 앞으로** 당긴다 (확장 U2). 잘려서 안 보이는 일이 없어진다.
 * 상한 3은 유지한다 — 전부 펼치면 행 높이가 태그 수에 따라 들쭉날쭉해져 목록을
 * 훑기 나빠진다. 전부 보는 곳은 상세 모달이고 거기는 이미 전부 보인다.
 */
function TagChips({ contact, term }: { contact: Contact; term: string }): React.ReactElement {
  if (contact.tags.length === 0) {
    return <span className="text-sm text-text-muted">—</span>;
  }
  const ordered = matchedFirst(contact.tags, term, (t) => t.name);
  const shown = ordered.slice(0, 3);
  const overflow = ordered.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((t) => (
        // 칩 전체를 물들인다 — 칩 안에서 글자 일부만 칠하면 배경 두 겹이 겹쳐 탁해진다.
        <Badge key={t.id} variant={matchesTerm(t.name, term) ? "warning" : "default"}>
          {t.name}
        </Badge>
      ))}
      {overflow > 0 && <span className="text-xs text-text-muted">+{overflow}</span>}
    </div>
  );
}

export function ContactsDirectory({
  actions,
}: {
  actions: ContactActions;
}): React.ReactElement {
  const modal = useModal();

  const [filters, setFilters] = usePersistedFilters("contacts", {
    q: "",
    tag: "",
    store: "",
    sort: "name",
    page: "1",
  });
  const page = Number(filters.page) || 1;
  const sort = parseSort(filters.sort);

  // 입력창은 로컬 상태로 즉시 반응시키고, 서버 호출만 디바운스한다.
  const [searchInput, setSearchInput] = useState<string>(filters.q);
  const debouncedSearch = useDebounce(searchInput, 300);

  // 뒤로가기/필터 복원처럼 바깥에서 q 가 바뀐 경우 입력창을 맞춰준다.
  useEffect(() => {
    setSearchInput((current) => (current === filters.q ? current : filters.q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  // 디바운스가 끝난 값만 필터에 반영 — 검색어가 바뀌면 1페이지로.
  useEffect(() => {
    if (debouncedSearch === filters.q) return;
    setFilters({ q: debouncedSearch || null, page: "1" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data: stores } = useStores();
  const tagsQuery = useContactTags("", 50);

  const listFilters: ContactFilters = {
    q: filters.q || undefined,
    tag: filters.tag || undefined,
    store_id: filters.store || undefined,
    sort,
    page,
    per_page: PER_PAGE,
  };
  const contactsQuery = useContacts(listFilters);

  const items = contactsQuery.data?.items ?? [];
  const total = contactsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasActiveFilters = Boolean(filters.q || filters.tag || filters.store);

  const loadError = contactsQuery.isError
    ? describeApiError(contactsQuery.error, {
        context: "load",
        fallback: "Contacts couldn't be loaded.",
      })
    : null;

  /** 상세를 먼저 닫고, 그 결과에 따라 수정/삭제 흐름을 잇는다. */
  async function openDetail(contact: Contact): Promise<void> {
    const action = await modal.open<ContactDetailAction>(
      ({ close }) => (
        <ContactDetailModal
          contactId={contact.id}
          fallback={contact}
          canUpdate={actions.canUpdate}
          canDelete={actions.canDelete}
          onAction={(a) => close(a)}
          onClose={() => close()}
        />
      ),
      { title: "Contact", size: "lg" },
    );
    if (!action) return;
    if (action.kind === "searchTag") {
      // 태그를 **검색창에 써 넣는다** (확장 U3). 태그 필터에 넣지 않는 이유:
      //  - 검색창으로 가면 그 글자가 태그든 이름이든 메모든 걸리는 대로 다 잡힌다.
      //  - 그리고 강조(U1)와 매칭 태그 앞당김(U2)이 함께 걸려 **왜 걸렸는지가 보인다.**
      //    태그 필터는 정확 일치라 강조가 안 붙어 결과만 덩그러니 남는다.
      // 태그 필터가 켜져 있으면 교집합이 되어 결과가 0건이 되기 쉬우므로 함께 비운다.
      setSearchInput(action.tagName);
      setFilters({ q: action.tagName, tag: null, page: "1" });
      return;
    }
    if (action.kind === "edit") await actions.startEdit(action.contact);
    else await actions.startDelete(action.contact);
  }

  // 서버가 검색을 하고 강조만 여기서 한다 (확장 U1). 필터에 반영된 값을 쓴다 —
  // 입력 중인 값(searchInput)으로 칠하면 아직 그 검색으로 안 걸러진 행이 칠해진다.
  const term = filters.q ?? "";

  const columns: Column<Contact>[] = [
    {
      key: "name",
      header: "Name",
      className: "max-w-[240px]",
      render: (c) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-text">{highlight(c.name, term)}</div>
          <div className="truncate text-xs text-text-muted">{visibilityLabel(c)}</div>
        </div>
      ),
    },
    {
      key: "company",
      header: "Company",
      hideOnMobile: true,
      className: "max-w-[200px]",
      render: (c) => (
        <span className="block truncate text-sm text-text-secondary">
          {c.company ? highlight(c.company, term) : "—"}
        </span>
      ),
    },
    {
      key: "phones",
      header: "Phone",
      render: (c) => <PhoneCell phones={c.phones} term={term} />,
    },
    {
      key: "email",
      header: "Email",
      hideOnMobile: true,
      className: "max-w-[220px]",
      render: (c) => (
        <span className="block truncate text-sm text-text-secondary">
          {c.email ? highlight(c.email, term) : "—"}
        </span>
      ),
    },
    {
      key: "tags",
      header: "Tags",
      hideOnMobile: true,
      render: (c) => <TagChips contact={c} term={term} />,
    },
    {
      key: "memo",
      header: "Memo",
      hideOnMobile: true,
      className: "max-w-[280px]",
      render: (c) => (
        <span className="block truncate text-sm text-text-muted">
          {c.memo ? highlight(c.memo, term) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, company, phone, email, tag or memo"
            className="pl-9 pr-9"
            aria-label="Search contacts"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted transition-colors hover:text-text"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="w-44">
          <Select
            options={[
              { value: "", label: "All tags" },
              ...(tagsQuery.data ?? []).map((t) => ({
                value: t.key,
                label: t.usage_count > 0 ? `${t.name} (${t.usage_count})` : t.name,
              })),
            ]}
            value={filters.tag}
            onChange={(e) => setFilters({ tag: e.target.value || null, page: "1" })}
            aria-label="Filter by tag"
          />
        </div>

        <div className="w-48">
          <Select
            options={[
              { value: "", label: "All stores" },
              { value: CONTACT_STORE_SHARED, label: "Shared (no store)" },
              ...(stores ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={filters.store}
            onChange={(e) => setFilters({ store: e.target.value || null, page: "1" })}
            aria-label="Filter by store"
          />
        </div>

        <div className="w-44">
          <Select
            options={SORT_OPTIONS}
            value={sort}
            onChange={(e) => setFilters({ sort: e.target.value, page: "1" })}
            aria-label="Sort contacts"
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setFilters({ q: null, tag: null, store: null, page: "1" });
            }}
            className="text-sm text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Load error — 원인 + 다음 행동 (조용한 실패 금지) */}
      {loadError && (
        <div className="rounded-xl border border-danger/40 bg-danger/5 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle size={15} />
            Couldn&apos;t load contacts
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {loadError.message}
            {loadError.hint ? ` ${loadError.hint}` : " Check your connection, then retry."}
          </p>
          {loadError.reference && (
            <p className="mt-1 text-[11px] text-text-muted">{loadError.reference}</p>
          )}
          <button
            type="button"
            onClick={() => void contactsQuery.refetch()}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* List — 에러 배너가 떠 있는 동안에는 낡은 표를 같이 보여주지 않는다. */}
      {!loadError && (
        <>
          <Table
            columns={columns}
            data={items}
            isLoading={contactsQuery.isLoading}
            onRowClick={(c) => void openDetail(c)}
            emptyMessage={
              hasActiveFilters
                ? "No contacts match these filters. Try a shorter search term or clear the filters."
                : actions.canCreate
                  ? "No contacts yet. Add the first one to start the directory."
                  : "No contacts yet. Use Request new contact to suggest the first one."
            }
          />

          {!contactsQuery.isLoading && items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                {total} contact{total === 1 ? "" : "s"}
              </span>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => setFilters({ page: String(p) })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
