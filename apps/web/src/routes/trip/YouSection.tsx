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

import { TimeField } from "../../components/TimeField";
import { CheckboxField, SelectField, TextField } from "../../components/fields";
import { legalMessages, messages } from "../../messages";
import { h2Class, labelClass, surfaceClass } from "../../ui";
import {
  isCaffeine,
  isChronotype,
  isPreAdjust,
  melatoninTimingVisible,
} from "./formState";
import { fieldDomId, type FieldErrors, type TripFormValues } from "./schema";

const PRE_ADJUST = { "0": 0, "1": 1, "2": 2, "3": 3 } as const;

export function YouSection({
  form,
  errors,
  showMelatonin,
  onChange,
}: {
  form: TripFormValues;
  errors: FieldErrors;
  showMelatonin: boolean;
  onChange: (patch: Partial<TripFormValues>) => void;
}) {
  return (
    <section aria-labelledby="you-heading" className={surfaceClass}>
      <h2 id="you-heading" className={h2Class}>
        {messages.youHeading}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TimeField
          id={fieldDomId("habitualBedtime")}
          label={messages.bedtime}
          hint={messages.bedtimeHint}
          value={form.habitualBedtime}
          error={errors.habitualBedtime}
          required
          onChange={(habitualBedtime) => onChange({ habitualBedtime })}
        />
        <TimeField
          id={fieldDomId("habitualWake")}
          label={messages.wake}
          hint={messages.wakeHint}
          value={form.habitualWake}
          error={errors.habitualWake}
          required
          onChange={(habitualWake) => onChange({ habitualWake })}
        />
        <SelectField
          id={fieldDomId("chronotype")}
          label={messages.chronotype}
          value={form.chronotype}
          required
          error={errors.chronotype}
          options={[
            { value: "morning", label: messages.chronotypeMorning },
            { value: "intermediate", label: messages.chronotypeIntermediate },
            { value: "evening", label: messages.chronotypeEvening },
          ]}
          onChange={(value) => {
            if (isChronotype(value)) onChange({ chronotype: value });
          }}
        />
        <TextField
          id={fieldDomId("sleepNeedHours")}
          label={messages.sleepNeed}
          hint={messages.sleepNeedHint}
          value={form.sleepNeedHours}
          error={errors.sleepNeedHours}
          required
          inputMode="decimal"
          onChange={(sleepNeedHours) => onChange({ sleepNeedHours })}
        />
        <SelectField
          id={fieldDomId("caffeine")}
          label={messages.caffeine}
          value={form.caffeine}
          required
          error={errors.caffeine}
          options={[
            { value: "none", label: messages.caffeineNone },
            { value: "normal", label: messages.caffeineNormal },
            { value: "heavy", label: messages.caffeineHeavy },
          ]}
          onChange={(value) => {
            if (isCaffeine(value)) onChange({ caffeine: value });
          }}
        />
        <SelectField
          id={fieldDomId("preAdjustDays")}
          label={messages.preAdjust}
          hint={messages.preAdjustHint}
          value={String(form.preAdjustDays)}
          required
          error={errors.preAdjustDays}
          options={[0, 1, 2, 3].map((days) => ({
            value: String(days),
            label: messages.preAdjustOption(days),
          }))}
          onChange={(value) => {
            if (isPreAdjust(value)) {
              onChange({ preAdjustDays: PRE_ADJUST[value] });
            }
          }}
        />
      </div>
      <CheckboxField
        id={fieldDomId("exerciseEnabled")}
        label={messages.exercise}
        checked={form.exerciseEnabled}
        hint={form.exerciseEnabled ? legalMessages.exerciseNotice : undefined}
        onChange={(exerciseEnabled) => onChange({ exerciseEnabled })}
      />
      <CheckboxField
        label={messages.windDown}
        checked={form.meditationEnabled}
        onChange={(meditationEnabled) => onChange({ meditationEnabled })}
      />
      <CheckboxField
        label={messages.meals}
        checked={form.mealTimingEnabled}
        onChange={(mealTimingEnabled) => onChange({ mealTimingEnabled })}
      />
      {showMelatonin ? (
        <>
          <CheckboxField
            label={legalMessages.melatoninQuestion}
            checked={form.useMelatonin}
            onChange={(useMelatonin) => onChange({ useMelatonin })}
          />
          {form.useMelatonin ? (
            <>
              <p>{legalMessages.melatoninNotice}</p>
              <fieldset className="flex flex-col gap-2">
                <legend className={labelClass}>
                  {legalMessages.melatoninCheckHeading}
                </legend>
                <CheckboxField
                  label={legalMessages.melatoninPregnant}
                  checked={form.melatoninPregnant}
                  onChange={(melatoninPregnant) =>
                    onChange({ melatoninPregnant })
                  }
                />
                <CheckboxField
                  label={legalMessages.melatoninMedication}
                  checked={form.melatoninMedication}
                  onChange={(melatoninMedication) =>
                    onChange({ melatoninMedication })
                  }
                />
                <CheckboxField
                  label={legalMessages.melatoninUnder18}
                  checked={form.melatoninUnder18}
                  onChange={(melatoninUnder18) =>
                    onChange({ melatoninUnder18 })
                  }
                />
              </fieldset>
              {melatoninTimingVisible(form) ? (
                <SelectField
                  id={fieldDomId("melatoninTiming")}
                  label={messages.melatoninTiming}
                  hint={messages.melatoninTimingHint}
                  value={form.melatoninTiming}
                  error={errors.melatoninTiming}
                  options={[
                    {
                      value: "strongest",
                      label: messages.melatoninTimingStrongest,
                    },
                    {
                      value: "evening",
                      label: messages.melatoninTimingEvening,
                    },
                  ]}
                  onChange={(value) => {
                    if (value === "strongest" || value === "evening") {
                      onChange({ melatoninTiming: value });
                    }
                  }}
                />
              ) : (
                <p role="status">{legalMessages.melatoninBlocked}</p>
              )}
            </>
          ) : null}
        </>
      ) : null}
      <SelectField
        id={fieldDomId("arrivalStyle")}
        label={messages.arrivalStyle}
        hint={messages.arrivalStyleHint}
        value={form.arrivalStyle}
        error={errors.arrivalStyle}
        options={[
          { value: "body-clock", label: messages.arrivalStyleBodyClock },
          { value: "local", label: messages.arrivalStyleLocal },
        ]}
        onChange={(value) => {
          if (value === "body-clock" || value === "local") {
            onChange({ arrivalStyle: value });
          }
        }}
      />
    </section>
  );
}
