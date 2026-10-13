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
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const pageClass =
  "mx-auto min-h-screen w-full max-w-[1040px] px-4 pb-8 pt-6 text-15 leading-body text-fg md:px-6 md:pt-10";

/** A raised card: hairline border, inner top highlight, soft drop shadow. */
export const surfaceClass = "pj-card flex flex-col gap-4 p-5";

export const labelClass = "text-13 font-medium leading-body text-fg";

export const hintClass = "text-13 leading-body text-fg-muted";

export const errorClass = "text-13 leading-body text-danger";

export const controlClass = `pj-control w-full rounded-control border border-line px-3 py-2 text-15 leading-body text-fg ${focusRing}`;

export const checkClass = `size-4 shrink-0 accent-accent ${focusRing}`;

/** Secondary action: a quiet pill. */
export const buttonClass = `pj-btn ${focusRing}`;

/** The one main action on a screen: a solid pill. */
export const primaryButtonClass = `pj-btn pj-btn-primary ${focusRing}`;

export const h1Class =
  "text-28 font-semibold leading-display tracking-[-0.03em] md:text-40";

export const h2Class =
  "text-17 font-semibold leading-display tracking-[-0.015em] md:text-22";

export const h3Class =
  "text-15 font-semibold leading-display tracking-[-0.01em] md:text-17";

/** Small uppercase label above a heading. */
export const eyebrowClass =
  "text-13 font-medium uppercase tracking-[0.08em] text-fg-muted";

export const linkClass = `underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg ${focusRing}`;
