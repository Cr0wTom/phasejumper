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

// Words PhaseJumper never uses in anything users or the public read.
// Health words keep the product general-wellness information, never a
// prescription. Third-party names and marks are stored encoded so this file
// does not publish them; decode locally to review the list.

export const HEALTH_TERMS: readonly string[] = [
  "treat",
  "cure",
  "diagnos",
  "prescri",
  "therap",
  "disorder",
  "patient",
  "dose",
  "dosage",
  "\\bmg\\b",
  "notification",
  "reminder",
  "guarantee",
  "clinically proven",
  "medical-grade",
];

const THIRD_PARTY_ENCODED =
  "WyJ0aW1lc2hpZnRlciIsICJ0aW1lIHNoaWZ0ZXIiLCAicXVpY2sgdHVybmFyb3VuZCIsICJwcmFjdGljYWxpdHkgZmlsdGVyIiwgIm15IGNpcmNhZGlhbiBkYXkiLCAiY2lyY2FkaWFuIHRpbWUiLCAiem9uZWp1bXBlciIsICJ6b25lIGp1bXBlciIsICJ0aGUgamV0IGxhZyBhcHAiXQ==";

export const THIRD_PARTY_TERMS: readonly string[] = JSON.parse(
  new TextDecoder().decode(
    Uint8Array.from(atob(THIRD_PARTY_ENCODED), (c) => c.charCodeAt(0)),
  ),
) as string[];

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive pattern for user-facing copy: health words + third-party terms. */
export function bannedCopyPattern(): RegExp {
  return new RegExp(
    [...HEALTH_TERMS, ...THIRD_PARTY_TERMS.map(escape)].join("|"),
    "i",
  );
}

/** Case-insensitive pattern for the repository-wide check: third-party terms only. */
export function thirdPartyPattern(): RegExp {
  return new RegExp(THIRD_PARTY_TERMS.map(escape).join("|"), "i");
}
