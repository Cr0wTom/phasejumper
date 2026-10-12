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

/**
 * One flight as the booking wrote it. Times are local wall times.
 * This parser never reads a zone from the text; the app resolves zones
 * from the airport directory.
 */
export interface ParsedLeg {
  flightNumber?: string;
  departureAirport: string;
  arrivalAirport: string;
  /** YYYY-MM-DD */
  departureDate: string;
  /** HH:MM, 24 h */
  departureTime: string;
  /** YYYY-MM-DD */
  arrivalDate: string;
  /** HH:MM, 24 h */
  arrivalTime: string;
}

export interface ParseOptions {
  /**
   * YYYY-MM-DD. Used only to fill a missing year: the first on-or-after
   * occurrence of that month and day. A date with no year and no reference
   * date leaves its leg unparsed.
   */
  referenceDate?: string;
  /**
   * When set, a three-letter token is an airport only if this returns true.
   * When omitted, any `[A-Z]{3}` token in an airport position is accepted.
   */
  isAirport?: (iata: string) => boolean;
}

export interface ParseResult {
  legs: ParsedLeg[];
  /** See `confidenceFor`. */
  confidence: number;
  unparsed: string[];
}

/**
 * confidence is 0 when `legs` is empty.
 * Otherwise it is the share of flight-like lines that belong to a complete
 * leg, rounded to 4 decimal places (half up):
 *   round4(linesInsideCompleteLegs / (linesInsideCompleteLegs + unparsed.length))
 * A paste whose every flight-like line sits inside a complete leg scores 1.
 * A flight-like line contains a flight number, a time, or an airport code
 * outside a date.
 */
function confidenceFor(
  linesInsideLegs: number,
  unparsed: number,
  legs: number,
): number {
  if (legs === 0 || linesInsideLegs === 0) return 0;
  const share = linesInsideLegs / (linesInsideLegs + unparsed);
  return Math.round(share * 10000) / 10000;
}

const WEEKDAY =
  "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun";
const MONTH =
  "January|February|March|April|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const DATE_SRC = `\\b(\\d{4})-(\\d{2})-(\\d{2})\\b|\\b(?:(?:${WEEKDAY})\\s+)?(\\d{1,2})\\s+(${MONTH})\\b(?:\\s+(\\d{4}))?`;
const TIME_SRC = "\\b(\\d{1,2})[:.](\\d{2})\\s*([AaPp][Mm])?\\b";
const FLIGHT_SRC = "\\b([A-Z]{2}|[A-Z]\\d|\\d[A-Z])\\s?(\\d{1,4})\\b";
const LABEL_SRC =
  "\\b(departure|departs|depart|arrival|arrives|arrive|from|dep|to|arr)\\b";
const PLUS_SRC = "(?:\\(\\s*\\+\\s*1\\s*\\)|\\+\\s*1(?:\\s*days?)?)(?!\\d)";
const BLOCKED_BEFORE = new Set(["gate", "seat", "terminal", "row", "group"]);

interface Span {
  start: number;
  end: number;
}

interface DateParts {
  year?: number;
  month: number;
  day: number;
  span: Span;
}

interface TimeToken {
  value: string;
  /** Where the clock time starts, used to attach it to a label. */
  index: number;
  kind: "dep" | "arr" | "unknown";
}

interface Signals {
  flightNumber?: string;
  from?: string;
  to?: string;
  dates: DateParts[];
  times: TimeToken[];
  plusOne: boolean;
  /** A line whose only signal is a next-day marker. */
  plusOnly: boolean;
}

interface TimeSlot {
  value: string;
  labeled: boolean;
}

interface Draft {
  flightNumber?: string;
  from?: string;
  to?: string;
  dates: DateParts[];
  dep?: TimeSlot;
  arr?: TimeSlot;
  plusOne: boolean;
  lines: string[];
}

type Accept = (code: string) => boolean;

function matches(
  source: string,
  flags: string,
  line: string,
): RegExpMatchArray[] {
  return [
    ...line.matchAll(
      new RegExp(source, flags.includes("g") ? flags : `${flags}g`),
    ),
  ];
}

function normalize(line: string): string {
  return line
    .replaceAll("\u00a0", " ")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2212", "-")
    .replaceAll("\u2192", "→")
    .replaceAll("->", "→");
}

