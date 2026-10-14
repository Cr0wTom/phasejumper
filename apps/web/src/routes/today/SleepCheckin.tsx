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

// "How did you sleep last night?": the traveler corrects last night's planned
// sleep, and the plan is rebuilt from what they report (PlanInput
// .observedSleep). Reports stay on this device and never go into share links.

import { generatePlan, ENGINE_VERSION, type Block } from "@phasejumper/engine";
import { useState, type FormEvent } from "react";
import { Temporal } from "temporal-polyfill";
import { TimeField } from "../../components/TimeField";
import { wallTime } from "../../format";
import { planMessages as m } from "../../messages";
import { savePlan, type StoredPlan } from "../../storage/plans";
import { buttonClass, errorClass, h2Class, surfaceClass } from "../../ui";

/** The planned main sleep that ended most recently before now (within 18 h). */
export function lastNight(plan: StoredPlan, now: string): Block | undefined {
  const at = Temporal.Instant.from(now);
  return plan.result.days
    .flatMap((d) => d.blocks)
    .filter((b) => b.kind === "SLEEP" || b.kind === "SLEEP_INFLIGHT")
    .filter((b) => {
      const end = Temporal.Instant.from(b.endUtc);
      const age = at.since(end).total({ unit: "hours" });
      return age >= 0 && age <= 18;
    })
    .sort((a, b) => b.endUtc.localeCompare(a.endUtc))[0];
}

/** The instant nearest to `around` whose wall time in `zone` is `hhmm`. */
function nearest(
  hhmm: string,
  around: Temporal.Instant,
  zone: string,
): Temporal.Instant {
  const [h, mi] = hhmm.split(":").map(Number);
  const base = around
    .toZonedDateTimeISO(zone)
    .with({ hour: h ?? 0, minute: mi ?? 0, second: 0, millisecond: 0 });
  const candidates = [
    base.subtract({ days: 1 }),
    base,
    base.add({ days: 1 }),
  ].map((z) => z.toInstant());
  return candidates.reduce((best, c) =>
    Math.abs(c.since(around).total({ unit: "minutes" })) <
    Math.abs(best.since(around).total({ unit: "minutes" }))
      ? c
      : best,
  );
}

export function SleepCheckin({
  plan,
  night,
  zone,
  now,
  onSaved,
}: {
  plan: StoredPlan;
  night: Block;
  /** Where the traveler is now; times are entered in this zone. */
  zone: string;
  /** Current instant (ISO); a report cannot end after it. */
  now: string;
  onSaved: (plan: StoredPlan) => void;
}) {
  const plannedStart = Temporal.Instant.from(night.startUtc);
  const plannedEnd = Temporal.Instant.from(night.endUtc);
  const [bed, setBed] = useState(wallTime(night.startUtc, zone));
  const [wake, setWake] = useState(wallTime(night.endUtc, zone));
  const [notice, setNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (bed === "" || wake === "") return;
    const start = nearest(bed, plannedStart, zone);
    const end = nearest(wake, plannedEnd, zone);
    const hours = end.since(start).total({ unit: "hours" });
    if (hours <= 0 || hours > 16) {
      setNotice({ tone: "error", text: m.checkinInvalid });
      return;
    }
    if (Temporal.Instant.compare(end, Temporal.Instant.from(now)) > 0) {
      setNotice({ tone: "error", text: m.checkinFuture });
      return;
    }
    if (start.equals(plannedStart) && end.equals(plannedEnd)) {
      setNotice({ tone: "ok", text: m.checkinSame });
      return;
    }
    // One report per night: replace any earlier report that overlaps it.
    const others = (plan.input.observedSleep ?? []).filter((r) => {
      const s = Temporal.Instant.from(r.start);
      const e = Temporal.Instant.from(r.end);
      return (
        Temporal.Instant.compare(e, start) <= 0 ||
        Temporal.Instant.compare(s, end) >= 0
      );
    });
    const input = {
      ...plan.input,
      observedSleep: [
        ...others,
        { start: start.toString(), end: end.toString() },
      ],
    };
    setSaving(true);
    try {
      const next: StoredPlan = {
        ...plan,
        input,
        result: generatePlan(input),
        engineVersion: ENGINE_VERSION,
      };
      await savePlan(next);
      setNotice({ tone: "ok", text: m.checkinSaved });
      onSaved(next);
    } catch {
      setNotice({ tone: "error", text: m.checkinFailed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={surfaceClass} aria-labelledby="checkin-heading">
      <h2 id="checkin-heading" className={h2Class}>
        {m.checkinHeading}
      </h2>
      <p className="text-13 leading-body text-fg-muted">{m.checkinHint}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => void onSubmit(e)}
        noValidate
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TimeField
            id="checkin-bed"
            label={m.checkinBed}
            value={bed}
            onChange={setBed}
          />
          <TimeField
            id="checkin-wake"
            label={m.checkinWake}
            value={wake}
            onChange={setWake}
          />
        </div>
        <div>
          <button type="submit" className={buttonClass} disabled={saving}>
            {m.checkinSave}
          </button>
        </div>
        {notice === null ? null : notice.tone === "ok" ? (
          <p role="status">{notice.text}</p>
        ) : (
          <p role="alert" className={errorClass}>
            {notice.text}
          </p>
        )}
      </form>
    </section>
  );
}
