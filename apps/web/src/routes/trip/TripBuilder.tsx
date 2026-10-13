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
import { airportLabel } from "../../airports/searchAirports";
import { currentInstant } from "../../clock";
import { LegalGate } from "../../components/LegalGate";
import { flags } from "../../flags";
import { legalMessages, messages, returnMessages } from "../../messages";
import { goToPlan } from "../../router";
import {
  termsAccepted,
  termsOutdated,
  writeTermsAcceptance,
} from "../../terms";
import { deletePlan, loadPlan, savePlan } from "../../storage/plans";
import {
  buttonClass,
  errorClass,
  h1Class,
  pageClass,
  primaryButtonClass,
} from "../../ui";
import { ConstraintsSection } from "./ConstraintsSection";
import { FlightsSection } from "./FlightsSection";
import {
  createDefaultForm,
  formFromPlanInput,
  emptyAwake,
  emptyLeg,
  emptyWindow,
} from "./formState";
import { mapTripForm, returnPlanInput, zonesForLegs } from "./mapPlanInput";
import { returnSplitIndex, stayDays } from "./returnTrip";
import { ReturnSection } from "./ReturnSection";
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

/**
 * Applies a leg edit. The arrival date follows the departure date while it
 * is empty or still equal to it; once the traveler sets another day (an
 * overnight flight), it is left alone.
 */