function maskSpans(line: string, spans: readonly Span[]): string {
  const chars = line.split("");
  for (const span of spans) {
    for (let i = span.start; i < span.end && i < chars.length; i += 1) {
      chars[i] = " ";
    }
  }
  return chars.join("");
}

function monthNumber(word: string): number | undefined {
  const key = word.slice(0, 3).toLowerCase();
  const months: Readonly<Record<string, number>> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return months[key];
}

function plainDate(
  year: number,
  month: number,
  day: number,
): Temporal.PlainDate | undefined {
  try {
    return Temporal.PlainDate.from(
      { year, month, day },
      { overflow: "reject" },
    );
  } catch {
    return undefined;
  }
}

/** Weekday words are labels only. They are not checked against the calendar. */
function findDates(line: string): DateParts[] {
  const found: DateParts[] = [];
  for (const match of matches(DATE_SRC, "gi", line)) {
    const index = match.index;
    if (index === undefined) continue;
    const isoYear = match[1];
    const isoMonth = match[2];
    const isoDay = match[3];
    let year: number | undefined;
    let month: number | undefined;
    let day: number | undefined;
    if (
      isoYear !== undefined &&
      isoMonth !== undefined &&
      isoDay !== undefined
    ) {
      year = Number(isoYear);
      month = Number(isoMonth);
      day = Number(isoDay);
    } else if (match[4] !== undefined && match[5] !== undefined) {
      day = Number(match[4]);
      month = monthNumber(match[5]);
      if (match[6] !== undefined) year = Number(match[6]);
    }
    if (month === undefined || day === undefined) continue;
    const checkYear = year ?? 2024;
    if (plainDate(checkYear, month, day) === undefined && year !== undefined)
      continue;
    if (year === undefined && (day < 1 || day > 31 || month < 1 || month > 12))
      continue;
    const parts: DateParts = {
      month,
      day,
      span: { start: index, end: index + match[0].length },
    };
    if (year !== undefined) parts.year = year;
    found.push(parts);
  }
  return found;
}

