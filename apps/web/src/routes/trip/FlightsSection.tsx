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

import type { SearchableAirport } from "../../airports/searchAirports";
import { messages } from "../../messages";
import {
  buttonClass,
  errorClass,
  h2Class,
  hintClass,
  surfaceClass,
} from "../../ui";
import { FlightLegFields } from "./FlightLegFields";
import type { FieldErrors, LegForm } from "./schema";

export function FlightsSection({
  legs,
  errors,
  airports,
  airportsError,
  onChangeLeg,
  onAdd,
  onRemove,
}: {
  legs: readonly LegForm[];
  errors: FieldErrors;
  airports: readonly SearchableAirport[] | null;
  airportsError: string | null;
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
