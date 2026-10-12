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

import {
  airportLabel,
  type SearchableAirport,
} from "../../airports/searchAirports";
import { AirportCombobox } from "../../components/AirportCombobox";
import { TextField } from "../../components/fields";
import { messages } from "../../messages";
import {
  buttonClass,
  controlClass,
  errorClass,
  h2Class,
  h3Class,
  hintClass,
  labelClass,
  surfaceClass,
} from "../../ui";
import { fieldDomId, type FieldErrors, type LegForm } from "./schema";

export function FlightsSection({
  legs,
  errors,
  airports,
  airportsError,
  paste,
  pasteError,
  unparsed,
  readDisabled,
  reviewed,
  onPaste,
  onRead,
  onChangeLeg,
  onAdd,
  onRemove,
}: {
  legs: readonly LegForm[];
  errors: FieldErrors;
  airports: readonly SearchableAirport[] | null;
  airportsError: string | null;
  paste: string;
  pasteError: string | null;
  unparsed: readonly string[];
  readDisabled: boolean;
  reviewed: (legId: string, field: string) => boolean;
  onPaste: (value: string) => void;
  onRead: () => void;
  onChangeLeg: (index: number, patch: Partial<LegForm>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section aria-labelledby="flights-heading" className={surfaceClass}>
      <h2 id="flights-heading" className={h2Class}>
        {messages.flightsHeading}
      </h2>
      <p className={hintClass}>{messages.localTimesHint}</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="itinerary-paste" className={labelClass}>
          {messages.pasteLabel}
        </label>
        <textarea
          id="itinerary-paste"
          className={`${controlClass} min-h-32 resize-y`}
          value={paste}
          onChange={(event) => onPaste(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          className={`${buttonClass} self-start`}
          onClick={onRead}
          disabled={readDisabled}
        >
          {messages.readFlights}
        </button>
        {pasteError === null ? null : (
          <p role="alert" className={errorClass}>
            {pasteError}
          </p>
        )}
        {unparsed.length === 0 ? null : (
          <div>
            <p>{messages.pasteUnparsed}</p>
            <ul className="mt-2 list-disc pl-5">
              {unparsed.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
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
          <section
            key={leg.id}
            aria-labelledby={`flight-${leg.id}`}
            className="flex flex-col gap-4 border-t border-[#26262B] pt-4"
          >
            <h3 id={`flight-${leg.id}`} className={h3Class}>
              {messages.flightLegend(number)}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AirportCombobox
                id={fieldDomId(`legs.${index}.fromIata`)}
                label={messages.fromAirport}
                query={leg.fromQuery}
                airports={airports}
                disabled={airports === null}
                error={errors[`legs.${index}.fromIata`]}
                review={
                  reviewed(leg.id, "fromIata") ? messages.checkThis : undefined
                }
                onQueryChange={(fromQuery) =>
                  onChangeLeg(index, { fromQuery, fromIata: "" })
                }
                onSelect={(airport) =>
                  onChangeLeg(index, {
                    fromQuery: airportLabel(airport),
                    fromIata: airport.iata,
                  })
                }
              />
              <AirportCombobox
                id={fieldDomId(`legs.${index}.toIata`)}
                label={messages.toAirport}
                query={leg.toQuery}
                airports={airports}
                disabled={airports === null}
                error={errors[`legs.${index}.toIata`]}
                review={
                  reviewed(leg.id, "toIata") ? messages.checkThis : undefined
                }
                onQueryChange={(toQuery) =>
                  onChangeLeg(index, { toQuery, toIata: "" })
                }
                onSelect={(airport) =>
                  onChangeLeg(index, {
                    toQuery: airportLabel(airport),
                    toIata: airport.iata,
                  })
                }
              />
              <TextField
                id={fieldDomId(`legs.${index}.departureDate`)}
                label={messages.departureDate}
                hint={messages.dateHint}
                value={leg.departureDate}
                error={errors[`legs.${index}.departureDate`]}
                review={
                  reviewed(leg.id, "departureDate")
                    ? messages.checkThis
                    : undefined
                }
                required
                onChange={(departureDate) =>
                  onChangeLeg(index, { departureDate })
                }
              />
              <TextField
                id={fieldDomId(`legs.${index}.departureTime`)}
                label={messages.departureTime}
                hint={messages.timeHint}
                value={leg.departureTime}
                error={errors[`legs.${index}.departureTime`]}
                review={
                  reviewed(leg.id, "departureTime")
                    ? messages.checkThis
                    : undefined
                }
                required
                onChange={(departureTime) =>
                  onChangeLeg(index, { departureTime })
                }
              />
              <TextField
                id={fieldDomId(`legs.${index}.arrivalDate`)}
                label={messages.arrivalDate}
                hint={messages.dateHint}
                value={leg.arrivalDate}
                error={errors[`legs.${index}.arrivalDate`]}
                review={
                  reviewed(leg.id, "arrivalDate")
                    ? messages.checkThis
                    : undefined
                }
                required
                onChange={(arrivalDate) => onChangeLeg(index, { arrivalDate })}
              />
              <TextField
                id={fieldDomId(`legs.${index}.arrivalTime`)}
                label={messages.arrivalTime}
                hint={messages.timeHint}
                value={leg.arrivalTime}
                error={errors[`legs.${index}.arrivalTime`]}
                review={
                  reviewed(leg.id, "arrivalTime")
                    ? messages.checkThis
                    : undefined
                }
                required
                onChange={(arrivalTime) => onChangeLeg(index, { arrivalTime })}
              />
            </div>
            <TextField
              id={fieldDomId(`legs.${index}.flightNumber`)}
              label={messages.flightNumber}
              hint={messages.flightNumberHint}
              value={leg.flightNumber}
              error={errors[`legs.${index}.flightNumber`]}
              review={
                reviewed(leg.id, "flightNumber")
                  ? messages.checkThis
                  : undefined
              }
              onChange={(flightNumber) => onChangeLeg(index, { flightNumber })}
            />
            {legs.length > 1 ? (
              <button
                type="button"
                className={buttonClass}
                onClick={() => onRemove(index)}
              >
                {messages.removeLeg(number)}
              </button>
            ) : null}
          </section>
        );
      })}
      <button type="button" className={buttonClass} onClick={onAdd}>
        {messages.addLeg}
      </button>
    </section>
  );
}
