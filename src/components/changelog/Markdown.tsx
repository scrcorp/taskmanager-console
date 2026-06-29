"use client";

import React, { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Markdown 렌더러 — 신뢰된 운영자가 작성한 markdown(이미지 포함)을
 * HTML 로 변환 후 DOMPurify 로 sanitize 하여 렌더한다.
 *
 * 데이터가 client React Query 훅에서 도착한 뒤에만 마운트되므로
 * sanitize 는 브라우저(window 존재)에서 수행된다.
 *
 * @param content - markdown 원문
 */
export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}): React.ReactElement {
  const html: string = useMemo(() => {
    const raw = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);

  return (
    <div
      className={`changelog-prose ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
