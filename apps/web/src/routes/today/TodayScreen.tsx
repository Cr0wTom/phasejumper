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

// Today (§3.1 #4): what a traveler opens at the gate. Current local time,
// the current block, the next block with a countdown, and today's ribbon.
// Recomputed from the clock every 30 s and on returning to the tab.

import { PhaseMap } from "../../components/PhaseMap/PhaseMap";
import { dateIn, shortDate, wallTime, zoneName } from "../../format";
import { Icon, KIND_ICON } from "../../icons";
import { messages, phaseMapMessages, planMessages as m } from "../../messages";
import { todayView, type TimedBlock } from "../../today";
import {
  errorClass,
  h1Class,
  linkClass,
  pageClass,
  surfaceClass,
} from "../../ui";
import { useNow } from "../../useNow";
import { usePlan } from "../plan/usePlan";

function BlockCard({
  title,
  item,
  timing,
}: {
  title: string;
  item: TimedBlock;
  timing: string;
}) {
  const icon = KIND_ICON[item.block.kind];
  return (
    <section className={surfaceClass} aria-label={title}>
      <p className="text-13 leading-body text-fg-muted">{title}</p>
      <p className="flex items-center gap-2 text-22 font-medium leading-display">
        {icon === undefined ? null : <Icon name={icon} />}
        {phaseMapMessages.kinds[item.block.kind]}
      </p>
      <p className="font-mono text-15" data-testid={`${title}-timing`}>
        {timing}
      </p>
      <p className="text-13 leading-body text-fg-muted">{item.block.reason}</p>
    </section>
  );
}

export function TodayScreen() {
  const state = usePlan(undefined);
  const now = useNow();

  if (state.status === "loading") {
    return (
      <main className={pageClass}>
        <h1 className={h1Class}>{m.todayHeading}</h1>
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
        <h1 className={h1Class}>{m.todayHeading}</h1>
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

  const { plan } = state;
  const view = todayView(plan.input, plan.result, now);
  const zone = zoneName(view.zone);
  const firstDate = plan.result.days[0]?.date;

  return (
    <main className={pageClass}>
      <h1 className={h1Class}>{m.todayHeading}</h1>
      <p className="mt-2 text-17 leading-body" data-testid="now-line">
        {m.nowAt(wallTime(now, view.zone), zone)}
      </p>
      {view.phase === "before" && firstDate !== undefined ? (
        <p className="mt-2 text-15 text-fg-muted">
          {m.before(shortDate(firstDate))}
        </p>
      ) : null}
      {view.phase === "after" ? (
        <p className="mt-2 text-15 text-fg-muted">{m.after}</p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {view.current === undefined ? (
          <p className={`${surfaceClass} text-fg-muted`}>{m.nothingNow}</p>
        ) : (
          <BlockCard
            title={m.current}
            item={view.current}
            timing={`${m.until(wallTime(view.current.block.endUtc, view.current.block.localTz))}, ${m.endsIn(m.duration(view.current.minutes))}`}
          />
        )}
        {view.next === undefined ? (
          <p className={`${surfaceClass} text-fg-muted`}>{m.nothingNext}</p>
        ) : (
          <BlockCard
            title={m.next}
            item={view.next}
            timing={`${wallTime(view.next.block.startUtc, view.next.block.localTz)}, ${m.inMinutes(m.duration(view.next.minutes))}`}
          />
        )}
      </div>

      <div className="mt-6">
        <PhaseMap
          input={plan.input}
          result={plan.result}
          now={now}
          compact
          onlyDate={dateIn(now, plan.input.itinerary.destinationTz)}
        />
      </div>

      <p className="mt-6">
        <a className={linkClass} href={`#/plan/${encodeURIComponent(plan.id)}`}>
          {m.viewPlan}
        </a>
      </p>

      <footer className="mt-8 border-t border-line pt-4 text-13 leading-body text-fg-muted">
        <p>{messages.footer}</p>
      </footer>
    </main>
  );
}
