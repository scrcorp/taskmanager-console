"use client";

/**
 * Directory — 연락처 리스트/검색.
 *
 * 검색어 하나로 이름·회사·요약·메모·태그·전화·이메일·링크를 전부 훑는다(서버가 OR 부분일치).
 * 여기에 태그·매장·즐겨찾기 필터와 정렬, 그리고 List ↔ Card 전환을 얹었다.
 *
 * 배치는 승인된 목업이 계약이다 (temp/2026-08-19-contacts-ui):
 *  - 컬럼은 **Main contact**(대표 채널: 전화 → 없으면 이메일 → 없으면 링크)와
 *    **Other contact**(가진 채널 칩)로 나뉜다. "Phone" 이라 부르지 않는 이유는
 *    전화 없이 링크만 있는 연락처가 실제로 있기 때문이다.
 *  - **펼치기와 상세 열기는 다른 조작이다.** 행을 누르면 그 자리에서 펼쳐지고,
 *    Open 을 눌러야 모달로 들어간다. 훑어보는 일과 편집하러 가는 일을 섞지 않는다.
 *  - 칩 hover 는 **보조 수단**이다. 터치·키보드에는 hover 가 없으므로 hover 로만
 *    도달하는 정보를 두지 않는다 — 펼치기로 항상 같은 것을 볼 수 있다.
 */

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronsDownUp,
  ChevronsUpDown,
  LayoutGrid,
  Link2,
  List as ListIcon,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Shield,
  Star,
  Store as StoreIcon,
  UserMinus,
  Users,
  X,
} from "lucide-react";

import { useContacts, useContactTags, useToggleContactFavorite } from "@/hooks/useContacts";
import { useDebounce } from "@/hooks/useDebounce";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useStores } from "@/hooks/useStores";
import { Badge, Input, Pagination, Select, Table } from "@/components/ui";
import type { Column } from "@/components/ui/Table";
import { useModal } from "@/components/ui/imperative-modal";
import { describeApiError } from "@/lib/errorDisplay";
import { CONTACT_STORE_SHARED } from "@/types";
import type { Contact, ContactFilters, ContactSort } from "@/types";
import { ContactDetailModal, type ContactDetailAction } from "./ContactDetailModal";
import { highlight } from "./contactHighlight";
import { CopyLine, LinkLine, SectionHead, type ContactChannel } from "./contactFieldUI";
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

/**
 * Main contact — **사용자가 지정한 것 하나**. 채널을 가로질러 하나뿐이다.
 *
 * 무엇이 메인인지는 사람이 정한다(전화가 있어도 주문 포털이 메인인 업체가 있다).
 * 아무도 지정하지 않은 경우에만 첫 전화 → 이메일 → 링크로 떨어진다 — 서버도 같은 규칙이라
 * 저장만 하면 별이 붙으므로, 이 폴백은 옛 데이터용 안전망이다.
 */
function mainContact(
  c: Contact,
): { channel: ContactChannel; value: string; label: string | null } | null {
  const starredPhone = c.phones.find((p) => p.is_primary);
  if (starredPhone)
    return { channel: "phone", value: starredPhone.number, label: starredPhone.label };
  const starredEmail = c.emails.find((e) => e.is_primary);
  if (starredEmail)
    return { channel: "email", value: starredEmail.address, label: starredEmail.label };
  const starredLink = c.links.find((l) => l.is_primary);
  if (starredLink)
    return { channel: "link", value: starredLink.url, label: starredLink.label };

  const phone = c.phones[0];
  if (phone) return { channel: "phone", value: phone.number, label: phone.label };
  const email = c.emails[0];
  if (email) return { channel: "email", value: email.address, label: email.label };
  const link = c.links[0];
  if (link) return { channel: "link", value: link.url, label: link.label };
  return null;
}

const CHANNEL_ICON: Record<ContactChannel, typeof Phone> = {
  phone: Phone,
  email: Mail,
  link: Link2,
};

/** 별 버튼 — 목록/카드 공용. 행 클릭(펼치기)과 섞이지 않게 이벤트를 멈춘다. */
function FavoriteStar({
  contact,
  onToggle,
}: {
  contact: Contact;
  onToggle: (c: Contact) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(contact);
      }}
      aria-pressed={contact.is_favorite}
      title={contact.is_favorite ? "Remove from favorites" : "Add to favorites"}
      className={`rounded-lg p-1 transition-colors ${
        contact.is_favorite
          ? "text-warning hover:bg-warning-muted"
          : "text-text-muted hover:bg-warning-muted hover:text-warning"
      }`}
    >
      <Star size={16} fill={contact.is_favorite ? "currentColor" : "none"} />
    </button>
  );
}

