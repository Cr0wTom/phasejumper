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

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { messages } from "../messages";
import { formatTimeForDisplay, parseTimeText } from "../timeText";
import { controlClass } from "../ui";
import { FieldFrame, TextField } from "./fields";

const QUARTER_HOURS: readonly string[] = Array.from(
  { length: 96 },
  (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  },
);

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const apply = (): void => {
      setCoarse(query.matches);
    };
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
    };
  }, []);
  return coarse;
}

function displayValue(value: string): string {
  const parsed = parseTimeText(value);
  return parsed === null ? "" : formatTimeForDisplay(parsed);
}

/** Index of the option at `value`, or the next 15-minute slot after it. */
function indexAtOrAfter(value: string): number {
  const [hourText, minuteText] = value.split(":");
  const total = Number(hourText) * 60 + Number(minuteText);
  const index = Math.ceil(total / 15);
  if (index >= QUARTER_HOURS.length) return QUARTER_HOURS.length - 1;
  if (index < 0) return 0;
  return index;
}

function indexFor(text: string): number {
  const parsed = parseTimeText(text);
  return parsed === null ? 0 : indexAtOrAfter(parsed);
}

export function TimeField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  const coarse = useCoarsePointer();
  if (coarse) {
    return (
      <TextField
        id={id}
        label={label}
        type="time"
        value={value}
        onChange={onChange}
        error={error}
        hint={hint}
        required={required}
      />
    );
  }
  return (
    <TimeCombobox
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      hint={hint}
      required={required}
    />
  );
}

function TimeCombobox({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required: boolean;
}) {
  const reactId = useId();
  const listId = `${reactId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const emitted = useRef(value);
  const [text, setText] = useState(() => displayValue(value));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? error;
  const activeOptionId = open ? `${listId}-opt-${activeIndex}` : undefined;

  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setText(displayValue(value));
    setLocalError(null);
  }, [value]);

  useEffect(() => {
    if (!open || activeOptionId === undefined) return;
    const list = listRef.current;
    const option = document.getElementById(activeOptionId);
    if (list === null || option === null) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [open, activeOptionId]);

  // A no-op call would clear a form error on blur of an unchanged field.
  function commit(next: string): void {
    emitted.current = next;
    if (next !== value) onChange(next);
  }

  function openList(current: string): void {
    setActiveIndex(indexFor(current));
    setOpen(true);
  }

  function select(hhmm: string): void {
    setLocalError(null);
    setText(formatTimeForDisplay(hhmm));
    commit(hhmm);
    setOpen(false);
  }

  function settle(): void {
    const parsed = parseTimeText(text);
    if (parsed !== null) {
      setLocalError(null);
      setText(formatTimeForDisplay(parsed));
      commit(parsed);
      return;
    }
    if (text.trim() === "") {
      setLocalError(null);
      setText("");
      commit("");
      return;
    }
    if (value !== "" && text === formatTimeForDisplay(value)) {
      setLocalError(null);
      return;
    }
    setLocalError(messages.timeUnreadable);
    commit("");
  }

  function onInput(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setText(next);
    setLocalError(null);
    const parsed = parseTimeText(next);
    if (parsed !== null) {
      commit(parsed);
      if (open) setActiveIndex(indexAtOrAfter(parsed));
      return;
    }
    if (next.trim() === "") commit("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openList(text);
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, QUARTER_HOURS.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      if (!open) return;
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      // Close before the browser moves focus, so the popup is not the next stop.
      setOpen(false);
      settle();
      return;
    }
    if (event.key === "Enter") {
      if (!open) {
        settle();
        return;
      }
      event.preventDefault();
      const chosen = QUARTER_HOURS[activeIndex];
      if (chosen !== undefined) select(chosen);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative min-w-0"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && containerRef.current?.contains(next)) {
          return;
        }
        setOpen(false);
        settle();
      }}
    >
      <FieldFrame id={id} label={label} hint={hint} error={shownError}>
        {(described) => (
          <input
            id={id}
            type="text"
            role="combobox"
            className={controlClass}
            value={text}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={activeOptionId}
            aria-invalid={shownError === undefined ? undefined : true}
            aria-describedby={described}
            aria-required={required ? true : undefined}
            autoComplete="off"
            spellCheck={false}
            inputMode="numeric"
            maxLength={8}
            onChange={onInput}
            onKeyDown={onKeyDown}
            onFocus={() => openList(text)}
            onClick={() => openList(text)}
          />
        )}
      </FieldFrame>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={messages.timeOptions(label)}
          className="pj-card absolute top-full z-10 mt-1 max-h-60 w-full overflow-auto text-15 text-fg"
        >
          {QUARTER_HOURS.map((option, index) => {
            const selected = index === activeIndex;
            return (
              <li
                key={option}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={selected}
                className={
                  selected
                    ? "flex h-9 cursor-pointer items-center bg-accent/15 px-3"
                    : "flex h-9 cursor-pointer items-center px-3"
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(option);
                }}
                onMouseMove={() => setActiveIndex(index)}
              >
                {formatTimeForDisplay(option)}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
