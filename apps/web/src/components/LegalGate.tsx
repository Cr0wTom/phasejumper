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

import { messages } from "../messages";
import { buttonClass, h3Class } from "../ui";

/** Placeholder until T12 replaces it. Shown only when legal.acceptanceGate is on. */
export function LegalGate({ onContinue }: { onContinue: () => void }) {
  return (
    <section aria-labelledby="legal-gate-title" className="flex flex-col gap-4">
      <h3 id="legal-gate-title" className={h3Class}>
        {messages.legalGateTitle}
      </h3>
      <p>{messages.legalGateBody}</p>
      <button type="button" className={buttonClass} onClick={onContinue}>
        {messages.legalGateContinue}
      </button>
    </section>
  );
}