/**
 * 펼쳤을 때 보이는 내용 — 목록과 카드가 같은 것을 쓴다.
 *
 * **잘려 있던 값이 전부 보이는 자리**다. 목록 셀에서 잘린 Summary 와 `+N` 으로 접힌 Tags 도
 * 여기서 전문이 나온다 — 펼쳤는데 목록과 같은 것만 보이면 펼칠 이유가 없다.
 *
 * `showActions=false` 는 카드용 — 카드에는 이미 아래에 Open 이 있어 버튼이 겹친다.
 */
function ExpandedDetails({
  contact,
  onOpen,
  onEdit,
  showActions = true,
}: {
  contact: Contact;
  onOpen: () => void;
  onEdit: () => void;
  showActions?: boolean;
}): React.ReactElement {
  const phones = [...contact.phones].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  );
  const emails = [...contact.emails].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  );
  const links = [...contact.links].sort((a, b) => a.sort_order - b.sort_order);

  /** 공개 대상을 축(매장/직급/개인)별로 묶는다 — 축을 뭉개면 누가 보는지 감이 안 온다. */
  const targetsByType = (["store", "role", "user"] as const).map((type) => ({
    type,
    label: type === "store" ? "Stores" : type === "role" ? "Roles" : "People",
    items: contact.targets.filter((t) => t.type === type),
  }));

  return (
    /* **세로로 쌓는다.** 여러 열로 흘리면 블록 폭이 제각각이라 줄바꿈이 들쭉날쭉하고,
       어디까지가 한 섹션인지도 흐려진다. 길어지는 건 접으면 되는 문제다. */
    <div className="flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
      {contact.summary && (
        <div className="border-l-2 border-border pl-3">
          <SectionHead label="Summary" />
          <p className="text-sm text-text-secondary">{contact.summary}</p>
        </div>
      )}

      {phones.length > 0 && (
        <div className="border-l-2 border-border pl-3">
          <SectionHead channel="phone" count={phones.length} />
          {phones.map((p) => (
            <CopyLine key={p.id} value={p.number} label={p.label} />
          ))}
        </div>
      )}
      {emails.length > 0 && (
        <div className="border-l-2 border-border pl-3">
          <SectionHead channel="email" count={emails.length} />
          {emails.map((e) => (
            <CopyLine key={e.id} value={e.address} label={e.label} />
          ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="border-l-2 border-border pl-3">
          <SectionHead channel="link" count={links.length} />
          {links.map((l) => (
            <LinkLine key={l.id} url={l.url} label={l.label} />
          ))}
        </div>
      )}
      {contact.company && (
        <div className="border-l-2 border-border pl-3">
          <SectionHead label="Company" />
          <CopyLine value={contact.company} />
        </div>
      )}

      {contact.notes && (
        <div className="border-l-2 border-border pl-3">
          <SectionHead label="Notes" />
          <p className="whitespace-pre-wrap text-sm text-text-secondary">{contact.notes}</p>
        </div>
      )}

      {contact.tags.length > 0 && (
        <div className="border-l-2 border-border pl-3">
          <SectionHead label="Tags" count={contact.tags.length} />
          <div className="flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <Badge key={t.id} variant="accent">
                {t.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* 누가 볼 수 있는가 — **어느 축으로 열렸는지**까지 보여준다 (매장 배정인지 직급인지 개인인지).
          이걸 모르면 "이게 왜 보이지 / 안 보이지"를 판단할 수 없고 고칠 곳도 못 찾는다. */}
      <div className="border-l-2 border-border pl-3">
        <SectionHead label="Visible to" />
        {contact.visibility === "organization" ? (
          <p className="text-sm text-text-secondary">
            Everyone in the organization
          </p>
        ) : contact.targets.length === 0 ? (
          <p className="text-sm text-warning">
            No targets left — only owners and the creator can see this.
          </p>
        ) : (
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            {targetsByType
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.type} className="min-w-0">
                  <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">
                    {g.label} · {g.items.length}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {g.items.map((t) => (
                      <Badge key={`${t.type}-${t.id}`}>{t.name}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            {contact.excluded_users.length > 0 && (
              <div className="min-w-0">
                <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-danger">
                  Excluded · {contact.excluded_users.length}
                </p>
                <div className="flex flex-wrap gap-1">
                  {contact.excluded_users.map((u) => (
                    <Badge key={u.id} variant="danger">
                      {u.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showActions && (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover"
          >
            Open detail
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover"
          >
            Edit
          </button>
        </div>
      )}
      {/* 아무것도 저장돼 있지 않은 연락처 — 펼쳤는데 빈 칸만 보이면 고장으로 읽힌다 */}
      {phones.length === 0 &&
        emails.length === 0 &&
        links.length === 0 &&
        !contact.company &&
        !contact.summary &&
        !contact.notes &&
        contact.tags.length === 0 && (
          <p className="text-sm text-text-muted">
            Nothing saved yet besides the name. Use Edit to add a phone, email or link.
          </p>
        )}
    </div>
  );
}

export function ContactsDirectory({
  actions,
}: {
  actions: ContactActions;
}): React.ReactElement {
  const modal = useModal();
  const toggleFavorite = useToggleContactFavorite();

  const [filters, setFilters] = usePersistedFilters("contacts", {
    q: "",
    tag: "",
    store: "",
    visibility: "",
    sort: "name",
    page: "1",
    fav: "",
    view: "list",
  });
  const page = Number(filters.page) || 1;
  const sort = parseSort(filters.sort);
  const favoritesOnly = filters.fav === "1";
  const cardView = filters.view === "card";

  // 입력창은 로컬 상태로 즉시 반응시키고, 서버 호출만 디바운스한다.
  const [searchInput, setSearchInput] = useState<string>(filters.q);
  const debouncedSearch = useDebounce(searchInput, 300);

  // 펼친 행 — 여러 개를 동시에 펼쳐 비교할 수 있다.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 칩 hover 미리보기. 위치는 트리거 기준으로 계산한다(fixed).
  const [preview, setPreview] = useState<{
    contact: Contact;
    channel: ContactChannel;
    x: number;
    y: number;
  } | null>(null);

  // 태그가 잘렸을 때 나머지를 보여주는 미리보기 (칩 팝오버와 같은 규칙 — 읽기 전용)
  const [tagPreview, setTagPreview] = useState<{
    contact: Contact;
    x: number;
    y: number;
  } | null>(null);

  // 공개 대상 미리보기 — 축별 이름과 제외자를 전부 펼쳐 보여준다
  const [accessPreview, setAccessPreview] = useState<{
    contact: Contact;
    x: number;
    y: number;
  } | null>(null);

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
    visibility: (filters.visibility || undefined) as ContactFilters["visibility"],
    favorites_only: favoritesOnly || undefined,
    sort,
    page,
    per_page: PER_PAGE,
  };
  const contactsQuery = useContacts(listFilters);

  const items = contactsQuery.data?.items ?? [];
  const total = contactsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasActiveFilters = Boolean(
    filters.q || filters.tag || filters.store || filters.visibility || favoritesOnly,
  );

  const loadError = contactsQuery.isError
    ? describeApiError(contactsQuery.error, {
        context: "load",
        fallback: "Contacts couldn't be loaded.",
      })
    : null;

  function onToggleFavorite(contact: Contact): void {
    toggleFavorite.mutate({ id: contact.id, favorite: !contact.is_favorite });
  }

  function toggleExpand(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
          onToggleFavorite={onToggleFavorite}
          onClose={() => close()}
        />
      ),
      { title: "Contact", size: "lg" },
    );
    if (!action) return;
    if (action.kind === "searchTag") {
      // 태그를 **검색창에 써 넣는다** (확장 U3). 태그 필터에 넣지 않는 이유:
      //  - 검색창으로 가면 그 글자가 태그든 이름이든 메모든 걸리는 대로 다 잡힌다.
      //  - 그리고 강조가 함께 걸려 **왜 걸렸는지가 보인다.**
      setSearchInput(action.tagName);
      setFilters({ q: action.tagName, tag: null, page: "1" });
      return;
    }
    if (action.kind === "edit") await actions.startEdit(action.contact);
    else await actions.startDelete(action.contact);
  }

  // 서버가 검색을 하고 강조만 여기서 한다. 필터에 반영된 값을 쓴다 —
  // 입력 중인 값으로 칠하면 아직 그 검색으로 안 걸러진 행이 칠해진다.
  const term = filters.q ?? "";

  /** 가진 채널 칩 — **있는 것만**, 개수는 1건이어도 항상. 칩 폭이 같아야 열이 안 흔들린다. */
  function ChannelChips({ contact }: { contact: Contact }): React.ReactElement {
    const counts: [ContactChannel, number][] = [
      ["phone", contact.phones.length],
      ["email", contact.emails.length],
      ["link", contact.links.length],
    ];
    const shown = counts.filter(([, n]) => n > 0);
    if (shown.length === 0) return <span className="text-sm text-text-muted">—</span>;
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {shown.map(([channel, n]) => {
          const Icon = CHANNEL_ICON[channel];
          return (
            <span
              key={channel}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setPreview({ contact, channel, x: r.left, y: r.bottom + 8 });
              }}
              onMouseLeave={() => setPreview(null)}
              className="inline-flex min-w-[44px] items-center justify-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              <Icon size={13} /> {n}
            </span>
          );
        })}
      </div>
    );
  }

  /**
   * 누가 볼 수 있는가 — 좁은 칸이라 **축별 개수**만 보여준다.
   *
   *   Everyone            : 전 조직 공유
   *   🏪2 · 👥3 · −1      : 매장 2 + 사람 3 에게 열려 있고, 그중 1명은 제외됨
   *
   * "그룹으로 열고 일부를 뺀" 상태가 이 화면에서 제일 헷갈린다. 그래서 제외는
   * **붉은 −N 으로 따로** 세운다 — 포함 숫자에 섞어 버리면 빠진 사람이 있다는 사실이 사라진다.
   * 이름까지는 hover 로 본다(펼치기의 Visible to 섹션에도 항상 있다).
   */
  function AccessChips({ contact }: { contact: Contact }): React.ReactElement {
    if (contact.visibility === "organization") {
      return <Badge>Everyone</Badge>;
    }
    const counts = [
      { type: "store" as const, Icon: StoreIcon, n: contact.targets.filter((t) => t.type === "store").length },
      { type: "role" as const, Icon: Shield, n: contact.targets.filter((t) => t.type === "role").length },
      { type: "user" as const, Icon: Users, n: contact.targets.filter((t) => t.type === "user").length },
    ].filter((x) => x.n > 0);
    const excluded = contact.excluded_users.length;

    return (
      <div
        className="flex items-center gap-1"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAccessPreview({ contact, x: r.left, y: r.bottom + 8 });
        }}
        onMouseLeave={() => setAccessPreview(null)}
      >
        {counts.length === 0 ? (
          // 대상이 전부 사라진 상태 — 조용히 "전체 공유"처럼 보이면 안 된다
          <Badge variant="warning">Owners only</Badge>
        ) : (
          counts.map(({ type, Icon, n }) => (
            <span
              key={type}
              className="inline-flex min-w-[40px] items-center justify-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary"
            >
              <Icon size={12} /> {n}
            </span>
          ))
        )}
        {excluded > 0 && (
          <span
            title={`${excluded} excluded`}
            className="inline-flex items-center gap-0.5 rounded-md border border-danger/40 bg-danger-muted px-1.5 py-0.5 text-[11px] font-semibold text-danger"
          >
            <UserMinus size={12} />
            {excluded}
          </span>
        )}
      </div>
    );
  }

  const columns: Column<Contact>[] = [
    {
      key: "favorite",
      header: "",
      className: "w-10",
      render: (c) => <FavoriteStar contact={c} onToggle={onToggleFavorite} />,
    },
    {
      key: "name",
      header: "Name",
      className: "max-w-[240px]",
      render: (c) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-text">{highlight(c.name, term)}</div>
          {/* 공개 범위는 이제 전용 컬럼이 있다 — 여기서는 회사명만 (같은 정보를 두 번 쓰지 않는다) */}
          {c.company && (
            <div className="truncate text-xs text-text-muted">
              {highlight(c.company, term)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      hideOnMobile: true,
      className: "max-w-[280px]",
      render: (c) => (
        <span className="block truncate text-sm text-text-secondary">
          {c.summary ? highlight(c.summary, term) : "—"}
        </span>
      ),
    },
    {
      key: "main",
      header: "Main contact",
      className: "max-w-[300px]",
      render: (c) => {
        const main = mainContact(c);
        if (!main) return <span className="text-sm text-text-muted">—</span>;
        const Icon = CHANNEL_ICON[main.channel];
        // 목록에서 바로 쓰는 값이다 — 상세로 들어가지 않고 그 자리에서 복사(링크는 액션 모달)한다.
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Icon size={14} className="shrink-0 text-text-muted" />
            <div className="min-w-0 flex-1">
              {main.channel === "link" ? (
                <LinkLine url={main.value} label={main.label} />
              ) : (
                <CopyLine value={main.value} label={main.label} />
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "other",
      header: "Other",
      hideOnMobile: true,
      className: "w-[140px]",
      render: (c) => <ChannelChips contact={c} />,
    },
    {
      key: "tags",
      header: "Tags",
      hideOnMobile: true,
      // 태그는 뒤쪽이다. Summary/Main contact 가 길어야 하고, 태그는 몇 개만 보이면 된다.
      className: "w-[150px]",
      render: (c) =>
        c.tags.length === 0 ? (
          <span className="text-sm text-text-muted">—</span>
        ) : (
          <div
            className="flex items-center gap-1"
            onMouseEnter={(e) => {
              if (c.tags.length <= 2) return;
              const r = e.currentTarget.getBoundingClientRect();
              setTagPreview({ contact: c, x: r.left, y: r.bottom + 8 });
            }}
            onMouseLeave={() => setTagPreview(null)}
          >
            {c.tags.slice(0, 2).map((t) => (
              <Badge key={t.id} variant="accent">
                {t.name}
              </Badge>
            ))}
            {c.tags.length > 2 && (
              <span className="whitespace-nowrap text-xs font-semibold text-text-muted">
                +{c.tags.length - 2}
              </span>
            )}
          </div>
        ),
    },
    {
      key: "access",
      header: "Who can see",
      hideOnMobile: true,
      className: "w-[150px]",
      render: (c) => <AccessChips contact={c} />,
    },
    {
      key: "open",
      header: "",
      className: "w-20",
      render: (c) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void openDetail(c);
          }}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover"
        >
          Open
        </button>
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
            placeholder="Search name, company, phone, email, link, tag or notes"
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
            options={[
              { value: "", label: "All sharing" },
              { value: "organization", label: "Shared with everyone" },
              { value: "restricted", label: "Restricted" },
            ]}
            value={filters.visibility}
            onChange={(e) => setFilters({ visibility: e.target.value || null, page: "1" })}
            aria-label="Filter by who can see it"
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

        {/* 즐겨찾기만 보기 — 꺼져 있어도 즐겨찾기는 맨 위로 온다(서버 정렬, D4) */}
        <button
          type="button"
          onClick={() => setFilters({ fav: favoritesOnly ? null : "1", page: "1" })}
          aria-pressed={favoritesOnly}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            favoritesOnly
              ? "border-accent bg-accent-muted text-accent"
              : "border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text"
          }`}
        >
          <Star size={14} fill={favoritesOnly ? "currentColor" : "none"} /> Favorites only
        </button>

        {/* 전체 펼치기/접기 — 한 건씩 누르지 않고 한 번에 훑을 수 있게 */}
        <button
          type="button"
          onClick={() =>
            setExpanded((prev) =>
              prev.size === items.length && items.length > 0
                ? new Set()
                : new Set(items.map((c) => c.id)),
            )
          }
          disabled={items.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {expanded.size === items.length && items.length > 0 ? (
            <>
              <ChevronsDownUp size={14} /> Collapse all
            </>
          ) : (
            <>
              <ChevronsUpDown size={14} /> Expand all
            </>
          )}
        </button>

        <div className="ml-auto inline-flex rounded-lg border border-border bg-surface p-0.5">
          {([
            ["list", ListIcon, "List"],
            ["card", LayoutGrid, "Cards"],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilters({ view: key })}
              aria-pressed={cardView === (key === "card")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                cardView === (key === "card")
                  ? "bg-accent-muted text-accent"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setFilters({
                q: null,
                tag: null,
                store: null,
                visibility: null,
                fav: null,
                page: "1",
              });
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

      {!loadError && !cardView && (
        <Table
          columns={columns}
          data={items}
          isLoading={contactsQuery.isLoading}
          onRowClick={(c) => toggleExpand(c.id)}
          renderExpanded={(c) =>
            expanded.has(c.id) ? (
              <ExpandedDetails
                contact={c}
                onOpen={() => void openDetail(c)}
                onEdit={() => void actions.startEdit(c)}
              />
            ) : null
          }
          emptyMessage={
            hasActiveFilters
              ? "No contacts match these filters. Try a shorter search term or clear the filters."
              : actions.canCreate
                ? "No contacts yet. Add the first one to start the directory."
                : "No contacts yet. Use Request new contact to suggest the first one."
          }
        />
      )}

      {!loadError && cardView && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => {
            const main = mainContact(c);
            const Icon = main ? CHANNEL_ICON[main.channel] : null;
            const isOpen = expanded.has(c.id);
            return (
              <div
                key={c.id}
                className={`flex flex-col gap-2 rounded-xl border bg-card p-4 transition-colors ${
                  isOpen ? "border-accent" : "border-border hover:border-text-muted/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-text">
                      {highlight(c.name, term)}
                    </div>
                    {c.company && (
                      <div className="truncate text-xs text-text-muted">{c.company}</div>
                    )}
                  </div>
                  <FavoriteStar contact={c} onToggle={onToggleFavorite} />
                </div>

                <div className="flex min-h-[86px] flex-col gap-2">
                  {/* 접혀 있을 때만 보여준다 — 펼치면 아래 Tags 섹션이 전부 보여주므로
                      같은 것을 두 번 그릴 이유가 없다. 잘린 나머지는 목록과 같이 hover 로 본다. */}
                  {!isOpen && c.tags.length > 0 && (
                    <div
                      className="flex flex-wrap items-center gap-1"
                      onMouseEnter={(e) => {
                        if (c.tags.length <= 3) return;
                        const r = e.currentTarget.getBoundingClientRect();
                        setTagPreview({ contact: c, x: r.left, y: r.bottom + 8 });
                      }}
                      onMouseLeave={() => setTagPreview(null)}
                    >
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t.id} variant="accent">
                          {t.name}
                        </Badge>
                      ))}
                      {c.tags.length > 3 && (
                        <span className="text-xs font-semibold text-text-muted">
                          +{c.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  {c.summary && !isOpen && (
                    <p className="line-clamp-2 text-sm text-text-secondary">{c.summary}</p>
                  )}
                  {main && Icon && (
                    <div className="flex items-center gap-2 text-sm">
                      <Icon size={14} className="shrink-0 text-text-muted" />
                      <span className="truncate font-medium text-text">{main.value}</span>
                    </div>
                  )}
                  {isOpen && (
                    <div className="border-t border-border pt-2">
                      <ExpandedDetails
                        contact={c}
                        onOpen={() => void openDetail(c)}
                        onEdit={() => void actions.startEdit(c)}
                        showActions={false}
                      />
                    </div>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
                  <ChannelChips contact={c} />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(c.id)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
                    >
                      {isOpen ? "Less" : "More"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void openDetail(c)}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {!contactsQuery.isLoading && items.length === 0 && (
            <p className="col-span-full rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted">
              {hasActiveFilters
                ? "No contacts match these filters."
                : "No contacts yet."}
            </p>
          )}
        </div>
      )}

      {!loadError && !contactsQuery.isLoading && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-text-muted">
            {total} contact{total === 1 ? "" : "s"}
            {favoritesOnly ? " · favorites only" : ""}
          </span>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={(p) => setFilters({ page: String(p) })}
          />
        </div>
      )}

      {accessPreview && (
        <div
          className="pointer-events-none fixed z-50 w-[300px] rounded-xl border border-border bg-surface p-3 shadow-lg"
          style={{
            left: Math.min(accessPreview.x, window.innerWidth - 316),
            top: Math.min(accessPreview.y, window.innerHeight - 240),
          }}
        >
          <p className="mb-2 text-sm font-semibold text-text">Who can see this</p>
          {accessPreview.contact.visibility === "organization" ? (
            <p className="text-sm text-text-secondary">Everyone in the organization</p>
          ) : accessPreview.contact.targets.length === 0 ? (
            <p className="text-sm text-warning">
              No targets left — only owners and the creator.
            </p>
          ) : (
            <div className="space-y-2">
              {(["store", "role", "user"] as const).map((type) => {
                const items = accessPreview.contact.targets.filter((t) => t.type === type);
                if (items.length === 0) return null;
                return (
                  <div key={type}>
                    <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">
                      {type === "store" ? "Stores" : type === "role" ? "Roles" : "People"} ·{" "}
                      {items.length}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {items.map((t) => (
                        <Badge key={`${t.type}-${t.id}`}>{t.name}</Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {accessPreview.contact.excluded_users.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-danger">
                Excluded · {accessPreview.contact.excluded_users.length}
              </p>
              <div className="flex flex-wrap gap-1">
                {accessPreview.contact.excluded_users.map((u) => (
                  <Badge key={u.id} variant="danger">
                    {u.name}
                  </Badge>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-text-muted">
                Picked by store or role, then taken out one by one.
              </p>
            </div>
          )}
          <p className="mt-2 border-t border-border pt-2 text-[11px] text-text-muted">
            Owners and the creator always see it.
          </p>
        </div>
      )}

      {tagPreview && (
        <div
          className="pointer-events-none fixed z-50 max-w-[280px] rounded-xl border border-border bg-surface p-3 shadow-lg"
          style={{
            left: Math.min(tagPreview.x, window.innerWidth - 296),
            top: Math.min(tagPreview.y, window.innerHeight - 160),
          }}
        >
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">
            Tags · {tagPreview.contact.tags.length}
          </p>
          <div className="flex flex-wrap gap-1">
            {tagPreview.contact.tags.map((t) => (
              <Badge key={t.id} variant="accent">
                {t.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* 칩 hover 미리보기 — 보조 수단이라 **읽기 전용**이다.
          떠 있는 판이라 마우스가 도달하기 전에 사라지므로, 누를 수 있는 것처럼 보이게 두지 않는다. */}
      {preview && (
        <div
          className="pointer-events-none fixed z-50 w-[300px] rounded-xl border border-border bg-surface p-3 shadow-lg"
          style={{
            left: Math.min(preview.x, window.innerWidth - 316),
            top: Math.min(preview.y, window.innerHeight - 220),
          }}
        >
          <p className="text-sm font-semibold text-text">{preview.contact.name}</p>
          {preview.contact.company && (
            <p className="mb-2 text-[11.5px] text-text-muted">{preview.contact.company}</p>
          )}
          {/* 어느 칩에 올렸든 **전체**가 뜨고, 올린 채널만 맨 위로 와서 강조된다.
              동작이 하나라 예측 가능하면서 칩을 나눈 의미도 남는다. */}
          {([preview.channel, ...(["phone", "email", "link"] as ContactChannel[]).filter(
            (c) => c !== preview.channel,
          )] as ContactChannel[]).map((channel) => {
            const rows =
              channel === "phone"
                ? preview.contact.phones.map((p) => ({ id: p.id, v: p.number, l: p.label }))
                : channel === "email"
                  ? preview.contact.emails.map((e) => ({ id: e.id, v: e.address, l: e.label }))
                  : preview.contact.links.map((l) => ({ id: l.id, v: l.url, l: l.label }));
            if (rows.length === 0 && channel !== preview.channel) return null;
            const highlighted = channel === preview.channel;
            return (
              <div
                key={channel}
                className={`mt-2 border-t border-border pt-2 first:mt-0 first:border-t-0 first:pt-0 ${
                  highlighted ? "-ml-2 border-l-2 border-l-accent pl-2" : ""
                }`}
              >
                <SectionHead channel={channel} count={rows.length} highlighted={highlighted} />
                {rows.length === 0 ? (
                  <p className="text-xs text-text-muted">Nothing saved yet</p>
                ) : (
                  rows.map((r) =>
                    channel === "link" ? (
                      <LinkLine key={r.id} url={r.v} label={r.l} readOnly />
                    ) : (
                      <CopyLine key={r.id} value={r.v} label={r.l} readOnly />
                    ),
                  )
                )}
              </div>
            );
          })}
          <p className="mt-2 border-t border-border pt-2 text-[11px] text-text-muted">
            Touch &amp; keyboard: use the expand arrow instead.
          </p>
        </div>
      )}
    </div>
  );
}
