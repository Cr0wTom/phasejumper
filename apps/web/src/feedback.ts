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

import { feedbackMessages } from "./messages";

/**
 * mailto URL for a Settings feedback link.
 * Spaces are %20. A bug body is the given report text, or the unavailable
 * line; a feature body never includes it. This function adds nothing else.
 */
export function feedbackMailto(
  kind: "bug" | "feature",
  report: string | null,
): string {
  const subject =
    kind === "bug"
      ? feedbackMessages.bugSubject
      : feedbackMessages.featureSubject;
  const body =
    kind === "bug"
      ? feedbackMessages.bugBody(report ?? feedbackMessages.reportUnavailable)
      : feedbackMessages.featureBody;
  return `mailto:${feedbackMessages.address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
