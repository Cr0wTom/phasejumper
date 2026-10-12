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
  ENGINE_VERSION,
  EngineInputError,
  generatePlan,
  validatePlanInput,
  type PlanResult,
} from "@phasejumper/engine";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  loadAirportDirectory,
  type AirportDirectory,
} from "../../airports/loadAirports";
import { currentInstant } from "../../clock";
import { LegalGate } from "../../components/LegalGate";
import { flags } from "../../flags";
import { messages } from "../../messages";
import { goToPlan } from "../../router";
import { savePlan } from "../../storage/plans";
import { errorClass, h1Class, pageClass, primaryButtonClass } from "../../ui";
import { ConstraintsSection } from "./ConstraintsSection";
import { FlightsSection } from "./FlightsSection";
import {
  createDefaultForm,
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

function focusFirst(errors: FieldErrors): void {
  const first = Object.keys(errors)[0];
  if (first === undefined) return;
  document.getElementById(fieldDomId(first))?.focus();
}

export function TripBuilder() {
  const [form, setForm] = useState<TripFormValues>(createDefaultForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formAlert, setFormAlert] = useState<FormAlert | null>(null);
  const [directory, setDirectory] = useState<AirportDirectory | null>(null);
  const [airportsError, setAirportsError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    if (formAlert !== null) formAlertRef.current?.focus();
  }, [formAlert]);

  function patch(next: Partial<TripFormValues>): void {
    setForm((current) => ({ ...current, ...next }));
  }

  function changeLeg(index: number, legPatch: Partial<LegForm>): void {
    setForm((current) => ({
      ...current,
      legs: current.legs.map((leg, legIndex) =>
        legIndex === index ? { ...leg, ...legPatch } : leg,
      ),
    }));
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
            className="rounded-[10px] border border-[#FFB4B4] bg-[#141417] p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2F2F0]"
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
          onChangeLeg={changeLeg}
          onAdd={() =>
            setForm((current) => ({
              ...current,
              legs: [...current.legs, emptyLeg()],
            }))
          }
          onRemove={(index) =>
            setForm((current) => ({
              ...current,
              legs: current.legs.filter((_, legIndex) => legIndex !== index),
            }))
          }
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
          <LegalGate onContinue={() => setAccepted(true)} />
        ) : (
          <button
            type="submit"
            className={`${primaryButtonClass} self-start`}
            disabled={saving || directory === null}
            aria-busy={saving ? true : undefined}
          >
            {saving ? messages.generating : messages.generate}
          </button>
        )}
      </form>
    </main>
  );
}
