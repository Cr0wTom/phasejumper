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

// What each mark on the phase map looks like. The map shows a short key of
// the marks in view; the research page shows all of them, grouped like the
// bands in each row.

import type { BlockKind } from "@phasejumper/engine";
import { useId, type ReactNode } from "react";
import { ICON_SIZE_RIBBON, Icon, KIND_ICON, type IconName } from "../../icons";
import { phaseMapMessages as m } from "../../messages";

export const COLOR: Record<BlockKind, string> = {
  SLEEP: "var(--sleep)",
  SLEEP_INFLIGHT: "var(--sleep)",
  NAP: "var(--sleep)",
  SEEK_LIGHT: "var(--light)",
  SEEK_LIGHT_ARTIFICIAL: "var(--light)",
  LIGHT_INFLIGHT_WINDOW: "var(--light)",
  AVOID_LIGHT: "var(--dark)",
  MELATONIN_WINDOW: "var(--melatonin)",
  MELATONIN_OK: "var(--melatonin)",
  EXERCISE_GOOD: "var(--move)",
  EXERCISE_OK: "var(--move)",
  EXERCISE_OPTIONAL_WALK: "var(--move)",
  EXERCISE_AVOID: "var(--move)",
  CAFFEINE_OK: "var(--caffeine)",
  CAFFEINE_LATE_OK: "var(--caffeine)",
  CAFFEINE_STOP: "var(--caffeine)",
  MEAL: "var(--fg-muted)",
  // Wind-down and rest share the sleep band, as pale sleep.
  WIND_DOWN: "var(--sleep)",
  NSDR: "var(--sleep)",
};

/**
 * How strong the background marks are. Theme tokens, so light mode can draw
 * them stronger on white (tokens.css).
 */
export const FAINT = { fillOpacity: "var(--pj-faint)" } as const;
export const SOFT = { fillOpacity: "var(--pj-soft)" } as const;
export const SOFT_STROKE = { strokeOpacity: "var(--pj-soft)" } as const;
export const QUIET_FILL = { fillOpacity: "var(--pj-quiet)" } as const;

const FG = "var(--fg)";

/** The small sample drawn next to each name in a key (14 × 10). */
export function swatch(kind: BlockKind): ReactNode {
  const color = COLOR[kind];
  switch (kind) {
    case "WIND_DOWN":
    case "NSDR":
      return (
        <rect width="14" height="10" rx="2" fill={color} style={QUIET_FILL} />
      );
    case "EXERCISE_OK":
    case "CAFFEINE_OK":
    case "CAFFEINE_LATE_OK":
      return (
        <rect y="4" width="14" height="3" rx="1.5" fill={color} style={SOFT} />
      );
    case "MELATONIN_OK":
      return (
        <rect y="4" width="14" height="3" rx="1.5" fill={color} style={FAINT} />
      );
    case "EXERCISE_AVOID":
      return (
        <line
          x1="1"
          x2="13"
          y1="5"
          y2="5"
          stroke={color}
          style={SOFT_STROKE}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="0.1 4"
        />
      );
    case "CAFFEINE_STOP":
      return <rect x="5.5" width="3" height="10" fill={color} />;
    case "MEAL":
      return <rect x="6" width="2" height="10" rx="1" fill={color} />;
    default:
      return <rect width="14" height="10" rx="2" fill={color} />;
  }
}

/** Light on a one-line day is a thinner band on the sleep line. */
export function stripSwatch(kind: BlockKind): ReactNode {
  if (LIGHT_KINDS.has(kind)) {
    return <rect y="2" width="14" height="6" rx="3" fill={COLOR[kind]} />;
  }
  return swatch(kind);
}

const LIGHT_KINDS: ReadonlySet<BlockKind> = new Set([
  "SEEK_LIGHT",
  "SEEK_LIGHT_ARTIFICIAL",
  "LIGHT_INFLIGHT_WINDOW",
]);

export type Marker = "flight" | "cbtMin" | "target";

