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

// The progress curve (§2.8): forecast misalignment per day, as a small
// inline SVG. It repeats the phase map's CBTmin-to-target story as numbers.

import type { PlanResult } from "@phasejumper/engine";
import { planMessages as m } from "../../messages";

const W = 320;
const H = 64;
const PAD = 6;

function hours(h: number): string {
  return Number.isInteger(h) ? h.toFixed(0) : h.toFixed(1);
}

export function ProgressCurve({ result }: { result: PlanResult }) {
  const points = result.days.map((d) => d.misalignmentBefore);
  const last = result.days[result.days.length - 1];
  if (last !== undefined) points.push(last.misalignmentAfter);
  const max = Math.max(1, ...points);
  const x = (i: number): number =>
    PAD + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - 2 * PAD));
  const y = (v: number): number => PAD + (1 - v / max) * (H - 2 * PAD);
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
    .join(" ");
  const label = `${m.progressTitle}: ${points.map((v) => m.progressAxis(hours(v))).join(", ")}.`;
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-13 leading-body text-fg-muted">
        {m.progressTitle}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-16 w-full max-w-[320px]"
        role="img"
        aria-label={label}
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD}
          y2={H - PAD}
          stroke="var(--line)"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--sleep)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {points.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="var(--fg)" />
        ))}
      </svg>
    </figure>
  );
}
