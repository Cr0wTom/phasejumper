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
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  airportLabel,
  searchAirports,
  type SearchableAirport,
} from "../airports/searchAirports";
import { messages } from "../messages";
import { controlClass, errorClass, hintClass, labelClass } from "../ui";

export function AirportCombobox({
  id,
  label,
  query,
  airports,
  disabled,
  error,
  review,
  onQueryChange,
  onSelect,
}: {
  id: string;
  label: string;
  query: string;
  airports: readonly SearchableAirport[] | null;
  disabled: boolean;
  error?: string;
  review?: string;
  onQueryChange: (query: string) => void;
  onSelect: (airport: SearchableAirport) => void;
}) {
  const reactId = useId();
  const listId = `${reactId}-listbox`;
  const hintId = `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const statusId = `${reactId}-status`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const search = useMemo(
    () =>
      airports === null
        ? { results: [], total: 0 }
        : searchAirports(airports, query),
    [airports, query],
  );
  const results = search.results;
  const expanded = open && query.trim().length > 0 && !disabled;
  const active =
    results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);
  const activeId =
    expanded && results[active] !== undefined
      ? `${reactId}-opt-${results[active].iata}`
      : undefined;

  useEffect(() => {
    if (activeId === undefined) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function commit(airport: SearchableAirport): void {
    onSelect(airport);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!expanded) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((index) =>
        results.length === 0 ? 0 : Math.min(index + 1, results.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!expanded) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Home" && expanded) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && expanded) {
      event.preventDefault();
      setActiveIndex(Math.max(results.length - 1, 0));
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && expanded && results.length > 0) {
      event.preventDefault();
      const chosen = results[active] ?? results[0];
      if (chosen !== undefined) commit(chosen);
    }
  }

  const reviewId = review === undefined ? undefined : `${id}-review`;
  const described = [hintId, reviewId, errorId].filter(
    (part) => part !== undefined,
  );
  const liveText = !expanded
    ? ""
    : results.length === 0
      ? messages.comboboxNoMatches
      : search.total > results.length
        ? messages.airportShowing(results.length)
        : messages.airportMatches(results.length);

  return (
    <div
      ref={containerRef}
      className="relative flex min-w-0 flex-col gap-2"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && containerRef.current?.contains(next)) {
          return;
        }
        setOpen(false);
      }}
    >
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        className={
          review === undefined
            ? controlClass
            : `${controlClass} ring-1 ring-inset ring-[#F2F2F0]`
        }
        value={query}
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={expanded && results.length > 0}
        aria-controls={expanded && results.length > 0 ? listId : undefined}
        aria-activedescendant={activeId}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={described.join(" ")}
        aria-required="true"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (query.trim().length > 0) setOpen(true);
        }}
      />
      <p id={hintId} className={hintClass}>
        {messages.comboboxHint}
      </p>
      {reviewId === undefined || review === undefined ? null : (
        <p id={reviewId} className={hintClass}>
          {review}
        </p>
      )}
      {errorId === undefined || error === undefined ? null : (
        <p id={errorId} role="alert" className={errorClass}>
          {error}
        </p>
      )}
      <p id={statusId} className="sr-only" aria-live="polite">
        {liveText}
      </p>
      {expanded && results.length === 0 ? (
        <p
          aria-hidden="true"
          className="absolute top-full z-10 mt-1 w-full rounded-[10px] border border-[#26262B] bg-[#141417] p-2 text-[13px] leading-[1.45] text-[#8B8B93] shadow-[0_8px_24px_rgba(0,0,0,.35)]"
        >
          {messages.comboboxNoMatches}
        </p>
      ) : null}
      {expanded && results.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-10 mt-1 max-h-60 w-full overflow-auto rounded-[10px] border border-[#26262B] bg-[#141417] py-1 shadow-[0_8px_24px_rgba(0,0,0,.35)]"
        >
          {results.map((airport, index) => {
            const selected = index === active;
            return (
              <li
                key={airport.iata}
                id={`${reactId}-opt-${airport.iata}`}
                role="option"
                aria-selected={selected}
                className={
                  selected
                    ? "cursor-pointer bg-[#26262B] px-2 py-2 break-words"
                    : "cursor-pointer px-2 py-2 break-words"
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(airport);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {airportLabel(airport)}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
