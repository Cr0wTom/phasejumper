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

import { describe, expect, it } from "vitest";
import {
  EXPECTED_SHA256,
  SOURCE_URL,
  buildAirports,
  downloadCsv,
  gateChecksum,
} from "../build";

const HEADER = [
  "ident",
  "name",
  "latitude_deg",
  "longitude_deg",
  "iso_country",
  "municipality",
  "scheduled_service",
  "icao_code",
  "iata_code",
].join(",");

function csv(lines: readonly string[]): string {
  return [HEADER, ...lines].join("\n");
}

const utc = (): string => "Etc/UTC";

describe("checksum gate", () => {
  it("prints expected and actual and exits non-zero on mismatch", () => {
    const written: string[] = [];
    let code: number | undefined;
    const actual = "f".repeat(64);
    expect(() => {
      gateChecksum(
        actual,
        (text) => {
          written.push(text);
        },
        (exitCode) => {
          code = exitCode;
          throw new Error("exit");
        },
      );
    }).toThrow("exit");
    expect(code).toBe(1);
    const text = written.join("");
    expect(text).toContain("checksum mismatch");
    expect(text).toContain(`expected: ${EXPECTED_SHA256}`);
    expect(text).toContain(`actual: ${actual}`);
  });

  it("accepts the recorded checksum", () => {
    let called = false;
    gateChecksum(
      EXPECTED_SHA256,
      () => {
        called = true;
      },
      () => {
        called = true;
        throw new Error("exit");
      },
    );
    expect(called).toBe(false);
  });
});

describe("download", () => {
  it("requests the pinned URL once and returns the body", async () => {
    const payload = new Uint8Array([97, 98, 99]);
    let calls = 0;
    const result = await downloadCsv(async (url) => {
      calls += 1;
      expect(url).toBe(SOURCE_URL);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: () => Promise.resolve(payload.buffer),
      };
    }, 1000);
    expect(calls).toBe(1);
    expect(result).toEqual({ ok: true, bytes: payload });
  });

  it("does not retry a network failure and returns the reason", async () => {
    let calls = 0;
    const result = await downloadCsv(() => {
      calls += 1;
      return Promise.reject(new Error("network down"));
    }, 1000);
    expect(calls).toBe(1);
    expect(result).toEqual({
      ok: false,
      reason: "download failed: network down",
    });
  });

  it("does not retry an HTTP error and returns the status", async () => {
    let calls = 0;
    const result = await downloadCsv(() => {
      calls += 1;
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
        arrayBuffer: () => Promise.reject(new Error("body should not be read")),
      });
    }, 1000);
    expect(calls).toBe(1);
    expect(result).toEqual({
      ok: false,
      reason: "download failed: HTTP 404 Not Found",
    });
  });

  it("fails when the bounded timeout aborts the request", async () => {
    let calls = 0;
    const result = await downloadCsv((_url, init) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(new Error("The operation was aborted due to timeout"));
        });
      });
    }, 20);
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("download failed:");
      expect(result.reason).toContain("aborted");
    }
  });
});

describe("buildAirports", () => {
  it("keeps scheduled airports that have an IATA code, sorted by code", () => {
    const result = buildAirports(
      csv([
        "KZZZ,Zulu,1,2,US,Town,yes,KZZZ,ZZZ",
        "AAAA,Alpha,3,4,US,City,no,AAAA,AAA",
        "BBBB,Beta,5,6,US,Village,yes,BBBB,",
        "CCCC,Gamma,7,8,US,Hamlet,yes,CCCC,   ",
        'EGLL,"London, Heathrow",51.47,-0.46,GB,"London, England",yes,EGLL,LHR',
      ]),
      utc,
    );
    expect(result).toEqual({
      ok: true,
      airports: [
        {
          iata: "LHR",
          icao: "EGLL",
          name: "London, Heathrow",
          city: "London, England",
          country: "GB",
          lat: 51.47,
          lon: -0.46,
          tz: "Etc/UTC",
        },
        {
          iata: "ZZZ",
          icao: "KZZZ",
          name: "Zulu",
          city: "Town",
          country: "US",
          lat: 1,
          lon: 2,
          tz: "Etc/UTC",
        },
      ],
    });
  });

  it("exits the build with every duplicate IATA code listed", () => {
    const result = buildAirports(
      csv([
        "AAAA,Alpha,10,20,US,City,yes,AAAA,AAA",
        "BBBB,Beta,11,21,US,Town,yes,BBBB,AAA",
        "EGLL,Heathrow,51.5,-0.4,GB,London,yes,EGLL,LHR",
      ]),
      utc,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("duplicate IATA codes:");
      expect(result.reason).toContain(
        "AAA: ident=AAAA name=Alpha; ident=BBBB name=Beta",
      );
      expect(result.reason).not.toContain("LHR");
    }
  });

  it("fails on an empty coordinate instead of treating it as zero", () => {
    const result = buildAirports(
      csv(["EGLL,Heathrow,,-0.46,GB,London,yes,EGLL,LHR"]),
      utc,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid coordinates:");
      expect(result.reason).toContain("LHR");
    }
  });

  it("lists timezone lookup failures", () => {
    const result = buildAirports(
      csv(["LKPR,Prague,50.1,14.26,CZ,Prague,yes,LKPR,PRG"]),
      () => {
        throw new Error("no zone");
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("timezone lookup failed:");
      expect(result.reason).toContain("PRG (50.1, 14.26): no zone");
    }
  });

  it("fails when timezone lookup returns an empty string", () => {
    const result = buildAirports(
      csv(["LKPR,Prague,50.1,14.26,CZ,Prague,yes,LKPR,PRG"]),
      () => "",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("empty timezone");
  });

  it("fails on an unterminated quoted field", () => {
    const result = buildAirports('"unterminated', utc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("unterminated quoted field");
    }
  });

  it("fails when the header is missing a required column", () => {
    const result = buildAirports("name,iata_code\nA,AAA", utc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("CSV header missing columns:");
      expect(result.reason).toContain("ident");
      expect(result.reason).toContain("scheduled_service");
    }
  });

  it("fails when a record has the wrong number of columns", () => {
    const result = buildAirports(csv(["only-one-field"]), utc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(
        "CSV record 2: expected 9 columns, got 1",
      );
    }
  });
});
