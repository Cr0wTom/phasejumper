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

import type { ReactNode } from "react";
import {
  controlClass,
  errorClass,
  hintClass,
  labelClass,
  checkClass,
} from "../ui";

function describedBy(ids: Array<string | undefined>): string | undefined {
  const present = ids.filter((id): id is string => id !== undefined);
  return present.length === 0 ? undefined : present.join(" ");
}

function FieldFrame({
  id,
  label,
  hint,
  review,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  review?: string;
  error?: string;
  children: (described: string | undefined) => ReactNode;
}) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const reviewId = review === undefined ? undefined : `${id}-review`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children(describedBy([hintId, reviewId, errorId]))}
      {hintId === undefined ? null : (
        <p id={hintId} className={hintClass}>
          {hint}
        </p>
      )}
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
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  review,
  required = false,
  inputMode,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  review?: string;
  required?: boolean;
  inputMode?: "text" | "decimal";
  /** "date" and "time" use the platform's own picker (values YYYY-MM-DD, HH:MM). */
  type?: "text" | "date" | "time";
}) {
  return (
    <FieldFrame id={id} label={label} hint={hint} review={review} error={error}>
      {(described) => (
        <input
          id={id}
          type={type}
          className={
            review === undefined
              ? controlClass
              : `${controlClass} ring-1 ring-inset ring-[#F2F2F0]`
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={described}
          aria-required={required ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          inputMode={type === "text" ? inputMode : undefined}
        />
      )}
    </FieldFrame>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  error,
  hint,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      {(described) => (
        <select
          id={id}
          className={controlClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={described}
          aria-required={required ? true : undefined}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldFrame>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[15px] leading-[1.45]">
      <input
        type="checkbox"
        className={checkClass}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
