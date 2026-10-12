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

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg";

export const pageClass =
  "mx-auto min-h-screen w-full max-w-[1040px] px-4 py-8 text-15 leading-body text-fg";

export const surfaceClass =
  "flex flex-col gap-4 rounded-surface border border-line bg-surface p-4";

export const labelClass = "text-13 font-medium leading-body text-fg";

export const hintClass = "text-13 leading-body text-fg-muted";

export const errorClass = "text-13 leading-body text-danger";

export const controlClass = `w-full rounded-control border border-line bg-bg px-2 py-2 text-15 leading-body text-fg ${focusRing}`;

export const checkClass = `size-4 shrink-0 accent-fg ${focusRing}`;

export const buttonClass = `rounded-control border border-line bg-bg px-3 py-2 text-left text-15 leading-body text-fg ${focusRing}`;

export const primaryButtonClass = `rounded-control bg-fg px-4 py-2 text-15 font-medium leading-body text-bg disabled:bg-fg-muted disabled:text-bg ${focusRing}`;

export const h1Class = "text-28 font-semibold leading-display";

export const h2Class = "text-22 font-medium leading-display";

export const h3Class = "text-17 font-medium leading-display";

export const linkClass = `underline ${focusRing}`;
