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

import type { PlanInput } from "@phasejumper/engine";
import { describe, expect, it } from "vitest";
import fixture from "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json";
import { feedbackMailto } from "../src/feedback";
import { feedbackMessages } from "../src/messages";
import {
  buildTechnicalReport,
  technicalReportText,
} from "../src/technicalReport";

const input = fixture as unknown as PlanInput;

function decodeMailto(url: string): { subject: string; body: string } {
  const prefix = `mailto:${feedbackMessages.address}?subject=`;
  expect(url.startsWith(prefix)).toBe(true);
  expect(url).not.toContain("+");
  const query = url.slice(url.indexOf("?") + 1);
  const bodyAt = query.indexOf("&body=");
  expect(query.startsWith("subject=")).toBe(true);
  expect(bodyAt).toBeGreaterThan("subject=".length);
  const encodedBody = query.slice(bodyAt + "&body=".length);
  expect(encodedBody).not.toContain("&");
  return {
    subject: decodeURIComponent(query.slice("subject=".length, bodyAt)),
    body: decodeURIComponent(encodedBody),
  };
}

describe("feedback mailto", () => {
  it("encodes bug and feature messages and leaves the trip out", async () => {
    const report = technicalReportText(
      await buildTechnicalReport({
        engineVersion: "0.2.0",
        appVersion: "0.0.0",
        userAgent: "test",
        input,
        warnings: [],
      }),
    );
    const bugUrl = feedbackMailto("bug", report);
    const featureUrl = feedbackMailto("feature", report);
    const bug = decodeMailto(bugUrl);
    const feature = decodeMailto(featureUrl);

    expect(bug.subject).toBe(feedbackMessages.bugSubject);
    expect(bug.body).toBe(feedbackMessages.bugBody(report));
    expect(bug.body).toContain(report);
    expect(bugUrl).toContain("PhaseJumper%20bug%20report");
    expect(feature.subject).toBe(feedbackMessages.featureSubject);
    expect(feature.body).toBe(feedbackMessages.featureBody);
    expect(featureUrl).toContain("PhaseJumper%20feature%20request");

    for (const leg of input.itinerary.legs) {
      for (const secret of [
        leg.departureAirport,
        leg.arrivalAirport,
        leg.departureLocal,
        leg.arrivalLocal,
      ]) {
        expect(bugUrl).not.toContain(secret);
        expect(bug.body).not.toContain(secret);
        expect(featureUrl).not.toContain(secret);
        expect(feature.body).not.toContain(secret);
      }
    }
  });

  it("uses the unavailable line when the bug report is null", () => {
    const decoded = decodeMailto(feedbackMailto("bug", null));
    expect(decoded.subject).toBe(feedbackMessages.bugSubject);
    expect(decoded.body).toBe(
      feedbackMessages.bugBody(feedbackMessages.reportUnavailable),
    );
    expect(decoded.body).toContain(feedbackMessages.reportUnavailable);
  });
});
