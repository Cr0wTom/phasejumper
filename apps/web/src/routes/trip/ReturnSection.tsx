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
import { returnMessages } from "../../messages";
import { buttonClass, h2Class, hintClass, surfaceClass } from "../../ui";
import { FlightLegFields } from "./FlightLegFields";
import type { FieldErrors, LegForm } from "./schema";

export function ReturnSection({
  legs,
  errors,
  airports,
  onChangeLeg,
  onAdd,
  onRemove,
  onRemoveAll,
}: {
  legs: readonly LegForm[];
  errors: FieldErrors;
  airports: readonly SearchableAirport[] | null;
  onChangeLeg: (index: number, patch: Partial<LegForm>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onRemoveAll: () => void;
}) {
  return (
    <section aria-labelledby="return-flights-heading" className={surfaceClass}>
      <h2 id="return-flights-heading" className={h2Class}>
        {returnMessages.heading}
      </h2>
      <p className={hintClass}>{returnMessages.hint}</p>
      {legs.map((leg, index) => {
        const number = index + 1;
        return (
          <FlightLegFields
            key={leg.id}
            leg={leg}
            index={index}
            path="returnLegs"
            headingId={`return-flight-${leg.id}`}
            legend={returnMessages.legHeading(number)}
            removeLabel={returnMessages.removeLeg(number)}
            showRemove
            errors={errors}
            airports={airports}
            onChange={(patch) => onChangeLeg(index, patch)}
            onRemove={() => onRemove(index)}
          />
        );
      })}
      <button type="button" className={buttonClass} onClick={onAdd}>
        {returnMessages.addLeg}
      </button>
      <button type="button" className={buttonClass} onClick={onRemoveAll}>
        {returnMessages.removeAll}
      </button>
    </section>
  );
}
