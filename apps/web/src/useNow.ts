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
import { currentInstant } from "./clock";

/**
 * The current instant, re-read every `intervalMs` and whenever the tab comes
 * back (visibility or focus), so a sleeping tab never shows a stale time.
 */
export function useNow(intervalMs = 30_000): string {
  const [now, setNow] = useState(currentInstant);
  useEffect(() => {
    const tick = (): void => setNow(currentInstant());
    const id = window.setInterval(tick, intervalMs);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [intervalMs]);
  return now;
}
