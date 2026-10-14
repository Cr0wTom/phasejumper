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

import { generatePlan, type PlanInput } from "@phasejumper/engine";
import { describe, expect, it } from "vitest";
import {
  decodeShareLink,
  encodeShareLink,
  MAX_SHARE_PAYLOAD,
} from "../src/storage/shareLink";
import prgTyo from "../../../packages/engine/test/fixtures/prg-tyo-advance.input.json";
import nycLon from "../../../packages/engine/test/fixtures/nyc-lon-dst.input.json";

describe("share links (§3.3)", () => {
  it("round-trips a PlanInput and regenerates the identical plan", () => {
    for (const fixture of [prgTyo, nycLon]) {
      const input = fixture as unknown as PlanInput;
      const payload = encodeShareLink(input);
      expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
      const decoded = decodeShareLink(payload);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.input).toEqual(input);
        expect(JSON.stringify(generatePlan(decoded.input))).toBe(
          JSON.stringify(generatePlan(input)),
        );
      }
    }
  });

  it("keeps non-ASCII text intact", () => {
    const input = { ...(prgTyo as unknown as PlanInput) };
    input.constraints = {
      mustBeAwake: [
        {
          start: "2027-01-17T09:00",
          end: "2027-01-17T10:00",
          tz: "Asia/Tokyo",
          label: "Café → 会議",
        },
      ],
    };
    const decoded = decodeShareLink(encodeShareLink(input));
    expect(
      decoded.ok && decoded.input.constraints?.mustBeAwake?.[0]?.label,
    ).toBe("Café → 会議");
  });

  it("never includes reported sleep", () => {
    const input = {
      ...(prgTyo as unknown as PlanInput),
      observedSleep: [
        { start: "2027-01-16T14:00:00Z", end: "2027-01-16T22:00:00Z" },
      ],
    };
    const decoded = decodeShareLink(encodeShareLink(input));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.input).not.toHaveProperty("observedSleep");
  });

  it("rejects damaged, oversized and non-plan payloads with a reason", () => {
    expect(decodeShareLink("@@@")).toEqual({ ok: false, reason: "unreadable" });
    expect(
      decodeShareLink(encodeShareLink([] as unknown as PlanInput)),
    ).toEqual({ ok: false, reason: "unreadable" });
    expect(decodeShareLink("A".repeat(MAX_SHARE_PAYLOAD + 1))).toEqual({
      ok: false,
      reason: "too-large",
    });
    const bad = { ...(prgTyo as unknown as PlanInput), now: "yesterday" };
    expect(decodeShareLink(encodeShareLink(bad))).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(
      decodeShareLink(encodeShareLink({ hello: 1 } as unknown as PlanInput)),
    ).toMatchObject({ ok: false, reason: "invalid" });
  });
});
