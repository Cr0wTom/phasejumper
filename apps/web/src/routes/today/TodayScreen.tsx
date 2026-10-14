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

// Today (§3.1 #4): what a traveler opens at the gate. A large "Now" card
// with time left, the day as a 24-hour dial, the next block with a
// countdown, and the rest of today as a row of chips (never a vertical
// list of the day's blocks).
// Recomputed from the clock every 30 s and on returning to the tab.

import { Temporal } from "temporal-polyfill";
import { shortDate, wallTime, zoneName } from "../../format";
import { Icon, KIND_ICON } from "../../icons";
import { messages, phaseMapMessages, planMessages as m } from "../../messages";
import { BACKGROUND, todayView, type TimedBlock } from "../../today";
import {
  errorClass,
  h1Class,
  linkClass,
  pageClass,
  surfaceClass,
} from "../../ui";
import { useNow } from "../../useNow";
import { usePlan } from "../plan/usePlan";
import { DayDial } from "./DayDial";

function BlockCard({
  title,
  item,
  timing,
  progress,
}: {
  title: string;
  item: TimedBlock;
  timing: string;
  /** 0–1 share of the block already done; shown as a bar on "Now". */
  progress?: number;
}) {
  const icon = KIND_ICON[item.block.kind];
  const hero = progress !== undefined;
  return (
    <section className={surfaceClass} aria-label={title}>
      <p className="text-13 font-medium uppercase tracking-[0.08em] text-fg-muted">
        {title}
      </p>
      <p
        className={`flex items-center gap-2 font-semibold leading-display tracking-[-0.02em] ${hero ? "text-28" : "text-22"}`}
      >
        {icon === undefined ? null : <Icon name={icon} />}
        {phaseMapMessages.kinds[item.block.kind]}
      </p>
      <p className="font-mono text-15" data-testid={`${title}-timing`}>
        {timing}
      </p>
      {progress === undefined ? null : (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label={m.timeLeft(m.duration(item.minutes))}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      <p className="text-13 leading-body text-fg-muted">{item.block.reason}</p>
    </section>
  );
}

/** Share of a block already done now, 0–1. */
function doneShare(item: TimedBlock): number {
  const total = Temporal.Instant.from(item.block.endUtc)
    .since(Temporal.Instant.from(item.block.startUtc))
    .total({ unit: "minutes" });
  return total <= 0 ? 1 : Math.min(1, Math.max(0, 1 - item.minutes / total));
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
  // The rest of today after "Next", as chips: start times in the local zone.
  const endOfToday = Temporal.PlainDate.from(view.date)
    .add({ days: 1 })
    .toZonedDateTime({ timeZone: view.zone })
    .toInstant();
  const after =
    view.next === undefined
      ? undefined
      : Temporal.Instant.from(view.next.block.startUtc);
  const later = plan.result.days
    .flatMap((d) => d.blocks)
    .filter((b) => !BACKGROUND.has(b.kind))
    .filter((b) => {
      const s = Temporal.Instant.from(b.startUtc);
      return (
        after !== undefined &&
        Temporal.Instant.compare(s, after) > 0 &&
        Temporal.Instant.compare(s, endOfToday) < 0
      );
    })
    .sort((x, y) => x.startUtc.localeCompare(y.startUtc))
    .slice(0, 10);

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

      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {view.current === undefined ? (
            <p className={`${surfaceClass} text-fg-muted`}>{m.nothingNow}</p>
          ) : (
            <BlockCard
              title={m.current}
              item={view.current}
              timing={`${m.until(wallTime(view.current.block.endUtc, view.current.block.localTz))}, ${m.endsIn(m.duration(view.current.minutes))}`}
              progress={doneShare(view.current)}
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
          {later.length === 0 ? null : (
            <section aria-labelledby="today-later" className="min-w-0">
              <h2
                id="today-later"
                className="text-13 font-medium uppercase tracking-[0.08em] text-fg-muted"
              >
                {m.laterToday}
              </h2>
              <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {later.map((b) => (
                  <li key={b.startUtc + b.kind} className="pj-chip shrink-0">
                    <span className="text-fg">
                      {wallTime(b.startUtc, view.zone)}
                    </span>
                    <span className="font-sans text-13">
                      {phaseMapMessages.kinds[b.kind]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <DayDial
          input={plan.input}
          result={plan.result}
          now={now}
          zone={view.zone}
          date={view.date}
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
