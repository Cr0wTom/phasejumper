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

// Pure iCalendar export. No I/O and no clock: DTSTAMP is the plan's injected
// `now`. ical-generator writes one TZID per event and only X- properties, so
// flight DTEND (arrival zone) and RFC 7986 COLOR are applied to its text.

import type { FlightLeg, PlanInput, PlanResult } from "@phasejumper/engine";
import ical, {
  foldLines,
  ICalAlarmType,
  ICalCalendarMethod,
} from "ical-generator";
import { Temporal } from "temporal-polyfill";
import {
  alarmMinutes,
  alarmText,
  calendarName,
  eventColor,
  eventDescription,
  eventSummary,
  FLIGHT_COLOR,
  flightSummary,
  isExportedKind,
  isMarker,
  type ExportedKind,
} from "./copy";
import { vtimezoneComponent } from "./vtimezone";

export interface ToIcsArgs {
  planId: string;
  input: PlanInput;
  result: PlanResult;
  sequence: number;
}

interface EventPatch {
  color: string;
  dtend?: string;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function formatWall(zoned: Temporal.ZonedDateTime): string {
  return `${pad(zoned.year, 4)}${pad(zoned.month)}${pad(zoned.day)}T${pad(zoned.hour)}${pad(zoned.minute)}${pad(zoned.second)}`;
}

function zonedWall(local: string, tz: string): Temporal.ZonedDateTime {
  return Temporal.PlainDateTime.from(local).toZonedDateTime(tz);
}

function elapsedMinutes(
  start: Temporal.ZonedDateTime,
  end: Temporal.ZonedDateTime,
): number {
  return Math.round(
    end.toInstant().since(start.toInstant()).total({ unit: "minutes" }),
  );
}

function planSpan(
  input: PlanInput,
  result: PlanResult,
): { start: Temporal.Instant; end: Temporal.Instant } {
  let start: Temporal.Instant | undefined;
  let end: Temporal.Instant | undefined;
  const consider = (instant: Temporal.Instant): void => {
    if (start === undefined || Temporal.Instant.compare(instant, start) < 0) {
      start = instant;
    }
    if (end === undefined || Temporal.Instant.compare(instant, end) > 0) {
      end = instant;
    }
  };
  for (const day of result.days) {
    for (const block of day.blocks) {
      consider(Temporal.Instant.from(block.startUtc));
      consider(Temporal.Instant.from(block.endUtc));
    }
  }
  for (const leg of input.itinerary.legs) {
    consider(zonedWall(leg.departureLocal, leg.departureTz).toInstant());
    consider(zonedWall(leg.arrivalLocal, leg.arrivalTz).toInstant());
  }
  const fallback = Temporal.Instant.from(input.now);
  const spanStart = start ?? fallback;
  let spanEnd = end ?? fallback;
  if (Temporal.Instant.compare(spanStart, spanEnd) >= 0) {
    spanEnd = spanStart.add({ hours: 1 });
  }
  return { start: spanStart, end: spanEnd };
}

function blockUid(
  planId: string,
  dayIndex: number,
  kind: ExportedKind,
  n: number,
): string {
  return `pj-${planId}-${dayIndex}-${kind}-${n}@phasejumper`;
}

function legUid(planId: string, index: number): string {
  return `pj-${planId}-leg-${index}@phasejumper`;
}

function dtendLine(tz: string, zoned: Temporal.ZonedDateTime): string {
  return `DTEND;TZID=${tz}:${formatWall(zoned)}`;
}

/**
 * Unfold, then set COLOR and (for flights) the arrival-zone DTEND, then
 * add a VTIMEZONE for any TZID the library did not ask the generator for.
 */
function finish(
  ics: string,
  patches: ReadonlyMap<string, EventPatch>,
  zones: readonly string[],
  generator: (tzid: string) => string,
): string {
  let text = ics.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n");
  const parts = text.split(/(?=BEGIN:VEVENT\n)/);
  text = parts
    .map((part) => {
      const uid = part.match(/^UID:(.*)$/m)?.[1];
      if (uid === undefined) return part;
      const patch = patches.get(uid);
      if (patch === undefined) return part;
      let next = part;
      if (patch.dtend !== undefined) {
        next = next.replace(/^DTEND[^\n]*/m, patch.dtend);
      }
      // COLOR is a property, so it has to precede the VALARM component.
      const alarm = next.indexOf("BEGIN:VALARM");
      const end = next.lastIndexOf("END:VEVENT");
      const at = alarm === -1 ? end : alarm;
      if (at === -1) return next;
      return `${next.slice(0, at)}COLOR:${patch.color}\n${next.slice(at)}`;
    })
    .join("");

  const defined = new Set(
    [...text.matchAll(/^TZID:(.*)$/gm)].map((match) => match[1] ?? ""),
  );
  const missing = [...new Set(zones)].filter((zone) => !defined.has(zone));
  if (missing.length > 0) {
    const block = `${missing
      .map((zone) => generator(zone).trim())
      .join("\n")}\n`;
    const at = text.indexOf("BEGIN:VEVENT");
    text =
      at === -1
        ? text.replace("END:VCALENDAR", `${block}END:VCALENDAR`)
        : `${text.slice(0, at)}${block}${text.slice(at)}`;
  }
  return foldLines(text.replace(/\n/g, "\r\n"));
}

function legEnd(leg: FlightLeg): Temporal.ZonedDateTime {
  return zonedWall(leg.arrivalLocal, leg.arrivalTz);
}

export function toIcs(args: ToIcsArgs): string {
  const { planId, input, result, sequence } = args;
  const legs = input.itinerary.legs;
  const origin = legs[0]?.departureAirport ?? "";
  const destination = legs[legs.length - 1]?.arrivalAirport ?? "";
  const span = planSpan(input, result);
  const stamp = Temporal.Instant.from(input.now);
  const generator = (tzid: string): string =>
    vtimezoneComponent(tzid, span.start, span.end);
  const zones: string[] = [];
  const patches = new Map<string, EventPatch>();

  const calendar = ical({
    prodId: {
      company: "PhaseJumper",
      product: `PhaseJumper ${result.engineVersion}`,
      language: "EN",
    },
    method: ICalCalendarMethod.PUBLISH,
    name: calendarName(origin, destination),
    timezone: { name: null, generator },
  });

  for (const [dayIndex, day] of result.days.entries()) {
    const seen = new Map<ExportedKind, number>();
    for (const block of day.blocks) {
      if (!isExportedKind(block.kind)) continue;
      const n = seen.get(block.kind) ?? 0;
      seen.set(block.kind, n + 1);
      const uid = blockUid(planId, dayIndex, block.kind, n);
      const start = Temporal.Instant.from(block.startUtc).toZonedDateTimeISO(
        block.localTz,
      );
      const end = isMarker(block.kind)
        ? start.add({ minutes: 5 })
        : Temporal.Instant.from(block.endUtc).toZonedDateTimeISO(block.localTz);
      const minutes = alarmMinutes(block.kind);
      zones.push(block.localTz);
      patches.set(uid, { color: eventColor(block.kind) });
      calendar.createEvent({
        id: uid,
        sequence,
        stamp,
        start,
        end,
        timezone: block.localTz,
        summary: eventSummary(block.kind, elapsedMinutes(start, end)),
        description: eventDescription(
          block.reason,
          block.confidence,
          result.engineVersion,
        ),
        categories: [{ name: "PhaseJumper" }],
        alarms:
          minutes === null
            ? []
            : [
                {
                  type: ICalAlarmType.display,
                  trigger: minutes * 60,
                  description: alarmText(),
                },
              ],
      });
    }
  }

  legs.forEach((leg, index) => {
    const uid = legUid(planId, index);
    const start = zonedWall(leg.departureLocal, leg.departureTz);
    const end = legEnd(leg);
    zones.push(leg.departureTz, leg.arrivalTz);
    patches.set(uid, {
      color: FLIGHT_COLOR,
      dtend: dtendLine(leg.arrivalTz, end),
    });
    calendar.createEvent({
      id: uid,
      sequence,
      stamp,
      start,
      end,
      timezone: leg.departureTz,
      summary: flightSummary(
        leg.departureAirport,
        leg.arrivalAirport,
        leg.flightNumber,
      ),
      categories: [{ name: "PhaseJumper" }],
    });
  });

  return finish(calendar.toString(), patches, zones, generator);
}
