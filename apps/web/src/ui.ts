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
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2F2F0]";

export const pageClass =
  "mx-auto min-h-screen w-full max-w-[1040px] px-4 py-8 text-[15px] leading-[1.45] text-[#F2F2F0]";

export const surfaceClass =
  "flex flex-col gap-4 rounded-[10px] border border-[#26262B] bg-[#141417] p-4";

export const labelClass =
  "text-[13px] font-medium leading-[1.45] text-[#F2F2F0]";

export const hintClass = "text-[13px] leading-[1.45] text-[#8B8B93]";

export const errorClass = "text-[13px] leading-[1.45] text-[#FFB4B4]";

export const controlClass = `w-full rounded-md border border-[#26262B] bg-[#0B0B0D] px-2 py-2 text-[15px] leading-[1.45] text-[#F2F2F0] ${focusRing}`;

export const checkClass = `size-4 shrink-0 accent-[#F2F2F0] ${focusRing}`;

export const buttonClass = `rounded-md border border-[#26262B] bg-[#0B0B0D] px-3 py-2 text-left text-[15px] leading-[1.45] text-[#F2F2F0] ${focusRing}`;

export const primaryButtonClass = `rounded-md bg-[#F2F2F0] px-4 py-2 text-[15px] font-medium leading-[1.45] text-[#17171A] disabled:bg-[#8B8B93] disabled:text-[#0B0B0D] ${focusRing}`;

export const h1Class = "text-[28px] font-semibold leading-[1.1]";

export const h2Class = "text-[22px] font-medium leading-[1.1]";

export const h3Class = "text-[17px] font-medium leading-[1.1]";

export const linkClass = `underline ${focusRing}`;
