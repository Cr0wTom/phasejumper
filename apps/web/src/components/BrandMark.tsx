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

import { useId } from "react";

/** The PhaseJumper mark: a ribbon crossing from day (amber) into night (indigo). */
export function BrandMark({ size = 22 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#f6b73c" />
          <stop offset="0.45" stopColor="#ff7a59" />
          <stop offset="0.75" stopColor="#b06cff" />
          <stop offset="1" stopColor="#6c7bff" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="22"
        height="22"
        rx="6.5"
        fill={`url(#${id}-g)`}
      />
      <path
        d="M5 15.5c3.2 0 4.4-7 7.6-7s4.2 4.5 6.4 4.5"
        fill="none"
        stroke="#07080a"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
