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
import { z } from "zod";
import { messages } from "../../messages";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type FieldErrors = Readonly<Record<string, string>>;

function realDate(value: string): boolean {
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}

const timeField = z.string().trim().regex(TIME, messages.timeInvalid);

/** Plans are for real trips; a 2-digit year typed as "26" reads as 0026. */
const YEARS = { min: 2020, max: 2100 } as const;

function plausibleYear(value: string): boolean {
  const year = Number(value.slice(0, 4));
  return year >= YEARS.min && year <= YEARS.max;
}

const dateField = z
  .string()
  .trim()
  .refine(realDate, messages.dateInvalid)
  .refine(plausibleYear, messages.dateYear);

const preAdjustDays = z.union(
  [z.literal(0), z.literal(1), z.literal(2), z.literal(3)],
  { error: messages.preAdjustInvalid },
);

const legSchema = z.object({
  id: z.string().min(1, messages.fieldInvalid),
  fromQuery: z.string(),
  fromIata: z.string().regex(/^[A-Z]{3}$/, messages.chooseAirport),
  toQuery: z.string(),
  toIata: z.string().regex(/^[A-Z]{3}$/, messages.chooseAirport),
  departureDate: dateField,
  departureTime: timeField,
  arrivalDate: dateField,
  arrivalTime: timeField,
  flightNumber: z.string().trim(),
});

const awakeSchema = z.object({
  id: z.string().min(1, messages.fieldInvalid),
  label: z.string().trim().min(1, messages.eventLabelInvalid),
  startDate: dateField,
  startTime: timeField,
  endDate: dateField,
  endTime: timeField,
  tz: z.string().trim().min(1, messages.zoneInvalid),
});

const windowSchema = z.object({
  id: z.string().min(1, messages.fieldInvalid),
  startDate: dateField,
  startTime: timeField,
  endDate: dateField,
  endTime: timeField,
  tz: z.string().trim().min(1, messages.zoneInvalid),
});

export const tripFormSchema = z
  .object({
    habitualBedtime: timeField,
    habitualWake: timeField,
    chronotype: z.enum(["morning", "intermediate", "evening"], {
      error: messages.fieldInvalid,
    }),
    sleepNeedHours: z
      .string()
      .trim()
      .refine((value) => {
        if (!/^\d+(\.\d+)?$/.test(value)) return false;
        const hours = Number(value);
        return hours > 0 && hours < 24;
      }, messages.sleepNeedInvalid),
    useMelatonin: z.boolean(),
    melatoninTiming: z.enum(["strongest", "evening"], {
      error: messages.fieldInvalid,
    }),
    melatoninPregnant: z.boolean(),
    melatoninMedication: z.boolean(),
    melatoninUnder18: z.boolean(),
    caffeine: z.enum(["none", "normal", "heavy"], {
      error: messages.fieldInvalid,
    }),
    exerciseEnabled: z.boolean(),
    meditationEnabled: z.boolean(),
    mealTimingEnabled: z.boolean(),
    preAdjustDays,
    arrivalStyle: z.enum(["body-clock", "local"], {
      error: messages.fieldInvalid,
    }),
    legs: z.array(legSchema).min(1, messages.legsRequired),
    returnLegs: z.array(legSchema),
    mustBeAwake: z.array(awakeSchema),
    noWorkoutWindows: z.array(windowSchema),
    tripDays: z
      .string()
      .trim()
      .refine((value) => {
        if (value === "") return true;
        return /^[1-9]\d*$/.test(value);
      }, messages.tripDaysInvalid),
  })
  .superRefine((value, ctx) => {
    if (value.habitualBedtime === value.habitualWake) {
      ctx.addIssue({
        code: "custom",
        message: messages.timesSame,
        path: ["habitualBedtime"],
      });
    }
  });

export type TripFormValues = z.infer<typeof tripFormSchema>;
export type LegForm = TripFormValues["legs"][number];
export type AwakeForm = TripFormValues["mustBeAwake"][number];
export type WindowForm = TripFormValues["noWorkoutWindows"][number];

export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (key.length === 0 || fieldErrors[key] !== undefined) continue;
    fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export function parseTripForm(
  input: unknown,
):
  | { ok: true; value: TripFormValues }
  | { ok: false; fieldErrors: FieldErrors } {
  const parsed = tripFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  return { ok: true, value: parsed.data };
}

export function fieldDomId(path: string): string {
  return `field-${path.replaceAll(".", "-")}`;
}
