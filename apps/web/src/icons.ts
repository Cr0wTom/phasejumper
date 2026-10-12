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

import { createElement } from "react";
import {
  BedSingle,
  CalendarArrowDown,
  Clock,
  Coffee,
  Dumbbell,
  Link,
  Moon,
  Pill,
  Plane,
  Sun,
  SunDim,
  Utensils,
  Wind,
  type LucideIcon,
} from "lucide-react";

/** Stroke for every icon (§5). */
export const ICON_STROKE = 1.5;

/** Size in the UI. Ribbons use {@link ICON_SIZE_RIBBON}. */
export const ICON_SIZE = 20;

/** Size inside ribbons. Icons are never drawn in the phase-map grid. */
export const ICON_SIZE_RIBBON = 16;

/** Fixed meaning → Lucide icon. Do not add or swap entries. */
export const icons = {
  seekLight: Sun,
  avoidLight: SunDim,
  sleep: Moon,
  nap: BedSingle,
  exercise: Dumbbell,
  caffeine: Coffee,
  melatonin: Pill,
  meal: Utensils,
  windDown: Wind,
  flight: Plane,
  cbtMin: Clock,
  export: CalendarArrowDown,
  share: Link,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export function Icon({
  name,
  size = ICON_SIZE,
}: {
  name: IconName;
  size?: number;
}) {
  const Glyph = icons[name];
  return createElement(Glyph, {
    size,
    strokeWidth: ICON_STROKE,
    "aria-hidden": true,
  });
}
