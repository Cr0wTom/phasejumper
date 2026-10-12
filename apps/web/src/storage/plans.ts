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

import type { PlanInput, PlanResult } from "@phasejumper/engine";
import { get, set } from "idb-keyval";

export interface StoredPlan {
  id: string;
  input: PlanInput;
  result: PlanResult;
  engineVersion: string;
  createdAt: string;
}

export function planKey(id: string): string {
  return `plan:${id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredPlan(value: unknown): value is StoredPlan {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.engineVersion !== "string") return false;
  if (typeof value.createdAt !== "string") return false;
  if (!isRecord(value.input)) return false;
  if (!isRecord(value.result)) return false;
  if (!isRecord(value.result.decision)) return false;
  if (typeof value.result.decision.explanation !== "string") return false;
  if (!Array.isArray(value.result.days)) return false;
  return true;
}

/** Rejects when IndexedDB is missing or the write fails. Callers surface that. */
export async function savePlan(plan: StoredPlan): Promise<void> {
  await set(planKey(plan.id), plan);
}

/**
 * Undefined means the key is missing or the value is unreadable.
 * A rejected promise means IndexedDB itself failed.
 */
export async function loadPlan(id: string): Promise<StoredPlan | undefined> {
  const value: unknown = await get<unknown>(planKey(id));
  if (value === undefined) return undefined;
  if (!isStoredPlan(value)) return undefined;
  return value;
}
