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

// One day drawn in full, for phones: every band and the body-clock low
// point. Shapes only, no text: the day sheet below lists every item with its time.
// Touching or dragging across it marks a moment and highlights what is going
// on then in that list.

import type { PlanInput, PlanResult } from "@phasejumper/engine";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Temporal } from "temporal-polyfill";
import { phaseMapMessages as m } from "../../messages";
import { axisZone, layoutPlan, type Row } from "./layout";
import {
  BAND,
  COLOR,
  FAINT,
  Hatch,
  QUIET_FILL,
  SOFT,
  SOFT_STROKE,
} from "./legend";

/** The drawing starts below the sheet's faded top edge. */
const TOP = 30;
const LANES = {
  sleep: { y: 34, h: 22 },
  light: { y: 64, h: 16 },
  move: { y: 88, h: 10 },
  intake: { y: 106, h: 12 },
} as const;
const BOTTOM = 122;
const HEIGHT = 130;
/** The day is inset by this much from the sheet's edges. */
const PAD = 16;
/** Meals are drawn this many minutes wide, so they read as a mark. */
const MEAL_MIN = 30;

const POINT_KINDS = new Set(["CAFFEINE_STOP", "MEAL"]);
const LINE_KINDS = new Set([
  "EXERCISE_OK",
  "CAFFEINE_OK",
  "CAFFEINE_LATE_OK",
  "MELATONIN_OK",
]);
const QUIET_KINDS = new Set(["WIND_DOWN", "NSDR"]);

/** The row for a date, or the nearest one after it, or the last. */
function rowFor(rows: readonly Row[], date: string): Row | undefined {
  return (
    rows.find((r) => r.date === date) ??
    rows.find((r) => r.date > date) ??
    rows.at(-1)
  );
}

export function DayView({
  input,
  result,
  date,
  onMoment,
}: {
  input: PlanInput;
  result: PlanResult;
  /** YYYY-MM-DD; drawn in destination time, like the map. */
  date: string;
  /** The moment (ISO) touched on the drawing. */
  onMoment?: (atUtc: string) => void;
}) {
  const zone = axisZone("destination", input);
  const row = useMemo(
    () => rowFor(layoutPlan(input, result, "destination"), date),
    [input, result, date],
  );
  const ids = useId().replace(/:/g, "");
  const hatchId = `${ids}-hatch`;
  const clipId = `${ids}-clip`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [cursor, setCursor] = useState<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (el === null) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.floor(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowDate = row?.date ?? date;
  // A different day starts without a mark.
  useEffect(() => setCursor(null), [rowDate]);
  const instantAt = useMemo(() => {
    const day = Temporal.PlainDate.from(rowDate);
    return (min: number): Temporal.Instant =>
      day
        .toPlainDateTime({ hour: Math.floor(min / 60), minute: min % 60 })
        .toZonedDateTime(zone)
        .toInstant();
  }, [rowDate, zone]);
  if (row === undefined) return null;
  const inner = Math.max(1, width - 2 * PAD);
  const x = (min: number): number => PAD + (min / 1440) * inner;

  function mark(event: PointerEvent<SVGRectElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    const scale = box.width / width;
    const raw =
      ((event.clientX - box.left - PAD * scale) / (inner * scale)) * 1440;
    const min = Math.max(0, Math.min(1435, Math.round(raw / 5) * 5));
    setCursor(min);
    onMoment?.(instantAt(min).toString());
  }

  return (
    <div ref={wrapRef} className="w-full" data-testid="day-view">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="block"
        role="img"
        aria-label={m.dayViewLabel}
      >
        <defs>
          <Hatch id={hatchId} />
          <clipPath id={clipId}>
            <rect width={width} height={HEIGHT} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`} aria-hidden="true">
          {row.flights.map((f) => (
            <rect
              key={f.id}
              x={x(f.startMin)}
              y={TOP - 4}
              width={x(f.endMin) - x(f.startMin)}
              height={BOTTOM - TOP + 8}
              rx={8}
              fill={`url(#${hatchId})`}
              fillOpacity={0.6}
            />
          ))}
          {Array.from({ length: 7 }, (_, i) => (i + 1) * 180).map((min) => (
            <line
              key={min}
              x1={x(min)}
              x2={x(min)}
              y1={TOP}
              y2={BOTTOM}
              stroke="var(--fg-muted)"
              strokeOpacity={0.12}
            />
          ))}
          {row.segments.map((seg) => {
            const kind = seg.block.kind;
            const lane = LANES[seg.lane];
            const color = COLOR[kind];
            const x0 = x(seg.startMin);
            const w = Math.max(2, x(seg.endMin) - x0);
            if (kind === "MEAL") {
              const mw = Math.max(5, x(MEAL_MIN) - x(0));
              return (
                <rect
                  key={seg.id}
                  x={x0}
                  y={lane.y - 2}
                  width={mw}
                  height={lane.h + 4}
                  rx={Math.min(3, mw / 2)}
                  fill={color}
                  style={SOFT}
                />
              );
            }
            if (POINT_KINDS.has(kind)) {
              const tick = 3;
              return (
                <rect
                  key={seg.id}
                  x={x0 - tick / 2}
                  y={lane.y - 2}
                  width={tick}
                  height={lane.h + 4}
                  rx={1}
                  fill={color}
                />
              );
            }
            if (kind === "EXERCISE_AVOID") {
              return (
                <line
                  key={seg.id}
                  x1={x0 + 1}
                  x2={x0 + Math.max(1, w - 1)}
                  y1={lane.y + lane.h / 2}
                  y2={lane.y + lane.h / 2}
                  stroke={color}
                  style={SOFT_STROKE}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="0.1 4"
                />
              );
            }
            if (LINE_KINDS.has(kind)) {
              return (
                <rect
                  key={seg.id}
                  x={x0}
                  y={lane.y + lane.h / 2 - 1.5}
                  width={w}
                  height={3}
                  rx={1.5}
                  fill={color}
                  style={kind === "MELATONIN_OK" ? FAINT : SOFT}
                />
              );
            }
            return (
              <rect
                key={seg.id}
                x={x0}
                y={lane.y}
                width={w}
                height={lane.h}
                rx={Math.min(8, lane.h / 2)}
                fill={color}
                style={QUIET_KINDS.has(kind) ? QUIET_FILL : BAND}
              />
            );
          })}

          {row.cbtMin.map((d) => (
            <circle
              key={d.dayIndex}
              cx={x(d.min)}
              cy={LANES.sleep.y + LANES.sleep.h / 2}
              r={5}
              fill="var(--fg)"
              stroke="var(--bg)"
              strokeWidth={1.5}
            />
          ))}
        </g>
        {cursor === null ? null : (
          <line
            x1={x(cursor)}
            x2={x(cursor)}
            y1={TOP - 4}
            y2={BOTTOM + 4}
            stroke="var(--accent)"
            strokeWidth={2}
            pointerEvents="none"
            aria-hidden="true"
            data-testid="day-view-cursor"
          />
        )}
        <rect
          width={width}
          height={HEIGHT}
          fill="transparent"
          style={{ cursor: "col-resize", touchAction: "pan-y" }}
          aria-hidden="true"
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            mark(e);
          }}
          onPointerMove={(e) => {
            if (dragging.current) mark(e);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        />
      </svg>
    </div>
  );
}
