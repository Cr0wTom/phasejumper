/*
 * Copyright 2026 PhaseJumper contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Renders the small Markdown subset used by docs/EVIDENCE.md — headings,
// paragraphs, "- " lists, **bold**, [links](https://…) and "---" — as React
// elements. No HTML is ever injected.

import type { ReactNode } from "react";
import { linkClass } from "../ui";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1] !== undefined) {
      out.push(<strong key={`${key}-b${i}`}>{m[1]}</strong>);
    } else if (m[2] !== undefined && m[3] !== undefined) {
      out.push(
        <a
          key={`${key}-a${i}`}
          className={linkClass}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
        >
          {m[2]}
        </a>,
      );
    }
    last = at + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({
  source,
  headingOffset = 0,
}: {
  source: string;
  headingOffset?: number;
}) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];
  const flush = (k: number): void => {
    if (paragraph.length > 0) {
      blocks.push(
        <p key={`p${k}`} className="leading-body">
          {inline(paragraph.join(" "), `p${k}`)}
        </p>,
      );
      paragraph = [];
    }
    if (list.length > 0) {
      blocks.push(
        <ul
          key={`l${k}`}
          className="flex list-disc flex-col gap-1 pl-5 text-15 leading-body"
        >
          {list.map((item, j) => (
            <li key={j}>{inline(item, `l${k}-${j}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  source.split("\n").forEach((raw, k) => {
    const line = raw.trimEnd();
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (line === "") {
      flush(k);
    } else if (line === "---") {
      flush(k);
      blocks.push(<hr key={`hr${k}`} className="border-line" />);
    } else if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flush(k);
      const level = Math.min(6, heading[1].length + headingOffset);
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      blocks.push(
        <Tag
          key={`h${k}`}
          className={
            level <= 1
              ? "text-28 font-semibold leading-display"
              : "mt-2 text-17 font-medium leading-display"
          }
        >
          {heading[2]}
        </Tag>,
      );
    } else if (line.startsWith("- ")) {
      if (paragraph.length > 0) flush(k);
      list.push(line.slice(2));
    } else {
      paragraph.push(line);
    }
  });
  flush(-1);
  return <div className="flex flex-col gap-3">{blocks}</div>;
}
