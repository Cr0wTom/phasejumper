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

import { useState } from "react";
import { legalMessages } from "../messages";
import { errorClass, h2Class, linkClass, primaryButtonClass } from "../ui";
import { CheckboxField } from "./fields";

export function LegalGate({
  outdated,
  onContinue,
}: {
  outdated: boolean;
  onContinue: () => void;
}) {
  const [wellness, setWellness] = useState(false);
  const [age, setAge] = useState(false);
  const [needBoth, setNeedBoth] = useState(false);

  return (
    <section aria-labelledby="legal-gate-title" className="flex flex-col gap-4">
      <h2 id="legal-gate-title" className={h2Class}>
        {outdated ? legalMessages.updatedHeading : legalMessages.heading}
      </h2>
      <p>{outdated ? legalMessages.updatedIntro : legalMessages.intro}</p>
      <p>
        <a
          className={linkClass}
          href="#/legal"
          target="_blank"
          rel="noopener noreferrer"
        >
          {legalMessages.readTerms}
        </a>
      </p>
      <p>
        <a
          className={linkClass}
          href="#/legal"
          target="_blank"
          rel="noopener noreferrer"
        >
          {legalMessages.readPrivacy}
        </a>
      </p>
      <CheckboxField
        label={legalMessages.acceptWellness}
        checked={wellness}
        onChange={setWellness}
      />
      <CheckboxField
        label={legalMessages.acceptAge}
        checked={age}
        onChange={setAge}
      />
      {needBoth ? (
        <p role="alert" className={errorClass}>
          {legalMessages.needBoth}
        </p>
      ) : null}
      <button
        type="button"
        className={`${primaryButtonClass} self-start`}
        onClick={() => {
          if (!wellness || !age) {
            setNeedBoth(true);
            return;
          }
          onContinue();
        }}
      >
        {legalMessages.continue}
      </button>
    </section>
  );
}
