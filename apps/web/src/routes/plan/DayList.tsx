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

// Per-day detail (§3.1 #3): every block with its icon, local time and
// reason. Icons are allowed here and in the legend, never in the grid (§11.1).

import type { PlanResult } from "@phasejumper/engine";
import { shortDate, wallTime, zoneName } from "../../format";
import { ICON_SIZE, Icon, KIND_ICON } from "../../icons";
import { phaseMapMessages, planMessages as m } from "../../messages";

const POINT = new Set(["CAFFEINE_STOP", "MEAL", "MELATONIN_WINDOW"]);

export function DayList({ result }: { result: PlanResult }) {
  return (
    <ol className="flex flex-col gap-4">
      {result.days.map((day, index) => {
        const warnings = result.warnings.filter((w) => w.dayIndex === index);
        const advice = result.staticAdvice.filter((a) => a.dayIndex === index);
        const dropped = result.droppedBlocks.filter(
          (d) => d.dayIndex === index,
        );
        return (
          <li
            key={day.date + index}
            className="rounded-surface border border-line bg-surface p-4"
          >
            <h3 className="text-17 font-medium leading-display">
              {m.dayHeading(shortDate(day.date), index)}
            </h3>
            {warnings.length === 0 ? null : (
              <ul className="mt-2 flex flex-col gap-1 text-13 leading-body text-fg-muted">
                {warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            )}
            <ul className="mt-3 flex flex-col gap-3">
              {day.blocks.map((block, i) => {
                const icon = KIND_ICON[block.kind];
                const zone = zoneName(block.localTz);
                const from = wallTime(block.startUtc, block.localTz);
                const time = POINT.has(block.kind)
                  ? m.timePoint(from, zone)
                  : m.timeRange(
                      from,
                      wallTime(block.endUtc, block.localTz),
                      zone,
                    );
                return (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 shrink-0 text-fg-muted">
                      {icon === undefined ? (
                        <span className="inline-block w-5" />
                      ) : (
                        <Icon name={icon} size={ICON_SIZE} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {phaseMapMessages.kinds[block.kind]}{" "}
                        <span className="font-mono text-13 font-normal text-fg-muted">
                          {time}
                        </span>
                      </p>
                      <p className="text-13 leading-body text-fg-muted">
                        {block.reason}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {advice.length === 0 ? null : (
              <div className="mt-3">
                <h4 className="text-13 font-medium">{m.adviceHeading}</h4>
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-13 leading-body text-fg-muted">
                  {advice.map((a, i) => (
                    <li key={i}>{a.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {dropped.length === 0 ? null : (
              <div className="mt-3">
                <h4 className="text-13 font-medium">{m.droppedHeading}</h4>
                <ul className="mt-1 flex flex-col gap-1 text-13 leading-body text-fg-muted">
                  {dropped.map((d, i) => (
                    <li key={i}>{d.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
