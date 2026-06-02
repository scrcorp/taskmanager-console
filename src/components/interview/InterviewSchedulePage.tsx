"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { SlotCalendarPicker } from "@/components/hiring/SlotCalendarPicker";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const publicApi = axios.create({ baseURL: API_BASE });

interface Slot {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string;
  taken: boolean;
  picked: boolean;
}
interface ScheduleData {
  store: { id: string; name: string; timezone: string | null };
  applicant_first_name: string;
  status: "pending" | "picked" | "confirmed";
  max_picks: number;
  slots: Slot[];
  confirmed: { id: string; date: string; start: string; end: string } | null;
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function InterviewSchedulePage({ token }: { token: string }) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await publicApi.get<ScheduleData>(`/app/interview/${token}`);
      setData(res.data);
      setSelected(res.data.slots.filter((s) => s.picked).map((s) => s.id));
    } catch (e) {
      const detail = axios.isAxiosError(e) && e.response?.data?.detail;
      setError(
        (detail && (detail.message as string)) ||
          "This scheduling link is invalid or has expired. Please contact the store.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const tz = data?.store.timezone ?? "";
  const max = data?.max_picks ?? 3;

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < max ? [...prev, id] : prev,
    );

  const submit = async () => {
    setSubmitting(true);
    try {
      await publicApi.post(`/app/interview/${token}/preferences`, { slot_ids: selected });
      setJustSubmitted(true);
      await load();
    } catch (e) {
      const detail = axios.isAxiosError(e) && e.response?.data?.detail;
      setError((detail && (detail.message as string)) || "Couldn't submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return <Shell><p className="text-center text-[13px] text-slate-400">Loading…</p></Shell>;

  if (error && !data)
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center">
          <h2 className="text-[15px] font-semibold text-slate-900">Can&apos;t open this link</h2>
          <p className="mt-1 text-[13px] text-slate-500">{error}</p>
        </div>
      </Shell>
    );

  if (!data) return null;

  // Confirmed
  if (data.status === "confirmed" && data.confirmed) {
    const c = data.confirmed;
    return (
      <Shell store={data.store.name}>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
            ✓ Interview confirmed
          </div>
          <div className="mt-2 text-[22px] font-semibold text-slate-900">
            {fmtDate(c.date)} · {fmtTime(c.start)} {tz}
          </div>
          <div className="mt-1 text-[13px] text-slate-500">{data.store.name}</div>
        </div>
        <p className="mt-4 text-center text-[12px] text-slate-400">
          Your other preferred times were released.
        </p>
      </Shell>
    );
  }

  const noSlots = data.slots.length === 0;

  // 제출 완료(picked) → read-only. 제출 후에는 더 못 고친다.
  if (data.status === "picked") {
    const picks = data.slots.filter((s) => s.picked);
    return (
      <Shell store={data.store.name}>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[13px] font-semibold text-blue-900">
            {justSubmitted ? "Your preferred times are in! 🎉" : "Your preferred times are submitted"}
          </p>
          <p className="mt-0.5 text-[12px] text-blue-700">
            {data.store.name} will confirm one and email you the final time.
          </p>
        </div>
        <h2 className="mb-2 mt-5 text-[14px] font-semibold text-slate-900">Your preferred times</h2>
        <div className="space-y-2">
          {picks.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[13.5px] font-semibold text-white"
            >
              {fmtDate(s.date)} · {fmtTime(s.start)}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] text-slate-400">
          Need to change them? Contact {data.store.name}.
        </p>
      </Shell>
    );
  }

  // 미제출(pending) → 편집 가능
  return (
    <Shell
      store={data.store.name}
      footer={
        noSlots ? undefined : (
          <button
            type="button"
            disabled={selected.length === 0 || submitting}
            onClick={submit}
            className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-[14px] font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-40"
          >
            {submitting
              ? "Saving…"
              : `Submit ${selected.length || ""} preferred time${selected.length === 1 ? "" : "s"}`}
          </button>
        )
      }
    >
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-900">Pick up to {max} times</h2>
        <span className="text-[12px] font-semibold text-slate-500">
          {selected.length} / {max} selected
        </span>
      </div>
      <p className="mb-3 text-[12px] text-slate-500">
        Pick a date, then a time. {data.store.name} confirms the final one.
      </p>

      {noSlots ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center">
          <p className="text-[13px] text-slate-500">
            No interview times are open right now. Please contact {data.store.name}.
          </p>
        </div>
      ) : (
        <>
          <SlotCalendarPicker slots={data.slots} selected={selected} onToggle={toggle} max={max} tzLabel={tz} />
          {/* selected picks — stacked at the bottom so the calendar never jumps */}
          {selected.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Selected ({selected.length})
              </p>
              <div className="space-y-2">
                {selected.map((id) => {
                  const s = data.slots.find((x) => x.id === id);
                  if (!s) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
                    >
                      <span>{fmtDate(s.date)} · {fmtTime(s.start)}</span>
                      <span className="text-blue-200">✕</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="mt-3 text-center text-[12px] text-rose-600">{error}</p>}
    </Shell>
  );
}

function Shell({
  children,
  store,
  footer,
}: {
  children: React.ReactNode;
  store?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50 md:h-[calc(100dvh-3rem)] md:rounded-3xl">
      {/* fixed header */}
      <header className="shrink-0 border-b border-slate-100 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-[560px] items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-[12px] font-bold text-white">
            H
          </div>
          <span className="text-[13px] font-extrabold text-slate-800">{store ?? "Interview"}</span>
          <span className="ml-auto text-[11px] text-slate-400">Interview scheduling</span>
        </div>
      </header>
      {/* scrollable body */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[560px] px-5 py-6">{children}</div>
      </main>
      {/* fixed footer */}
      {footer && (
        <footer className="shrink-0 border-t border-slate-100 bg-white px-5 py-3">
          <div className="mx-auto max-w-[560px]">{footer}</div>
        </footer>
      )}
    </div>
  );
}
