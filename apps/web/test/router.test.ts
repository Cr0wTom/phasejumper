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
import { parseHash } from "../src/router";

describe("parseHash", () => {
  it("sends the root to Start and unknown hashes nowhere (T13)", () => {
    expect(parseHash("")).toEqual({ name: "start" });
    expect(parseHash("#")).toEqual({ name: "start" });
    expect(parseHash("#/")).toEqual({ name: "start" });
    expect(parseHash("#/nowhere")).toBeNull();
    expect(parseHash("#/trip")).toEqual({ name: "trip" });
  });

  it("reads the settings, evidence and legal routes", () => {
    expect(parseHash("#/settings")).toEqual({ name: "settings" });
    expect(parseHash("#/evidence")).toEqual({ name: "evidence" });
    expect(parseHash("#/legal")).toEqual({ name: "legal" });
    expect(parseHash("#/settings/x")).toBeNull();
  });

  it("reads a plan id", () => {
    expect(parseHash("#/plan/abc")).toEqual({ name: "plan", id: "abc" });
    expect(parseHash("#/plan/a%2Fb")).toEqual({ name: "plan", id: "a/b" });
    expect(parseHash("#/plan/")).toBeNull();
  });

  it("reads the plan, today, edit and share routes (T09)", () => {
    expect(parseHash("#/plan")).toEqual({ name: "plan" });
    expect(parseHash("#/today")).toEqual({ name: "today" });
    expect(parseHash("#/trip/abc")).toEqual({ name: "trip", editId: "abc" });
    expect(parseHash("#p=eyJ9")).toEqual({ name: "share", payload: "eyJ9" });
    expect(parseHash("#p=")).toBeNull();
  });
});
