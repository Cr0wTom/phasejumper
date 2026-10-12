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

export const THEME_STORAGE_KEY = "pj.theme";

export type Theme = "dark" | "light";

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function preferredTheme(): Theme {
  try {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch {
    // matchMedia is unavailable; dark is the default.
  }
  return "dark";
}

export function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Call before the first React render. */
export function applyInitialTheme(): void {
  const theme = storedTheme() ?? preferredTheme();
  document.documentElement.dataset.theme = theme;
}

export function toggleTheme(): Theme {
  const next: Theme = readTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // The choice applies for this view. This device cannot store it.
  }
  return next;
}
