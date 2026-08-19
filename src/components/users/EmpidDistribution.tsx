"use client";

/**
 * EMPID 분포 막대 — 임포트 프리뷰의 100 단위 묶음 표시 (계약 §3-5).
 *
 * 서버가 준 distribution[] 을 그대로 그린다. 어떤 묶음이 예외인지는 **판정하지
 * 않는다**(INV-8) — 동떨어진 묶음이 눈에 띄게만 하고, 예외 체크는 사람이 한다.
 *
 * Hundreds-band distribution of the numbers in the uploaded file. The server
 * decides the buckets; the console only draws them and never guesses which
 * band is an exception.
 */

import React from "react";
import type { EmpidDistributionBand } from "@/types";

export function EmpidDistribution({
  bands,
}: {
  bands: EmpidDistributionBand[];
}): React.ReactElement | null {
  if (bands.length === 0) return null;
  // 막대 길이는 최다 묶음 기준 상대값 (relative bar width against the biggest band)
  const max = bands.reduce((n, b) => (b.count > n ? b.count : n), 0) || 1;
  const total = bands.reduce((n, b) => n + b.count, 0);
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="mb-2">
        <p className="text-sm font-bold text-text">
          Number distribution ({total} numbered row{total === 1 ? "" : "s"})
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          Grouped in hundreds. A band far from the rest is usually a one-off —
          tick Exception on those rows so they stay out of the sequence.
        </p>
      </div>
      <ul className="space-y-1">
        {bands.map((b) => (
          <li key={b.band} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs font-mono text-text-secondary">
              {b.band}
            </span>
            <span className="flex-1 h-3 rounded-full bg-surface overflow-hidden">
              <span
                className="block h-full rounded-full bg-accent/70"
                style={{ width: `${Math.max(2, (b.count / max) * 100)}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right text-xs text-text">
              {b.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
