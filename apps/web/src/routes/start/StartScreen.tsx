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
import { CalendarArrowDown, ChevronRight, Lock, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "../../components/BrandMark";
import { PhaseMap } from "../../components/PhaseMap/PhaseMap";
import { ICON_STROKE } from "../../icons";
import { EXAMPLE_TRIP } from "../../exampleTrip";
import { shortDate } from "../../format";
import {
  legalMessages,
  messages,
  returnMessages,
  startMessages as m,
} from "../../messages";
import { planHash } from "../../router";
import { listPlans, type StoredPlan } from "../../storage/plans";
import {
  buttonClass,
  errorClass,
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
  const date = shortDate(first.departureLocal.slice(0, 10));
  if (plan.returnPlanId !== undefined && plan.returnPlanId.length > 0) {
    return returnMessages.savedRoundTrip(
      first.departureAirport,
      last.arrivalAirport,
      date,
    );
  }
  return m.savedTrip(first.departureAirport, last.arrivalAirport, date);
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

  const featureIcons = [Sun, Lock, CalendarArrowDown] as const;
  const visiblePlans =
    saved.status === "ready"
      ? saved.plans.filter((plan) => plan.outboundPlanId === undefined)
      : [];

  return (
    <main className={pageClass}>
      <section className="pj-hero flex flex-col items-center pt-6 text-center md:pt-14">
        <div className="pj-hero-glow" aria-hidden="true" />
        <div className="pj-hero-mark mb-6">
          <BrandMark size={64} />
        </div>
        <p className="pj-chip">{m.eyebrow}</p>
        <h1 className="mt-5 max-w-[16ch] text-40 font-semibold leading-[1.02] tracking-[-0.04em] md:text-56">
          {m.headingStart}
          <span className="pj-accent-word">{m.headingAccent}</span>
        </h1>
        <p className="mt-4 max-w-[52ch] text-17 leading-body text-fg-muted">
          {m.lede}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <a className={primaryButtonClass} href="#/trip">
            {m.planTrip}
          </a>
          <a className={buttonClass} href="#/evidence">
            {m.researchButton}
          </a>
        </div>
      </section>

      <section
        aria-labelledby="start-example"
        className="pj-card mt-12 overflow-hidden md:mt-16"
      >
        <div className="pj-window-bar">
          <span className="pj-window-dot" aria-hidden="true" />
          <span className="pj-window-dot" aria-hidden="true" />
          <span className="pj-window-dot" aria-hidden="true" />
          <h2 id="start-example" className="ml-2 text-13 font-medium">
            {m.exampleHeading}
          </h2>
        </div>
        <div className="p-4 md:p-5">
          <PhaseMap input={EXAMPLE_TRIP} result={example} compact />
        </div>
      </section>

      <section aria-labelledby="start-features" className="mt-12">
        <h2 id="start-features" className="sr-only">
          {m.featuresHeading}
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {m.features.map((feature, i) => {
            const Glyph = featureIcons[i] ?? Sun;
            return (
              <li key={feature.title} className={surfaceClass}>
                <span className="pj-icon-tile" aria-hidden="true">
                  <Glyph size={18} strokeWidth={ICON_STROKE} />
                </span>
                <h3 className="text-15 font-semibold tracking-[-0.01em]">
                  {feature.title}
                </h3>
                <p className="text-13 leading-body text-fg-muted">
                  {feature.body}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="start-saved"
        className="mt-12 flex flex-col gap-3"
      >
        <h2 id="start-saved" className={h2Class}>
          {m.savedHeading}
        </h2>
        {saved.status === "loading" ? (
          <p className="text-fg-muted">{m.savedLoading}</p>
        ) : saved.status === "failed" ? (
          <p role="alert" className={errorClass}>
            {m.savedFailed}
          </p>
        ) : visiblePlans.length === 0 ? (
          <p className="text-fg-muted">{m.savedNone}</p>
        ) : (
          <ul className="pj-card divide-y divide-line overflow-hidden p-0">
            {visiblePlans.map((plan) => (
              <li key={plan.id}>
                <a className="pj-list-link" href={planHash(plan.id)}>
                  <span>{tripLabel(plan)}</span>
                  <ChevronRight
                    size={16}
                    strokeWidth={ICON_STROKE}
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-12 flex flex-col gap-2 border-t border-line pt-5 text-13 leading-body text-fg-muted md:flex-row md:items-center md:justify-between">
        <p>{messages.footer}</p>
        <p className="flex gap-4">
          <a className={linkClass} href="#/legal">
            {legalMessages.legalLink}
          </a>
          <a className={linkClass} href="#/evidence">
            {m.evidenceLink}
          </a>
        </p>
      </footer>
    </main>
  );
}
