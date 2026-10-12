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

// Start (§3.1 #1): a live example ribbon, "Plan a trip", the plans saved on
// this device, and the required footer.

import { generatePlan } from "@phasejumper/engine";
import { useEffect, useMemo, useState } from "react";
import { PhaseMap } from "../../components/PhaseMap/PhaseMap";
import { EXAMPLE_TRIP } from "../../exampleTrip";
import { shortDate } from "../../format";
import { messages, startMessages as m } from "../../messages";
import { planHash } from "../../router";
import { listPlans, type StoredPlan } from "../../storage/plans";
import {
  errorClass,
  h1Class,
  h2Class,
  linkClass,
  pageClass,
  primaryButtonClass,
  surfaceClass,
} from "../../ui";

type Saved =
  | { status: "loading" }
  | { status: "ready"; plans: StoredPlan[] }
  | { status: "failed" };

function tripLabel(plan: StoredPlan): string {
  const legs = plan.input.itinerary.legs;
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (first === undefined || last === undefined) return plan.id;
  return m.savedTrip(
    first.departureAirport,
    last.arrivalAirport,
    shortDate(first.departureLocal.slice(0, 10)),
  );
}

export function StartScreen() {
  const example = useMemo(() => generatePlan(EXAMPLE_TRIP), []);
  const [saved, setSaved] = useState<Saved>({ status: "loading" });

  useEffect(() => {
    let live = true;
    listPlans().then(
      (plans) => {
        if (live) setSaved({ status: "ready", plans });
      },
      () => {
        if (live) setSaved({ status: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className={pageClass}>
      <h1 className={h1Class}>{m.heading}</h1>
      <p className="mt-2 max-w-[60ch] text-fg-muted">{m.lede}</p>
      <div className="mt-6">
        <a className={`${primaryButtonClass} inline-block`} href="#/trip">
          {m.planTrip}
        </a>
      </div>

      <section
        aria-labelledby="start-example"
        className={`mt-8 ${surfaceClass}`}
      >
        <h2 id="start-example" className={h2Class}>
          {m.exampleHeading}
        </h2>
        <PhaseMap input={EXAMPLE_TRIP} result={example} compact />
      </section>

      <section
        aria-labelledby="start-saved"
        className="mt-8 flex flex-col gap-3"
      >
        <h2 id="start-saved" className={h2Class}>
          {m.savedHeading}
        </h2>
        {saved.status === "loading" ? (
          <p>{m.savedLoading}</p>
        ) : saved.status === "failed" ? (
          <p role="alert" className={errorClass}>
            {m.savedFailed}
          </p>
        ) : saved.plans.length === 0 ? (
          <p className="text-fg-muted">{m.savedNone}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {saved.plans.map((plan) => (
              <li key={plan.id}>
                <a className={linkClass} href={planHash(plan.id)}>
                  {tripLabel(plan)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-8 flex flex-col gap-2 border-t border-line pt-4 text-13 leading-body text-fg-muted">
        <p>{messages.footer}</p>
        <p>
          <a className={linkClass} href="#/evidence">
            {m.evidenceLink}
          </a>
        </p>
      </footer>
    </main>
  );
}
