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

// The theme switch lives in Settings (T13).
export function AppHeader() {
  return (
    <header className="pj-header">
      <div className="pj-header-bar">
        <a className="pj-brand" href="#/">
          {messages.title}
        </a>
      </div>
    </header>
  );
}
