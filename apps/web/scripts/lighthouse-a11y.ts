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

// Accessibility gate for the built trip page. Lighthouse 12 has no PWA
// category; installability is checked in e2e/pwa.spec.ts. Run from apps/web
// after `pnpm build`: node --experimental-strip-types scripts/lighthouse-a11y.ts

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { preview } from "vite";

const MINIMUM_SCORE = 95;
const PORT = 4174;

interface LighthouseAudit {
  title?: string;
  score?: number | null;
  scoreDisplayMode?: string;
}

interface LighthouseReport {
  categories?: {
    accessibility?: {
      score?: number | null;
      auditRefs?: { id: string; weight?: number }[];
    };
  };
  audits?: Record<string, LighthouseAudit>;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const indexHtml = join(root, "dist", "index.html");
if (!existsSync(indexHtml)) {
  fail("Build the web app before the accessibility check.");
}

const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve("lighthouse/package.json")),
  "cli/index.js",
);
const base = process.env.VITE_BASE_PATH || "/phasejumper/";
const url = `http://127.0.0.1:${PORT}${base}#/trip`;

const server = await preview({
  root,
  configFile: join(root, "vite.config.ts"),
  preview: { host: "127.0.0.1", port: PORT, strictPort: true },
});

let stdout = "";
let stderr = "";
try {
  const child = spawn(
    process.execPath,
    [
      cli,
      url,
      "--only-categories=accessibility",
      "--output=json",
      "--output-path=stdout",
      "--quiet",
      "--no-enable-error-reporting",
      "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
    ],
    {
      cwd: root,
      env: { ...process.env, CHROME_PATH: chromium.executablePath() },
    },
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Lighthouse timed out."));
    }, 120_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    fail(`Lighthouse exited ${exitCode}.\n${stderr}\n${stdout.slice(0, 500)}`);
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  fail(`${reason}\n${stderr}`);
} finally {
  await server.close();
}

const jsonStart = stdout.indexOf("{");
if (jsonStart < 0) fail(`Lighthouse did not return JSON.\n${stderr}`);
let report: LighthouseReport;
try {
  report = JSON.parse(stdout.slice(jsonStart)) as LighthouseReport;
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  fail(`Could not read the Lighthouse report (${reason}).`);
}

const score = report.categories?.accessibility?.score;
if (typeof score !== "number") {
  fail("Lighthouse did not return an accessibility score.");
}
const percent = score * 100;
process.stderr.write(`accessibility ${percent.toFixed(0)}\n`);
if (percent < MINIMUM_SCORE) {
  const refs = report.categories?.accessibility?.auditRefs ?? [];
  for (const ref of refs) {
    const audit = report.audits?.[ref.id];
    if (
      audit === undefined ||
      audit.score === null ||
      audit.score === undefined
    ) {
      continue;
    }
    if (audit.score >= 1 || (ref.weight ?? 0) === 0) continue;
    process.stderr.write(`${ref.id}: ${audit.score} ${audit.title ?? ""}\n`);
  }
  fail(`Accessibility score ${percent.toFixed(0)} is below ${MINIMUM_SCORE}.`);
}
