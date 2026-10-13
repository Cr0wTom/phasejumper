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

import { describe, expect, it } from "vitest";
import { scanUserFacingCopy } from "../../../scripts/banned-terms";

const health = ["treat", "dose"] as const;
const third = ["acmeapp"] as const;

describe("scanUserFacingCopy", () => {
  it("fails on a seeded violation", () => {
    const result = scanUserFacingCopy(
      [
        {
          file: "apps/web/src/messages.ts",
          text: "This will treat jet lag.\n",
        },
      ],
      health,
      [],
      [],
    );
    expect(result.hits).toEqual([
      { file: "apps/web/src/messages.ts", line: 1, term: "treat" },
    ]);
    expect(result.unusedAllow).toEqual([]);
  });

  it("passes an allow-listed hit", () => {
    const allow = [
      {
        file: "docs/CONTRIBUTING.md",
        contains: "treat, treatment",
        term: "treat",
        justification: "the banned-words list itself",
      },
    ];
    const result = scanUserFacingCopy(
      [
        {
          file: "docs/CONTRIBUTING.md",
          text: "> treat, treatment, cure\n",
        },
      ],
      health,
      [],
      allow,
    );
    expect(result.hits).toEqual([]);
    expect(result.unusedAllow).toEqual([]);
  });

  it("fails on an unused allow-list entry", () => {
    const allow = [
      {
        file: "README.md",
        contains: "treat",
        term: "treat",
        justification: "no longer present",
      },
    ];
    const result = scanUserFacingCopy(
      [{ file: "README.md", text: "hello\n" }],
      health,
      [],
      allow,
    );
    expect(result.hits).toEqual([]);
    expect(result.unusedAllow).toEqual(allow);
  });

  it("never allow-lists a third-party term", () => {
    const allow = [
      {
        file: "README.md",
        contains: "acmeapp",
        term: "acmeapp",
        justification: "not allowed",
      },
    ];
    const result = scanUserFacingCopy(
      [{ file: "README.md", text: "acmeapp is great\n" }],
      health,
      third,
      allow,
    );
    expect(result.hits).toEqual([
      { file: "README.md", line: 1, term: "(third-party)" },
    ]);
    expect(result.unusedAllow).toEqual(allow);
  });
});
