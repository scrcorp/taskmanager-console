/**
 * 간소화 콘솔 히스토리의 값·시각 표기.
 *
 * 근태 correction 값은 UTC 순간(…Z)으로 저장된다. 문자열을 그대로 잘라 쓰면 매장 20:50 이
 * 03:50 으로 보인다 — 이 화면에서 실제로 났던 오류다. 그래서 표기는 전부 매장 시간대를
 * 거친다. 반대로 스케줄 계열 값은 오프셋 없는 벽시계라 이미 매장 기준이므로 건드리지 않는다.
 *
 * 순수 함수로 떼어 둔 이유는 이 판정(오프셋 유무)을 화면 없이 검증하기 위해서다.
 */

import { isoToLocalInputInTz } from "./utils";

const ISO_HHMM = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;

/** 기록 시각 — 브라우저가 아니라 매장 시간대로 읽는다 (원격에서 열어도 매장 기준). */
export function historyStamp(iso: string, tz?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** correction 의 저장값 → 표기. ISO datetime 이면 시:분만, 센티널·코드값은 사람 말로. */
export function historyValue(value: string | null | undefined, tz?: string): string {
  if (!value) return "—";
  // 서버가 넣는 센티널 — 데스크탑 상세와 같은 말로 옮긴다.
  if (value === "(none)" || value === "(cleared)") return "—";
  if (value === "(set)") return "Set";
  const m = value.match(ISO_HHMM);
  if (!m) return value;
  if (!HAS_OFFSET.test(value)) return m[1]; // 벽시계 — 이미 매장 기준
  const local = isoToLocalInputInTz(value, tz);
  return local ? local.slice(11, 16) : m[1];
}
