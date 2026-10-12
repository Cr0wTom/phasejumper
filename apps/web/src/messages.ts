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

export const messages = {
  title: "PhaseJumper",
  themeDark: "Dark theme",
  updateReady: "A new version is ready.",
  updateReload: "Reload",
  tripHeading: "Plan a trip",
  youHeading: "You",
  flightsHeading: "Flights",
  constraintsHeading: "Constraints",
  bedtime: "Bedtime",
  bedtimeHint: "The time you usually go to bed at home.",
  wake: "Wake time",
  wakeHint: "The time you usually wake at home.",
  chronotype: "Chronotype",
  chronotypeMorning: "Morning",
  chronotypeIntermediate: "Intermediate",
  chronotypeEvening: "Evening",
  sleepNeed: "Hours of sleep you need",
  sleepNeedHint: "Use a number, such as 8 or 7.5.",
  caffeine: "Caffeine",
  caffeineNone: "None",
  caffeineNormal: "Normal",
  caffeineHeavy: "Heavy",
  exercise: "Exercise",
  windDown: "Wind-down",
  meals: "Meals",
  preAdjust: "Days to shift before you fly",
  preAdjustOption: (days: number): string =>
    days === 1 ? "1 day" : `${days} days`,
  melatonin: "I already use melatonin and want timing windows for it",
  fromAirport: "From",
  toAirport: "To",
  departureDate: "Departure date",
  departureTime: "Departure time",
  arrivalDate: "Arrival date",
  arrivalTime: "Arrival time",
  flightNumber: "Flight number",
  flightNumberHint: "Optional.",
  dateHint: "YYYY-MM-DD",
  timeHint: "HH:MM",
  localTimesHint: "Times are local to each airport.",
  pasteLabel: "Confirmation text",
  readFlights: "Read flights",
  pasteUnread: "We couldn't read this. Enter the flights by hand.",
  pasteUnparsed: "Check these lines and add anything missing by hand.",
  checkThis: "Check this.",
  addLeg: "Add another flight",
  removeLeg: (index: number): string => `Remove flight ${index}`,
  flightLegend: (index: number): string => `Flight ${index}`,
  mustBeAwakeHeading: "Times you must be awake",
  addEvent: "Add an event",
  removeEvent: (index: number): string => `Remove event ${index}`,
  eventLegend: (index: number): string => `Event ${index}`,
  noWorkoutHeading: "Times you will not work out",
  addNoWorkout: "Add a no-workout window",
  removeNoWorkout: (index: number): string =>
    `Remove no-workout window ${index}`,
  windowLegend: (index: number): string => `No-workout window ${index}`,
  eventLabel: "Label",
  startDate: "Start date",
  startTime: "Start time",
  endDate: "End date",
  endTime: "End time",
  eventZone: "Time zone",
  zonePlaceholder: "Choose a time zone",
  zoneEmpty: "Choose your airports first. Time zones come from those flights.",
  tripDays: "Days at your destination",
  tripDaysHint: "Optional. Leave blank if you are not sure.",
  generate: "Generate plan",
  generating: "Generating your plan.",
  airportsLoading: "Loading airports.",
  airportsFailed:
    "The airport list did not load. Reload the page and try again.",
  comboboxHint: "Search by city, airport name, or IATA code.",
  comboboxNoMatches:
    "No airports match that search. Try a city, an airport name, or an IATA code.",
  airportMatches: (count: number): string =>
    count === 1 ? "1 airport matches." : `${count} airports match.`,
  airportShowing: (count: number): string =>
    `Showing ${count} matching airports.`,
  chooseAirport: "Choose an airport from the list.",
  timeInvalid: "Enter a time as HH:MM.",
  dateInvalid: "Enter a date as YYYY-MM-DD.",
  timesSame: "Bedtime and wake time are the same. Enter two different times.",
  sleepNeedInvalid:
    "Enter the hours of sleep you need as a number greater than 0 and less than 24.",
  eventLabelInvalid: "Enter a short label for this event.",
  zoneInvalid: "Choose a time zone from your flights.",
  tripDaysInvalid:
    "Enter days at your destination as a whole number greater than 0, or leave this blank.",
  legsRequired: "Add at least one flight.",
  arrivalBeforeDeparture:
    "Arrival is before departure. Check the local times on your booking.",
  legOutOfOrder:
    "This flight leaves before the previous flight arrives. Check the times.",
  endsBeforeStart: "The end is before the start. Check the times.",
  fieldInvalid: "This field needs a correction.",
  preAdjustInvalid: "Choose 0, 1, 2, or 3 days.",
  fieldSummary:
    "Some fields need a correction. Read the message next to each one, then choose Generate plan again.",
  engineRejected:
    "The plan could not be built. Fix the items below, then choose Generate plan again.",
  saveFailed:
    "This browser could not save the plan on this device. Allow site data for this site, then choose Generate plan again.",
  unexpectedFailure:
    "The plan could not be built. Check the flights and times, then choose Generate plan again.",
  planHeading: "Your plan",
  planSummary: "Plan summary",
  planLoading: "Loading this plan.",
  planMissing:
    "This plan could not be opened on this device. It may be missing, or this browser may be blocking site data. Go back to the trip form and generate the plan again.",
  planBack: "Back to the trip form",
  planDays: (count: number): string =>
    count === 1 ? "1 day in this plan." : `${count} days in this plan.`,
  planComingLater: "The full plan view is coming in a later update.",
  footer:
    "General wellness information, not medical advice. You use PhaseJumper at your own risk.",
  legalGateTitle: "Before you generate a plan",
  legalGateBody:
    "Confirm you want to generate a plan. The full acceptance step arrives in a later update.",
  legalGateContinue: "Continue",
} as const;

