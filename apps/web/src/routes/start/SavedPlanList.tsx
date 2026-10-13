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

// One group of saved plans on Start, each with its own delete (confirmed
// in place). Deleting removes a round trip's linked half too.

import { ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { ICON_STROKE } from "../../icons";
import { sharedMessages as s } from "../../messages";
import { planHash } from "../../router";
import { deletePlanAndLinked, type StoredPlan } from "../../storage/plans";
import { buttonClass, errorClass, focusRing } from "../../ui";

export function SavedPlanList({
  plans,
  label,
  onDeleted,
}: {
  plans: readonly StoredPlan[];
  label: (plan: StoredPlan) => string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove(plan: StoredPlan): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      await deletePlanAndLinked(plan);
      setConfirming(null);
      onDeleted();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="pj-card divide-y divide-line overflow-hidden p-0">
        {plans.map((plan) => (
          <li key={plan.id}>
            {confirming === plan.id ? (
              <div className="flex flex-col gap-3 p-4">
                <p role="alert" className="text-15">
                  {s.deleteConfirm}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void remove(plan)}
                  >
                    {s.deleteYes}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setConfirming(null)}
                  >
                    {s.deleteCancel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center">
                <a
                  className="pj-list-link min-w-0 flex-1"
                  href={planHash(plan.id)}
                >
                  <span>{label(plan)}</span>
                  <ChevronRight
                    size={16}
                    strokeWidth={ICON_STROKE}
                    aria-hidden="true"
                  />
                </a>
                <button
                  type="button"
                  className={`mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-fg ${focusRing}`}
                  aria-label={s.delete(label(plan))}
                  onClick={() => {
                    setFailed(false);
                    setConfirming(plan.id);
                  }}
                >
                  <Trash2
                    size={16}
                    strokeWidth={ICON_STROKE}
                    aria-hidden="true"
                  />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {failed ? (
        <p role="alert" className={errorClass}>
          {s.deleteFailed}
        </p>
      ) : null}
    </div>
  );
}
