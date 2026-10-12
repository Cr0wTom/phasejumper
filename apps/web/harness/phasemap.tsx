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

// Test-only page: renders a golden fixture in the phase map for Playwright.
// Built by vite.harness.config.ts into dist-harness/; never part of the app.
// URL: /harness/phasemap.html?fixture=<name>[&now=<ISO instant>]

import { generatePlan, type PlanInput } from "@phasejumper/engine";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PhaseMap } from "../src/components/PhaseMap/PhaseMap";
import "../src/index.css";

const inputs = import.meta.glob<PlanInput>(
  "../../../packages/engine/test/fixtures/*.input.json",
  { eager: true, import: "default" },
);

const params = new URLSearchParams(window.location.search);
const name = params.get("fixture") ?? "";
const now = params.get("now") ?? undefined;
const input = Object.entries(inputs).find(([path]) =>
  path.endsWith(`/${name}.input.json`),
)?.[1];

const root = document.getElementById("root");
if (root === null) throw new Error("Root element #root is missing.");

createRoot(root).render(
  <StrictMode>
    <main className="mx-auto w-full max-w-[1040px] px-4 py-8 text-[#F2F2F0]">
      <h1 className="mb-4 text-[22px] font-medium leading-[1.1]">{name}</h1>
      {input === undefined ? (
        <p role="alert">Unknown fixture: {name}</p>
      ) : (
        <PhaseMap input={input} result={generatePlan(input)} now={now} />
      )}
    </main>
  </StrictMode>,
);
