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

/** "Asia/Tokyo" → "Tokyo", "America/Los_Angeles" → "Los Angeles". */
export function zoneName(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

/** Wall-clock "HH:MM" of an instant in a zone. */
export function wallTime(utc: string, zone: string): string {
  const z = Temporal.Instant.from(utc).toZonedDateTimeISO(zone);
  return `${String(z.hour).padStart(2, "0")}:${String(z.minute).padStart(2, "0")}`;
}

/** "Thu 14 Jan" for a YYYY-MM-DD date. */
export function shortDate(date: string): string {
  return Temporal.PlainDate.from(date).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Today's date (YYYY-MM-DD) in a zone. */
export function dateIn(utc: string, zone: string): string {
  return Temporal.Instant.from(utc)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}
