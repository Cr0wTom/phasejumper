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

// Settings (§3.1 #5): appearance, data on this device (export, import,
// forget all trips) and the evidence page. Nothing here leaves the device.

import { ENGINE_VERSION } from "@phasejumper/engine";
import { useId, useState, type ChangeEvent } from "react";
import { currentPlainDate } from "../../clock";
import { legalMessages, messages, settingsMessages as m } from "../../messages";
import { MAX_IMPORT_BYTES, parseImport } from "../../storage/importPlans";
import {
  backupOf,
  forgetAllPlans,
  getLastPlanId,
  listPlans,
  loadPlan,
} from "../../storage/plans";
import {
  buildTechnicalReport,
  technicalReportText,
} from "../../technicalReport";
import { readTheme, setTheme, type Theme } from "../../theme";
import { version as appVersion } from "../../../package.json";
import {
  buttonClass,
  checkClass,
  controlClass,
  errorClass,
  h1Class,
  h2Class,
  hintClass,
  labelClass,
  linkClass,
  pageClass,
  surfaceClass,
} from "../../ui";
import { importAll } from "./importAll";

type Notice = { tone: "ok" | "error"; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (notice === null) return null;
  return notice.tone === "ok" ? (
    <p role="status">{notice.text}</p>
  ) : (
    <p role="alert" className={errorClass}>
      {notice.text}
    </p>
  );
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function SettingsScreen() {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [dataNotice, setDataNotice] = useState<Notice>(null);
  const [reportNotice, setReportNotice] = useState<Notice>(null);
  const [reportManual, setReportManual] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const importId = useId();
  const reportId = useId();

  async function onExport(): Promise<void> {
    try {
      const plans = await listPlans();
      if (plans.length === 0) {
        setDataNotice({ tone: "error", text: m.exportEmpty });
        return;
      }
      download(
        `phasejumper-plans-${currentPlainDate()}.json`,
        `${JSON.stringify(backupOf(plans), null, 2)}\n`,
      );
      setDataNotice({ tone: "ok", text: m.exportDone(plans.length) });
    } catch {
      setDataNotice({ tone: "error", text: m.exportFailed });
    }
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;
    setBusy(true);
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        setDataNotice({ tone: "error", text: m.importTooLarge });
        return;
      }
      const parsed = parseImport(await file.text());
      if (!parsed.ok) {
        const text =
          parsed.reason === "too-large"
            ? m.importTooLarge
            : parsed.reason === "not-json"
              ? m.importNotJson
              : parsed.reason === "not-plans"
                ? m.importNotPlans
                : m.importInvalid(parsed.detail ?? "a trip is incomplete");
        setDataNotice({ tone: "error", text });
        return;
      }
      const outcome = await importAll(parsed.inputs);
      setDataNotice(
        outcome.ok
          ? { tone: "ok", text: m.importDone(outcome.count) }
          : outcome.reason === "invalid"
            ? { tone: "error", text: m.importInvalid(outcome.detail) }
            : { tone: "error", text: m.importFailed },
      );
    } catch {
      setDataNotice({ tone: "error", text: m.importFailed });
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  async function onReport(): Promise<void> {
    setReportNotice(null);
    setReportManual(null);
    try {
      const lastId = await getLastPlanId();
      const plan = lastId === undefined ? undefined : await loadPlan(lastId);
      const report = await buildTechnicalReport({
        engineVersion: ENGINE_VERSION,
        appVersion,
        userAgent: navigator.userAgent,
        input: plan?.input,
        warnings: (plan?.result.warnings ?? []).map((warning) => warning.code),
      });
      const text = technicalReportText(report);
      try {
        await navigator.clipboard.writeText(text);
        setReportNotice({ tone: "ok", text: legalMessages.reportCopied });
      } catch {
        setReportManual(text);
      }
    } catch {
      setReportNotice({ tone: "error", text: legalMessages.reportFailed });
    }
  }

  async function onForget(): Promise<void> {
    setBusy(true);
    try {
      await forgetAllPlans();
      setDataNotice({ tone: "ok", text: m.forgetDone });
    } catch {
      setDataNotice({ tone: "error", text: m.forgetFailed });
    } finally {
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <main className={pageClass}>
      <h1 className={h1Class}>{m.heading}</h1>

      <section className={`mt-8 ${surfaceClass}`}>
        <fieldset className="flex flex-col gap-2">
          <legend className={`${h2Class} mb-2`}>{m.themeHeading}</legend>
          {(["dark", "light"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="theme"
                className={checkClass}
                checked={theme === value}
                onChange={() => setThemeState(setTheme(value))}
              />
              <span>{value === "dark" ? m.themeDark : m.themeLight}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <section
        aria-labelledby="settings-data"
        className={`mt-6 ${surfaceClass}`}
      >
        <h2 id="settings-data" className={h2Class}>
          {m.dataHeading}
        </h2>
        <p className="text-fg-muted">{m.dataLede}</p>
        <div>
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => void onExport()}
          >
            {m.exportButton}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={importId} className={labelClass}>
            {m.importLabel}
          </label>
          <input
            id={importId}
            type="file"
            accept="application/json,.json"
            disabled={busy}
            aria-describedby={`${importId}-hint`}
            className="text-15"
            onChange={(event) => void onImport(event)}
          />
          <p id={`${importId}-hint`} className={hintClass}>
            {m.importHint}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {confirming ? (
            <>
              <p role="alert" className={errorClass}>
                {m.forgetConfirm}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void onForget()}
                >
                  {m.forgetYes}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setConfirming(false)}
                >
                  {m.forgetCancel}
                </button>
              </div>
            </>
          ) : (
            <div>
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => {
                  setDataNotice(null);
                  setConfirming(true);
                }}
              >
                {m.forgetButton}
              </button>
            </div>
          )}
        </div>
        <NoticeLine notice={dataNotice} />
      </section>

      <section
        aria-labelledby="settings-about"
        className={`mt-6 ${surfaceClass}`}
      >
        <h2 id="settings-about" className={h2Class}>
          {m.aboutHeading}
        </h2>
        <p>
          <a className={linkClass} href="#/evidence">
            {m.evidenceLink}
          </a>
        </p>
        <p>
          <a className={linkClass} href="#/legal">
            {legalMessages.legalLink}
          </a>
        </p>
        <p className="text-fg-muted">{m.licence}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={buttonClass}
            aria-describedby={`${reportId}-hint`}
            onClick={() => void onReport()}
          >
            {legalMessages.reportButton}
          </button>
          <p id={`${reportId}-hint`} className={hintClass}>
            {legalMessages.reportHint}
          </p>
          <NoticeLine notice={reportNotice} />
          {reportManual === null ? null : (
            <div className="flex flex-col gap-2">
              <label htmlFor={reportId} className={labelClass}>
                {legalMessages.reportManual}
              </label>
              <textarea
                id={reportId}
                className={controlClass}
                readOnly
                rows={12}
                value={reportManual}
              />
            </div>
          )}
        </div>
      </section>

      <footer className="mt-8 border-t border-line pt-4 text-13 leading-body text-fg-muted">
        <p>{messages.footer}</p>
      </footer>
    </main>
  );
}
