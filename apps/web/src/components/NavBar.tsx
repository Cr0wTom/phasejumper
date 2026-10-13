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

// Navigation (§5): a bottom tab bar on phones, a left rail from 768 px.
// Plan, Today, New trip and Settings.

import { planMessages as m } from "../messages";
import type { Route } from "../router";

const ITEMS = [
  { key: "plan", href: "#/plan", label: m.nav.plan },
  { key: "today", href: "#/today", label: m.nav.today },
  { key: "trip", href: "#/trip", label: m.nav.newTrip },
  { key: "settings", href: "#/settings", label: m.nav.settings },
] as const;

export function NavBar({ route }: { route: Route }) {
  const active =
    route.name === "share"
      ? "plan"
      : route.name === "evidence" || route.name === "legal"
        ? "settings"
        : route.name;
  return (
    <nav aria-label={m.nav.label} className="pj-nav">
      <ul>
        {ITEMS.map((item) => (
          <li key={item.key}>
            <a
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              className="pj-nav-link"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
