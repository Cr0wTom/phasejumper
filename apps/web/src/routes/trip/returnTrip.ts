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

import { Temporal } from "temporal-polyfill";
import type { LegForm } from "./schema";

/** Whole local dates between arrival and the return departure. At least 1. */
export function stayDays(
  arrivalDate: string,
  departureDate: string,
): number | undefined {
  try {
    const start = Temporal.PlainDate.from(arrivalDate);
    const end = Temporal.PlainDate.from(departureDate);
    if (start.toString() !== arrivalDate || end.toString() !== departureDate) {
      return undefined;
    }
    const days = start.until(end, { largestUnit: "day" }).days;
    return Math.max(1, days);
  } catch {
    return undefined;
  }
}

function zonedInstant(
  date: string,
  time: string,
  timeZone: string,
): Temporal.Instant | undefined {
  try {
    return Temporal.PlainDateTime.from(`${date}T${time}`)
      .toZonedDateTime(timeZone)
      .toInstant();
  } catch {
    return undefined;
  }
}

type ZoneLookup = (iata: string) => { tz: string } | undefined;

function instantAt(
  leg: LegForm,
  end: "departure" | "arrival",
  lookup: ZoneLookup,
): Temporal.Instant | undefined {
  const iata = end === "departure" ? leg.fromIata : leg.toIata;
  const date = end === "departure" ? leg.departureDate : leg.arrivalDate;
  const time = end === "departure" ? leg.departureTime : leg.arrivalTime;
  const zone = lookup(iata)?.tz;
  if (zone === undefined) return undefined;
  return zonedInstant(date, time, zone);
}

/** True when the return takes off before the outbound flight has landed. */
export function returnDepartsBeforeArrival(
  outbound: LegForm,
  returning: LegForm,
  lookup: ZoneLookup,
): boolean {
  const arrival = instantAt(outbound, "arrival", lookup);
  const departure = instantAt(returning, "departure", lookup);
  if (arrival === undefined || departure === undefined) return false;
  return Temporal.Instant.compare(departure, arrival) < 0;
}

function endsWhereItStarted(
  legs: readonly LegForm[],
  lookup: ZoneLookup,
): boolean {
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (first === undefined || last === undefined) return false;
  if (!/^[A-Z]{3}$/.test(first.fromIata) || !/^[A-Z]{3}$/.test(last.toIata)) {
    return false;
  }
  if (first.fromIata === last.toIata) return true;
  const fromTz = lookup(first.fromIata)?.tz;
  const toTz = lookup(last.toIata)?.tz;
  return fromTz !== undefined && fromTz === toTz;
}

/**
 * Index of the first leg to move into the return, after the longest gap of
 * at least 24 h. Undefined when this is not a round trip typed as one list.
 */
export function returnSplitIndex(
  legs: readonly LegForm[],
  lookup: ZoneLookup,
): number | undefined {
  if (legs.length < 2 || !endsWhereItStarted(legs, lookup)) return undefined;
  let bestAt: number | undefined;
  let bestHours = 0;
  for (let index = 0; index < legs.length - 1; index += 1) {
    const previous = legs[index];
    const next = legs[index + 1];
    if (previous === undefined || next === undefined) continue;
    const arrival = instantAt(previous, "arrival", lookup);
    const departure = instantAt(next, "departure", lookup);
    if (arrival === undefined || departure === undefined) continue;
    const hours = arrival.until(departure).total({ unit: "hour" });
    if (hours >= 24 && (bestAt === undefined || hours > bestHours)) {
      bestAt = index + 1;
      bestHours = hours;
    }
  }
  return bestAt;
}
