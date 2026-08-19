/**
 * 직원 상태 배지 — 목록·선택 UI 어디서나 같은 말로 보이게 하는 단일 컴포넌트.
 *
 * 왜 공용인가: 화면마다 `is_active` 조합으로 각자 라벨을 만들면 같은 사람이 어디선
 * "Former", 어디선 무표시가 된다(실제로 스케줄 그리드에만 배지가 있고 Bulk 빌더엔
 * 없었다). 판정 자체는 서버가 소유하고(`assignable`/`assignable_until`), 이 컴포넌트는
 * **표시만** 한다.
 *
 * 상태 구분 (2026-08-19):
 *   Not signed up — 미가입(유령). 배정은 되지만 로그인 불가.
 *   Terminated    — 퇴사. 마지막 근무일이 있고, 그날까지는 배정할 수 있다.
 *   Deactivated   — 퇴사일 없이 계정만 비활성. 어떤 날짜로도 배정 불가.
 *                   ("계정 비활성"과 "퇴사"는 별개 축이다 — 중복 가입 정리나 오등록도 여기 들어온다)
 *
 * 재직자에게는 아무것도 렌더하지 않는다(null). 목록이 배지로 뒤덮이면 신호가 죽는다.
 */

interface StaffLike {
  is_active?: boolean;
  is_provisional?: boolean;
  assignable?: boolean;
  assignable_until?: string | null;
}

interface Props {
  staff: StaffLike | null | undefined;
  /** 아주 좁은 칸(테이블 셀 등)에서 점만 찍고 싶을 때 */
  compact?: boolean;
  className?: string;
}

export function staffStatusOf(staff: StaffLike | null | undefined): {
  label: string;
  title: string;
  tone: "warning" | "muted";
} | null {
  if (!staff) return null;
  if (staff.is_provisional) {
    return {
      label: "Not signed up",
      tone: "warning",
      title:
        "Not signed up — this employee hasn't signed up yet. They can be scheduled, but can't log in.",
    };
  }
  if (staff.is_active === false) {
    return staff.assignable_until
      ? {
          label: "Terminated",
          tone: "muted",
          title: `Terminated — last working day ${staff.assignable_until}.`,
        }
      : {
          label: "Deactivated",
          tone: "muted",
          title:
            "Deactivated — this account is no longer in use (left, duplicate, or created by mistake).",
        };
  }
  return null;
}

export function StaffStatusBadge({ staff, compact = false, className = "" }: Props) {
  const status = staffStatusOf(staff);
  if (!status) return null;

  const tone =
    status.tone === "warning"
      ? "bg-[var(--color-warning-muted)] text-[var(--color-warning)]"
      : "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]";

  if (compact) {
    return (
      <span
        title={status.title}
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
          status.tone === "warning" ? "bg-[var(--color-warning)]" : "bg-[var(--color-text-muted)]"
        } ${className}`}
      />
    );
  }

  return (
    <span
      title={status.title}
      className={`inline-block shrink-0 rounded-full px-1.5 py-px text-[8px] font-bold uppercase leading-[14px] tracking-wide ${tone} ${className}`}
    >
      {status.label}
    </span>
  );
}
