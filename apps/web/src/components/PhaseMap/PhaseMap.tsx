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

// The phase map (§4): one 24-hour ribbon per date, stacked. Bands and text
// only inside the grid — icons appear in the legend, never in the grid.

import type { BlockKind, PlanInput, PlanResult } from "@phasejumper/engine";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Temporal } from "temporal-polyfill";
import { phaseMapMessages as m } from "../../messages";
import { focusRing } from "../../ui";
import { layoutPlan, type Axis, type Segment } from "./layout";

const COLOR: Record<BlockKind, string> = {
  SLEEP: "var(--sleep, #6C7BFF)",
  SLEEP_INFLIGHT: "var(--sleep, #6C7BFF)",
  NAP: "var(--sleep, #6C7BFF)",
  SEEK_LIGHT: "var(--light, #F6B73C)",
  SEEK_LIGHT_ARTIFICIAL: "var(--light, #F6B73C)",
  LIGHT_INFLIGHT_WINDOW: "var(--light, #F6B73C)",
  AVOID_LIGHT: "var(--dark, #2E2E36)",
  MELATONIN_WINDOW: "var(--melatonin, #B690FF)",
  EXERCISE_GOOD: "var(--move, #3FD6A0)",
  EXERCISE_OPTIONAL_WALK: "var(--move, #3FD6A0)",
  EXERCISE_AVOID: "var(--move, #3FD6A0)",
  CAFFEINE_OK: "var(--caffeine, #C9915A)",
  CAFFEINE_LATE_OK: "var(--caffeine, #C9915A)",
  CAFFEINE_STOP: "var(--caffeine, #C9915A)",
  MEAL: "var(--fg-muted, #8B8B93)",
  WIND_DOWN: "var(--fg-muted, #8B8B93)",
  NSDR: "var(--fg-muted, #8B8B93)",
};

const FG = "var(--fg, #F2F2F0)";
const MUTED = "var(--fg-muted, #8B8B93)";
const SURFACE = "var(--surface, #141417)";
const LINE = "var(--line, #26262B)";
const INK = "#0B0B0D";

/** Kinds drawn faintly (lighter weight, no text) so stronger bands read on top. */
const QUIET: ReadonlySet<BlockKind> = new Set([
  "EXERCISE_AVOID",
  "CAFFEINE_OK",
  "CAFFEINE_LATE_OK",
]);

interface Geometry {
  width: number;
  gutter: number;
  ribbon: number;
  header: number;
  rowH: number;
  lanes: Record<Segment["lane"], { y: number; h: number }>;
  tickEvery: number;
  compact: boolean;
}

function geometry(width: number): Geometry {
  const compact = width < 600;
  const gutter = compact ? 52 : 96;
  const k = compact ? 1.3 : 1;
  return {
    width,
    gutter,
    ribbon: Math.max(1, width - gutter - 8),
    header: 22,
    rowH: Math.round(52 * k),
    lanes: {
      sleep: { y: Math.round(6 * k), h: Math.round(16 * k) },
      light: { y: Math.round(24 * k), h: Math.round(10 * k) },
      move: { y: Math.round(36 * k), h: Math.round(8 * k) },
      caffeine: { y: Math.round(45 * k), h: Math.round(3 * k) },
    },
    tickEvery: compact ? 6 : 3,
    compact,
  };
}

function dateLabel(date: string, compact: boolean): string {
  return Temporal.PlainDate.from(date).toLocaleString("en-GB", {
    ...(compact ? {} : { weekday: "short" }),
    day: "numeric",
    month: "short",
  });
}

function offsetLabel(zone: string, atUtc: string): string {
  const offset = Temporal.Instant.from(atUtc).toZonedDateTimeISO(zone).offset;
  if (offset === "+00:00") return "UTC";
  // "+05:30" → "UTC+5:30", "-08:00" → "UTC−8"
  const sign = offset.startsWith("-") ? "\u2212" : "+";
  const [h = "0", mm = "00"] = offset.slice(1).split(":");
  return `UTC${sign}${Number(h)}${mm === "00" ? "" : `:${mm}`}`;
}

