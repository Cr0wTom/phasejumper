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

import type { PlanInput, WarningCode } from "@phasejumper/engine";
import { flags } from "./flags";

export interface TechnicalReport {
  engineVersion: string;
  appVersion: string;
  userAgent: string;
  flags: typeof flags;
  hashedInputDigest: string | null;
  warnings: WarningCode[];
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of JSON.stringify(input). Never include the input itself in a report. */
export async function hashedInputDigest(input: PlanInput): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(input));
  return hex(await crypto.subtle.digest("SHA-256", encoded));
}

export function technicalReportText(report: TechnicalReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function buildTechnicalReport(args: {
  engineVersion: string;
  appVersion: string;
  userAgent: string;
  input: PlanInput | undefined;
  warnings: readonly WarningCode[];
}): Promise<TechnicalReport> {
  return {
    engineVersion: args.engineVersion,
    appVersion: args.appVersion,
    userAgent: args.userAgent,
    flags,
    hashedInputDigest:
      args.input === undefined ? null : await hashedInputDigest(args.input),
    warnings: [...args.warnings],
  };
}
