"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SignatureStrokes, SignParty } from "@/types";
import { SignatureView } from "./SignatureView";

/**
 * On-device signature pad — a centered modal over the document with a real SVG
 * pad capturing pointer strokes, for either the employee or manager line. The
 * person signs in person on this device. "Use saved signature" + "save as
 * default" are offered only when `allowSaved` (the logged-in user is signing
 * their own line); capturing someone else's signature is draw-only so we never
 * store another person's strokes as the operator's default. Strokes are
 * normalized 0..1 against the pad with `aspect` captured, so they render the
 * same in the document's signature box. Permission/identity is gated by the
 * CALLER (the confirm step + warnings:sign).
 */

const PAD_W = 520;
const PAD_H = 200;
const PAD_ASPECT = PAD_W / PAD_H;
const ACCENT = "#6C5CE7";

type Mode = "draw" | "saved";
type Pt = [number, number]; // normalized 0..1
type Stroke = Pt[];

// Result the caller submits to the server: vector strokes + method + reuse flag.
export interface SignatureResult {
  strokes: number[][][];
  aspect: number;
  method: "drawn" | "saved";
  saveAsDefault: boolean;
}

export function SignaturePad({
  party,
  signerName,
  savedSignature,
  allowSaved = false,
  isSubmitting = false,
  onCancel,
  onConfirm,
}: {
  party: SignParty;
  signerName: string;
  savedSignature?: SignatureStrokes | null;
  /** Offer reuse + save-as-default. Only when the operator IS this party (self). */
  allowSaved?: boolean;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: (result: SignatureResult) => void;
}): React.ReactElement {
  const partyLabel = party === "manager" ? "manager" : "employee";
  const lineLabel = party === "manager" ? "Manager Signature" : "Employee Signature";
  const hasSaved = allowSaved && !!savedSignature && savedSignature.strokes.length > 0;
  const [mode, setMode] = useState<Mode>(hasSaved ? "saved" : "draw");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Mobile: lock background scroll while the pad is open so the page behind
  // doesn't scroll under the finger while drawing.
  useEffect(() => {
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.overscrollBehavior = overscrollBehavior;
    };
  }, []);

  // Mobile: block the native touch-scroll gesture on the pad itself. React 19's
  // delegated pointer events can't preventDefault the native gesture, so attach
  // a non-passive native touchmove listener (touch-action:none alone is not
  // reliable across mobile browsers). Re-attaches when the pad mounts (draw mode).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || mode !== "draw") return;
    const block = (e: TouchEvent): void => e.preventDefault();
    svg.addEventListener("touchmove", block, { passive: false });
    return () => svg.removeEventListener("touchmove", block);
  }, [mode]);

  // pointer → normalized 0..1 against the pad viewBox.
  const pointFrom = useCallback((e: React.PointerEvent): Pt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  }, []);

  const start = (e: React.PointerEvent): void => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pointFrom(e);
    if (!p) return;
    drawing.current = true;
    setCurrent([p]);
  };
  const move = (e: React.PointerEvent): void => {
    if (!drawing.current) return;
    const p = pointFrom(e);
    if (!p) return;
    setCurrent((cur) => (cur ? [...cur, p] : [p]));
  };
  const end = (): void => {
    if (!drawing.current) return;
    drawing.current = false;
    setCurrent((cur) => {
      if (cur && cur.length > 0) setStrokes((s) => [...s, cur]);
      return null;
    });
  };

  const clear = (): void => {
    setStrokes([]);
    setCurrent(null);
    drawing.current = false;
  };

  const all = current ? [...strokes, current] : strokes;
  const hasDrawing = all.length > 0;
  const canConfirm = (mode === "saved" ? hasSaved : hasDrawing) && !isSubmitting;

  const confirm = (): void => {
    if (mode === "saved") {
      if (savedSignature) {
        onConfirm({
          strokes: savedSignature.strokes,
          aspect: savedSignature.aspect ?? PAD_ASPECT,
          method: "saved",
          saveAsDefault: false,
        });
      }
    } else if (hasDrawing) {
      onConfirm({
        strokes: strokes.map((s) => s.map((p) => [p[0], p[1]])),
        aspect: PAD_ASPECT,
        method: "drawn",
        saveAsDefault,
      });
    }
  };

  // draw paths in the pad's pixel space (viewBox 0 0 PAD_W PAD_H).
  const path = (s: Stroke): string => {
    const X = (p: Pt) => p[0] * PAD_W;
    const Y = (p: Pt) => p[1] * PAD_H;
    if (s.length === 1) return `M ${X(s[0])} ${Y(s[0])} L ${X(s[0]) + 0.5} ${Y(s[0])}`;
    return s.map((p, i) => `${i === 0 ? "M" : "L"} ${X(p)} ${Y(p)}`).join(" ");
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,17,23,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <button type="button" aria-label="Close" onClick={onCancel} style={{ position: "absolute", inset: 0, border: "none", background: "transparent", cursor: "default" }} />

      <div style={{ position: "relative", zIndex: 1, width: "min(560px,100%)", background: "#fff", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,.35)", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#1A1C22" }}>Sign as {partyLabel}</h2>
          <button type="button" onClick={onCancel} aria-label="Cancel" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9AA0AD", padding: 4, lineHeight: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#7A8090" }}>
          {mode === "saved"
            ? `Apply your stored signature to the warning's ${lineLabel} line.`
            : `Draw your signature below. It will be added to the warning's ${lineLabel} line.`}
        </p>

        {/* mode toggle — draw new vs reuse the manager's saved signature */}
        {hasSaved && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["draw", "saved"] as Mode[]).map((m) => {
              const on = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
                    border: `1px solid ${on ? ACCENT : "#C7CBD4"}`,
                    background: on ? "rgba(108,92,231,.10)" : "#fff",
                    color: on ? ACCENT : "#7A8090",
                  }}
                >
                  {m === "draw" ? "Draw new" : "Use saved signature"}
                </button>
              );
            })}
          </div>
        )}

        {/* pad */}
        <div style={{ position: "relative", borderRadius: 12, border: "2px dashed #C7CBD4", background: "#FCFCFD", overflow: "hidden" }}>
          {mode === "draw" ? (
            <>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${PAD_W} ${PAD_H}`}
                style={{ display: "block", width: "100%", height: 200, touchAction: "none", userSelect: "none" }}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerLeave={end}
                onPointerCancel={end}
              >
                <line x1="36" y1={PAD_H - 44} x2={PAD_W - 36} y2={PAD_H - 44} stroke="#E8E0E3" strokeWidth="1.5" />
                {all.map((s, i) => (
                  <path key={i} d={path(s)} fill="none" stroke="#1A1C22" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </svg>
              {!hasDrawing && (
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#9AA0AD", pointerEvents: "none" }}>
                  Draw your signature here
                </span>
              )}
            </>
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px" }}>
              {savedSignature && (
                <div style={{ width: "100%", height: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <SignatureView signature={savedSignature} className="h-full w-full" strokeWidth={2.8} />
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 10 }}>
          <span style={{ fontSize: 12, color: "#9AA0AD" }}>
            Signing as <span style={{ fontWeight: 700, color: "#3C4049" }}>{signerName}</span>
          </span>
          {mode === "draw" && (
            <button type="button" onClick={clear} disabled={!hasDrawing} style={{ border: "none", background: "transparent", cursor: hasDrawing ? "pointer" : "not-allowed", fontSize: 12.5, fontWeight: 700, color: ACCENT, opacity: hasDrawing ? 1 : 0.4 }}>
              Clear
            </button>
          )}
        </div>

        {/* save-as-default — only when signing your own line (self), freshly drawn */}
        {allowSaved && mode === "draw" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12.5, color: "#3C4049", cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} style={{ accentColor: ACCENT, width: 15, height: 15 }} />
            Save as my default signature for next time
          </label>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onCancel} disabled={isSubmitting} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #C7CBD4", background: "#fff", fontSize: 14, fontWeight: 700, color: "#3C4049", cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.6 : 1 }}>
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={!canConfirm} style={{ flex: 1.4, padding: "11px 0", borderRadius: 10, border: "none", background: canConfirm ? ACCENT : "#C7CBD4", fontSize: 14, fontWeight: 800, color: "#fff", cursor: canConfirm ? "pointer" : "not-allowed" }}>
            {isSubmitting ? "Signing…" : "Confirm signature"}
          </button>
        </div>
      </div>
    </div>
  );
}