function textFits(label: string, px: number): boolean {
  return label.length * 6.6 + 8 <= px;
}

export function PhaseMap({
  input,
  result,
}: {
  input: PlanInput;
  result: PlanResult;
}) {
  const [axis, setAxis] = useState<Axis>("destination");
  const [width, setWidth] = useState(1040);
  const [open, setOpen] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<SVGGElement | null>>([]);
  const segRefs = useRef(new Map<string, SVGGElement>());
  const headingId = useId();
  const patternId = `${useId().replace(/:/g, "")}-hatch`;

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.floor(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(
    () => layoutPlan(input, result, axis),
    [input, result, axis],
  );
  const g = geometry(width);
  const height = g.header + rows.length * g.rowH;
  const x = (min: number): number => g.gutter + (min / 1440) * g.ribbon;
  const segmentsOf = (rowIndex: number): Segment[] =>
    rows[rowIndex]?.segments ?? [];
  const allSegments = useMemo(
    () =>
      new Map(rows.flatMap((r) => r.segments.map((s) => [s.id, s] as const))),
    [rows],
  );

  const firstUtc = result.days[0]?.cbtMinUtc ?? input.now;

  function openFor(seg: Segment, rowIndex: number): void {
    setOpen({
      id: seg.id,
      x: Math.min(x(seg.startMin), width - 280),
      y: g.header + (rowIndex + 1) * g.rowH,
    });
  }

  function focusRow(index: number): void {
    rowRefs.current[Math.max(0, Math.min(rows.length - 1, index))]?.focus();
  }

  function onRowKey(event: KeyboardEvent<SVGGElement>, rowIndex: number): void {
    const list = segmentsOf(rowIndex);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(rowIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(rowIndex - 1);
    } else if (event.key === "ArrowRight" && list[0] !== undefined) {
      event.preventDefault();
      segRefs.current.get(list[0].id)?.focus();
    }
  }

  function onSegKey(
    event: KeyboardEvent<SVGGElement>,
    rowIndex: number,
    segIndex: number,
  ): void {
    const list = segmentsOf(rowIndex);
    const seg = list[segIndex];
    event.stopPropagation();
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = list[segIndex + (event.key === "ArrowRight" ? 1 : -1)];
      if (next === undefined) {
        if (event.key === "ArrowLeft") focusRow(rowIndex);
        return;
      }
      segRefs.current.get(next.id)?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(rowIndex + (event.key === "ArrowDown" ? 1 : -1));
    } else if (
      (event.key === "Enter" || event.key === " ") &&
      seg !== undefined
    ) {
      event.preventDefault();
      openFor(seg, rowIndex);
    } else if (event.key === "Escape") {
      setOpen(null);
    }
  }

  const openSeg = open === null ? undefined : allSegments.get(open.id);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open !== null) closeRef.current?.focus();
  }, [open]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-[17px] font-medium leading-[1.1]">
          {m.title}
        </h2>
        <div role="radiogroup" aria-label={m.axisLabel} className="flex gap-1">
          {(["destination", "home", "local"] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={axis === a}
              onClick={() => {
                setOpen(null);
                setAxis(a);
              }}
              className={`rounded-md border px-2 py-1 text-[13px] leading-[1.45] ${
                axis === a
                  ? "border-[#F2F2F0] bg-[#F2F2F0] text-[#17171A]"
                  : "border-[#26262B] text-[#F2F2F0]"
              } ${focusRing}`}
            >
              {m.axis[a]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[13px] leading-[1.45] text-[#8B8B93]">
        {axis === "local"
          ? m.localNote
          : m.offsets(
              offsetLabel(input.itinerary.destinationTz, firstUtc),
              offsetLabel(input.itinerary.homeTz, firstUtc),
            )}
      </p>

      <div ref={containerRef} className="relative w-full">
        <svg
          role="group"
          aria-label={`${m.title}, ${m.axis[axis]}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block max-w-full"
          data-testid="phase-map"
        >
          <defs>
            <pattern
              id={patternId}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill={SURFACE} />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                stroke={MUTED}
                strokeWidth="2"
                strokeOpacity="0.3"
              />
            </pattern>
          </defs>

          {/* Hour axis, shown once. */}
          <g aria-hidden="true">
            {Array.from(
              { length: 24 / g.tickEvery + 1 },
              (_, i) => i * g.tickEvery,
            ).map((h) => (
              <text
                key={h}
                x={x(h * 60)}
                y={14}
                textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
                fontSize="11"
                fill={MUTED}
                className="font-mono"
              >
                {String(h).padStart(2, "0")}
              </text>
            ))}
          </g>

          {rows.map((row, rowIndex) => {
            const y0 = g.header + rowIndex * g.rowH;
            const list = row.segments;
            return (
              <g
                key={row.date}
                ref={(el) => {
                  rowRefs.current[rowIndex] = el;
                }}
                transform={`translate(0 ${y0})`}
                role="group"
                tabIndex={0}
                aria-label={m.rowLabel(dateLabel(row.date, false), list.length)}
                onKeyDown={(e) => onRowKey(e, rowIndex)}
                className="pj-row outline-none focus-visible:[&>rect.pj-row-bg]:stroke-[#F2F2F0]"
                style={{ animationDelay: `${rowIndex * 120}ms` }}
                data-date={row.date}
              >
                <rect
                  className="pj-row-bg"
                  x={g.gutter}
                  y={2}
                  width={g.ribbon}
                  height={g.rowH - 4}
                  rx={6}
                  fill={SURFACE}
                  stroke={LINE}
                  strokeWidth={1}
                />
                <text
                  x={0}
                  y={g.lanes.sleep.y + g.lanes.sleep.h - 3}
                  fontSize="13"
                  fill={FG}
                >
                  {dateLabel(row.date, g.compact)}
                </text>
                {Array.from(
                  { length: 24 / g.tickEvery - 1 },
                  (_, i) => (i + 1) * g.tickEvery,
                ).map((h) => (
                  <line
                    key={h}
                    x1={x(h * 60)}
                    x2={x(h * 60)}
                    y1={4}
                    y2={g.rowH - 4}
                    stroke={LINE}
                    strokeWidth={1}
                    aria-hidden="true"
                  />
                ))}

                {row.targetMin === null ? null : (
                  <line
                    x1={x(row.targetMin)}
                    x2={x(row.targetMin)}
                    y1={3}
                    y2={g.rowH - 3}
                    stroke={FG}
                    strokeOpacity={0.35}
                    strokeDasharray="2 3"
                    aria-label={m.target}
                    role="img"
                  />
                )}

                {list.map((seg, segIndex) => {
                  const lane = g.lanes[seg.lane];
                  const color = COLOR[seg.block.kind];
                  const name = m.kinds[seg.block.kind];
                  const label = m.itemLabel(name, seg.from, seg.to, seg.point);
                  const x0 = x(seg.startMin);
                  const w = Math.max(2, x(seg.endMin) - x0);
                  const quiet = QUIET.has(seg.block.kind);
                  return (
                    <g
                      key={seg.id}
                      ref={(el) => {
                        if (el === null) segRefs.current.delete(seg.id);
                        else segRefs.current.set(seg.id, el);
                      }}
                      role="button"
                      tabIndex={-1}
                      aria-label={label}
                      aria-haspopup="dialog"
                      onKeyDown={(e) => onSegKey(e, rowIndex, segIndex)}
                      onClick={() => openFor(seg, rowIndex)}
                      className="cursor-pointer outline-none focus-visible:[&>.pj-mark]:stroke-[#F2F2F0] focus-visible:[&>.pj-mark]:[stroke-width:2]"
                      data-kind={seg.block.kind}
                      data-start-min={seg.startMin}
                      data-end-min={seg.endMin}
                    >
                      {seg.point ? (
                        seg.block.kind === "MELATONIN_WINDOW" ? (
                          <rect
                            className="pj-mark"
                            x={x0 - 4}
                            y={lane.y}
                            width={8}
                            height={8}
                            fill={color}
                            transform={`rotate(45 ${x0} ${lane.y + 4})`}
                          />
                        ) : seg.block.kind === "CAFFEINE_STOP" ? (
                          <rect
                            className="pj-mark"
                            x={x0 - 1.5}
                            y={lane.y - 6}
                            width={3}
                            height={lane.h + 8}
                            fill={color}
                          />
                        ) : (
                          <circle
                            className="pj-mark"
                            cx={x0}
                            cy={lane.y + lane.h / 2}
                            r={3.5}
                            fill={color}
                          />
                        )
                      ) : seg.block.kind === "EXERCISE_AVOID" ? (
                        <rect
                          className="pj-mark"
                          x={x0 + 0.5}
                          y={lane.y + 0.5}
                          width={Math.max(1, w - 1)}
                          height={lane.h - 1}
                          rx={2}
                          fill="none"
                          stroke={color}
                          strokeOpacity={0.6}
                          strokeDasharray="3 2"
                        />
                      ) : (
                        <rect
                          className="pj-mark"
                          x={x0}
                          y={lane.y}
                          width={w}
                          height={lane.h}
                          rx={Math.min(4, lane.h / 2)}
                          fill={color}
                          fillOpacity={quiet ? 0.55 : 1}
                        />
                      )}
                      {!seg.point &&
                      !quiet &&
                      lane.h >= 10 &&
                      textFits(name, w) ? (
                        <text
                          x={x0 + 4}
                          y={lane.y + lane.h - Math.round((lane.h - 9) / 2) - 1}
                          fontSize="11"
                          fill={seg.block.kind === "AVOID_LIGHT" ? FG : INK}
                          aria-hidden="true"
                        >
                          {name}
                        </text>
                      ) : null}
                    </g>
                  );
                })}

                {row.flights.map((f) => {
                  const w = x(f.endMin) - x(f.startMin);
                  return (
                    <g key={f.id} aria-label={m.flight(f.label)} role="img">
                      <rect
                        x={x(f.startMin)}
                        y={3}
                        width={w}
                        height={g.rowH - 6}
                        fill={`url(#${patternId})`}
                        rx={4}
                      />
                      {textFits(f.label, w) ? (
                        <g aria-hidden="true">
                          <rect
                            x={x(f.startMin) + 3}
                            y={g.rowH - 19}
                            width={f.label.length * 6.6 + 6}
                            height={15}
                            rx={3}
                            fill={SURFACE}
                          />
                          <text
                            x={x(f.startMin) + 6}
                            y={g.rowH - 8}
                            fontSize="11"
                            fill={MUTED}
                          >
                            {f.label}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  );
                })}

                {row.cbtMin.map((c) => (
                  <circle
                    key={c.dayIndex}
                    cx={x(c.min)}
                    cy={g.lanes.sleep.y + g.lanes.sleep.h / 2}
                    r={4.5}
                    fill={FG}
                    stroke={INK}
                    strokeWidth={1.5}
                    role="img"
                    aria-label={`${m.cbtMin} ${String(Math.floor(c.min / 60)).padStart(2, "0")}:${String(c.min % 60).padStart(2, "0")}`}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {openSeg === undefined || open === null ? null : (
          <div
            role="dialog"
            aria-label={m.kinds[openSeg.block.kind]}
            className="absolute z-10 w-[272px] rounded-[10px] border border-[#26262B] bg-[#141417] p-3 text-[13px] leading-[1.45] shadow-[0_8px_24px_rgba(0,0,0,.35)]"
            style={{ left: Math.max(0, open.x), top: open.y }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(null);
                segRefs.current.get(openSeg.id)?.focus();
              }
            }}
          >
            <p className="text-[15px] font-medium">
              {m.kinds[openSeg.block.kind]}
            </p>
            <p className="font-mono text-[#8B8B93]">
              {openSeg.point ? openSeg.from : `${openSeg.from}–${openSeg.to}`}
            </p>
            <p className="mt-2 font-medium">{m.whyHere}</p>
            <p>{openSeg.block.reason}</p>
            <p className="mt-2 text-[#8B8B93]">
              {m.evidence(openSeg.block.confidence, openSeg.block.source)}
            </p>
            <button
              type="button"
              className={`mt-2 rounded-md border border-[#26262B] px-2 py-1 ${focusRing}`}
              onClick={() => {
                setOpen(null);
                segRefs.current.get(openSeg.id)?.focus();
              }}
              ref={closeRef}
            >
              {m.close}
            </button>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-[13px] font-medium leading-[1.45]">{m.legend}</h3>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-[1.45] text-[#8B8B93]">
          {(
            [
              [
                "SLEEP",
                <rect width="14" height="10" rx="2" fill={COLOR.SLEEP} />,
              ],
              [
                "SEEK_LIGHT",
                <rect width="14" height="10" rx="2" fill={COLOR.SEEK_LIGHT} />,
              ],
              [
                "AVOID_LIGHT",
                <rect width="14" height="10" rx="2" fill={COLOR.AVOID_LIGHT} />,
              ],
              [
                "EXERCISE_GOOD",
                <rect
                  width="14"
                  height="10"
                  rx="2"
                  fill={COLOR.EXERCISE_GOOD}
                />,
              ],
              [
                "EXERCISE_AVOID",
                <rect
                  x="0.5"
                  y="0.5"
                  width="13"
                  height="9"
                  rx="2"
                  fill="none"
                  stroke={COLOR.EXERCISE_AVOID}
                  strokeDasharray="3 2"
                />,
              ],
              [
                "CAFFEINE_OK",
                <rect y="4" width="14" height="3" fill={COLOR.CAFFEINE_OK} />,
              ],
              [
                "CAFFEINE_STOP",
                <rect
                  x="5.5"
                  width="3"
                  height="10"
                  fill={COLOR.CAFFEINE_STOP}
                />,
              ],
              [
                "MELATONIN_WINDOW",
                <rect
                  x="3"
                  y="1"
                  width="7"
                  height="7"
                  fill={COLOR.MELATONIN_WINDOW}
                  transform="rotate(45 7 5)"
                />,
              ],
              ["MEAL", <circle cx="7" cy="5" r="3.5" fill={COLOR.MEAL} />],
              [
                "WIND_DOWN",
                <rect width="14" height="10" rx="2" fill={COLOR.WIND_DOWN} />,
              ],
            ] as const
          ).map(([k, shape]) => (
            <li key={k} className="flex items-center gap-1">
              <svg width="14" height="10" aria-hidden="true">
                {shape}
              </svg>
              {m.kinds[k]}
            </li>
          ))}
          <li className="flex items-center gap-1">
            <svg width="14" height="10" aria-hidden="true">
              <rect width="14" height="10" fill={`url(#${patternId})`} />
            </svg>
            {m.flight("")}
          </li>
          <li className="flex items-center gap-1">
            <svg width="14" height="10" aria-hidden="true">
              <circle cx="7" cy="5" r="4" fill={FG} />
            </svg>
            {m.cbtMin}
          </li>
          <li className="flex items-center gap-1">
            <svg width="14" height="10" aria-hidden="true">
              <line
                x1="7"
                x2="7"
                y1="0"
                y2="10"
                stroke={FG}
                strokeOpacity={0.5}
                strokeDasharray="2 2"
              />
            </svg>
            {m.target}
          </li>
        </ul>
      </div>
    </section>
  );
}
