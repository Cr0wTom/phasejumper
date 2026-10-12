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

import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dev-dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/blob-report/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // §0 rule 2 / §3.2: the engine and the itinerary parser are pure —
    // no I/O, no wall clock.
    files: ["packages/engine/src/**/*.ts", "packages/itinerary/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "node:*",
            "fs",
            "path",
            "os",
            "http",
            "https",
            "child_process",
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        "process",
        "fetch",
        "XMLHttpRequest",
        "localStorage",
        "sessionStorage",
        "indexedDB",
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "now",
          message: "Inject the clock (PlanInput.now).",
        },
        {
          object: "Math",
          property: "random",
          message: "The engine is deterministic.",
        },
        {
          object: "Temporal",
          property: "Now",
          message: "Inject the clock (PlanInput.now).",
        },
      ],
    },
  },
);
