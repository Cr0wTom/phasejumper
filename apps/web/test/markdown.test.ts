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

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import evidence from "../../../docs/EVIDENCE.md?raw";
import { Markdown } from "../src/components/Markdown";

function html(source: string): string {
  return renderToStaticMarkup(createElement(Markdown, { source }));
}

describe("Markdown (T13 evidence page)", () => {
  it("renders headings, paragraphs, lists, bold, links and rules", () => {
    const out = html(
      "# Title\n\nSome **bold** text\nwrapped.\n\n## Part\n\n- one [link](https://example.org/a)\n- two\n\n---\n\nEnd.",
    );
    expect(out).toContain(">Title</h1>");
    expect(out).toContain("Some <strong>bold</strong> text wrapped.</p>");
    expect(out).toContain(">Part</h2>");
    expect(out).toMatch(
      /<li>one <a [^>]*href="https:\/\/example.org\/a"[^>]*rel="noopener noreferrer"[^>]*>link<\/a><\/li>/,
    );
    expect(out).toContain("<li>two</li>");
    expect(out).toContain("<hr");
  });

  it("never injects HTML and ignores non-https links", () => {
    const out = html(
      "<script>x</script> [a](javascript:alert(1)) [b](http://x)",
    );
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("href=");
  });

  it("renders docs/EVIDENCE.md with every link pointing to https", () => {
    const out = html(evidence);
    expect(out.match(/<h1/g)).toHaveLength(1);
    const hrefs = [...out.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
  });
});
