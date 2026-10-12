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

// Import (§3.3): a backup file from Settings, or a single PlanInput JSON.
// Every input is checked by the engine before anything is saved; a file
// with any bad entry imports nothing.

import { validatePlanInput, type PlanInput } from "@phasejumper/engine";

/** Larger files are refused before parsing. A backup of many trips is far smaller. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type ParsedImport =
  | { ok: true; inputs: PlanInput[] }
  | {
      ok: false;
      reason: "too-large" | "not-json" | "not-plans" | "invalid";
      detail?: string;
    };

function checkInput(
  value: unknown,
): { ok: true; input: PlanInput } | { ok: false; detail: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, detail: "not an object" };
  }
  try {
    const check = validatePlanInput(value as PlanInput);
    return check.ok
      ? { ok: true, input: value as PlanInput }
      : { ok: false, detail: check.issues.join("; ") };
  } catch {
    return { ok: false, detail: "missing trip fields" };
  }
}

export function parseImport(text: string): ParsedImport {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    return { ok: false, reason: "too-large" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-json" };
  }
  const entries: unknown[] =
    typeof value === "object" &&
    value !== null &&
    (value as { format?: unknown }).format === "phasejumper-plans" &&
    Array.isArray((value as { plans?: unknown }).plans)
      ? ((value as { plans: Array<{ input?: unknown }> }).plans.map(
          (p) => p?.input,
        ) as unknown[])
      : typeof value === "object" && value !== null && "traveler" in value
        ? [value]
        : [];
  if (entries.length === 0) return { ok: false, reason: "not-plans" };
  const inputs: PlanInput[] = [];
  for (const [i, entry] of entries.entries()) {
    const checked = checkInput(entry);
    if (!checked.ok)
      return {
        ok: false,
        reason: "invalid",
        detail: `trip ${i + 1}: ${checked.detail}`,
      };
    inputs.push(checked.input);
  }
  return { ok: true, inputs };
}