function toHHMM(
  hourText: string,
  minuteText: string,
  ampm: string | undefined,
): string | undefined {
  if (!/^\d+$/.test(hourText) || !/^\d+$/.test(minuteText)) return undefined;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (minute > 59) return undefined;
  if (ampm === undefined) {
    if (hour > 23) return undefined;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  if (hour < 1 || hour > 12) return undefined;
  let normalized = hour % 12;
  if (ampm.toUpperCase() === "PM") normalized += 12;
  return `${String(normalized).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function findTimes(line: string): TimeToken[] {
  const found: TimeToken[] = [];
  for (const match of matches(TIME_SRC, "g", line)) {
    const index = match.index;
    const hour = match[1];
    const minute = match[2];
    if (index === undefined || hour === undefined || minute === undefined)
      continue;
    const value = toHHMM(hour, minute, match[3]);
    if (value === undefined) continue;
    found.push({ value, index, kind: "unknown" });
  }
  return found;
}

function wordBefore(line: string, index: number): string {
  const match = /([A-Za-z]+)\s*$/.exec(line.slice(0, index));
  return match?.[1]?.toLowerCase() ?? "";
}

function findFlight(line: string): string | undefined {
  for (const match of matches(FLIGHT_SRC, "g", line)) {
    const index = match.index;
    if (index === undefined) continue;
    if (BLOCKED_BEFORE.has(wordBefore(line, index))) continue;
    return match[0];
  }
  return undefined;
}

function acceptCode(
  code: string,
  isAirport: ParseOptions["isAirport"],
): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  if (isAirport !== undefined && !isAirport(code)) return false;
  return true;
}

function codesIn(segment: string, accept: Accept): string[] {
  const found: string[] = [];
  for (const match of segment.matchAll(/\b[A-Z]{3}\b/g)) {
    const code = match[0];
    if (accept(code)) found.push(code);
  }
  return found;
}

function splitRoute(
  line: string,
  index: number,
  length: number,
  accept: Accept,
): { from: string; to: string } | undefined {
  const left = codesIn(line.slice(0, index), accept);
  const right = codesIn(line.slice(index + length), accept);
  const from = left[left.length - 1];
  const to = right[0];
  if (from === undefined || to === undefined) return undefined;
  return { from, to };
}

function findRoute(
  line: string,
  accept: Accept,
): { from: string; to: string } | undefined {
  for (const match of matches("→", "g", line)) {
    if (match.index === undefined) continue;
    const route = splitRoute(line, match.index, match[0].length, accept);
    if (route !== undefined) return route;
  }
  const hyphen = "(?<=\\s|\\))-(?=\\s|\\()|(?<=[A-Z])-(?=[A-Z])";
  for (const match of matches(hyphen, "g", line)) {
    if (match.index === undefined) continue;
    const route = splitRoute(line, match.index, match[0].length, accept);
    if (route !== undefined) return route;
  }
  for (const match of matches("\\bto\\b", "gi", line)) {
    if (match.index === undefined) continue;
    const route = splitRoute(line, match.index, match[0].length, accept);
    if (route !== undefined) return route;
  }
  return undefined;
}

interface LabelHit {
  kind: "dep" | "arr";
  start: number;
  end: number;
}

function labelKind(word: string): "dep" | "arr" {
  const lower = word.toLowerCase();
  if (lower === "to" || lower.startsWith("arr")) return "arr";
  return "dep";
}

function labelCounts(line: string, index: number, word: string): boolean {
  const before = line.slice(0, index);
  if (/^\s*(?:[-*•]|\d+[.)])?\s*$/.test(before)) return true;
  if (line.slice(index + word.length).startsWith(":")) return true;
  const first = word[0];
  return first !== undefined && first !== first.toLowerCase();
}

function findLabels(line: string): LabelHit[] {
  const hits: LabelHit[] = [];
  for (const match of matches(LABEL_SRC, "gi", line)) {
    const index = match.index;
    const word = match[1];
    if (index === undefined || word === undefined) continue;
    if (!labelCounts(line, index, word)) continue;
    const colon = line.slice(index + word.length).startsWith(":") ? 1 : 0;
    hits.push({
      kind: labelKind(word),
      start: index,
      end: index + word.length + colon,
    });
  }
  hits.sort((a, b) => a.start - b.start);
  return hits;
}

function hasPlus(line: string): boolean {
  return new RegExp(PLUS_SRC, "i").test(line);
}

/** The whole line is `+1`, `+1 day`, or `(+1)`, so it can apply to the open leg. */
function isPlusOnlyLine(line: string): boolean {
  return new RegExp(`^\\s*(?:${PLUS_SRC})\\s*$`, "i").test(line);
}

function parseLine(raw: string, accept: Accept): Signals {
  const line = normalize(raw);
  const dates = findDates(line);
  const masked = maskSpans(
    line,
    dates.map((date) => date.span),
  );
  const times = findTimes(line);
  const labels = findLabels(line);
  const route = findRoute(masked, accept);
  const signals: Signals = { dates, times, plusOne: false, plusOnly: false };

  const flight = findFlight(line);
  if (flight !== undefined) signals.flightNumber = flight;
  if (route !== undefined) {
    signals.from = route.from;
    signals.to = route.to;
  }

  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i];
    if (label === undefined) continue;
    const next = labels[i + 1];
    const spanEnd = next === undefined ? line.length : next.start;
    if (route === undefined) {
      const code = codesIn(masked.slice(label.end, spanEnd), accept)[0];
      if (code !== undefined) {
        if (label.kind === "dep") signals.from ??= code;
        else signals.to ??= code;
      }
    }
    for (const time of times) {
      if (time.index < label.end || time.index >= spanEnd) continue;
      time.kind = label.kind;
    }
  }

  const plus = hasPlus(line);
  const arrivalTime = times.some((time) => time.kind === "arr");
  const arrivalLabel = labels.some((label) => label.kind === "arr");
  if (plus && (arrivalTime || arrivalLabel || times.length >= 2)) {
    signals.plusOne = true;
  } else if (plus && times.length === 1) {
    const only = times[0];
    if (only !== undefined && only.kind !== "dep") {
      only.kind = "arr";
      signals.plusOne = true;
    }
  } else if (isPlusOnlyLine(line)) {
    signals.plusOnly = true;
    signals.plusOne = true;
  }

  return signals;
}

function hasSignal(signals: Signals): boolean {
  return (
    signals.flightNumber !== undefined ||
    signals.from !== undefined ||
    signals.to !== undefined ||
    signals.dates.length > 0 ||
    signals.times.length > 0 ||
    signals.plusOne
  );
}

function emptyDraft(): Draft {
  return { dates: [], plusOne: false, lines: [] };
}

function started(draft: Draft): boolean {
  return (
    draft.flightNumber !== undefined ||
    draft.from !== undefined ||
    draft.to !== undefined ||
    draft.dates.length > 0 ||
    draft.dep !== undefined ||
    draft.arr !== undefined ||
    draft.plusOne
  );
}

function sameDate(a: DateParts, b: DateParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function placeTime(
  current: TimeSlot | undefined,
  incoming: TimeSlot,
): { slot: TimeSlot; conflict: boolean } {
  if (current === undefined) return { slot: incoming, conflict: false };
  if (current.value === incoming.value) {
    return {
      slot: {
        value: current.value,
        labeled: current.labeled || incoming.labeled,
      },
      conflict: false,
    };
  }
  if (incoming.labeled && !current.labeled)
    return { slot: incoming, conflict: false };
  if (!incoming.labeled && current.labeled)
    return { slot: current, conflict: false };
  return { slot: current, conflict: true };
}

/**
 * Returns a draft with `signals` merged, or undefined when the line belongs
 * to a new leg (the caller flushes the previous draft first).
 */
function absorb(draft: Draft, signals: Signals): Draft | undefined {
  if (
    signals.flightNumber !== undefined &&
    draft.flightNumber !== undefined &&
    signals.flightNumber !== draft.flightNumber
  ) {
    return undefined;
  }
  if (
    signals.from !== undefined &&
    draft.from !== undefined &&
    signals.from !== draft.from
  ) {
    return undefined;
  }
  if (
    signals.to !== undefined &&
    draft.to !== undefined &&
    signals.to !== draft.to
  ) {
    return undefined;
  }

  let dep = draft.dep;
  let arr = draft.arr;
  const unknowns: TimeToken[] = [];
  for (const time of signals.times) {
    const labeled = time.kind !== "unknown";
    if (time.kind === "dep") {
      const placed = placeTime(dep, { value: time.value, labeled });
      if (placed.conflict) return undefined;
      dep = placed.slot;
    } else if (time.kind === "arr") {
      const placed = placeTime(arr, { value: time.value, labeled });
      if (placed.conflict) return undefined;
      arr = placed.slot;
    } else {
      unknowns.push(time);
    }
  }
  for (const time of unknowns) {
    if (dep === undefined) dep = { value: time.value, labeled: false };
    else if (arr === undefined) arr = { value: time.value, labeled: false };
    else if (time.value !== dep.value && time.value !== arr.value)
      return undefined;
  }

  const dates = [...draft.dates];
  for (const date of signals.dates) {
    if (dates.some((have) => sameDate(have, date))) continue;
    const distinct = dates.filter(
      (have, index) =>
        dates.findIndex((other) => sameDate(have, other)) === index,
    );
    if (distinct.length >= 2) return undefined;
    dates.push(date);
  }

  return {
    flightNumber: draft.flightNumber ?? signals.flightNumber,
    from: draft.from ?? signals.from,
    to: draft.to ?? signals.to,
    dates,
    dep,
    arr,
    plusOne: draft.plusOne || signals.plusOne,
    lines: draft.lines,
  };
}

function resolveDate(
  part: DateParts,
  referenceDate: string | undefined,
): string | undefined {
  if (part.year !== undefined) {
    return plainDate(part.year, part.month, part.day)?.toString();
  }
  if (
    referenceDate === undefined ||
    !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
  ) {
    return undefined;
  }
  let reference: Temporal.PlainDate;
  try {
    reference = Temporal.PlainDate.from(referenceDate);
  } catch {
    return undefined;
  }
  for (let year = reference.year; year <= reference.year + 8; year += 1) {
    const date = plainDate(year, part.month, part.day);
    if (date === undefined) continue;
    if (Temporal.PlainDate.compare(date, reference) >= 0)
      return date.toString();
  }
  return undefined;
}

function distinctDates(dates: readonly DateParts[]): DateParts[] {
  const out: DateParts[] = [];
  for (const date of dates) {
    if (!out.some((have) => sameDate(have, date))) out.push(date);
  }
  return out;
}

/**
 * One date and no "+1" marker: arrival is the same calendar day as departure.
 * A "+1" / "+1 day" / "(+1)" marker moves the arrival by one day when the
 * booking does not give a second date. An explicit second date wins.
 * An earlier arrival clock does not imply a next-day arrival.
 */
function finish(
  draft: Draft,
  referenceDate: string | undefined,
): ParsedLeg | undefined {
  if (draft.from === undefined || draft.to === undefined) return undefined;
  if (draft.dep === undefined || draft.arr === undefined) return undefined;
  const dates = distinctDates(draft.dates);
  const departure = dates[0];
  if (departure === undefined) return undefined;
  const departureDate = resolveDate(departure, referenceDate);
  if (departureDate === undefined) return undefined;
  const second = dates[1];
  let arrivalDate: string | undefined;
  if (second !== undefined) {
    arrivalDate = resolveDate(second, referenceDate);
  } else if (draft.plusOne) {
    try {
      arrivalDate = Temporal.PlainDate.from(departureDate)
        .add({ days: 1 })
        .toString();
    } catch {
      arrivalDate = undefined;
    }
  } else {
    arrivalDate = departureDate;
  }
  if (arrivalDate === undefined) return undefined;
  const leg: ParsedLeg = {
    departureAirport: draft.from,
    arrivalAirport: draft.to,
    departureDate,
    departureTime: draft.dep.value,
    arrivalDate,
    arrivalTime: draft.arr.value,
  };
  if (draft.flightNumber !== undefined) leg.flightNumber = draft.flightNumber;
  return leg;
}

function looksLike(line: string, accept: Accept): boolean {
  const normalized = normalize(line);
  if (findFlight(normalized) !== undefined) return true;
  if (findTimes(normalized).length > 0) return true;
  const dates = findDates(normalized);
  const masked = maskSpans(
    normalized,
    dates.map((date) => date.span),
  );
  return codesIn(masked, accept).length > 0;
}

function compareLegs(a: ParsedLeg, b: ParsedLeg): number {
  const left = `${a.departureDate}T${a.departureTime}`;
  const right = `${b.departureDate}T${b.departureTime}`;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function parseItinerary(text: string, opts?: ParseOptions): ParseResult {
  const referenceDate = opts?.referenceDate;
  const accept: Accept = (code) => acceptCode(code, opts?.isAirport);
  const lines = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n");
  const legs: ParsedLeg[] = [];
  const unparsed: string[] = [];
  let linesInsideLegs = 0;
  let draft = emptyDraft();

  function flush(): void {
    const leg = finish(draft, referenceDate);
    if (leg !== undefined) {
      legs.push(leg);
      for (const line of draft.lines) {
        if (looksLike(line, accept)) linesInsideLegs += 1;
      }
    } else {
      for (const line of draft.lines) {
        if (looksLike(line, accept)) unparsed.push(line);
      }
    }
    draft = emptyDraft();
  }

  for (const line of lines) {
    const raw = line.trim();
    if (raw.length === 0) continue;
    const signals = parseLine(raw, accept);
    if (signals.plusOnly) {
      if (
        started(draft) &&
        (draft.arr !== undefined || draft.dep !== undefined)
      ) {
        draft.plusOne = true;
        draft.lines.push(raw);
      } else if (looksLike(raw, accept)) {
        unparsed.push(raw);
      }
      continue;
    }
    if (!hasSignal(signals)) {
      if (started(draft)) draft.lines.push(raw);
      else if (looksLike(raw, accept)) unparsed.push(raw);
      continue;
    }
    const merged = absorb(draft, signals);
    if (merged === undefined) {
      flush();
      const fresh = absorb(emptyDraft(), signals);
      draft = fresh ?? emptyDraft();
    } else {
      draft = merged;
    }
    draft.lines.push(raw);
  }
  flush();

  legs.sort(compareLegs);
  return {
    legs,
    confidence: confidenceFor(linesInsideLegs, unparsed.length, legs.length),
    unparsed,
  };
}
