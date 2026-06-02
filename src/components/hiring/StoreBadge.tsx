"use client";

// 매장별 안정적인 색 — id 해시로 팔레트에서 고름 (cross-store 뷰에서 매장 구분용).
const PALETTE = [
  "#6C5CE7", "#3B8DD9", "#00B894", "#E17055", "#E84393",
  "#0984E3", "#00CEC9", "#FDCB6E", "#A29BFE", "#FAB1A0",
];

export function storeColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface Props {
  name: string;
  id: string;
  /** 'dot' = 점 + 이름, 'chip' = 옅은 배경 칩 */
  variant?: "dot" | "chip";
}

/** Cross-store 뷰에서 "어느 매장 지원인지" 표시하는 배지. */
export function StoreBadge({ name, id, variant = "dot" }: Props) {
  const color = storeColor(id);
  if (variant === "chip") {
    return (
      <span
        className="inline-flex max-w-[140px] items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
        style={{ background: `${color}1A`, color }}
      >
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">{name}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#64748B]">
      <span className="h-2 w-2 flex-shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}
