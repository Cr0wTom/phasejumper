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

import type { Airport } from "@phasejumper/airports";
import {
  ENGINE_VERSION,
  EngineInputError,
  generatePlan,
  validatePlanInput,
  type PlanResult,
} from "@phasejumper/engine";
import { parseItinerary, type ParsedLeg } from "@phasejumper/itinerary";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  loadAirportDirectory,
  type AirportDirectory,
} from "../../airports/loadAirports";
import { airportLabel } from "../../airports/searchAirports";
import { currentInstant, currentPlainDate } from "../../clock";
import { LegalGate } from "../../components/LegalGate";
import { flags } from "../../flags";
import { legalMessages, messages } from "../../messages";
import { goToPlan } from "../../router";
import {
  termsAccepted,
  termsOutdated,
  writeTermsAcceptance,
} from "../../terms";
import { loadPlan, savePlan } from "../../storage/plans";
import { errorClass, h1Class, pageClass, primaryButtonClass } from "../../ui";
import { ConstraintsSection } from "./ConstraintsSection";
import { FlightsSection } from "./FlightsSection";
import {
  createDefaultForm,
  formFromPlanInput,
  createId,
  emptyAwake,
  emptyLeg,
  emptyWindow,
} from "./formState";
import { mapTripForm, zonesForLegs } from "./mapPlanInput";
import {
  fieldDomId,
  parseTripForm,
  type AwakeForm,
  type FieldErrors,
  type LegForm,
  type TripFormValues,
  type WindowForm,
} from "./schema";
import { YouSection } from "./YouSection";

interface FormAlert {
  title: string;
  issues: readonly string[];
}

const REVIEW_FIELDS = [
  "fromIata",
  "toIata",
  "departureDate",
  "departureTime",
  "arrivalDate",
  "arrivalTime",
] as const;

function focusFirst(errors: FieldErrors): void {
  const first = Object.keys(errors)[0];
  if (first === undefined) return;
  document.getElementById(fieldDomId(first))?.focus();
}

function legFormFromParsed(
  leg: ParsedLeg,
  lookup: (iata: string) => Airport | undefined,
): LegForm {
  const from = lookup(leg.departureAirport);
  const to = lookup(leg.arrivalAirport);
  return {
    id: createId(),
    fromQuery: from === undefined ? leg.departureAirport : airportLabel(from),
    fromIata: from === undefined ? "" : from.iata,
    toQuery: to === undefined ? leg.arrivalAirport : airportLabel(to),
    toIata: to === undefined ? "" : to.iata,
    departureDate: leg.departureDate,
    departureTime: leg.departureTime,
    arrivalDate: leg.arrivalDate,
    arrivalTime: leg.arrivalTime,
    flightNumber: leg.flightNumber ?? "",
  };
}

function dropReview(
  current: Readonly<Record<string, true>>,
  keys: readonly string[],
): Readonly<Record<string, true>> {
  let changed = false;
  const next: Record<string, true> = { ...current };
  for (const key of keys) {
    if (next[key] !== true) continue;
    delete next[key];
    changed = true;
  }
  return changed ? next : current;
}

