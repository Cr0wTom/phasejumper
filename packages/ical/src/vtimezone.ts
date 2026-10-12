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

// VTIMEZONE for the zones a plan uses. Built from Temporal transitions over
// the plan span, plus one transition of margin on each side. No zone
// database and no network. A zone with no transitions gets one STANDARD.

import { Temporal } from "temporal-polyfill";

interface Observance {
  kind: "STANDARD" | "DAYLIGHT";
  /** Local time in the offset the transition leaves (TZOFFSETFROM). */
  dtstart: string;
  from: string;
  to: string;
}

function formatOffset(offsetNs: number): string {
  const sign = offsetNs < 0 ? "-" : "+";
  const total = Math.abs(Math.round(offsetNs / 1_000_000_000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const base = `${sign}${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
  if (seconds === 0) return base;
  return `${base}${String(seconds).padStart(2, "0")}`;
}

function formatLocal(zoned: Temporal.ZonedDateTime): string {
  const pad = (value: number, width = 2): string =>
    String(value).padStart(width, "0");
  return `${pad(zoned.year, 4)}${pad(zoned.month)}${pad(zoned.day)}T${pad(zoned.hour)}${pad(zoned.minute)}${pad(zoned.second)}`;
}

function constant(offsetNs: number): Observance {
  const offset = formatOffset(offsetNs);
  return {
    kind: "STANDARD",
    dtstart: "19700101T000000",
    from: offset,
    to: offset,
  };
}

/**
 * DTSTART is the clock reading in the offset being left. Temporal reports
 * the first instant of the new offset, so the old wall time is that instant
 * read in the previous offset.
 */
function fromTransition(
  tzid: string,
  transition: Temporal.ZonedDateTime,
): Observance {
  const instant = transition.toInstant();
  const fromNs = instant
    .subtract({ nanoseconds: 1 })
    .toZonedDateTimeISO(tzid).offsetNanoseconds;
  const toNs = transition.offsetNanoseconds;
  // toZonedDateTimeISO rejects offset ids that include seconds (Asia/Dubai
  // left +03:41:12 in 1920). Shift the instant by the offset instead.
  const oldWall = Temporal.Instant.fromEpochNanoseconds(
    instant.epochNanoseconds + BigInt(fromNs),
  ).toZonedDateTimeISO("UTC");
  return {
    kind: toNs > fromNs ? "DAYLIGHT" : "STANDARD",
    dtstart: formatLocal(oldWall),
    from: formatOffset(fromNs),
    to: formatOffset(toNs),
  };
}

function transitions(
  tzid: string,
  spanStart: Temporal.Instant,
  spanEnd: Temporal.Instant,
): Temporal.ZonedDateTime[] {
  const startZ = spanStart.toZonedDateTimeISO(tzid);
  const previous = startZ.getTimeZoneTransition("previous");
  const next = startZ.getTimeZoneTransition("next");
  if (previous == null && next == null) return [];

  const out: Temporal.ZonedDateTime[] = [];
  const seen = new Set<string>();
  const push = (zoned: Temporal.ZonedDateTime): boolean => {
    const key = zoned.toInstant().toString();
    if (seen.has(key)) return false;
    seen.add(key);
    out.push(zoned);
    return true;
  };

  if (previous != null) push(previous);

  let cursor: Temporal.ZonedDateTime | null =
    previous != null ? previous.getTimeZoneTransition("next") : next;

  // A transition exactly at the span start is not "previous".
  if (previous == null) {
    const justBefore = startZ
      .toInstant()
      .subtract({ nanoseconds: 1 })
      .toZonedDateTimeISO(tzid);
    if (justBefore.offsetNanoseconds !== startZ.offsetNanoseconds) {
      push(startZ);
      cursor = startZ.getTimeZoneTransition("next");
    }
  }

  while (cursor != null) {
    if (!push(cursor)) break;
    if (Temporal.Instant.compare(cursor.toInstant(), spanEnd) > 0) break;
    cursor = cursor.getTimeZoneTransition("next");
  }
  return out;
}

/** One VTIMEZONE component for `tzid` covering `[spanStart, spanEnd]`. */
export function vtimezoneComponent(
  tzid: string,
  spanStart: Temporal.Instant,
  spanEnd: Temporal.Instant,
): string {
  const changes = transitions(tzid, spanStart, spanEnd);
  const rows: Observance[] = changes.map((change) =>
    fromTransition(tzid, change),
  );
  const first = changes[0];
  if (
    first === undefined ||
    Temporal.Instant.compare(first.toInstant(), spanStart) > 0
  ) {
    rows.unshift(
      constant(spanStart.toZonedDateTimeISO(tzid).offsetNanoseconds),
    );
  }

  const lines = ["BEGIN:VTIMEZONE", `TZID:${tzid}`];
  for (const row of rows) {
    lines.push(
      `BEGIN:${row.kind}`,
      `DTSTART:${row.dtstart}`,
      `TZOFFSETFROM:${row.from}`,
      `TZOFFSETTO:${row.to}`,
      `END:${row.kind}`,
    );
  }
  lines.push("END:VTIMEZONE");
  return lines.join("\n");
}
