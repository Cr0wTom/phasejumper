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

import { ENGINE_VERSION, generatePlan } from "@phasejumper/engine";
import { useEffect, useState } from "react";
import { getLastPlanId, openPlan, type OpenedPlan } from "../../storage/plans";

export type PlanState = { status: "loading" } | { status: "none" } | OpenedPlan;

/** Opens a plan by id, or the last opened one when no id is given. */
export function usePlan(id: string | undefined): PlanState {
  const [state, setState] = useState<PlanState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      let target = id;
      if (target === undefined) {
        try {
          target = await getLastPlanId();
        } catch (error) {
          if (!cancelled) {
            setState({
              status: "failed",
              reason: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
      }
      if (target === undefined) {
        if (!cancelled) setState({ status: "none" });
        return;
      }
      const opened = await openPlan(target, {
        version: ENGINE_VERSION,
        generate: generatePlan,
      });
      if (!cancelled) setState(opened);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);
  return state;
}
