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

// The Plan screen (§3.1 #3): decision header with the progress curve, the
// phase map, then the per-day detail.

import type { PlanInput } from "@phasejumper/engine";
import { toIcs } from "@phasejumper/ical";
import { useRef, useState } from "react";
import { PhaseMap } from "../../components/PhaseMap/PhaseMap";
import { messages, planMessages as m } from "../../messages";
import { savePlan } from "../../storage/plans";
import { shareUrl } from "../../storage/shareLink";
import {
  buttonClass,
  errorClass,
  h1Class,
  linkClass,
  pageClass,
} from "../../ui";
import { useNow } from "../../useNow";
import { DayList } from "./DayList";
import { ProgressCurve } from "./ProgressCurve";
import { usePlan } from "./usePlan";

function calendarFilename(input: PlanInput): string {
  const legs = input.itinerary.legs;
  const origin = legs[0]?.departureAirport.toLowerCase() ?? "";
  const destination = legs.at(-1)?.arrivalAirport.toLowerCase() ?? "";
  return `phasejumper-${origin}-${destination}.ics`;
}

function storedSequence(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function downloadBlob(contents: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "text/calendar" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The browser reads the blob when the download starts.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PlanScreen({ id }: { id?: string }) {
  const state = usePlan(id);
  const now = useNow();
  const [share, setShare] = useState<{ copied: boolean; url: string } | null>(
    null,
  );
  const [downloadError, setDownloadError] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const sequenceRef = useRef<{ id: string; sequence: number } | null>(null);
  const saveChain = useRef(Promise.resolve());

  if (state.status === "loading") {
    return (
      <main className={pageClass}>
        <h1 className={h1Class}>{m.planHeading}</h1>
        <p className="mt-8">{m.loading}</p>
      </main>
    );
  }
  if (state.status !== "ready") {
    const text =
      state.status === "none"
        ? m.noPlan
        : state.status === "missing"
          ? m.missing
          : m.failed(state.reason);
    return (
      <main className={pageClass}>
        <h1 className={h1Class}>{m.planHeading}</h1>
        <div className="mt-8 flex flex-col gap-4">
          <p
            role={state.status === "none" ? undefined : "alert"}
            className={state.status === "none" ? undefined : errorClass}
          >
            {text}
          </p>
          <a className={linkClass} href="#/trip">
            {m.makePlan}
          </a>
        </div>
      </main>
    );
  }

  const { plan, regenerated } = state;
  const planWarnings = plan.result.warnings.filter(
    (w) => w.dayIndex === undefined,
  );
  if (sequenceRef.current === null || sequenceRef.current.id !== plan.id) {
    sequenceRef.current = {
      id: plan.id,
      sequence: storedSequence(plan.icsSequence),
    };
  }
  const downloadErrorText =
    downloadError?.id === plan.id ? downloadError.text : null;

  async function onShare(): Promise<void> {
    const url = shareUrl(plan.input);
    try {
      await navigator.clipboard.writeText(url);
      setShare({ copied: true, url });
    } catch {
      // No clipboard access (permissions, insecure context): show the link.
      setShare({ copied: false, url });
    }
  }

  function onDownload(): void {
    const current = sequenceRef.current?.sequence ?? 0;
    setDownloadError(null);
    let ics: string;
    try {
      ics = toIcs({
        planId: plan.id,
        input: plan.input,
        result: plan.result,
        sequence: current,
      });
    } catch (error) {
      setDownloadError({
        id: plan.id,
        text: m.downloadFailed(
          error instanceof Error ? error.message : String(error),
        ),
      });
      return;
    }
    downloadBlob(ics, calendarFilename(plan.input));
    const next = current + 1;
    sequenceRef.current = { id: plan.id, sequence: next };
    const saved = { ...plan, icsSequence: next };
    // Writes run in order so a second download cannot be overwritten by the first.
    // A failed write shows nothing: the file is already on disk.
    saveChain.current = saveChain.current
      .catch(() => undefined)
      .then(() => savePlan(saved))
      .catch(() => undefined);
  }

  return (
    <main className={pageClass}>
      <header className="pj-plan-header pj-card pj-glass z-10 flex md:sticky flex-col gap-3 p-5">
        <h1 className={h1Class}>{m.planHeading}</h1>
        <p className="text-17 leading-body">
          {plan.result.decision.explanation}
        </p>
        {regenerated ? (
          <p role="status" className="text-13 leading-body text-fg-muted">
            {m.regenerated}
          </p>
        ) : null}
        <ProgressCurve result={plan.result} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={() => void onShare()}
          >
            {m.share}
          </button>
          <button type="button" className={buttonClass} onClick={onDownload}>
            {m.downloadCalendar}
          </button>
          <a
            className={buttonClass}
            href={`#/trip/${encodeURIComponent(plan.id)}`}
          >
            {m.editTrip}
          </a>
        </div>
        {share === null ? null : share.copied ? (
          <p role="status" className="text-13 leading-body text-fg-muted">
            {m.shareCopied}
          </p>
        ) : (
          <label className="flex flex-col gap-1 text-13 leading-body">
            {m.shareManual}
            <input
              readOnly
              value={share.url}
              className="w-full rounded-control border border-line bg-surface px-2 py-1 font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
        )}
        {downloadErrorText === null ? null : (
          <p role="alert" className={errorClass}>
            {downloadErrorText}
          </p>
        )}
      </header>

      {planWarnings.length === 0 ? null : (
        <section className="pj-card mt-6 p-5" aria-labelledby="plan-warnings">
          <h2
            id="plan-warnings"
            className="text-15 font-semibold leading-display"
          >
            {m.warningsHeading}
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-13 leading-body text-fg-muted">
            {planWarnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6">
        <PhaseMap input={plan.input} result={plan.result} now={now} />
      </div>

      <section className="mt-8" aria-label={m.planHeading}>
        <DayList result={plan.result} />
      </section>

      <footer className="mt-8 border-t border-line pt-4 text-13 leading-body text-fg-muted">
        <p>{messages.footer}</p>
      </footer>
    </main>
  );
}
