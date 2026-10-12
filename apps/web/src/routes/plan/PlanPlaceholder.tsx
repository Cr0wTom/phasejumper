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

import { useEffect, useState } from "react";
import { messages } from "../../messages";
import { loadPlan, type StoredPlan } from "../../storage/plans";
import { errorClass, h1Class, linkClass, pageClass } from "../../ui";

type PlanState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; plan: StoredPlan };

export function PlanPlaceholder({ id }: { id: string }) {
  const [state, setState] = useState<PlanState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadPlan(id)
      .then((plan) => {
        if (cancelled) return;
        setState(
          plan === undefined
            ? { status: "missing" }
            : { status: "ready", plan },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className={pageClass}>
      <h1 className={h1Class}>{messages.planHeading}</h1>
      {state.status === "loading" ? (
        <p className="mt-8">{messages.planLoading}</p>
      ) : null}
      {state.status === "missing" ? (
        <div className="mt-8 flex flex-col gap-4">
          <p role="alert" className={errorClass}>
            {messages.planMissing}
          </p>
          <a className={linkClass} href="#/trip">
            {messages.planBack}
          </a>
        </div>
      ) : null}
      {state.status === "ready" ? (
        <div className="mt-8 flex flex-col gap-4">
          <section aria-label={messages.planSummary}>
            <p>{state.plan.result.decision.explanation}</p>
          </section>
          <p>{messages.planDays(state.plan.result.days.length)}</p>
          <p>{messages.planComingLater}</p>
          <footer className="mt-4 border-t border-line pt-4">
            <p>{messages.footer}</p>
          </footer>
        </div>
      ) : null}
    </main>
  );
}
