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

// Opening a share link (§3.3): decode the PlanInput from the fragment,
// regenerate the plan locally, save it on this device and show it.

import { ENGINE_VERSION, generatePlan } from "@phasejumper/engine";
import { useEffect, useState } from "react";
import { currentInstant } from "../../clock";
import { LegalGate } from "../../components/LegalGate";
import { flags } from "../../flags";
import { legalMessages, planMessages as m } from "../../messages";
import { replaceWithPlan } from "../../router";
import { decodeShareLink } from "../../storage/shareLink";
import { savePlan, setLastPlanId } from "../../storage/plans";
import {
  termsAccepted,
  termsOutdated,
  writeTermsAcceptance,
} from "../../terms";
import { errorClass, h1Class, linkClass, pageClass } from "../../ui";

export function ShareOpen({ payload }: { payload: string }) {
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(
    () => !flags["legal.acceptanceGate"] || termsAccepted(),
  );
  const [outdated, setOutdated] = useState(() => termsOutdated());
  const [saveFailed, setSaveFailed] = useState(false);
  const showGate = flags["legal.acceptanceGate"] && !accepted;

  useEffect(() => {
    if (showGate) return;
    let cancelled = false;
    void (async () => {
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
        const id = crypto.randomUUID();
        await savePlan({
          id,
          input: decoded.input,
          result: generatePlan(decoded.input),
          engineVersion: ENGINE_VERSION,
          createdAt: currentInstant(),
        });
        await setLastPlanId(id);
        if (!cancelled) replaceWithPlan(id);
      } catch (e) {
        if (!cancelled)
          setError(m.failed(e instanceof Error ? e.message : String(e)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload, showGate]);

  return (
    <main className={pageClass}>
      <h1 className={h1Class}>{m.planHeading}</h1>
      {showGate ? (
        <div className="mt-8">
          <LegalGate
            outdated={outdated}
            onContinue={() => {
              const written = writeTermsAcceptance(currentInstant());
              setSaveFailed(!written.ok);
              setOutdated(false);
              setAccepted(true);
            }}
          />
        </div>
      ) : error === null ? (
        <div className="mt-8 flex flex-col gap-4">
          <p>{m.shareOpening}</p>
          {saveFailed ? <p role="status">{legalMessages.saveFailed}</p> : null}
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