export function TripBuilder({ editId }: { editId?: string } = {}) {
  const [form, setForm] = useState<TripFormValues>(createDefaultForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formAlert, setFormAlert] = useState<FormAlert | null>(null);
  const [directory, setDirectory] = useState<AirportDirectory | null>(null);
  const [airportsError, setAirportsError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(
    () => !flags["legal.acceptanceGate"] || termsAccepted(),
  );
  const [outdated, setOutdated] = useState(() => termsOutdated());
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [unparsed, setUnparsed] = useState<readonly string[]>([]);
  const [review, setReview] = useState<Readonly<Record<string, true>>>({});
  const savingRef = useRef(false);
  const formAlertRef = useRef<HTMLDivElement>(null);
  const showMelatonin = flags["melatonin.optIn"];
  const showGate = flags["legal.acceptanceGate"] && !accepted;

  useEffect(() => {
    let cancelled = false;
    loadAirportDirectory()
      .then((loaded) => {
        if (!cancelled) setDirectory(loaded);
      })
      .catch(() => {
        if (!cancelled) setAirportsError(messages.airportsFailed);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Edit trip": fill the form from a saved plan once airports are loaded.
  // Generating then creates a new plan; the original stays as it was.
  useEffect(() => {
    if (editId === undefined || directory === null) return;
    let cancelled = false;
    loadPlan(editId)
      .then((plan) => {
        if (cancelled) return;
        if (plan === undefined) {
          setFormAlert({ title: messages.editMissing, issues: [] });
          return;
        }
        setForm(
          formFromPlanInput(plan.input, (iata) => {
            const airport = directory.lookup(iata);
            return airport === undefined ? iata : airportLabel(airport);
          }),
        );
      })
      .catch(() => {
        if (!cancelled)
          setFormAlert({ title: messages.editMissing, issues: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [editId, directory]);

  useEffect(() => {
    if (formAlert !== null) formAlertRef.current?.focus();
  }, [formAlert]);

  function patch(next: Partial<TripFormValues>): void {
    setForm((current) => ({ ...current, ...next }));
  }

  function changeLeg(index: number, legPatch: Partial<LegForm>): void {
    const id = form.legs[index]?.id;
    if (id !== undefined) {
      setReview((current) =>
        dropReview(
          current,
          Object.keys(legPatch).map((field) => `${id}:${field}`),
        ),
      );
    }
    setForm((current) => ({
      ...current,
      legs: current.legs.map((leg, legIndex) =>
        legIndex === index ? { ...leg, ...legPatch } : leg,
      ),
    }));
  }

  function onReadFlights(): void {
    if (directory === null) return;
    const text = paste;
    const result = parseItinerary(text, {
      referenceDate: currentPlainDate(),
      isAirport: (iata) => directory.lookup(iata) !== undefined,
    });
    setPaste("");
    if (result.legs.length === 0) {
      setPasteError(messages.pasteUnread);
      setUnparsed([]);
      return;
    }
    const legs = result.legs.map((leg) =>
      legFormFromParsed(leg, directory.lookup),
    );
    const nextReview: Record<string, true> = {};
    for (const leg of legs) {
      for (const field of REVIEW_FIELDS)
        nextReview[`${leg.id}:${field}`] = true;
      if (leg.flightNumber.length > 0) {
        nextReview[`${leg.id}:flightNumber`] = true;
      }
    }
    setPasteError(null);
    setUnparsed(result.unparsed);
    setReview(nextReview);
    setFormAlert(null);
    setForm((current) => ({ ...current, legs }));
    setFieldErrors((current) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(current)) {
        if (key === "legs" || key.startsWith("legs.")) {
          changed = true;
          continue;
        }
        next[key] = value;
      }
      return changed ? next : current;
    });
  }

  function changeEvent(index: number, eventPatch: Partial<AwakeForm>): void {
    setForm((current) => ({
      ...current,
      mustBeAwake: current.mustBeAwake.map((event, eventIndex) =>
        eventIndex === index ? { ...event, ...eventPatch } : event,
      ),
    }));
  }

  function changeWindow(index: number, windowPatch: Partial<WindowForm>): void {
    setForm((current) => ({
      ...current,
      noWorkoutWindows: current.noWorkoutWindows.map((window, windowIndex) =>
        windowIndex === index ? { ...window, ...windowPatch } : window,
      ),
    }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (showGate || savingRef.current) return;
    setFormAlert(null);
    setFieldErrors({});

    const submitted: TripFormValues = showMelatonin
      ? form
      : { ...form, useMelatonin: false };
    const parsed = parseTripForm(submitted);
    if (!parsed.ok) {
      setFieldErrors(parsed.fieldErrors);
      focusFirst(parsed.fieldErrors);
      return;
    }
    if (directory === null) {
      if (airportsError !== null) {
        setFormAlert({ title: airportsError, issues: [] });
      }
      return;
    }

    const mapped = mapTripForm(
      parsed.value,
      directory.lookup,
      currentInstant(),
    );
    if (!mapped.ok) {
      setFieldErrors(mapped.fieldErrors);
      focusFirst(mapped.fieldErrors);
      return;
    }

    const engineCheck = validatePlanInput(mapped.input);
    if (!engineCheck.ok) {
      setFormAlert({
        title: messages.engineRejected,
        issues: engineCheck.issues,
      });
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      let result: PlanResult;
      try {
        result = generatePlan(mapped.input);
      } catch (error) {
        if (error instanceof EngineInputError) {
          setFormAlert({
            title: messages.engineRejected,
            issues: [...error.issues],
          });
          return;
        }
        // Not an input problem: surface the engine's own message too.
        setFormAlert({
          title: messages.unexpectedFailure,
          issues: [error instanceof Error ? error.message : String(error)],
        });
        return;
      }

      const id = crypto.randomUUID();
      try {
        await savePlan({
          id,
          input: mapped.input,
          result,
          engineVersion: ENGINE_VERSION,
          createdAt: currentInstant(),
        });
      } catch {
        setFormAlert({ title: messages.saveFailed, issues: [] });
        return;
      }
      goToPlan(id);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const zones =
    directory === null ? [] : zonesForLegs(form.legs, directory.lookup);

  return (
    <main className={pageClass}>
      <h1 className={h1Class}>{messages.tripHeading}</h1>
      <form className="mt-8 flex flex-col gap-6" noValidate onSubmit={onSubmit}>
        {formAlert === null ? null : (
          <div
            ref={formAlertRef}
            tabIndex={-1}
            role="alert"
            className="rounded-surface border border-danger bg-surface p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            <p>{formAlert.title}</p>
            {formAlert.issues.length === 0 ? null : (
              <ul className="mt-2 list-disc pl-5">
                {formAlert.issues.map((issue, index) => (
                  <li key={`${index}-${issue}`}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {Object.keys(fieldErrors).length === 0 ? null : (
          <p role="alert" className={errorClass}>
            {messages.fieldSummary}
          </p>
        )}
        <YouSection
          form={form}
          errors={fieldErrors}
          showMelatonin={showMelatonin}
          onChange={patch}
        />
        <FlightsSection
          legs={form.legs}
          errors={fieldErrors}
          airports={directory === null ? null : directory.airports}
          airportsError={airportsError}
          paste={paste}
          pasteError={pasteError}
          unparsed={unparsed}
          readDisabled={directory === null}
          reviewed={(legId, field) => review[`${legId}:${field}`] === true}
          onPaste={setPaste}
          onRead={onReadFlights}
          onChangeLeg={changeLeg}
          onAdd={() =>
            setForm((current) => ({
              ...current,
              legs: [...current.legs, emptyLeg()],
            }))
          }
          onRemove={(index) => {
            const id = form.legs[index]?.id;
            setForm((current) => ({
              ...current,
              legs: current.legs.filter((_, legIndex) => legIndex !== index),
            }));
            if (id === undefined) return;
            setReview((current) => {
              const prefix = `${id}:`;
              const keys = Object.keys(current).filter((key) =>
                key.startsWith(prefix),
              );
              return dropReview(current, keys);
            });
          }}
        />
        <ConstraintsSection
          form={form}
          errors={fieldErrors}
          zones={zones}
          onTripDays={(tripDays) => patch({ tripDays })}
          onAddEvent={() =>
            setForm((current) => ({
              ...current,
              mustBeAwake: [...current.mustBeAwake, emptyAwake()],
            }))
          }
          onRemoveEvent={(index) =>
            setForm((current) => ({
              ...current,
              mustBeAwake: current.mustBeAwake.filter(
                (_, eventIndex) => eventIndex !== index,
              ),
            }))
          }
          onChangeEvent={changeEvent}
          onAddWindow={() =>
            setForm((current) => ({
              ...current,
              noWorkoutWindows: [...current.noWorkoutWindows, emptyWindow()],
            }))
          }
          onRemoveWindow={(index) =>
            setForm((current) => ({
              ...current,
              noWorkoutWindows: current.noWorkoutWindows.filter(
                (_, windowIndex) => windowIndex !== index,
              ),
            }))
          }
          onChangeWindow={changeWindow}
        />
        {showGate ? (
          <LegalGate
            outdated={outdated}
            onContinue={() => {
              const written = writeTermsAcceptance(currentInstant());
              setSaveFailed(!written.ok);
              setOutdated(false);
              setAccepted(true);
            }}
          />
        ) : (
          <>
            {saveFailed ? (
              <p role="status">{legalMessages.saveFailed}</p>
            ) : null}
            <button
              type="submit"
              className={`${primaryButtonClass} self-start`}
              disabled={saving || directory === null}
              aria-busy={saving ? true : undefined}
            >
              {saving ? messages.generating : messages.generate}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
