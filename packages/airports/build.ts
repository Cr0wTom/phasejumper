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

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import tzlookup from "@photostructure/tz-lookup";

interface HttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Injectable for tests; the real run passes the global fetch. */
type FetchLike = (
  input: string,
  init: { signal: AbortSignal },
) => Promise<HttpResponse>;

/** Pinned OurAirports dump. Hand-run only; not part of pnpm build, test, or CI. */
export const SOURCE_URL =
  "https://raw.githubusercontent.com/davidmegginson/ourairports-data/03565b612558de9d9ec27ca7a1e99a4f9d2619ba/airports.csv";

/** SHA-256 of the raw bytes at SOURCE_URL. */
export const EXPECTED_SHA256 =
  "eb99a7ca14a63612b82d1c33694b2f8963b7cc42b7a6128142e8f1b9c5be23e5";

/** One attempt. The pinned CSV is about 13 MB. */
export const DOWNLOAD_TIMEOUT_MS = 60_000;

const MAX_GZIPPED_BYTES = 600 * 1024;

const REQUIRED_COLUMNS = [
  "ident",
  "name",
  "latitude_deg",
  "longitude_deg",
  "iso_country",
  "municipality",
  "scheduled_service",
  "icao_code",
  "iata_code",
] as const;

type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

export interface BuiltAirport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
}

interface Candidate {
  ident: string;
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export type BuildAirportsResult =
  { ok: true; airports: BuiltAirport[] } | { ok: false; reason: string };

export type DownloadResult =
  { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

type CsvResult = { ok: true; rows: string[][] } | { ok: false; reason: string };

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message === "" ? err.name : err.message;
  }
  return String(err);
}

function compareIata(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function reportAndExit(
  reason: string,
  write: (text: string) => void,
  exit: (code: number) => never,
): never {
  write(`${reason}\n`);
  return exit(1);
}

function die(reason: string): never {
  return reportAndExit(
    reason,
    (text) => {
      process.stderr.write(text);
    },
    (code) => process.exit(code),
  );
}

export function gateChecksum(
  actualHex: string,
  write: (text: string) => void,
  exit: (code: number) => never,
): void {
  if (actualHex === EXPECTED_SHA256) return;
  reportAndExit(
    `checksum mismatch\nexpected: ${EXPECTED_SHA256}\nactual: ${actualHex}`,
    write,
    exit,
  );
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function downloadCsv(
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<DownloadResult> {
  try {
    const response = await fetchImpl(SOURCE_URL, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const status = `HTTP ${response.status} ${response.statusText}`.trim();
      return { ok: false, reason: `download failed: ${status}` };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { ok: true, bytes };
  } catch (err: unknown) {
    return { ok: false, reason: `download failed: ${errorMessage(err)}` };
  }
}

function decodeUtf8(
  bytes: Uint8Array,
): { ok: true; text: string } | { ok: false; reason: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
    return { ok: true, text };
  } catch (err: unknown) {
    return { ok: false, reason: `CSV decode failed: ${errorMessage(err)}` };
  }
}

function parseCsv(text: string): CsvResult {
  if (text.trim() === "") {
    return { ok: false, reason: "CSV parse error: file is empty" };
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let chars: string[] = [];
  let inQuotes = false;

  const takeField = (): string => {
    const value = chars.join("");
    chars = [];
    return value;
  };

  const finishRecord = (): void => {
    row.push(takeField());
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] ?? "";
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          chars.push('"');
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        chars.push(c);
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(takeField());
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      finishRecord();
      continue;
    }
    chars.push(c);
  }

  if (inQuotes) {
    return { ok: false, reason: "CSV parse error: unterminated quoted field" };
  }
  if (chars.length > 0 || row.length > 0) finishRecord();
  if (rows.length === 0) {
    return { ok: false, reason: "CSV parse error: missing header" };
  }
  return { ok: true, rows };
}

function headerMap(
  header: readonly string[],
):
  | { ok: true; columns: ReadonlyMap<RequiredColumn, number> }
  | { ok: false; reason: string } {
  const columns = new Map<RequiredColumn, number>();
  const missing: string[] = [];
  for (const name of REQUIRED_COLUMNS) {
    const index = header.indexOf(name);
    if (index === -1) missing.push(name);
    else columns.set(name, index);
  }
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `CSV header missing columns: ${missing.join(", ")}`,
    };
  }
  return { ok: true, columns };
}

function column(
  columns: ReadonlyMap<RequiredColumn, number>,
  row: readonly string[],
  name: RequiredColumn,
): string {
  const index = columns.get(name);
  if (index === undefined) {
    throw new Error(`CSV header missing column: ${name}`);
  }
  return row[index] ?? "";
}

