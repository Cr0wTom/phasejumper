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

// Share links (§3.3): the PlanInput (not the result) as base64url JSON in the
// URL fragment, which browsers never send to the host. The recipient's
// browser regenerates the plan locally.

import { validatePlanInput, type PlanInput } from "@phasejumper/engine";

/** Larger fragments are refused rather than parsed (a PlanInput is ~2 KB). */
export const MAX_SHARE_PAYLOAD = 64 * 1024;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeShareLink(input: PlanInput): string {
  // Reported sleep is private: a shared plan is the plan, not the diary.
  const json = JSON.stringify(input, (key, value: unknown) =>
    key === "observedSleep" ? undefined : value,
  );
  return toBase64Url(new TextEncoder().encode(json));
}

export type DecodedShare =
  | { ok: true; input: PlanInput }
  | {
      ok: false;
      reason: "too-large" | "unreadable" | "invalid";
      issues?: readonly string[];
    };

export function decodeShareLink(payload: string): DecodedShare {
  if (payload.length > MAX_SHARE_PAYLOAD)
    return { ok: false, reason: "too-large" };
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(payload)),
    );
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "unreadable" };
  }
  const input = value as PlanInput;
  try {
    const check = validatePlanInput(input);
    return check.ok
      ? { ok: true, input }
      : { ok: false, reason: "invalid", issues: check.issues };
  } catch {
    // Missing nested fields make the engine's checks throw: not a plan input.
    return { ok: false, reason: "invalid" };
  }
}

/** The full share URL for the current page location. */
export function shareUrl(
  input: PlanInput,
  location: Location = window.location,
): string {
  return `${location.origin}${location.pathname}#p=${encodeShareLink(input)}`;
}
