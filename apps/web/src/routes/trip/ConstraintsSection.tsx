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
import { SelectField, TextField } from "../../components/fields";
import { messages } from "../../messages";
import { buttonClass, h2Class, h3Class, surfaceClass } from "../../ui";
import {
  fieldDomId,
  type AwakeForm,
  type FieldErrors,
  type TripFormValues,
  type WindowForm,
} from "./schema";

function zoneOptions(
  zones: readonly string[],
): { value: string; label: string }[] {
  return [
    { value: "", label: messages.zonePlaceholder },
    ...zones.map((zone) => ({ value: zone, label: zone })),
  ];
}

export function ConstraintsSection({
  form,
  errors,
  zones,
  onTripDays,
  onAddEvent,
  onRemoveEvent,
  onChangeEvent,
  onAddWindow,
  onRemoveWindow,
  onChangeWindow,
}: {
  form: TripFormValues;
  errors: FieldErrors;
  zones: readonly string[];
  onTripDays: (tripDays: string) => void;
  onAddEvent: () => void;
  onRemoveEvent: (index: number) => void;
  onChangeEvent: (index: number, patch: Partial<AwakeForm>) => void;
  onAddWindow: () => void;
  onRemoveWindow: (index: number) => void;
  onChangeWindow: (index: number, patch: Partial<WindowForm>) => void;
}) {
  const options = zoneOptions(zones);
  const zoneHint = zones.length === 0 ? messages.zoneEmpty : undefined;

  return (
    <section aria-labelledby="constraints-heading" className={surfaceClass}>
      <h2 id="constraints-heading" className={h2Class}>
        {messages.constraintsHeading}
      </h2>
      <div className="flex flex-col gap-4">
        <h3 className={h3Class}>{messages.mustBeAwakeHeading}</h3>
        {form.mustBeAwake.map((event, index) => {
          const number = index + 1;
          const tz = zones.includes(event.tz) ? event.tz : "";
          return (
            <section
              key={event.id}
              aria-labelledby={`event-${event.id}`}
              className="flex flex-col gap-4 border-t border-line pt-4"
            >
              <h4
                id={`event-${event.id}`}
                className="text-15 font-medium leading-body"
              >
                {messages.eventLegend(number)}
              </h4>
              <TextField
                id={fieldDomId(`mustBeAwake.${index}.label`)}
                label={messages.eventLabel}
                value={event.label}
                error={errors[`mustBeAwake.${index}.label`]}
                required
                onChange={(label) => onChangeEvent(index, { label })}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  id={fieldDomId(`mustBeAwake.${index}.startDate`)}
                  label={messages.startDate}
                  type="date"
                  value={event.startDate}
                  error={errors[`mustBeAwake.${index}.startDate`]}
                  required
                  onChange={(startDate) => onChangeEvent(index, { startDate })}
                />
                <TimeField
                  id={fieldDomId(`mustBeAwake.${index}.startTime`)}
                  label={messages.startTime}
                  value={event.startTime}
                  error={errors[`mustBeAwake.${index}.startTime`]}
                  required
                  onChange={(startTime) => onChangeEvent(index, { startTime })}
                />
                <TextField
                  id={fieldDomId(`mustBeAwake.${index}.endDate`)}
                  label={messages.endDate}
                  type="date"
                  value={event.endDate}
                  error={errors[`mustBeAwake.${index}.endDate`]}
                  required
                  onChange={(endDate) => onChangeEvent(index, { endDate })}
                />
                <TimeField
                  id={fieldDomId(`mustBeAwake.${index}.endTime`)}
                  label={messages.endTime}
                  value={event.endTime}
                  error={errors[`mustBeAwake.${index}.endTime`]}
                  required
                  onChange={(endTime) => onChangeEvent(index, { endTime })}
                />
              </div>
              <SelectField
                id={fieldDomId(`mustBeAwake.${index}.tz`)}
                label={messages.eventZone}
                hint={zoneHint}
                value={tz}
                required
                error={errors[`mustBeAwake.${index}.tz`]}
                options={options}
                onChange={(next) => onChangeEvent(index, { tz: next })}
              />
              <button
                type="button"
                className={buttonClass}
                onClick={() => onRemoveEvent(index)}
              >
                {messages.removeEvent(number)}
              </button>
            </section>
          );
        })}
        <button type="button" className={buttonClass} onClick={onAddEvent}>
          {messages.addEvent}
        </button>
      </div>
      <div className="flex flex-col gap-4">
        <h3 className={h3Class}>{messages.noWorkoutHeading}</h3>
        {form.noWorkoutWindows.map((window, index) => {
          const number = index + 1;
          const tz = zones.includes(window.tz) ? window.tz : "";
          return (
            <section
              key={window.id}
              aria-labelledby={`window-${window.id}`}
              className="flex flex-col gap-4 border-t border-line pt-4"
            >
              <h4
                id={`window-${window.id}`}
                className="text-15 font-medium leading-body"
              >
                {messages.windowLegend(number)}
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  id={fieldDomId(`noWorkoutWindows.${index}.startDate`)}
                  label={messages.startDate}
                  type="date"
                  value={window.startDate}
                  error={errors[`noWorkoutWindows.${index}.startDate`]}
                  required
                  onChange={(startDate) => onChangeWindow(index, { startDate })}
                />
                <TimeField
                  id={fieldDomId(`noWorkoutWindows.${index}.startTime`)}
                  label={messages.startTime}
                  value={window.startTime}
                  error={errors[`noWorkoutWindows.${index}.startTime`]}
                  required
                  onChange={(startTime) => onChangeWindow(index, { startTime })}
                />
                <TextField
                  id={fieldDomId(`noWorkoutWindows.${index}.endDate`)}
                  label={messages.endDate}
                  type="date"
                  value={window.endDate}
                  error={errors[`noWorkoutWindows.${index}.endDate`]}
                  required
                  onChange={(endDate) => onChangeWindow(index, { endDate })}
                />
                <TimeField
                  id={fieldDomId(`noWorkoutWindows.${index}.endTime`)}
                  label={messages.endTime}
                  value={window.endTime}
                  error={errors[`noWorkoutWindows.${index}.endTime`]}
                  required
                  onChange={(endTime) => onChangeWindow(index, { endTime })}
                />
              </div>
              <SelectField
                id={fieldDomId(`noWorkoutWindows.${index}.tz`)}
                label={messages.eventZone}
                hint={zoneHint}
                value={tz}
                required
                error={errors[`noWorkoutWindows.${index}.tz`]}
                options={options}
                onChange={(next) => onChangeWindow(index, { tz: next })}
              />
              <button
                type="button"
                className={buttonClass}
                onClick={() => onRemoveWindow(index)}
              >
                {messages.removeNoWorkout(number)}
              </button>
            </section>
          );
        })}
        <button type="button" className={buttonClass} onClick={onAddWindow}>
          {messages.addNoWorkout}
        </button>
      </div>
      <TextField
        id={fieldDomId("tripDays")}
        label={messages.tripDays}
        hint={messages.tripDaysHint}
        value={form.tripDays}
        error={errors.tripDays}
        inputMode="decimal"
        onChange={onTripDays}
      />
    </section>
  );
}
