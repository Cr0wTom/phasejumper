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

const TIME_TEXT =
  /^(?:([0-9]{1,2})([:.])([0-9]{2})|([0-9]{1,4}))(?:\s*(a\.m\.|p\.m\.|am|pm|a|p))?$/;

const CANONICAL = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

function pad(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clock(
  hourText: string,
  minuteText: string,
): { hour: number; minute: number } {
  return { hour: Number(hourText), minute: Number(minuteText) };
}

function fromDigits(digits: string): { hour: number; minute: number } | null {
  if (digits.length === 1 || digits.length === 2) {
    return { hour: Number(digits), minute: 0 };
  }
  if (digits.length === 3) return clock(digits.slice(0, 1), digits.slice(1));
  if (digits.length === 4) return clock(digits.slice(0, 2), digits.slice(2));
  return null;
}

function withMeridiem(
  hour: number,
  minute: number,
  suffix: string | undefined,
): string | null {
  if (minute < 0 || minute > 59) return null;
  if (suffix === undefined) {
    if (hour < 0 || hour > 23) return null;
    return pad(hour, minute);
  }
  if (hour < 1 || hour > 12) return null;
  const pm = suffix.startsWith("p");
  if (hour === 12) return pad(pm ? 12 : 0, minute);
  return pad(pm ? hour + 12 : hour, minute);
}

/**
 * "HH:MM" (24 h, zero-padded), or null when `text` is not one of the
 * accepted shapes. Longer than 8 characters after trim and space collapse
 * is rejected, as is anything with seconds, signs, or non-ASCII digits.
 */
export function parseTimeText(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > 8) return null;
  const match = TIME_TEXT.exec(normalized.toLowerCase());
  if (match === null) return null;
  const sepHour = match[1];
  const minuteText = match[3];
  const digits = match[4];
  const suffix = match[5];
  const parts =
    sepHour !== undefined && minuteText !== undefined
      ? clock(sepHour, minuteText)
      : digits === undefined
        ? null
        : fromDigits(digits);
  if (parts === null) return null;
  return withMeridiem(parts.hour, parts.minute, suffix);
}

/** Locale wall time for a canonical "HH:MM". Uses that locale's 12/24 h cycle. */
export function formatTimeForDisplay(value: string, locale?: string): string {
  const match = CANONICAL.exec(value);
  if (match === null) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const date = new Date(2000, 0, 1, hour, minute, 0, 0);
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