function parseCoordinate(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function duplicateReason(
  byIata: ReadonlyMap<string, readonly Candidate[]>,
): string | undefined {
  const iatas = [...byIata.keys()]
    .filter((iata) => {
      const group = byIata.get(iata);
      return group !== undefined && group.length > 1;
    })
    .sort(compareIata);
  if (iatas.length === 0) return undefined;
  const lines = iatas.map((iata) => {
    const group = byIata.get(iata) ?? [];
    const described = group
      .map((airport) => `ident=${airport.ident} name=${airport.name}`)
      .join("; ");
    return `${iata}: ${described}`;
  });
  return `duplicate IATA codes:\n${lines.join("\n")}`;
}

export function buildAirports(
  csv: string,
  lookupTz: (lat: number, lon: number) => string,
): BuildAirportsResult {
  const parsed = parseCsv(csv);
  if (!parsed.ok) return parsed;

  const header = parsed.rows[0];
  if (header === undefined) {
    return { ok: false, reason: "CSV parse error: missing header" };
  }
  const mapped = headerMap(header);
  if (!mapped.ok) return mapped;

  const byIata = new Map<string, Candidate[]>();
  const coordinateErrors: string[] = [];

  for (let r = 1; r < parsed.rows.length; r += 1) {
    const row = parsed.rows[r];
    if (row === undefined) continue;
    if (row.length !== header.length) {
      return {
        ok: false,
        reason: `CSV record ${r + 1}: expected ${header.length} columns, got ${row.length}`,
      };
    }
    if (column(mapped.columns, row, "scheduled_service") !== "yes") continue;
    const iata = column(mapped.columns, row, "iata_code").trim();
    if (iata === "") continue;

    const ident = column(mapped.columns, row, "ident");
    const name = column(mapped.columns, row, "name");
    const lat = parseCoordinate(column(mapped.columns, row, "latitude_deg"));
    const lon = parseCoordinate(column(mapped.columns, row, "longitude_deg"));
    if (lat === undefined || lon === undefined) {
      coordinateErrors.push(
        `${iata}: ident=${ident} name=${name} latitude=${column(mapped.columns, row, "latitude_deg")} longitude=${column(mapped.columns, row, "longitude_deg")}`,
      );
      continue;
    }

    const candidate: Candidate = {
      ident,
      iata,
      icao: column(mapped.columns, row, "icao_code"),
      name,
      city: column(mapped.columns, row, "municipality"),
      country: column(mapped.columns, row, "iso_country"),
      lat,
      lon,
    };
    const group = byIata.get(iata);
    if (group === undefined) byIata.set(iata, [candidate]);
    else group.push(candidate);
  }

  if (coordinateErrors.length > 0) {
    coordinateErrors.sort(compareIata);
    return {
      ok: false,
      reason: `invalid coordinates:\n${coordinateErrors.join("\n")}`,
    };
  }

  const duplicates = duplicateReason(byIata);
  if (duplicates !== undefined) return { ok: false, reason: duplicates };

  const tzErrors: string[] = [];
  const airports: BuiltAirport[] = [];
  const ordered = [...byIata.values()].sort((a, b) => {
    const left = a[0]?.iata ?? "";
    const right = b[0]?.iata ?? "";
    return compareIata(left, right);
  });

  for (const group of ordered) {
    const airport = group[0];
    if (airport === undefined) continue;
    try {
      const tz: unknown = lookupTz(airport.lat, airport.lon);
      if (typeof tz !== "string" || tz === "") {
        tzErrors.push(
          `${airport.iata} (${airport.lat}, ${airport.lon}): empty timezone`,
        );
        continue;
      }
      airports.push({
        iata: airport.iata,
        icao: airport.icao,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        lat: airport.lat,
        lon: airport.lon,
        tz,
      });
    } catch (err: unknown) {
      tzErrors.push(
        `${airport.iata} (${airport.lat}, ${airport.lon}): ${errorMessage(err)}`,
      );
    }
  }

  if (tzErrors.length > 0) {
    tzErrors.sort(compareIata);
    return {
      ok: false,
      reason: `timezone lookup failed:\n${tzErrors.join("\n")}`,
    };
  }

  return { ok: true, airports };
}

function serializeAirports(airports: readonly BuiltAirport[]): string {
  const out: Record<string, BuiltAirport> = {};
  for (const airport of airports) {
    out[airport.iata] = {
      iata: airport.iata,
      icao: airport.icao,
      name: airport.name,
      city: airport.city,
      country: airport.country,
      lat: airport.lat,
      lon: airport.lon,
      tz: airport.tz,
    };
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

function assertGzippedSize(json: string): void {
  const size = gzipSync(json).byteLength;
  if (size > MAX_GZIPPED_BYTES) {
    die(
      `airports.json gzipped size ${size} bytes exceeds ${MAX_GZIPPED_BYTES} bytes`,
    );
  }
}

async function main(): Promise<void> {
  const downloaded = await downloadCsv(fetch, DOWNLOAD_TIMEOUT_MS);
  if (!downloaded.ok) die(downloaded.reason);

  gateChecksum(
    sha256Hex(downloaded.bytes),
    (text) => {
      process.stderr.write(text);
    },
    (code) => process.exit(code),
  );

  const decoded = decodeUtf8(downloaded.bytes);
  if (!decoded.ok) die(decoded.reason);

  const built = buildAirports(decoded.text, tzlookup);
  if (!built.ok) die(built.reason);

  const json = serializeAirports(built.airports);
  assertGzippedSize(json);
  const outputPath = fileURLToPath(
    new URL("./src/airports.json", import.meta.url),
  );
  try {
    await writeFile(outputPath, json, "utf8");
  } catch (err: unknown) {
    die(`failed to write airports.json: ${errorMessage(err)}`);
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined || entry === "") return false;
  const entryPath = realpathSync(fileURLToPath(pathToFileURL(entry)));
  const modulePath = realpathSync(fileURLToPath(import.meta.url));
  return entryPath === modulePath;
}

if (isDirectRun()) {
  main().catch((err: unknown) => {
    process.stderr.write(`${errorMessage(err)}\n`);
    process.exit(1);
  });
}