export function markerSwatch(marker: Marker, hatchId: string): ReactNode {
  if (marker === "flight") {
    return <rect width="14" height="10" fill={`url(#${hatchId})`} />;
  }
  if (marker === "cbtMin") return <circle cx="7" cy="5" r="4" fill={FG} />;
  return (
    <line
      x1="7"
      x2="7"
      y1="0"
      y2="10"
      stroke={FG}
      strokeOpacity={0.5}
      strokeDasharray="2 2"
    />
  );
}

export function markerName(marker: Marker): string {
  return marker === "flight"
    ? m.flight("")
    : marker === "cbtMin"
      ? m.cbtMin
      : m.target;
}

export const MARKER_ICON: Record<Marker, IconName | undefined> = {
  flight: "flight",
  cbtMin: "cbtMin",
  target: undefined,
};

/** The hatch used for flights; one per SVG that needs it. */
export function Hatch({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      width="6"
      height="6"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width="6" height="6" fill="var(--surface)" />
      <line
        x1="0"
        y1="0"
        x2="0"
        y2="6"
        stroke="var(--fg-muted)"
        strokeWidth="2"
        strokeOpacity="0.3"
      />
    </pattern>
  );
}

/** Keeps key rows aligned when an item has no icon. */
export function KeyIcon({ name }: { name: IconName | undefined }) {
  return name === undefined ? (
    <span className="inline-block w-4" aria-hidden="true" />
  ) : (
    <Icon name={name} size={ICON_SIZE_RIBBON} />
  );
}

/** Groups in band order, top to bottom. */
export const KEY_GROUPS: ReadonlyArray<
  readonly [keyof typeof m.legendGroups, readonly BlockKind[]]
> = [
  ["sleep", ["SLEEP", "SLEEP_INFLIGHT", "NAP", "WIND_DOWN", "NSDR"]],
  [
    "light",
    [
      "SEEK_LIGHT",
      "SEEK_LIGHT_ARTIFICIAL",
      "LIGHT_INFLIGHT_WINDOW",
      "AVOID_LIGHT",
    ],
  ],
  [
    "exercise",
    [
      "EXERCISE_GOOD",
      "EXERCISE_OPTIONAL_WALK",
      "EXERCISE_OK",
      "EXERCISE_AVOID",
    ],
  ],
  [
    "intake",
    [
      "CAFFEINE_OK",
      "CAFFEINE_LATE_OK",
      "CAFFEINE_STOP",
      "MEAL",
      "MELATONIN_OK",
      "MELATONIN_WINDOW",
    ],
  ],
];

/** Every kind, in band order. */
export const KEY_ORDER: readonly BlockKind[] = KEY_GROUPS.flatMap(
  ([, kinds]) => kinds,
);

/** The full key, for the research page: every mark, with what it means. */
export function PhaseMapKey() {
  const hatchId = `${useId().replace(/:/g, "")}-key-hatch`;
  return (
    <div>
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <Hatch id={hatchId} />
        </defs>
      </svg>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 text-15 leading-body sm:grid-cols-2">
        {KEY_GROUPS.map(([group, kinds]) => (
          <div key={group}>
            <h3 className="text-15 font-medium text-fg">
              {m.legendGroups[group]}
            </h3>
            <ul className="mt-1 flex flex-col gap-1 text-fg-muted">
              {kinds.map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <KeyIcon name={KIND_ICON[k]} />
                  <svg width="14" height="10" aria-hidden="true">
                    {swatch(k)}
                  </svg>
                  {m.kinds[k]}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-15 font-medium text-fg">
            {m.legendGroups.markers}
          </h3>
          <ul className="mt-1 flex flex-col gap-1 text-fg-muted">
            {(["flight", "cbtMin", "target"] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <KeyIcon name={MARKER_ICON[k]} />
                <svg width="14" height="10" aria-hidden="true">
                  {markerSwatch(k, hatchId)}
                </svg>
                {markerName(k)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
