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
import { TimeField } from "../../components/TimeField";
import { TextField } from "../../components/fields";
import { messages } from "../../messages";
import { buttonClass, h3Class } from "../../ui";
import { fieldDomId, type FieldErrors, type LegForm } from "./schema";

/** One flight, shared by the outbound list and the return list. */
export function FlightLegFields({
  leg,
  index,
  path,
  headingId,
  legend,
  removeLabel,
  showRemove,
  errors,
  airports,
  onChange,
  onRemove,
}: {
  leg: LegForm;
  index: number;
  path: "legs" | "returnLegs";
  headingId: string;
  legend: string;
  removeLabel: string;
  showRemove: boolean;
  errors: FieldErrors;
  airports: readonly SearchableAirport[] | null;
  onChange: (patch: Partial<LegForm>) => void;
  onRemove: () => void;
}) {
  const key = (field: string): string => `${path}.${index}.${field}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 border-t border-line pt-4"
    >
      <h3 id={headingId} className={h3Class}>
        {legend}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AirportCombobox
          id={fieldDomId(key("fromIata"))}
          label={messages.fromAirport}
          query={leg.fromQuery}
          airports={airports}
          disabled={airports === null}
          error={errors[key("fromIata")]}
          onQueryChange={(fromQuery) => onChange({ fromQuery, fromIata: "" })}
          onSelect={(airport) =>
            onChange({
              fromQuery: airportLabel(airport),
              fromIata: airport.iata,
            })
          }
        />
        <AirportCombobox
          id={fieldDomId(key("toIata"))}
          label={messages.toAirport}
          query={leg.toQuery}
          airports={airports}
          disabled={airports === null}
          error={errors[key("toIata")]}
          onQueryChange={(toQuery) => onChange({ toQuery, toIata: "" })}
          onSelect={(airport) =>
            onChange({
              toQuery: airportLabel(airport),
              toIata: airport.iata,
            })
          }
        />
        <TextField
          id={fieldDomId(key("departureDate"))}
          label={messages.departureDate}
          type="date"
          value={leg.departureDate}
          error={errors[key("departureDate")]}
          required
          onChange={(departureDate) => onChange({ departureDate })}
        />
        <TimeField
          id={fieldDomId(key("departureTime"))}
          label={messages.departureTime}
          value={leg.departureTime}
          error={errors[key("departureTime")]}
          required
          onChange={(departureTime) => onChange({ departureTime })}
        />
        <TextField
          id={fieldDomId(key("arrivalDate"))}
          label={messages.arrivalDate}
          type="date"
          value={leg.arrivalDate}
          error={errors[key("arrivalDate")]}
          required
          onChange={(arrivalDate) => onChange({ arrivalDate })}
        />
        <TimeField
          id={fieldDomId(key("arrivalTime"))}
          label={messages.arrivalTime}
          value={leg.arrivalTime}
          error={errors[key("arrivalTime")]}
          required
          onChange={(arrivalTime) => onChange({ arrivalTime })}
        />
      </div>
      <TextField
        id={fieldDomId(key("flightNumber"))}
        label={messages.flightNumber}
        hint={messages.flightNumberHint}
        value={leg.flightNumber}
        error={errors[key("flightNumber")]}
        onChange={(flightNumber) => onChange({ flightNumber })}
      />
      {showRemove ? (
        <button type="button" className={buttonClass} onClick={onRemove}>
          {removeLabel}
        </button>
      ) : null}
    </section>
  );
}
