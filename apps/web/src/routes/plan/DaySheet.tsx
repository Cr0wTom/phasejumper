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

// The day sheet: one day's detail in a modal panel, opened from the day
// chips or a row of the phase map. A bottom sheet on phones, with the whole
// day drawn in the space above it; a side panel from 768 px. Uses <dialog>
// for focus handling and Escape.

import type { PlanInput, PlanResult } from "@phasejumper/engine";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { shortDate } from "../../format";
import { DayView } from "../../components/PhaseMap/DayView";
import { ICON_STROKE } from "../../icons";
import { planMessages as m } from "../../messages";
import { focusRing } from "../../ui";
import { DayDetail } from "./DayList";

const iconButton = `pj-btn pj-icon-btn ${focusRing}`;

export function DaySheet({
  input,
  result,
  index,
  onIndex,
  onClose,
}: {
  input: PlanInput;
  result: PlanResult;
  /** The open day, or null when the sheet is closed. */
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const day = index === null ? undefined : result.days[index];
  // The moment touched on the drawn day; cleared when the day changes.
  const [activeAt, setActiveAt] = useState<string | null>(null);
  useEffect(() => setActiveAt(null), [index]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (day !== undefined && !dialog.open) dialog.showModal();
    if (day === undefined && dialog.open) dialog.close();
  }, [day]);

  const last = result.days.length - 1;
  return (
    <dialog
      ref={ref}
      className="pj-sheet"
      aria-labelledby="day-sheet-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog box itself) closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {day === undefined || index === null ? null : (
        <div className="pj-sheet-day">
          <DayView
            input={input}
            result={result}
            date={day.date}
            onMoment={setActiveAt}
          />
        </div>
      )}
      {day === undefined || index === null ? null : (
        <div className="pj-sheet-panel">
          <div className="flex items-center gap-2 border-b border-line p-4">
            <h2
              id="day-sheet-title"
              className="min-w-0 flex-1 text-17 font-semibold tracking-[-0.01em]"
            >
              {m.dayHeading(shortDate(day.date), index)}
            </h2>
            <button
              type="button"
              className={iconButton}
              aria-label={m.previousDay}
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              <ChevronLeft
                size={18}
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={m.nextDay}
              disabled={index === last}
              onClick={() => onIndex(index + 1)}
            >
              <ChevronRight
                size={18}
                strokeWidth={ICON_STROKE}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={m.closeDay}
              onClick={onClose}
            >
              <X size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
            </button>
          </div>
          <div
            className="overflow-y-auto p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            // Focusable so keyboard users can scroll a long day.
            tabIndex={0}
            role="region"
            aria-labelledby="day-sheet-title"
          >
            <DayDetail result={result} index={index} activeAt={activeAt} />
          </div>
        </div>
      )}
    </dialog>
  );
}
