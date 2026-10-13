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
import notice from "../../../NOTICE?raw";
import webPkg from "../package.json";
import airportsPkg from "../../../packages/airports/package.json";
import enginePkg from "../../../packages/engine/package.json";
import icalPkg from "../../../packages/ical/package.json";
import itineraryPkg from "../../../packages/itinerary/package.json";

function depNames(pkg: object): string[] {
  if (!("dependencies" in pkg) || pkg.dependencies === undefined) return [];
  if (typeof pkg.dependencies !== "object" || pkg.dependencies === null) {
    return [];
  }
  return Object.keys(pkg.dependencies as Record<string, string>);
}

describe("NOTICE", () => {
  it("lists every runtime dependency", () => {
    const missing = [
      ...new Set([
        ...depNames(webPkg),
        ...depNames(airportsPkg),
        ...depNames(enginePkg),
        ...depNames(icalPkg),
        ...depNames(itineraryPkg),
      ]),
    ]
      .sort()
      .filter((name) => !notice.includes(name));
    expect(missing).toEqual([]);
  });
});