export function withFollowedArrival(
  leg: LegForm,
  legPatch: Partial<LegForm>,
): LegForm {
  const next = { ...leg, ...legPatch };
  const departure = legPatch.departureDate;
  if (
    departure !== undefined &&
    legPatch.arrivalDate === undefined &&
    (leg.arrivalDate === "" || leg.arrivalDate === leg.departureDate)
  ) {
    next.arrivalDate = departure;
  }
  return next;
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

  /** An edited field's error goes away at once; Generate plan checks again. */
  function clearErrors(keys: readonly string[]): void {
    setFieldErrors((current) => {
      if (!keys.some((key) => key in current)) return current;
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
  }

  function patch(next: Partial<TripFormValues>): void {
    clearErrors(Object.keys(next));
    setForm((current) => ({ ...current, ...next }));
  }

  function dropErrors(predicate: (key: string) => boolean): void {
    setFieldErrors((current) => {
      const keys = Object.keys(current).filter(predicate);
      if (keys.length === 0) return current;
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
  }

  function changeLeg(index: number, legPatch: Partial<LegForm>): void {
    clearErrors([
      ...Object.keys(legPatch).map((field) => `legs.${index}.${field}`),
      "tripDays",
    ]);
    setForm((current) => ({
      ...current,
      legs: current.legs.map((leg, legIndex) =>
        legIndex === index ? withFollowedArrival(leg, legPatch) : leg,
      ),
    }));
  }

  function changeReturnLeg(index: number, legPatch: Partial<LegForm>): void {
    clearErrors([
      ...Object.keys(legPatch).map((field) => `returnLegs.${index}.${field}`),
      "tripDays",
    ]);
    setForm((current) => ({
      ...current,
      returnLegs: current.returnLegs.map((leg, legIndex) =>
        legIndex === index ? withFollowedArrival(leg, legPatch) : leg,
      ),
    }));
  }

  function changeEvent(index: number, eventPatch: Partial<AwakeForm>): void {
    clearErrors(
      Object.keys(eventPatch).map((field) => `mustBeAwake.${index}.${field}`),
    );
    setForm((current) => ({
      ...current,
      mustBeAwake: current.mustBeAwake.map((event, eventIndex) =>
        eventIndex === index ? { ...event, ...eventPatch } : event,
      ),
    }));
  }

  function changeWindow(index: number, windowPatch: Partial<WindowForm>): void {
    clearErrors(
      Object.keys(windowPatch).map(
        (field) => `noWorkoutWindows.${index}.${field}`,
      ),
    );
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

      const wantReturn = mapped.input.itinerary.returnLegs !== undefined;
      let returnInput: ReturnType<typeof returnPlanInput> = undefined;
      let returnResult: PlanResult | undefined;
      if (wantReturn && result.decision.direction !== "short-trip") {
        returnInput = returnPlanInput(mapped.input);
        if (returnInput === undefined) {
          setFormAlert({
            title: messages.unexpectedFailure,
            issues: [],
          });
          return;
        }
        const returnCheck = validatePlanInput(returnInput);
        if (!returnCheck.ok) {
          setFormAlert({
            title: messages.engineRejected,
            issues: returnCheck.issues,
          });
          return;
        }
        try {
          returnResult = generatePlan(returnInput);
        } catch (error) {
          if (error instanceof EngineInputError) {
            setFormAlert({
              title: messages.engineRejected,
              issues: [...error.issues],
            });
            return;
          }
          setFormAlert({
            title: messages.unexpectedFailure,
            issues: [error instanceof Error ? error.message : String(error)],
          });
          return;
        }
      }

      const id = crypto.randomUUID();
      const returnId = crypto.randomUUID();
      const createdAt = currentInstant();
      const savedIds: string[] = [];
      try {
        await savePlan({
          id,
          input: mapped.input,
          result,
          engineVersion: ENGINE_VERSION,
          createdAt,
          ...(returnResult === undefined ? {} : { returnPlanId: returnId }),
        });
        savedIds.push(id);
        if (returnInput !== undefined && returnResult !== undefined) {
          await savePlan({
            id: returnId,
            input: returnInput,
            result: returnResult,
            engineVersion: ENGINE_VERSION,
            createdAt,
            outboundPlanId: id,
          });
          savedIds.push(returnId);
        }
      } catch {
        await Promise.allSettled(
          savedIds.map((savedId) => deletePlan(savedId)),
        );
        setFormAlert({ title: messages.saveFailed, issues: [] });
        return;
      }
      goToPlan(id);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function revealReturn(): void {
    dropErrors((key) => key === "tripDays");
    setForm((current) => ({
      ...current,
      tripDays: "",
      returnLegs: [emptyLeg()],
    }));
  }

  function moveDetected(at: number): void {
    dropErrors(
      (key) =>
        key === "tripDays" ||
        key.startsWith("legs.") ||
        key.startsWith("returnLegs."),
    );
    setForm((current) => {
      if (at <= 0 || at >= current.legs.length) return current;
      return {
        ...current,
        tripDays: "",
        legs: current.legs.slice(0, at),
        returnLegs: current.legs.slice(at),
      };
    });
  }

  const airports = directory === null ? null : directory.airports;
  const zones =
    directory === null ? [] : zonesForLegs(form.legs, directory.lookup);
  const splitAt =
    directory === null || form.returnLegs.length > 0
      ? undefined
      : returnSplitIndex(form.legs, directory.lookup);
  const lastOutbound = form.legs[form.legs.length - 1];
  const firstReturn = form.returnLegs[0];
  const stay =
    form.returnLegs.length === 0
      ? null
      : {
          days: stayDays(
            lastOutbound?.arrivalDate ?? "",
            firstReturn?.departureDate ?? "",
          ),
        };

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
          airports={airports}
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
        {splitAt === undefined ? null : (
          <div className="flex flex-col items-start gap-3">
            <p role="status">{returnMessages.detected}</p>
            <button
              type="button"
              className={buttonClass}
              onClick={() => moveDetected(splitAt)}
            >
              {returnMessages.moveToReturn}
            </button>
          </div>
        )}
        {form.returnLegs.length === 0 ? (
          <button
            type="button"
            className={`${buttonClass} self-start`}
            onClick={revealReturn}
          >
            {returnMessages.add}
          </button>
        ) : (
          <ReturnSection
            legs={form.returnLegs}
            errors={fieldErrors}
            airports={airports}
            onChangeLeg={changeReturnLeg}
            onAdd={() =>
              setForm((current) => ({
                ...current,
                returnLegs: [...current.returnLegs, emptyLeg()],
              }))
            }
            onRemove={(index) => {
              dropErrors(
                (key) => key === "tripDays" || key.startsWith("returnLegs."),
              );
              setForm((current) => ({
                ...current,
                returnLegs: current.returnLegs.filter(
                  (_, legIndex) => legIndex !== index,
                ),
              }));
            }}
            onRemoveAll={() => {
              dropErrors(
                (key) => key === "tripDays" || key.startsWith("returnLegs."),
              );
              setForm((current) => ({ ...current, returnLegs: [] }));
            }}
          />
        )}
        <ConstraintsSection
          form={form}
          errors={fieldErrors}
          zones={zones}
          stay={stay}
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
