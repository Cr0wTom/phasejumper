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

// Today as a 24-hour dial: the four phase-map bands as rings (sleep & rest
// outside, food & drink inside), flights as a dashed outer ring, and a hand
// at the current time. Bands, lines and text only inside the dial (§11.1);
// icons appear in the detail card below it, like the day list.

import type {
  Block,
  BlockKind,
  PlanInput,
  PlanResult,
} from "@phasejumper/engine";
import { useState, type KeyboardEvent } from "react";
import { Temporal } from "temporal-polyfill";
import { COLOR } from "../../components/PhaseMap/PhaseMap";
import { LANE, POINT, type Lane } from "../../components/PhaseMap/layout";
import { wallTime } from "../../format";
import { Icon, KIND_ICON } from "../../icons";
import { phaseMapMessages as pm, planMessages as m } from "../../messages";
import { surfaceClass } from "../../ui";

const SIZE = 320;
const C = SIZE / 2;
const RING: Record<Lane, { r: number; w: number }> = {
  sleep: { r: 132, w: 16 },
  light: { r: 112, w: 10 },
  move: { r: 97, w: 8 },
  intake: { r: 83, w: 8 },
};
const FLIGHT_R = 149;
const DAY = 1440;

/** Thin "fine to" lines, drawn like the map's caffeine and exercise lines. */
const LINE_KINDS: ReadonlySet<BlockKind> = new Set([
  "EXERCISE_OK",
  "CAFFEINE_OK",
  "CAFFEINE_LATE_OK",
]);
const PALE: ReadonlySet<BlockKind> = new Set(["WIND_DOWN", "NSDR"]);

