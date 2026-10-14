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
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Temporal } from "temporal-polyfill";
import { phaseMapMessages as m } from "../../messages";
import { KIND_ICON } from "../../icons";
import { focusRing } from "../../ui";
import {
  COLOR,
  FAINT,
  Hatch,
  KEY_GROUPS,
  KEY_ORDER,
  KeyIcon,
  MARKER_ICON,
  QUIET_FILL,
  SOFT,
  SOFT_STROKE,
  markerName,
  markerSwatch,
  stripSwatch,
  swatch,
  type Marker,
} from "./legend";
import {
  axisZone,
  layoutPlan,
  positionOf,
  type Axis,
  type Segment,
} from "./layout";

export { COLOR } from "./legend";

const FG = "var(--fg)";
const MUTED = "var(--fg-muted)";
const SURFACE = "var(--surface)";
const LINE = "var(--line)";
const ACCENT = "var(--accent)";

/** Label text on a band: theme-aware, chosen for WCAG contrast. */
function inkFor(kind: BlockKind): string {
  if (kind === "AVOID_LIGHT") return FG;
  if (kind === "SLEEP" || kind === "SLEEP_INFLIGHT" || kind === "NAP") {
    return "var(--on-sleep)";
  }
  return "var(--ink)";
}

/** Outline around the CBTmin dot so it reads on top of any band. */
const DOT_OUTLINE = "var(--bg)";

/** Band label size; a band shows its name only if it is this tall + 4 px. */
const LABEL_FONT = 11;

