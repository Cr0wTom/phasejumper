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

// Pure layout for the phase map (§4): one row per calendar date in the
// grid's zone (destination or home), every block placed by its own UTC instant. x is the
// wall-clock minute of the day (0–1440) in the axis zone, so DST days read
// correctly: pieces are split at midnight and at clock changes.

import type {
  Block,
  BlockKind,
  PlanInput,
  PlanResult,
} from "@phasejumper/engine";
import { Temporal } from "temporal-polyfill";

export type Axis = "destination" | "home";

export type Lane = "sleep" | "light" | "move" | "caffeine";

export interface Segment {
  /** Stable id: day, block, piece. */
  id: string;
  dayIndex: number;
  blockIndex: number;
  block: Block;
  lane: Lane;
  /** Wall-clock minutes in the row's zone, 0–1440. */
  startMin: number;
  endMin: number;
  /** Point events (melatonin, caffeine stop, meals) render as glyphs at startMin. */
  point: boolean;
  /** Wall-clock times of the whole block in this axis, "HH:MM". */
  from: string;
  to: string;
}

export interface FlightBand {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
}

export interface Row {
  /** YYYY-MM-DD in the axis zone of this row. */
  date: string;
  /** Zone the row's minutes are measured in. */
  zone: string;
  segments: Segment[];
  flights: FlightBand[];
  /** CBTmin estimates falling on this date. */
  cbtMin: Array<{ dayIndex: number; min: number }>;
  /** Target CBTmin on this date in this row's zone, or null if it does not fall here. */
  targetMin: number | null;
}

const LANE: Record<BlockKind, Lane> = {
  SLEEP: "sleep",
  SLEEP_INFLIGHT: "sleep",
  NAP: "sleep",
  SEEK_LIGHT: "light",
  SEEK_LIGHT_ARTIFICIAL: "light",
  LIGHT_INFLIGHT_WINDOW: "light",
  AVOID_LIGHT: "light",
  EXERCISE_GOOD: "move",
  EXERCISE_OPTIONAL_WALK: "move",
  EXERCISE_AVOID: "move",
  WIND_DOWN: "move",
  NSDR: "move",
  MELATONIN_WINDOW: "move",
  MEAL: "move",
  CAFFEINE_OK: "caffeine",
  CAFFEINE_LATE_OK: "caffeine",
  CAFFEINE_STOP: "caffeine",
};

const POINT: ReadonlySet<BlockKind> = new Set([
  "MELATONIN_WINDOW",
  "CAFFEINE_STOP",
  "MEAL",
]);

/** The IANA zone an axis reads in. */
export function axisZone(axis: Axis, input: PlanInput): string {
  return axis === "destination"
    ? input.itinerary.destinationTz
    : input.itinerary.homeTz;
}

/** Where an instant falls on the grid: its date and wall-clock minute. */
export function positionOf(
  atUtc: string,
  zone: string,
): { date: string; min: number } {
  const z = Temporal.Instant.from(atUtc).toZonedDateTimeISO(zone);
  return { date: z.toPlainDate().toString(), min: z.hour * 60 + z.minute };
}

function wallMinutes(z: Temporal.ZonedDateTime): number {
  return z.hour * 60 + z.minute;
}

function hhmm(z: Temporal.ZonedDateTime): string {
  return `${String(z.hour).padStart(2, "0")}:${String(z.minute).padStart(2, "0")}`;
}

interface Piece {
  date: string;
  startMin: number;
  endMin: number;
}

/**
 * Splits [start, end) into per-date pieces in `zone`, breaking at local
 * midnight and at clock changes so every piece is continuous wall time.
 */
export function pieces(
  start: Temporal.Instant,
  end: Temporal.Instant,
  zone: string,
): Piece[] {
  const out: Piece[] = [];
  let cursor = start.toZonedDateTimeISO(zone);
  const stop = end.toZonedDateTimeISO(zone);
  while (Temporal.ZonedDateTime.compare(cursor, stop) < 0) {
    const midnight = cursor
      .toPlainDate()
      .add({ days: 1 })
      .toZonedDateTime({ timeZone: zone });
    const transition = cursor.getTimeZoneTransition("next");
    let next = midnight;
    if (
      transition !== null &&
      Temporal.ZonedDateTime.compare(transition, next) < 0
    ) {
      next = transition;
    }
    if (Temporal.ZonedDateTime.compare(stop, next) < 0) next = stop;
    const elapsed = Math.round(
      next.toInstant().since(cursor.toInstant()).total({ unit: "minutes" }),
    );
    const startMin = wallMinutes(cursor);
    out.push({
      date: cursor.toPlainDate().toString(),
      startMin,
      endMin: Math.min(1440, startMin + elapsed),
    });
    cursor = next;
  }
  return out.filter((p) => p.endMin > p.startMin);
}

