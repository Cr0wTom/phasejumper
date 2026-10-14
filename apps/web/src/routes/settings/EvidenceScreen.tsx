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

// The evidence page (§1.1, paraphrased): docs/EVIDENCE.md, bundled at build
// time and rendered on the device. Its links open only when tapped.

import { useEffect, useRef } from "react";
import evidence from "../../../../../docs/EVIDENCE.md?raw";
import { Markdown } from "../../components/Markdown";
import { PhaseMapKey } from "../../components/PhaseMap/legend";
import {
  messages,
  phaseMapMessages,
  settingsMessages as m,
} from "../../messages";
import { linkClass, pageClass } from "../../ui";

export function EvidenceScreen({ section }: { section?: "key" }) {
  const keyRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (section === "key") keyRef.current?.scrollIntoView();
  }, [section]);
  return (
    <main className={pageClass}>
      <p className="mb-4">
        <a className={linkClass} href="#/settings">
          {m.backToSettings}
        </a>
      </p>
      <article className="max-w-[70ch]">
        <Markdown source={evidence} />
      </article>
      <section
        ref={keyRef}
        aria-labelledby="phase-map-key"
        className="mt-10 max-w-[70ch] scroll-mt-24"
      >
        <h2 id="phase-map-key" className="text-17 font-medium leading-display">
          {phaseMapMessages.keyHeading}
        </h2>
        <p className="mt-2 text-15 leading-body text-fg-muted">
          {phaseMapMessages.keyIntro}
        </p>
        <div className="mt-4">
          <PhaseMapKey />
        </div>
      </section>
      <footer className="mt-8 border-t border-line pt-4 text-13 leading-body text-fg-muted">
        <p>{messages.footer}</p>
      </footer>
    </main>
  );
}
