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

/**
 * Hash routes only, so the static host never sees the path (§7.2). Share
 * links use `#p=<base64url PlanInput>` (§3.3): fragments are never sent to
 * the host, so a shared plan is never logged.
 */
export type Route =
  | { name: "start" }
  | { name: "settings" }
  | { name: "evidence" }
  | { name: "legal" }
  | { name: "trip"; editId?: string }
  | { name: "plan"; id?: string }
  | { name: "today" }
  | { name: "share"; payload: string };

const PLAN_HASH = /^\/plan(?:\/([^/]+))?$/;
const TRIP_HASH = /^\/trip(?:\/([^/]+))?$/;

/** Returns null for unknown hashes, which go to the Start screen. */
export function parseHash(hash: string): Route | null {
  const withoutHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (withoutHash.startsWith("p=")) {
    const payload = withoutHash.slice(2);
    return payload.length === 0 ? null : { name: "share", payload };
  }
  if (withoutHash === "" || withoutHash === "/") return { name: "start" };
  const path = withoutHash.startsWith("/") ? withoutHash : `/${withoutHash}`;
  if (path === "/today") return { name: "today" };
  if (path === "/settings") return { name: "settings" };
  if (path === "/evidence") return { name: "evidence" };
  if (path === "/legal") return { name: "legal" };
  const plan = PLAN_HASH.exec(path);
  if (plan !== null) {
    const id = plan[1];
    return id === undefined
      ? { name: "plan" }
      : { name: "plan", id: decodeURIComponent(id) };
  }
  const trip = TRIP_HASH.exec(path);
  if (trip !== null) {
    const id = trip[1];
    return id === undefined
      ? { name: "trip" }
      : { name: "trip", editId: decodeURIComponent(id) };
  }
  return null;
}

function initialRoute(): Route {
  return parseHash(window.location.hash) ?? { name: "start" };
}

function canonicalStartHash(): void {
  const next = `${window.location.pathname}${window.location.search}#/`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== next) window.history.replaceState(null, "", next);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(initialRoute);

  useEffect(() => {
    const apply = (): void => {
      const parsed = parseHash(window.location.hash);
      if (parsed === null) {
        canonicalStartHash();
        setRoute({ name: "start" });
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

export function planHash(id: string): string {
  return `#/plan/${encodeURIComponent(id)}`;
}

export function goToPlan(id: string): void {
  window.location.hash = planHash(id);
}