/** Phase map (§4). Kept separate from the trip form strings. */
export const phaseMapMessages = {
  title: "Phase map",
  axisLabel: "Time scales",
  axis: {
    destination: "Destination time",
    home: "Home time",
  },
  scaleShort: {
    destination: "Dest.",
    home: "Home",
  },
  scale: (name: string, offset: string): string => `${name} (${offset})`,
  lastScale: "Keep at least one time scale on.",
  now: (time: string): string => `Now, ${time}`,
  rowLabel: (date: string, count: number): string =>
    count === 1
      ? `${date}, 1 item. Use the arrow keys to move between items.`
      : `${date}, ${count} items. Use the arrow keys to move between items.`,
  cbtMin: "Body clock low point",
  target: "Where the body clock low point should land",
  flight: (label: string): string =>
    label === "" ? "Flight" : `Flight ${label}`,
  itemLabel: (
    kind: string,
    from: string,
    to: string,
    point: boolean,
  ): string => (point ? `${kind} at ${from}` : `${kind}, ${from} to ${to}`),
  whyHere: "Why here?",
  evidence: (grade: string, source: string): string =>
    source === "none"
      ? `Evidence grade ${grade}. A comfort layer with no single cited study.`
      : `Evidence grade ${grade}, source ${source}.`,
  close: "Close",
  legend: "Legend",
  kinds: {
    SLEEP: "Sleep",
    SLEEP_INFLIGHT: "Sleep on board",
    NAP: "Nap",
    SEEK_LIGHT: "Seek light",
    SEEK_LIGHT_ARTIFICIAL: "Bright indoor light",
    LIGHT_INFLIGHT_WINDOW: "Window light",
    AVOID_LIGHT: "Keep it dim",
    MELATONIN_WINDOW: "Melatonin window",
    EXERCISE_GOOD: "Exercise",
    EXERCISE_OPTIONAL_WALK: "Easy walk",
    EXERCISE_AVOID: "No exercise",
    CAFFEINE_OK: "Caffeine fits",
    CAFFEINE_LATE_OK: "Late caffeine",
    CAFFEINE_STOP: "Last caffeine",
    MEAL: "Meal",
    WIND_DOWN: "Wind down",
    NSDR: "Rest",
  },
} as const;
