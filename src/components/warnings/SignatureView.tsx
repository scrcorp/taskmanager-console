"use client";

import React from "react";
import type { SignatureStrokes } from "@/types";

/**
 * Renders captured VECTOR strokes as a single inline SVG — the same normalized
 * stroke format the staff app uses, so app + console show identical ink.
 *
 * Strokes are arrays of [x, y] points normalized to 0..1; `aspect` (width/height
 * of the capture pad) lets us build a stable viewBox so the ink keeps its shape
 * inside whatever box it's dropped into. Ink is near-black by default.
 */

// A view box wide enough to give the path good precision; height follows aspect.
const VB_W = 1000;

function strokeToPath(stroke: number[][], w: number, h: number): string {
  if (stroke.length === 0) return "";
  const X = (p: number[]) => (p[0] ?? 0) * w;
  const Y = (p: number[]) => (p[1] ?? 0) * h;
  if (stroke.length === 1) {
    // a dot — draw a hairline so it shows
    const x = X(stroke[0]);
    const y = Y(stroke[0]);
    return `M ${x} ${y} L ${x + 0.5} ${y}`;
  }
  return stroke.map((p, i) => `${i === 0 ? "M" : "L"} ${X(p)} ${Y(p)}`).join(" ");
}

export function SignatureView({
  signature,
  className = "",
  color = "#1A1C22",
  strokeWidth = 2.6,
}: {
  signature: SignatureStrokes;
  className?: string;
  color?: string;
  strokeWidth?: number;
}): React.ReactElement {
  // aspect = width / height. Fall back to a wide-ish signature box when unknown.
  const aspect = signature.aspect && signature.aspect > 0 ? signature.aspect : 2.6;
  const vbH = VB_W / aspect;

  // Center the ink: people often sign toward one side of the pad. Shift the
  // stroke bounding box to the pad-space center (translate only — keeps the
  // signature at its natural size; `meet` then fits the pad space into the box).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of signature.strokes) {
    for (const p of s) {
      const x = p[0] ?? 0, y = p[1] ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const hasInk = Number.isFinite(minX);
  const dx = hasInk ? (0.5 - (minX + maxX) / 2) * VB_W : 0;
  const dy = hasInk ? (0.5 - (minY + maxY) / 2) * vbH : 0;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${vbH}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="signature"
    >
      <g transform={`translate(${dx} ${dy})`}>
        {signature.strokes.map((s, i) => (
          <path
            key={i}
            d={strokeToPath(s, VB_W, vbH)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  );
}
