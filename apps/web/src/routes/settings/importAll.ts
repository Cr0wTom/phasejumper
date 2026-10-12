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

import {
  ENGINE_VERSION,
  generatePlan,
  type PlanInput,
  type PlanResult,
} from "@phasejumper/engine";
import { currentInstant } from "../../clock";
import { deletePlan, savePlan } from "../../storage/plans";

export type ImportOutcome =
  | { ok: true; count: number }
  | { ok: false; reason: "invalid"; detail: string }
  | { ok: false; reason: "save-failed" };

/**
 * Plans every input first, then saves them under new ids. If any input
 * cannot be planned or any save fails, nothing is left behind.
 */
export async function importAll(
  inputs: readonly PlanInput[],
): Promise<ImportOutcome> {
  const planned: Array<{ input: PlanInput; result: PlanResult }> = [];
  for (const [i, input] of inputs.entries()) {
    try {
      planned.push({ input, result: generatePlan(input) });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: "invalid", detail: `trip ${i + 1}: ${why}` };
    }
  }
  const saved: string[] = [];
  const createdAt = currentInstant();
  try {
    for (const { input, result } of planned) {
      const id = crypto.randomUUID();
      await savePlan({
        id,
        input,
        result,
        engineVersion: ENGINE_VERSION,
        createdAt,
      });
      saved.push(id);
    }
  } catch {
    await Promise.allSettled(saved.map((id) => deletePlan(id)));
    return { ok: false, reason: "save-failed" };
  }
  return { ok: true, count: saved.length };
}
