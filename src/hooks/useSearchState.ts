"use client";

/**
 * 검색 입력의 **동작**을 한 곳에 고정하는 headless 훅.
 *
 * 왜 필요한가 — 콘솔의 검색창은 화면마다 마크업이 다르고, 달라야 할 이유도 있다
 * (드롭다운 안 / 모달 안 / 필터바 위 / 폭). 하지만 "글자를 치면 무슨 일이
 * 일어나는가" 는 전부 같아야 한다. 그래서 UI 컴포넌트가 아니라 훅으로 묶는다.
 *
 * 핵심 원칙: **입력값(draft)과 커밋된 검색어(committed)를 분리한다.**
 * 입력은 즉시 반응해야 하고, 영속화·필터 재계산은 조금 늦어도 아무도 모른다.
 * 이 둘을 한 변수에 묶으면 (= input 의 value 가 곧 URL 파라미터) 글자 하나마다
 * router.replace 가 돌아 페이지 전체가 리렌더된다 — Staff 목록이 버벅이던 이유.
 *
 * 화면은 반환된 value/onChange 를 자기 마크업에 꽂고, 필터·쿼리에는 committed 를
 * 쓴다. 저장 위치(로컬 전용 / URL 영속)가 달라도 반환 모양은 항상 같다.
 *
 * @example 로컬 전용 (모달·피커류)
 *   const search = useSearchState();
 *   <input value={search.value} onChange={search.onChange} />
 *   const filtered = useMemo(() => rows.filter(r => match(r, search.committed)), [rows, search.committed]);
 *
 * @example URL 영속 (목록 페이지)
 *   const [params, setParams] = usePersistedFilters("users", { q: "" });
 *   const search = useSearchState({ param: { value: params.q, commit: (v) => setParams({ q: v || null }) } });
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** URL/외부 저장소에 커밋할 때 쓰는 어댑터. */
export interface SearchParamBinding {
  /** 외부(URL 등)에 저장된 현재 검색어. 뒤로가기·필터 초기화로 밖에서 바뀔 수 있다. */
  value: string;
  /** 디바운스가 끝난 뒤 호출된다. 빈 문자열이면 파라미터를 지우는 것이 관례. */
  commit: (next: string) => void;
}

export interface SearchStateOptions {
  /** URL 등 외부 저장소와 양방향으로 묶을 때. 생략하면 로컬 전용. */
  param?: SearchParamBinding;
  /**
   * 커밋까지 지연 (ms). 기본 300.
   *
   * 고르는 기준 — **무엇을 아끼는가**로 정한다:
   *   0    이미 손에 쥔 목록을 거르는 화면(드롭다운·피커·모달). 아낄 왕복이 없고
   *        사용자는 즉시 좁혀지길 기대한다. 렌더 비용은 목록 상한으로 잡는다.
   *   300  URL 에 커밋하는 목록 페이지(라우팅 폭주 방지) · 서버 검색(요청 폭주 방지).
   */
  delay?: number;
  /** 커밋 전 정규화. 기본은 trim. 서버 검색이면 그대로 두는 편이 낫다. */
  normalize?: (raw: string) => string;
  /**
   * 이 글자 수 미만이면 빈 문자열로 커밋한다 (서버 검색에서 1글자 요청 방지).
   * 기본 0 = 제한 없음. 클라이언트 필터에는 쓰지 말 것 — 한 글자 검색이 정상 동작이다.
   */
  minLength?: number;
}

export interface SearchState {
  /** input 의 value 에 그대로 꽂는다. 항상 즉시 갱신된다. */
  value: string;
  /** input 의 onChange 에 그대로 꽂는다. */
  onChange: (e: { target: { value: string } }) => void;
  /** IME 조합 처리 — input 에 스프레드한다. `<input {...search.imeProps} />` */
  imeProps: {
    onCompositionStart: () => void;
    onCompositionEnd: (e: { currentTarget: { value: string } }) => void;
  };
  /** 필터·쿼리에 쓰는 값. 디바운스·정규화를 거친 결과. */
  committed: string;
  /** 입력값을 직접 세팅 (외부 버튼 등에서). 커밋은 평소대로 디바운스된다. */
  setValue: (next: string) => void;
  /** 즉시 비우고 즉시 커밋한다 (× 버튼). 디바운스를 기다리지 않는다. */
  clear: () => void;
  /** 아직 커밋되지 않은 입력이 있는가 — "검색 중…" 힌트용. */
  isPending: boolean;
}

const DEFAULT_DELAY = 300;
const defaultNormalize = (raw: string): string => raw.trim();