function legLabel(input: PlanInput, index: number): string {
  const leg = input.itinerary.legs[index];
  return leg === undefined
    ? ""
    : `${leg.departureAirport} to ${leg.arrivalAirport}`;
}

export function layoutPlan(
  input: PlanInput,
  result: PlanResult,
  axis: Axis,
): Row[] {
  const rows = new Map<string, Row>();
  const row = (date: string, zone: string): Row => {
    let r = rows.get(date);
    if (r === undefined) {
      r = {
        date,
        zone,
        segments: [],
        flights: [],
        cbtMin: [],
        targetMin: null,
      };
      rows.set(date, r);
    }
    return r;
  };

  result.days.forEach((day, dayIndex) => {
    day.blocks.forEach((block, blockIndex) => {
      const zone = axisZone(axis, input);
      const start = Temporal.Instant.from(block.startUtc);
      const end = Temporal.Instant.from(block.endUtc);
      const from = hhmm(start.toZonedDateTimeISO(zone));
      const to = hhmm(end.toZonedDateTimeISO(zone));
      const point = POINT.has(block.kind);
      const parts = point
        ? pieces(start, start.add({ minutes: 1 }), zone)
        : pieces(start, end, zone);
      parts.forEach((p, pieceIndex) => {
        row(p.date, zone).segments.push({
          id: `d${dayIndex}-b${blockIndex}-p${pieceIndex}`,
          dayIndex,
          blockIndex,
          block,
          lane: LANE[block.kind],
          startMin: p.startMin,
          endMin: point ? p.startMin : p.endMin,
          point,
          from,
          to,
        });
      });
    });

    const cbt = Temporal.Instant.from(day.cbtMinUtc);
    const cbtZone = axisZone(axis, input);
    const at = cbt.toZonedDateTimeISO(cbtZone);
    row(at.toPlainDate().toString(), cbtZone).cbtMin.push({
      dayIndex,
      min: wallMinutes(at),
    });
  });

  input.itinerary.legs.forEach((leg, index) => {
    const start = Temporal.PlainDateTime.from(leg.departureLocal)
      .toZonedDateTime(leg.departureTz)
      .toInstant();
    const end = Temporal.PlainDateTime.from(leg.arrivalLocal)
      .toZonedDateTime(leg.arrivalTz)
      .toInstant();
    const zone = axisZone(axis, input);
    pieces(start, end, zone).forEach((p, pieceIndex) => {
      row(p.date, zone).flights.push({
        id: `f${index}-p${pieceIndex}`,
        label: legLabel(input, index),
        startMin: p.startMin,
        endMin: p.endMin,
      });
    });
  });

  // Fill gaps so dates are contiguous, then place the target line: the
  // target CBTmin is a destination wall-clock time, shown on each date in
  // the row's own zone.
  const dates = [...rows.keys()].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === undefined || last === undefined) return [];
  const [targetH, targetM] = result.decision.targetCbtMinLocal
    .split(":")
    .map(Number);
  const out: Row[] = [];
  for (
    let d = Temporal.PlainDate.from(first);
    Temporal.PlainDate.compare(d, Temporal.PlainDate.from(last)) <= 0;
    d = d.add({ days: 1 })
  ) {
    const date = d.toString();
    const existing = rows.get(date);
    const zone = existing?.zone ?? axisZone(axis, input);
    const r = existing ?? {
      date,
      zone,
      segments: [],
      flights: [],
      cbtMin: [],
      targetMin: null,
    };
    const target = d
      .toZonedDateTime({
        timeZone: input.itinerary.destinationTz,
        plainTime: new Temporal.PlainTime(targetH ?? 0, targetM ?? 0),
      })
      .withTimeZone(zone);
    r.targetMin =
      target.toPlainDate().toString() === date ? wallMinutes(target) : null;
    r.segments.sort(
      (a, b) => a.startMin - b.startMin || a.blockIndex - b.blockIndex,
    );
    out.push(r);
  }
  return out;
}
