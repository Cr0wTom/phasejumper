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

import { useId, useRef, useState, type ChangeEvent } from "react";
import type { SearchableAirport } from "../../airports/searchAirports";
import {
  parseCalendarFlights,
  type ImportedFlight,
} from "../../calendarImport";
import { CheckboxField } from "../../components/fields";
import { calendarImportMessages, messages } from "../../messages";
import {
  buttonClass,
  errorClass,
  h2Class,
  h3Class,
  hintClass,
  labelClass,
  surfaceClass,
} from "../../ui";
import { FlightLegFields } from "./FlightLegFields";
import type { FieldErrors, LegForm } from "./schema";

/** Larger calendar files are refused before they are read. */
const MAX_CALENDAR_BYTES = 1_000_000;

type AirportLookup = (iata: string) => { iata: string; tz: string } | undefined;

export function FlightsSection({
  legs,
  errors,
  airports,
  airportsError,
  lookup,
  onChangeLeg,
  onAdd,
  onRemove,
  onImport,
}: {
  legs: readonly LegForm[];
  errors: FieldErrors;
  airports: readonly SearchableAirport[] | null;
  airportsError: string | null;
  lookup: AirportLookup | null;
  onChangeLeg: (index: number, patch: Partial<LegForm>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onImport: (flights: readonly ImportedFlight[]) => void;
}) {
  return (
    <section aria-labelledby="flights-heading" className={surfaceClass}>
      <h2 id="flights-heading" className={h2Class}>
        {messages.flightsHeading}
      </h2>
      <p className={hintClass}>{messages.localTimesHint}</p>
      <CalendarImport
        enabled={airports !== null}
        lookup={lookup}
        onImport={onImport}
      />
      {airports === null && airportsError === null ? (
        <p>{messages.airportsLoading}</p>
      ) : null}
      {airportsError === null ? null : (
        <p role="alert" className={errorClass}>
          {airportsError}
        </p>
      )}
      {errors.legs === undefined ? null : (
        <p role="alert" className={errorClass}>
          {errors.legs}
        </p>
      )}
      {legs.map((leg, index) => {
        const number = index + 1;
        return (
          <FlightLegFields
            key={leg.id}
            leg={leg}
            index={index}
            path="legs"
            headingId={`flight-${leg.id}`}
            legend={messages.flightLegend(number)}
            removeLabel={messages.removeLeg(number)}
            showRemove={legs.length > 1}
            errors={errors}
            airports={airports}
            onChange={(patch) => onChangeLeg(index, patch)}
            onRemove={() => onRemove(index)}
          />
        );
      })}
      <button type="button" className={buttonClass} onClick={onAdd}>
        {messages.addLeg}
      </button>
    </section>
  );
}

function CalendarImport({
  enabled,
  lookup,
  onImport,
}: {
  enabled: boolean;
  lookup: AirportLookup | null;
  onImport: (flights: readonly ImportedFlight[]) => void;
}) {
  const inputId = useId();
  const headingId = useId();
  const hintId = `${inputId}-hint`;
  const alertId = `${inputId}-error`;
  const readSeq = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<readonly ImportedFlight[] | null>(null);
  const [checked, setChecked] = useState<readonly boolean[]>([]);

  function onChoose(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.item(0) ?? null;
    input.value = "";
    if (file === null) return;
    const seq = readSeq.current + 1;
    readSeq.current = seq;
    setNotice(null);
    setDraft(null);
    setChecked([]);
    if (file.size > MAX_CALENDAR_BYTES) {
      setNotice(calendarImportMessages.tooLarge);
      return;
    }
    if (lookup === null) return;
    void readCalendar(file, seq, lookup);
  }

  async function readCalendar(
    file: File,
    seq: number,
    resolve: AirportLookup,
  ): Promise<void> {
    let text: string;
    try {
      text = await file.text();
    } catch {
      if (readSeq.current !== seq) return;
      setNotice(calendarImportMessages.readFailed);
      return;
    }
    if (readSeq.current !== seq) return;
    const parsed = parseCalendarFlights(text, { lookup: resolve });
    if (!parsed.ok) {
      setNotice(calendarImportMessages.notCalendar);
      return;
    }
    if (parsed.flights.length === 0) {
      setNotice(calendarImportMessages.noneFound);
      return;
    }
    setDraft(parsed.flights);
    setChecked(parsed.flights.map(() => true));
  }

  function onAdd(): void {
    if (draft === null) return;
    const chosen = draft.filter((_, index) => checked[index] === true);
    // An empty selection would wipe the last outbound flight. The form always
    // keeps at least one leg, so Add stays disabled until one is ticked.
    if (chosen.length === 0) return;
    onImport(chosen);
    setDraft(null);
    setChecked([]);
    setNotice(null);
  }

  function onCancel(): void {
    setDraft(null);
    setChecked([]);
  }

  const showDraft = draft !== null && checked.length === draft.length;
  const noneChecked = checked.every((item) => !item);

  return (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={inputId} className={labelClass}>
          {calendarImportMessages.button}
        </label>
        <input
          id={inputId}
          type="file"
          accept=".ics,text/calendar"
          disabled={!enabled}
          aria-describedby={notice === null ? hintId : `${hintId} ${alertId}`}
          // Same plain file picker as Settings → Import plans.
          className="text-15"
          onChange={onChoose}
        />
        <p id={hintId} className={hintClass}>
          {calendarImportMessages.hint}
        </p>
        {notice === null ? null : (
          <p id={alertId} role="alert" className={errorClass}>
            {notice}
          </p>
        )}
      </div>
      {showDraft && draft !== null ? (
        <section
          aria-labelledby={headingId}
          className={`${surfaceClass} min-w-0`}
        >
          <h3 id={headingId} className={h3Class}>
            {calendarImportMessages.found(draft.length)}
          </h3>
          <p className={hintClass}>{calendarImportMessages.foundHint}</p>
          <div className="flex flex-col gap-2">
            {draft.map((item, index) => (
              <CheckboxField
                key={`${item.fromIata}-${item.toIata}-${item.departureDate}-${item.departureTime}-${index}`}
                label={calendarImportMessages.row(
                  item.fromIata,
                  item.toIata,
                  `${item.departureDate} ${item.departureTime}`,
                )}
                checked={checked[index] === true}
                onChange={(value) => {
                  setChecked((current) =>
                    current.map((itemChecked, itemIndex) =>
                      itemIndex === index ? value : itemChecked,
                    ),
                  );
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={noneChecked}
              onClick={onAdd}
            >
              {calendarImportMessages.add}
            </button>
            <button type="button" className={buttonClass} onClick={onCancel}>
              {calendarImportMessages.cancel}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
