"use client";

/**
 * 사용자 입력 텍스트 안의 http/https URL 을 클릭 가능한 링크로 렌더.
 *
 * dangerouslySetInnerHTML 을 쓰지 않는다 — description 은 사용자 입력이라 HTML 로
 * 넣는 순간 XSS 다. 텍스트를 정규식으로 쪼개서 매칭 조각만 <a> 엘리먼트로 만든다.
 * http/https 외의 스킴(javascript:, data: 등)은 링크화하지 않고 평문으로 남긴다.
 */

import React from "react";

const URL_RE = /(https?:\/\/[^\s<]+)/g;

/** 문장 끝 구두점이 URL 에 붙어 들어오는 흔한 케이스를 링크에서 떼어낸다. */
function splitTrailingPunctuation(url: string): [string, string] {
  const m = /[).,!?:;'"]+$/.exec(url);
  if (!m) return [url, ""];
  // 괄호가 균형을 이루면 URL 의 일부로 본다 (위키 링크 등).
  const trimmed = url.slice(0, url.length - m[0].length);
  return [trimmed, url.slice(trimmed.length)];
}

export function LinkifiedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}): React.ReactElement {
  const parts = text.split(URL_RE);
  return (
    <p className={className}>
      {parts.map((part, i) => {
        // split 의 홀수 인덱스가 캡처된 URL.
        if (i % 2 === 1) {
          const [href, tail] = splitTrailingPunctuation(part);
          return (
            <React.Fragment key={i}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline break-all hover:opacity-80"
              >
                {href}
              </a>
              {tail}
            </React.Fragment>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}
