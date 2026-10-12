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

import { useEffect, useState } from "react";

/** Hash routes only, so the static host never sees the path. */
export type Route = { name: "trip" } | { name: "plan"; id: string };

const PLAN_HASH = /^\/plan\/([^/]+)$/;

/** Returns null for `#/`, empty, and unknown hashes. Those render as the trip form. */
export function parseHash(hash: string): Route | null {
  const withoutHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (withoutHash === "" || withoutHash === "/") return null;
  const path = withoutHash.startsWith("/") ? withoutHash : `/${withoutHash}`;
  if (path === "/trip") return { name: "trip" };
  const match = PLAN_HASH.exec(path);
  const id = match?.[1];
  if (id === undefined || id.length === 0) return null;
  return { name: "plan", id: decodeURIComponent(id) };
}

function initialRoute(): Route {
  return parseHash(window.location.hash) ?? { name: "trip" };
}

function canonicalTripHash(): void {
  const next = `${window.location.pathname}${window.location.search}#/trip`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== next) window.history.replaceState(null, "", next);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(initialRoute);

  useEffect(() => {
    const apply = (): void => {
      const parsed = parseHash(window.location.hash);
      if (parsed === null) {
        canonicalTripHash();
        setRoute({ name: "trip" });
        return;
      }
      setRoute(parsed);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  return route;
}

export function goToPlan(id: string): void {
  window.location.hash = `#/plan/${encodeURIComponent(id)}`;
}