export function useSearchState(options?: SearchStateOptions): SearchState {
  const {
    param,
    delay = DEFAULT_DELAY,
    normalize = defaultNormalize,
    minLength = 0,
  } = options ?? {};

  // draft = 사용자가 지금 치고 있는 값. 항상 즉시 갱신된다.
  const [draft, setDraft] = useState<string>(param?.value ?? "");
  // 로컬 전용일 때의 커밋 값. param 이 있으면 param.value 가 커밋 값이다.
  const [localCommitted, setLocalCommitted] = useState<string>(
    normalize(param?.value ?? ""),
  );

  // 최신 값을 타이머 콜백에서 읽기 위한 ref — 의존성 배열에 넣으면 타이머가 매번 재생성된다.
  const optionsRef = useRef({ normalize, minLength, commit: param?.commit });
  optionsRef.current = { normalize, minLength, commit: param?.commit };

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 조합 중에도 커밋은 계속한다 — 검색은 중간 결과가 보이는 것이 정상이다.
  // (`ㅎ` → `호` → `홍` 으로 결과가 좁혀지는 것이 사용자가 기대하는 동작이고,
  //  조합을 막으면 `홍` 을 치고 멈춘 사용자에게 결과가 아예 안 나온다 — compositionend 가
  //  아직 안 왔기 때문. 텍스트를 소비하고 입력칸을 비우는 Enter 제출과는 반대 판단이다.
  //  그쪽은 `lib/ime.ts` 의 isImeComposing 으로 막는 것이 맞다.)
  // compositionend 는 "확정된 글자로 한 번 더 확실히 잡기" 용도로만 쓴다.
  // 방금 우리가 커밋해서 생긴 param.value 변화인지 — 그렇다면 draft 를 되돌리면 안 된다.
  const selfCommittedRef = useRef<string | null>(null);

  const applyCommit = useCallback((raw: string): void => {
    const { normalize: norm, minLength: min, commit } = optionsRef.current;
    const next = norm(raw);
    const effective = next.length < min ? "" : next;
    if (commit) {
      selfCommittedRef.current = effective;
      commit(effective);
    } else {
      setLocalCommitted(effective);
    }
  }, []);

  const schedule = useCallback(
    (raw: string): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (delay <= 0) {
        applyCommit(raw);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        applyCommit(raw);
      }, delay);
    },
    [delay, applyCommit],
  );

  const setValue = useCallback(
    (next: string): void => {
      setDraft(next);
      schedule(next);
    },
    [schedule],
  );

  const onChange = useCallback(
    (e: { target: { value: string } }): void => {
      setValue(e.target.value);
    },
    [setValue],
  );

  const onCompositionStart = useCallback((): void => {
    // 조합 시작 자체로는 아무것도 하지 않는다 — onChange 가 이미 draft 를 갱신하고 있고,
    // 커밋을 막으면 조합 중 결과가 멈춘다. 핸들러는 대칭성과 향후 확장을 위해 남긴다.
  }, []);

  const onCompositionEnd = useCallback(
    (e: { currentTarget: { value: string } }): void => {
      // 조합이 끝난 완성 글자로 다시 예약. onChange 가 조합 종료 후 한 번 더 오는
      // 브라우저도 있지만(Chrome), 안 오는 구현도 있어 여기서 확실히 잡는다.
      const value = e.currentTarget.value;
      setDraft(value);
      schedule(value);
    },
    [schedule],
  );

  const clear = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDraft("");
    applyCommit("");
  }, [applyCommit]);

  // 외부(URL)에서 값이 바뀐 경우 draft 를 따라가게 한다 — 뒤로가기, "필터 초기화" 버튼,
  // 다른 화면에서 돌아왔을 때. 단 우리가 방금 커밋해서 생긴 변화는 무시한다
  // (그걸 따라가면 타이핑 중 커서가 튄다).
  const externalValue = param?.value;
  useEffect(() => {
    if (externalValue === undefined) return;
    if (selfCommittedRef.current !== null) {
      if (selfCommittedRef.current === externalValue) {
        selfCommittedRef.current = null;
        return;
      }
      // 우리가 커밋한 값과 다르게 들어왔다 = 밖에서 덮어썼다. 아래로 흘려보낸다.
      selfCommittedRef.current = null;
    }
    setDraft((prev) => (normalize(prev) === externalValue ? prev : externalValue));
    // normalize 는 매 렌더 새 함수일 수 있어 의존성에서 뺀다 (값 비교에만 쓰인다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalValue]);

  // 언마운트 시 대기 중인 타이머 정리 — 사라진 컴포넌트가 URL 을 바꾸지 않게.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const committed = param ? normalize(param.value) : localCommitted;

  return {
    value: draft,
    onChange,
    imeProps: { onCompositionStart, onCompositionEnd },
    committed,
    setValue,
    clear,
    isPending: normalize(draft) !== committed,
  };
}
