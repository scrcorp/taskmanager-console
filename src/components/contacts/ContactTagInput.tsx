"use client";

/**
 * 태그 입력 — 자유 입력 + 서버 자동완성 (설계 D7).
 *
 * 태그는 문자열 배열로 보낸다. 서버가 `lower(trim)` 키로 org 단위 upsert 하므로
 * 화면에서도 같은 키로 중복을 막는다(표기만 다른 중복 방지).
 * 자동완성 질의는 **prefix** 검색이다(계약 `GET /contacts/tags`).
 */

import React, { useState } from "react";
import { X } from "lucide-react";

import { useContactTags } from "@/hooks/useContacts";
import { useDebounce } from "@/hooks/useDebounce";
import { CONTACT_LIMITS } from "./contactDraft";

interface ContactTagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
}

function tagKey(value: string): string {
  return value.trim().toLowerCase();
}

export function ContactTagInput({
  value,
  onChange,
  error,
}: ContactTagInputProps): React.ReactElement {
  const [text, setText] = useState<string>("");
  const [open, setOpen] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const debounced = useDebounce(text.trim(), 200);
  const suggestionsQuery = useContactTags(debounced, 8);

  const chosen = new Set(value.map(tagKey));
  const suggestions = (suggestionsQuery.data ?? []).filter((t) => !chosen.has(t.key));

  function addTag(raw: string): void {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    if (trimmed.length > CONTACT_LIMITS.tagLength) {
      setLocalError(`Tags can be at most ${CONTACT_LIMITS.tagLength} characters.`);
      return;
    }
    if (value.length >= CONTACT_LIMITS.tags) {
      setLocalError(`Up to ${CONTACT_LIMITS.tags} tags. Remove one before adding another.`);
      return;
    }
    if (chosen.has(tagKey(trimmed))) {
      // 이미 있는 태그 — 조용히 무시하지 않고 왜 안 들어갔는지 말해준다.
      setLocalError(`"${trimmed}" is already on this contact.`);
      setText("");
      return;
    }
    setLocalError(null);
    onChange([...value, trimmed]);
    setText("");
  }

  function removeTag(index: number): void {
    setLocalError(null);
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    // IME(한글/일본어/중국어) 조합 중의 Enter 는 **"조합 확정"이지 "제출"이 아니다.**
    //
    // 여기서 걸러내지 않으면 `이런수가` 를 치고 Enter 한 번에 태그가 두 개 생긴다:
    // 조합 중 keydown 을 제출로 받아 `이런` 을 넣고 입력칸을 비우는데, 곧이어 IME 가
    // 조합을 확정하면서 남은 `런` 을 **비워진 칸에 다시 써넣기** 때문이다.
    // (실측 2026-08-15: `이런`, `런`, `수가`, `가` 4개가 들어갔다.)
    //
    // 조합 확정용 Enter 를 흘려보내면 확정된 글자가 입력칸에 남고, 사용자는 Enter 를
    // 한 번 더 눌러 태그를 넣는다 — IME 를 쓰는 칩 입력의 표준 동작이다.
    // keyCode 229 는 nativeEvent.isComposing 을 안 채우는 브라우저용 보조 신호.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(text);
      return;
    }
    if (e.key === "Backspace" && text.length === 0 && value.length > 0) {
      e.preventDefault();
      removeTag(value.length - 1);
    }
  }

  const shownError = error ?? localError;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="contact-tag-input" className="text-sm font-medium text-text-secondary">
        Tags
      </label>

      <div className="rounded-lg border border-border bg-surface px-2 py-2">
        {value.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {value.map((tag, index) => (
              <span
                key={`${tagKey(tag)}-${index}`}
                className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(index)}
                  className="rounded-full p-0.5 transition-colors hover:bg-accent/20"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <input
            id="contact-tag-input"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setLocalError(null);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpen(true)}
            // blur 즉시 닫으면 제안 클릭이 먹히지 않는다 — 한 tick 미룬다.
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder="Type a tag and press Enter (e.g. vendor)"
            className="w-full bg-transparent px-1 py-1 text-sm text-text placeholder:text-text-muted focus:outline-none"
            aria-label="Add a tag"
          />

          {open && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-auto rounded-lg border border-border bg-card py-1 shadow-xl">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    // onMouseDown: blur 보다 먼저 걸려야 클릭이 살아남는다.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(s.name)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-text transition-colors hover:bg-surface-hover"
                  >
                    <span>{s.name}</span>
                    <span className="text-xs text-text-muted">
                      {s.usage_count} contact{s.usage_count === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {shownError ? (
        <p className="text-xs text-danger">{shownError}</p>
      ) : (
        <p className="text-xs text-text-muted">
          Existing tags are suggested as you type. New tags are created on save.
        </p>
      )}
    </div>
  );
}