function point(min: number, r: number): { x: number; y: number } {
  const a = (min / DAY) * 2 * Math.PI - Math.PI / 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

/** An arc from `from` to `to` minutes after midnight, clockwise. */
function arc(from: number, to: number, r: number): string {
  const span = Math.min(to - from, DAY - 0.5);
  const a = point(from, r);
  const b = point(from + span, r);
  const large = span > DAY / 2 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

interface Piece {
  key: string;
  block: Block;
  from: number;
  to: number;
}

export function DayDial({
  input,
  result,
  now,
  zone,
  date,
}: {
  input: PlanInput;
  result: PlanResult;
  now: string;
  /** Where the traveler is now; the dial reads in this zone's wall time. */
  zone: string;
  /** Today in that zone (YYYY-MM-DD). */
  date: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const start = Temporal.PlainDate.from(date)
    .toZonedDateTime({ timeZone: zone })
    .toInstant();
  const end = start.add({ hours: 24 });
  const minutesOf = (at: Temporal.Instant): number =>
    Math.max(0, Math.min(DAY, at.since(start).total({ unit: "minutes" })));

  const pieces: Piece[] = [];
  result.days.forEach((day, d) =>
    day.blocks.forEach((block, b) => {
      const s = Temporal.Instant.from(block.startUtc);
      const e = Temporal.Instant.from(block.endUtc);
      const point = POINT.has(block.kind);
      if (point) {
        if (
          Temporal.Instant.compare(s, start) < 0 ||
          Temporal.Instant.compare(s, end) >= 0
        )
          return;
      } else if (
        Temporal.Instant.compare(e, start) <= 0 ||
        Temporal.Instant.compare(s, end) >= 0
      ) {
        return;
      }
      pieces.push({
        key: `d${d}-b${b}`,
        block,
        from: minutesOf(s),
        to: point ? minutesOf(s) : minutesOf(e),
      });
    }),
  );
  const flights = input.itinerary.legs
    .map((leg) => ({
      s: Temporal.PlainDateTime.from(leg.departureLocal)
        .toZonedDateTime(leg.departureTz)
        .toInstant(),
      e: Temporal.PlainDateTime.from(leg.arrivalLocal)
        .toZonedDateTime(leg.arrivalTz)
        .toInstant(),
    }))
    .filter(
      (f) =>
        Temporal.Instant.compare(f.e, start) > 0 &&
        Temporal.Instant.compare(f.s, end) < 0,
    )
    .map((f) => ({ from: minutesOf(f.s), to: minutesOf(f.e) }));

  const nowInstant = Temporal.Instant.from(now);
  const nowMin = minutesOf(nowInstant);
  const hand = point(nowMin, FLIGHT_R);
  const open = pieces.find((p) => p.key === selected);

  const label = (p: Piece): string =>
    pm.itemLabel(
      pm.kinds[p.block.kind],
      wallTime(p.block.startUtc, zone),
      wallTime(p.block.endUtc, zone),
      POINT.has(p.block.kind),
    );
  const choose = (key: string): void =>
    setSelected((cur) => (cur === key ? null : key));
  const onKey = (e: KeyboardEvent<SVGGElement>, key: string): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(key);
    }
  };

  return (
    <section
      aria-label={m.dialLabel(date)}
      className="flex flex-col items-center gap-4"
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[360px]"
        role="group"
        aria-label={m.dialLabel(date)}
        data-testid="day-dial"
      >
        {/* Ring tracks and hour marks. */}
        {(Object.keys(RING) as Lane[]).map((lane) => (
          <circle
            key={lane}
            cx={C}
            cy={C}
            r={RING[lane].r}
            fill="none"
            stroke="var(--line)"
            strokeOpacity={0.5}
            strokeWidth={RING[lane].w}
            aria-hidden="true"
          />
        ))}
        {[0, 6, 12, 18].map((h) => {
          const at = point(h * 60, 64);
          const t0 = point(h * 60, 72);
          const t1 = point(h * 60, 142);
          return (
            <g key={h} aria-hidden="true">
              <line
                x1={t0.x}
                y1={t0.y}
                x2={t1.x}
                y2={t1.y}
                stroke="var(--line)"
                strokeOpacity={0.6}
              />
              <text
                x={at.x}
                y={at.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="10"
                fill="var(--fg-muted)"
                fontFamily="var(--font-mono)"
              >
                {String(h).padStart(2, "0")}
              </text>
            </g>
          );
        })}

        {flights.map((f, i) => (
          <path
            key={`f${i}`}
            d={arc(f.from, f.to, FLIGHT_R)}
            fill="none"
            stroke="var(--fg-muted)"
            strokeWidth={4}
            strokeDasharray="2 3"
            role="img"
            aria-label={pm.flight("")}
          />
        ))}

        {pieces.map((p) => {
          const ring = RING[LANE[p.block.kind]];
          const color = COLOR[p.block.kind];
          const dim = open !== undefined && open.key !== p.key ? 0.35 : 1;
          let mark;
          if (POINT.has(p.block.kind)) {
            const at = point(p.from, ring.r);
            mark =
              p.block.kind === "CAFFEINE_STOP" ? (
                <line
                  x1={point(p.from, ring.r - 6).x}
                  y1={point(p.from, ring.r - 6).y}
                  x2={point(p.from, ring.r + 6).x}
                  y2={point(p.from, ring.r + 6).y}
                  stroke={color}
                  strokeWidth={3}
                />
              ) : (
                <circle
                  cx={at.x}
                  cy={at.y}
                  r={p.block.kind === "MEAL" ? 3 : 4}
                  fill={color}
                />
              );
          } else if (p.block.kind === "EXERCISE_AVOID") {
            mark = (
              <path
                d={arc(p.from, p.to, ring.r)}
                fill="none"
                stroke={color}
                strokeOpacity={0.6}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="0.1 5"
              />
            );
          } else if (LINE_KINDS.has(p.block.kind)) {
            mark = (
              <path
                d={arc(p.from, p.to, ring.r)}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeOpacity={p.block.kind === "CAFFEINE_LATE_OK" ? 0.35 : 0.6}
              />
            );
          } else {
            mark = (
              <path
                d={arc(p.from, p.to, ring.r)}
                fill="none"
                stroke={color}
                strokeWidth={ring.w}
                strokeOpacity={PALE.has(p.block.kind) ? 0.35 : 1}
              />
            );
          }
          return (
            <g
              key={p.key}
              role="button"
              tabIndex={0}
              aria-label={label(p)}
              aria-pressed={selected === p.key}
              onClick={() => choose(p.key)}
              onKeyDown={(e) => onKey(e, p.key)}
              opacity={dim}
              className="cursor-pointer outline-none focus-visible:[&>path]:stroke-[var(--accent)]"
              data-kind={p.block.kind}
            >
              {/* A wide invisible stroke makes thin marks easy to tap. */}
              <path
                d={arc(p.from, Math.max(p.to, p.from + 10), ring.r)}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(ring.w, 14)}
              />
              {mark}
            </g>
          );
        })}

        {/* Now: a hand from the centre to the flight ring. */}
        <g aria-hidden="true">
          <line
            x1={point(nowMin, 52).x}
            y1={point(nowMin, 52).y}
            x2={hand.x}
            y2={hand.y}
            stroke="var(--accent)"
            strokeWidth={2}
            className="pj-now-line"
          />
          <circle cx={hand.x} cy={hand.y} r={4} fill="var(--accent)" />
        </g>
        <text
          x={C}
          y={C - 6}
          textAnchor="middle"
          fontSize="30"
          fontWeight={600}
          fill="var(--fg)"
          aria-hidden="true"
        >
          {wallTime(now, zone)}
        </text>
        <text
          x={C}
          y={C + 18}
          textAnchor="middle"
          fontSize="11"
          fill="var(--fg-muted)"
          aria-hidden="true"
        >
          {zone.split("/").at(-1)?.replace(/_/g, " ")}
        </text>
      </svg>

      {open === undefined ? (
        <p className="text-13 leading-body text-fg-muted">{m.dialHint}</p>
      ) : (
        <div className={`${surfaceClass} w-full`} role="status">
          <p className="flex items-center gap-2 font-medium">
            {KIND_ICON[open.block.kind] === undefined ? null : (
              <Icon name={KIND_ICON[open.block.kind]!} />
            )}
            {pm.kinds[open.block.kind]}{" "}
            <span className="font-mono text-13 font-normal text-fg-muted">
              {POINT.has(open.block.kind)
                ? wallTime(open.block.startUtc, zone)
                : `${wallTime(open.block.startUtc, zone)}–${wallTime(open.block.endUtc, zone)}`}
            </span>
          </p>
          <p className="text-13 leading-body text-fg-muted">
            {open.block.reason}
          </p>
        </div>
      )}
    </section>
  );
}
