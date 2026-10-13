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

import privacy from "../../../../../PRIVACY.md?raw";
import terms from "../../../../../TERMS.md?raw";
import { Markdown } from "../../components/Markdown";
import { legalMessages, messages } from "../../messages";
import { h1Class, pageClass } from "../../ui";

export function LegalScreen() {
  return (
    <main className={pageClass}>
      <h1 className={h1Class}>{legalMessages.pageHeading}</h1>
      <article className="mt-8 max-w-[70ch]">
        <Markdown source={terms} headingOffset={1} />
      </article>
      <article className="mt-8 max-w-[70ch]">
        <Markdown source={privacy} headingOffset={1} />
      </article>
      <footer className="mt-8 border-t border-line pt-4 text-13 leading-body text-fg-muted">
        <p>{messages.footer}</p>
      </footer>
    </main>
  );
}
