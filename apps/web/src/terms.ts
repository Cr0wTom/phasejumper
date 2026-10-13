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

/** Bump when TERMS.md or PRIVACY.md change; the gate re-prompts. */
export const TERMS_VERSION = 2;

export const TERMS_STORAGE_KEY = "pj.terms";

export interface TermsAcceptance {
  acceptedTermsVersion: number;
  /** ISO instant. */
  at: string;
}

export type TermsStatus =
  | { kind: "accepted"; record: TermsAcceptance }
  | { kind: "missing" }
  | { kind: "outdated"; record: TermsAcceptance }
  | { kind: "unavailable" };

let memory: TermsAcceptance | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTermsRecord(raw: string): TermsAcceptance | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (typeof value.acceptedTermsVersion !== "number") return undefined;
  if (typeof value.at !== "string" || value.at.length === 0) return undefined;
  return { acceptedTermsVersion: value.acceptedTermsVersion, at: value.at };
}

function fromMemory(): TermsStatus | undefined {
  if (memory === null) return undefined;
  if (memory.acceptedTermsVersion === TERMS_VERSION) {
    return { kind: "accepted", record: memory };
  }
  return { kind: "outdated", record: memory };
}

export function readTermsAcceptance(): TermsStatus {
  const cached = fromMemory();
  if (cached?.kind === "accepted") return cached;
  try {
    const raw = localStorage.getItem(TERMS_STORAGE_KEY);
    if (raw === null) return cached ?? { kind: "missing" };
    const record = parseTermsRecord(raw);
    if (record === undefined) return cached ?? { kind: "missing" };
    if (record.acceptedTermsVersion === TERMS_VERSION) {
      memory = record;
      return { kind: "accepted", record };
    }
    return { kind: "outdated", record };
  } catch {
    return cached ?? { kind: "unavailable" };
  }
}

export function termsAccepted(): boolean {
  return readTermsAcceptance().kind === "accepted";
}

export function termsOutdated(): boolean {
  return readTermsAcceptance().kind === "outdated";
}

/** Stores the current version. On storage failure the record stays in memory. */
export function writeTermsAcceptance(at: string): { ok: boolean } {
  const record: TermsAcceptance = { acceptedTermsVersion: TERMS_VERSION, at };
  memory = record;
  try {
    localStorage.setItem(TERMS_STORAGE_KEY, JSON.stringify(record));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
