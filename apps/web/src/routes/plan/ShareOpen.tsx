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

// Opening a share link (§3.3): decode the PlanInput from the fragment and
// show the plan, built in memory. It is saved on this device only if the
// traveler chooses "Save to my plans" (privacy: someone else's trip never
// becomes one of yours by opening a link).

import { ENGINE_VERSION, generatePlan } from "@phasejumper/engine";
import { useEffect, useState } from "react";
import { currentInstant } from "../../clock";
import { LegalGate } from "../../components/LegalGate";
import { flags } from "../../flags";
import {
  legalMessages,
  planMessages as m,
  sharedMessages,
} from "../../messages";
import { goToPlan } from "../../router";
import { decodeShareLink } from "../../storage/shareLink";
import { savePlan, setLastPlanId, type StoredPlan } from "../../storage/plans";
import { PlanView } from "./PlanScreen";
import {
  termsAccepted,
  termsOutdated,
  writeTermsAcceptance,
} from "../../terms";
import { errorClass, h1Class, linkClass, pageClass } from "../../ui";

export function ShareOpen({ payload }: { payload: string }) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StoredPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(
    () => !flags["legal.acceptanceGate"] || termsAccepted(),
  );
  const [outdated, setOutdated] = useState(() => termsOutdated());
  const showGate = flags["legal.acceptanceGate"] && !accepted;

  useEffect(() => {
    if (showGate) return;
    setPreview(null);
    setError(null);
    const decoded = decodeShareLink(payload);
    if (!decoded.ok) {
      setError(
        decoded.reason === "too-large"
          ? m.shareTooLarge
          : decoded.reason === "invalid"
            ? m.shareInvalid
            : m.shareUnreadable,
      );
      return;
    }
    try {
      // Built in memory only: nothing is written to this device.
      setPreview({
        id: "shared-preview",
        input: decoded.input,
        result: generatePlan(decoded.input),
        engineVersion: ENGINE_VERSION,
        createdAt: currentInstant(),
      });
    } catch (e) {
      setError(m.failed(e instanceof Error ? e.message : String(e)));
    }
  }, [payload, showGate]);

  async function onSave(): Promise<void> {
    if (preview === null || saving) return;
    setSaving(true);
    setSaveError(null);
    const id = crypto.randomUUID();
    try {
      await savePlan({
        ...preview,
        id,
        createdAt: currentInstant(),
        source: "shared",
      });
    } catch {
      setSaveError(sharedMessages.saveFailed);
      setSaving(false);
      return;
    }
    try {
      await setLastPlanId(id);
    } catch {
      // The plan is saved; only the "last opened" pointer is not.
    }
    goToPlan(id);
  }

  if (preview !== null && !showGate) {
    return (
      <PlanView
        plan={preview}
        regenerated={false}
        preview={{
          onSave: () => void onSave(),
          saving,
          error: saveError,
        }}
      />
    );
  }

  return (
    <main className={pageClass}>
      <h1 className={h1Class}>{m.planHeading}</h1>
      {showGate ? (
        <div className="mt-8">
          <LegalGate
            outdated={outdated}
            onContinue={() => {
              const written = writeTermsAcceptance(currentInstant());
              // Shown on the plan: the answer could not be stored here.
              if (!written.ok) setSaveError(legalMessages.saveFailed);
              setOutdated(false);
              setAccepted(true);
            }}
          />
        </div>
      ) : error === null ? (
        <div className="mt-8 flex flex-col gap-4">
          <p>{m.shareOpening}</p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          <p role="alert" className={errorClass}>
            {error}
          </p>
          <a className={linkClass} href="#/trip">
            {m.makePlan}
          </a>
        </div>
      )}
    </main>
  );
}