/** Kinds drawn faintly (lighter weight, no text) so stronger bands read on top. */
const QUIET: ReadonlySet<BlockKind> = new Set([
  "EXERCISE_AVOID",
  "EXERCISE_OK",
  "CAFFEINE_OK",
  "CAFFEINE_LATE_OK",
  "WIND_DOWN",
  "NSDR",
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

/** Phones: below this width each day is one line; tapping it opens the day. */
const PHONE_WIDTH = 600;

/** What a one-line day shows: sleep, light, meals (plus flights and the low point). */
const STRIP_KINDS: ReadonlySet<BlockKind> = new Set([
  "SLEEP",
  "SLEEP_INFLIGHT",
  "NAP",
  "SEEK_LIGHT",
  "SEEK_LIGHT_ARTIFICIAL",
  "LIGHT_INFLIGHT_WINDOW",
  "MEAL",
]);

function geometry(width: number, scaleCount: number, strip: boolean): Geometry {
  const compact = width < PHONE_WIDTH;
  const gutter = compact ? 52 : 96;
  if (strip) {
    // One line per day: sleep on the line, light as a thinner band on the
    // same line (they never overlap), meals as ticks through it.
    const line = { y: 11, h: 16 };
    return {
      width,
      gutter,
      ribbon: Math.max(1, width - gutter - 8),
      header: 4 + 18 * scaleCount,
      rowH: 38,
      lanes: {
        sleep: line,
        light: { y: 16, h: 6 },
        move: line,
        intake: { y: 10, h: 18 },
      },
      tickEvery: 6,
      compact,
    };
  }
  const k = compact ? 1.3 : 1;
  return {
    width,
    gutter,
    ribbon: Math.max(1, width - gutter - 8),
    header: 4 + 18 * scaleCount,
    rowH: Math.round(60 * k),
    lanes: {
      sleep: { y: Math.round(6 * k), h: Math.round(16 * k) },
      light: { y: Math.round(24 * k), h: Math.round(10 * k) },
      move: { y: Math.round(36 * k), h: Math.round(8 * k) },
      intake: { y: Math.round(48 * k), h: Math.round(10 * k) },
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

/** Two-line row label: a small weekday over the date. */
function dateParts(date: string): { weekday: string; day: string } {
  const d = Temporal.PlainDate.from(date);
  return {
    weekday: d.toLocaleString("en-GB", { weekday: "short" }),
    day: d.toLocaleString("en-GB", { day: "numeric", month: "short" }),
  };
}

function offsetLabel(zone: string, atUtc: string): string {
  const offset = Temporal.Instant.from(atUtc).toZonedDateTimeISO(zone).offset;
  if (offset === "+00:00") return "UTC";
  // "+05:30" → "UTC+5:30", "-08:00" → "UTC−8"
  const sign = offset.startsWith("-") ? "\u2212" : "+";
  const [h = "0", mm = "00"] = offset.slice(1).split(":");
  return `UTC${sign}${Number(h)}${mm === "00" ? "" : `:${mm}`}`;
}

function offsetMinutes(zone: string, atUtc: string): number {
  return Math.round(
    Temporal.Instant.from(atUtc).toZonedDateTimeISO(zone).offsetNanoseconds /
      60_000_000_000,
  );
}

/** Minutes after midnight as "HH" (whole hours) or "HH:MM". */
function clockLabel(min: number, withMinutes: boolean): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  return withMinutes ? `${h}:${String(min % 60).padStart(2, "0")}` : h;
}

function textFits(label: string, px: number): boolean {
  return label.length * 6.6 + 8 <= px;
}

/**
 * Where a band's name starts: at its left edge, or just past a body-clock
 * dot that would sit on it. Null when it does not fit either way.
 */
function labelX(
  label: string,
  x0: number,
  w: number,
  dots: readonly number[],
): number | null {
  const textW = label.length * 6.6;
  const end = x0 + w - 4;
  let at = x0 + 4;
  for (const dot of [...dots].sort((a, b) => a - b)) {
    if (dot + 6 < at || dot - 6 > at + textW) continue;
    at = dot + 8;
  }
  return at + textW <= end ? at : null;
}

export function PhaseMap({
  input,
  result,
  now,
  onlyDate,
  compact = false,
  selectedDate,
  onSelectDate,
}: {
  input: PlanInput;
  result: PlanResult;
  /** Current instant (ISO), read by the app on load; marks "Now" on the grid. */
  now?: string;
  /** Show only this date's row (YYYY-MM-DD in the grid's zone), e.g. on Today. */
  onlyDate?: string;
  /** No title, scale switches or legend: a single ribbon inside another screen. */
  compact?: boolean;
  /** The row whose day sheet is open (YYYY-MM-DD in the grid's zone). */
  selectedDate?: string;
  /** Choosing a row (its date, empty space, or Enter on the row) calls this. */
  onSelectDate?: (date: string) => void;
}) {
  // Both scales show by default; the grid reads in the first one switched on.
  const [scales, setScales] = useState<Record<Axis, boolean>>({
    destination: true,
    home: true,
  });
  const axis: Axis = scales.destination ? "destination" : "home";
  const otherAxis: Axis = axis === "destination" ? "home" : "destination";
  const shownScales: Axis[] = scales[otherAxis] ? [axis, otherAxis] : [axis];
  const [width, setWidth] = useState(1040);
  // Phones: one line per day; the day sheet shows the rest.
  const strip = width < PHONE_WIDTH && !compact;
  const [open, setOpen] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<SVGGElement | null>>([]);
  const segRefs = useRef(new Map<string, SVGGElement>());
  const headingId = useId();
  const patternId = `${useId().replace(/:/g, "")}-hatch`;
  const sheenId = `${patternId}-sheen`;

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

  const rows = useMemo(() => {
    const all = layoutPlan(input, result, axis);
    const dated =
      onlyDate === undefined ? all : all.filter((r) => r.date === onlyDate);
    return strip
      ? dated.map((r) => ({
          ...r,
          segments: r.segments.filter((s) => STRIP_KINDS.has(s.block.kind)),
        }))
      : dated;
  }, [input, result, axis, onlyDate, strip]);
  // The legend lists only what is drawn, in band order.
  const keyKinds = useMemo(() => {
    const kinds = new Set<BlockKind>();
    for (const row of rows)
      for (const s of row.segments) kinds.add(s.block.kind);
    return KEY_ORDER.filter((k) => kinds.has(k));
  }, [rows]);
  const keyMarkers: Marker[] = [
    ...(rows.some((r) => r.flights.length > 0) ? (["flight"] as const) : []),
    ...(rows.some((r) => r.cbtMin.length > 0) ? (["cbtMin"] as const) : []),
    ...(rows.some((r) => r.targetMin !== null) ? (["target"] as const) : []),
  ];
  const g = geometry(width, shownScales.length, strip);
  const height = g.header + rows.length * g.rowH;
  const zone = axisZone(axis, input);
  const nowAt =
    now === undefined
      ? undefined
      : (() => {
          const p = positionOf(now, zone);
          const rowIndex = rows.findIndex((r) => r.date === p.date);
          return rowIndex < 0 ? undefined : { ...p, rowIndex };
        })();
  const x = (min: number): number => g.gutter + (min / 1440) * g.ribbon;
  // Joins consecutive low-point dots; a jump of more than half a day means
  // the dot wrapped past midnight, so the line breaks there.
  const trajectory = rows
    .flatMap((row, rowIndex) =>
      row.cbtMin.map((c) => ({
        x: x(c.min),
        y: g.header + rowIndex * g.rowH + g.lanes.sleep.y + g.lanes.sleep.h / 2,
      })),
    )
    .map((p, i, all) => {
      const prev = all[i - 1];
      const jump = prev === undefined || Math.abs(p.x - prev.x) > g.ribbon / 2;
      return `${jump ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    })
    .join(" ");
  const segmentsOf = (rowIndex: number): Segment[] =>
    rows[rowIndex]?.segments ?? [];
  const allSegments = useMemo(
    () =>
      new Map(rows.flatMap((r) => r.segments.map((s) => [s.id, s] as const))),
    [rows],
  );

  // Offsets as they are now, or at the start of the plan if it hasn't begun.
  const refUtc =
    nowAt !== undefined && now !== undefined
      ? now
      : (result.days[0]?.cbtMinUtc ?? input.now);
  const shift =
    (offsetMinutes(axisZone(otherAxis, input), refUtc) -
      offsetMinutes(zone, refUtc) +
      1440) %
    1440;

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
    } else if (!strip && event.key === "ArrowRight" && list[0] !== undefined) {
      event.preventDefault();
      segRefs.current.get(list[0].id)?.focus();
    } else if (
      (event.key === "Enter" || event.key === " ") &&
      onSelectDate !== undefined
    ) {
      const date = rows[rowIndex]?.date;
      if (date === undefined) return;
      event.preventDefault();
      onSelectDate(date);
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
      <div
        className={
          compact
            ? "sr-only"
            : "flex flex-wrap items-baseline justify-between gap-2"
        }
      >
        <h2 id={headingId} className="text-17 font-medium leading-display">
          {m.title}
        </h2>
        {compact ? null : (
          <div
            role="group"
            aria-label={m.axisLabel}
            className="flex flex-wrap gap-1"
          >
            {(["destination", "home"] as const).map((a) => {
              const on = scales[a];
              const last =
                on && !scales[a === "destination" ? "home" : "destination"];
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  disabled={last}
                  title={last ? m.lastScale : undefined}
                  onClick={() => {
                    setOpen(null);
                    setScales((cur) => ({ ...cur, [a]: !cur[a] }));
                  }}
                  className={`rounded-full border px-3 py-1 text-13 leading-body transition-colors ${
                    on
                      ? "border-accent/50 bg-accent/15 text-fg"
                      : "border-line text-fg-muted hover:text-fg"
                  } ${focusRing}`}
                >
                  {m.scale(m.axis[a], offsetLabel(axisZone(a, input), refUtc))}
                </button>
              );
            })}
          </div>
        )}
      </div>

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
            {/* A soft top-lit sheen laid over the main bands. */}
            <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <Hatch id={patternId} />
          </defs>

          {/* Hour scales, shown once: the grid's, then the other zone's. */}
          {shownScales.map((a, i) => (
            <g key={a} aria-hidden="true">
              <text x={0} y={14 + i * 18} fontSize="11" fill={MUTED}>
                {m.scaleShort[a]}
              </text>
              {Array.from(
                { length: 24 / g.tickEvery + 1 },
                (_, t) => t * g.tickEvery * 60,
              ).map((min) => (
                <text
                  key={min}
                  x={x(min)}
                  y={14 + i * 18}
                  textAnchor={
                    min === 0 ? "start" : min === 1440 ? "end" : "middle"
                  }
                  fontSize="11"
                  fill={i === 0 ? FG : MUTED}
                  className="font-mono"
                >
                  {clockLabel(
                    i === 0 ? min : (min + shift) % 1440,
                    i > 0 && shift % 60 !== 0,
                  )}
                </text>
              ))}
            </g>
          ))}

          {rows.map((row, rowIndex) => {
            const y0 = g.header + rowIndex * g.rowH;
            const past = nowAt !== undefined && rowIndex < nowAt.rowIndex;
            const dotXs = row.cbtMin.map((c) => x(c.min));
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
                aria-label={
                  strip
                    ? m.stripRowLabel(dateLabel(row.date, false))
                    : m.rowLabel(dateLabel(row.date, false), list.length)
                }
                onKeyDown={(e) => onRowKey(e, rowIndex)}
                className="pj-row outline-none focus-visible:[&>rect.pj-row-bg]:stroke-fg"
                style={
                  {
                    animationDelay: `${rowIndex * 120}ms`,
                    // While the plan is underway, days already lived recede.
                    "--pj-row-opacity": past ? 0.5 : 1,
                    opacity: past ? 0.5 : undefined,
                  } as CSSProperties
                }
                data-date={row.date}
              >
                <rect
                  className="pj-row-bg"
                  x={g.gutter}
                  y={2}
                  width={g.ribbon}
                  height={g.rowH - 4}
                  rx={10}
                  fill={SURFACE}
                  data-today={nowAt?.rowIndex === rowIndex ? "" : undefined}
                  stroke={row.date === selectedDate ? ACCENT : LINE}
                  strokeWidth={row.date === selectedDate ? 1.5 : 1}
                  onClick={
                    onSelectDate === undefined
                      ? undefined
                      : () => onSelectDate(row.date)
                  }
                  style={
                    onSelectDate === undefined
                      ? undefined
                      : { cursor: "pointer" }
                  }
                />
                <text
                  x={0}
                  y={g.lanes.sleep.y + 8}
                  fontSize="11"
                  fill={nowAt?.rowIndex === rowIndex ? ACCENT : MUTED}
                  fontWeight={nowAt?.rowIndex === rowIndex ? 600 : 400}
                  onClick={
                    onSelectDate === undefined
                      ? undefined
                      : () => onSelectDate(row.date)
                  }
                  style={
                    onSelectDate === undefined
                      ? undefined
                      : { cursor: "pointer" }
                  }
                >
                  {dateParts(row.date).weekday}
                </text>
                <text
                  x={0}
                  y={g.lanes.sleep.y + 24}
                  fontSize="13"
                  fontWeight={row.date === selectedDate ? 600 : 500}
                  fill={FG}
                  onClick={
                    onSelectDate === undefined
                      ? undefined
                      : () => onSelectDate(row.date)
                  }
                  style={
                    onSelectDate === undefined
                      ? undefined
                      : { cursor: "pointer" }
                  }
                >
                  {g.compact
                    ? dateParts(row.date).day.split(" ")[0]
                    : dateParts(row.date).day}
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
                    strokeOpacity={0.6}
                    strokeWidth={1}
                    aria-hidden="true"
                  />
                ))}

                {/* Flights: the hatched band sits under everything... */}
                {row.flights.map((f) => (
                  <rect
                    key={f.id}
                    role="img"
                    aria-label={m.flight(f.label)}
                    x={x(f.startMin)}
                    y={3}
                    width={x(f.endMin) - x(f.startMin)}
                    height={g.rowH - 6}
                    fill={`url(#${patternId})`}
                    rx={4}
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
                  const bandName = name;
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
                      onClick={() => {
                        // A one-line day opens as a whole.
                        if (strip && onSelectDate !== undefined) {
                          onSelectDate(row.date);
                        } else openFor(seg, rowIndex);
                      }}
                      className="cursor-pointer outline-none focus-visible:[&>.pj-mark]:stroke-fg focus-visible:[&>.pj-mark]:[stroke-width:2]"
                      data-kind={seg.block.kind}
                      data-start-min={seg.startMin}
                      data-end-min={seg.endMin}
                    >
                      {seg.point ? (
                        seg.block.kind === "CAFFEINE_STOP" ? (
                          <rect
                            className="pj-mark"
                            x={x0 - 1.5}
                            y={lane.y - 1}
                            width={3}
                            height={lane.h + 2}
                            fill={color}
                          />
                        ) : (
                          // A meal is a thin full-height tick, so it stays
                          // visible on top of the melatonin and caffeine lines.
                          <rect
                            className="pj-mark"
                            x={x0 - 1}
                            y={lane.y - 1}
                            width={2}
                            height={lane.h + 2}
                            rx={1}
                            fill={color}
                          />
                        )
                      ) : seg.block.kind === "EXERCISE_AVOID" ? (
                        // "No exercise" is a dotted line, continuous with the
                        // "Can exercise" line, so the band reads as one track.
                        <>
                          <rect
                            x={x0}
                            y={lane.y}
                            width={w}
                            height={lane.h}
                            fill="transparent"
                            aria-hidden="true"
                          />
                          <line
                            className="pj-mark"
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
                        </>
                      ) : seg.block.kind === "CAFFEINE_OK" ||
                        seg.block.kind === "CAFFEINE_LATE_OK" ? (
                        // Caffeine reads as a line through the food & drink band.
                        <rect
                          className="pj-mark"
                          x={x0}
                          y={lane.y + lane.h / 2 - 1.5}
                          width={w}
                          height={3}
                          rx={1.5}
                          fill={color}
                          style={
                            seg.block.kind === "CAFFEINE_OK" ? SOFT : QUIET_FILL
                          }
                        />
                      ) : seg.block.kind === "EXERCISE_OK" ||
                        seg.block.kind === "MELATONIN_OK" ? (
                        // Thin line, same as "Can exercise". The melatonin
                        // range is only a suggestion, so it is fainter.
                        <rect
                          className="pj-mark"
                          x={x0}
                          y={lane.y + lane.h / 2 - 1.5}
                          width={w}
                          height={3}
                          rx={1.5}
                          fill={color}
                          style={
                            seg.block.kind === "MELATONIN_OK" ? FAINT : SOFT
                          }
                        />
                      ) : (
                        <>
                          <rect
                            className="pj-mark"
                            x={x0}
                            y={lane.y}
                            width={w}
                            height={lane.h}
                            rx={Math.min(6, lane.h / 2)}
                            fill={color}
                            style={quiet ? QUIET_FILL : undefined}
                          />
                          {quiet || lane.h < 8 ? null : (
                            <rect
                              x={x0}
                              y={lane.y}
                              width={w}
                              height={lane.h}
                              rx={Math.min(6, lane.h / 2)}
                              fill={`url(#${sheenId})`}
                              pointerEvents="none"
                              aria-hidden="true"
                            />
                          )}
                        </>
                      )}
                      {!seg.point &&
                      !quiet &&
                      lane.h >= LABEL_FONT + 4 &&
                      labelX(bandName, x0, w, dotXs) !== null ? (
                        <text
                          x={labelX(bandName, x0, w, dotXs) ?? x0 + 4}
                          y={lane.y + lane.h / 2}
                          dominantBaseline="central"
                          fontSize={LABEL_FONT}
                          fontWeight={500}
                          fill={inkFor(seg.block.kind)}
                          aria-hidden="true"
                        >
                          {bandName}
                        </text>
                      ) : null}
                    </g>
                  );
                })}

                {/* ...and its label chip sits on top. */}
                {row.flights.map((f) =>
                  textFits(f.label, x(f.endMin) - x(f.startMin)) ? (
                    <g key={`${f.id}-label`} aria-hidden="true">
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
                  ) : null,
                )}

                {nowAt?.rowIndex === rowIndex ? (
                  <g role="img" aria-label={m.now(clockLabel(nowAt.min, true))}>
                    <line
                      x1={x(nowAt.min)}
                      x2={x(nowAt.min)}
                      y1={1}
                      y2={g.rowH - 1}
                      stroke={ACCENT}
                      strokeWidth={2}
                      className="pj-now-line"
                    />
                    <circle cx={x(nowAt.min)} cy={2} r={3.5} fill={ACCENT} />
                  </g>
                ) : null}

                {row.cbtMin.map((c) => (
                  <circle
                    key={c.dayIndex}
                    cx={x(c.min)}
                    cy={g.lanes.sleep.y + g.lanes.sleep.h / 2}
                    r={4.5}
                    fill={FG}
                    stroke={DOT_OUTLINE}
                    strokeWidth={1.5}
                    role="img"
                    aria-label={`${m.cbtMin} ${String(Math.floor(c.min / 60)).padStart(2, "0")}:${String(c.min % 60).padStart(2, "0")}`}
                  />
                ))}
              </g>
            );
          })}

          {/* The body clock's path: each night's low point joined to the
              next, so the drift toward the target reads as one shape. */}
          <path
            d={trajectory}
            fill="none"
            stroke={ACCENT}
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1 4"
            pointerEvents="none"
            aria-hidden="true"
            data-testid="phase-trajectory"
          />
        </svg>

        {openSeg === undefined || open === null ? null : (
          <div
            role="dialog"
            aria-label={m.kinds[openSeg.block.kind]}
            className="absolute z-10 w-[272px] rounded-surface border border-line bg-surface p-3 text-13 leading-body shadow-[0_8px_24px_rgba(0,0,0,.35)]"
            style={{ left: Math.max(0, open.x), top: open.y }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(null);
                segRefs.current.get(openSeg.id)?.focus();
              }
            }}
          >
            <p className="text-15 font-medium">{m.kinds[openSeg.block.kind]}</p>
            <p className="font-mono text-fg-muted">
              {openSeg.point ? openSeg.from : `${openSeg.from}–${openSeg.to}`}
            </p>
            <p className="mt-2 font-medium">{m.whyHere}</p>
            <p>{openSeg.block.reason}</p>
            <p className="mt-2 text-fg-muted">
              {m.evidence(openSeg.block.confidence, openSeg.block.source)}
            </p>
            <button
              type="button"
              className={`mt-2 rounded-control border border-line px-2 py-1 ${focusRing}`}
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
      {compact ? null : (
        <div>
          <h3 className="text-13 font-medium leading-body">{m.legend}</h3>
          {strip ? (
            <p className="mt-1 text-13 leading-body text-fg-muted">
              {m.stripHint}
            </p>
          ) : null}
          {/* Grouped like the bands in each row; only what is drawn. */}
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-13 leading-body text-fg-muted sm:grid-cols-3 lg:grid-cols-5">
            {KEY_GROUPS.map(([group, kinds]) => {
              const shown = kinds.filter((k) => keyKinds.includes(k));
              return shown.length === 0 ? null : (
                <div key={group}>
                  <h4 className="text-13 font-medium text-fg">
                    {m.legendGroups[group]}
                  </h4>
                  <ul className="mt-1 flex flex-col gap-1">
                    {shown.map((k) => (
                      <li key={k} className="flex items-center gap-1">
                        <KeyIcon name={KIND_ICON[k]} />
                        <svg width="14" height="10" aria-hidden="true">
                          {strip ? stripSwatch(k) : swatch(k)}
                        </svg>
                        {m.kinds[k]}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {keyMarkers.length === 0 ? null : (
              <div>
                <h4 className="text-13 font-medium text-fg">
                  {m.legendGroups.markers}
                </h4>
                <ul className="mt-1 flex flex-col gap-1">
                  {keyMarkers.map((k) => (
                    <li key={k} className="flex items-center gap-1">
                      <KeyIcon name={MARKER_ICON[k]} />
                      <svg width="14" height="10" aria-hidden="true">
                        {markerSwatch(k, patternId)}
                      </svg>
                      {markerName(k)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <p className="mt-3 text-13 leading-body">
            <a
              href="#/evidence/key"
              className={`text-fg-muted underline underline-offset-2 hover:text-fg ${focusRing}`}
            >
              {m.fullKey}
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
