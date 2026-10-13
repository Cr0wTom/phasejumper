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
  updateReady: "A new version is ready.",
  updateReload: "Reload",
  tripHeading: "Plan a trip",
  tripName: "Trip name",
  tripNameHint:
    "Optional, to find it in your list, like “Seoul conference”. It is not included in share links.",
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
  fromAirport: "From",
  toAirport: "To",
  departureDate: "Departure date",
  departureTime: "Departure time",
  arrivalDate: "Arrival date",
  arrivalTime: "Arrival time",
  flightNumber: "Flight number",
  flightNumberHint: "Optional.",
  localTimesHint: "Times are local to each airport.",
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
  timeInvalid: "Choose a time.",
  timeUnreadable:
    "Enter a time like 07:45 or 7:45 pm, or pick one from the list.",
  timeOptions: (label: string): string => `${label} options`,
  dateInvalid: "Choose a date.",
  dateIncomplete: "Finish the date: day, month and a 4-digit year.",
  dateYear: "Check the year: use 4 digits, like 2027.",
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
  footer:
    "General wellness information, not medical advice. You use PhaseJumper at your own risk.",
  editMissing:
    "That plan could not be opened for editing. Fill in the trip below, or open the plan again.",
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

/** Plan and Today screens, and navigation (T09). */
export const planMessages = {
  nav: {
    label: "Main",
    plan: "Plan",
    today: "Today",
    newTrip: "New trip",
    settings: "Settings",
  },
  planHeading: "Your plan",
  loading: "Loading this plan.",
  noPlan: "There is no plan on this device yet.",
  makePlan: "Plan a trip",
  missing:
    "This plan could not be opened on this device. It may be missing, or this browser may be blocking site data. Go back to the trip form and generate the plan again.",
  failed: (reason: string): string =>
    `This plan could not be opened: ${reason}. Reload the page and try again.`,
  regenerated:
    "This plan was rebuilt with the current version of the planner, so some times may have changed.",
  progressTitle: "How far your body clock is from destination time",
  progressAxis: (hours: string): string => `${hours} h off`,
  progressDay: (day: number, hours: string): string =>
    `Day ${day}: ${hours} hours off before, then the plan shifts it.`,
  share: "Share link",
  downloadCalendar: "Download calendar (.ics)",
  downloadFailed: (reason: string): string =>
    `The calendar file could not be created: ${reason}. Reload the page and try again.`,
  shareCopied:
    "Link copied. Anyone with it sees this plan; it never passes through a server.",
  shareManual: "Copy this link to share the plan:",
  editTrip: "Edit trip",
  warningsHeading: "Things to know",
  dayHeading: (date: string, index: number): string =>
    `Day ${index + 1}, ${date}`,
  timeRange: (from: string, to: string, zone: string): string =>
    `${from}–${to} (${zone})`,
  timePoint: (at: string, zone: string): string => `${at} (${zone})`,
  daysHeading: "Days",
  daysHint: "Choose a day, or a row on the map, to see what to do and why.",
  dayChip: (index: number, date: string): string =>
    `Day ${index + 1} · ${date}`,
  previousDay: "Previous day",
  nextDay: "Next day",
  closeDay: "Close",
  adviceHeading: "On the plane",
  droppedHeading: "Left out today",
  shareOpening: "Opening the shared plan.",
  shareUnreadable:
    "This share link is damaged or incomplete. Ask for the link again, or plan the trip yourself.",
  shareTooLarge:
    "This share link is too long to be a plan. Ask for the link again.",
  shareInvalid:
    "This share link does not describe a trip the planner can use. Ask for the link again.",
  todayHeading: "Today",
  nowAt: (time: string, zone: string): string =>
    `It's ${time} where you are (${zone}).`,
  current: "Now",
  next: "Next",
  until: (time: string): string => `until ${time}`,
  inMinutes: (text: string): string => `in ${text}`,
  endsIn: (text: string): string => `ends in ${text}`,
  duration: (minutes: number): string => {
    if (minutes < 60) return minutes === 1 ? "1 min" : `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  },
  nothingNow: "Nothing scheduled right now.",
  nothingNext: "Nothing else is planned.",
  before: (date: string): string => `Your plan starts on ${date}.`,
  after:
    "Your plan is complete. Your body clock should be on destination time.",
  viewPlan: "See the full plan",
} as const;

/** Start, Settings and the evidence page (T13). */
export const startMessages = {
  eyebrow: "Free · Private · Works offline",
  heading: "Arrive on local time",
  headingStart: "Arrive on ",
  headingAccent: "local time",
  lede: "PhaseJumper turns your flights and usual sleep into a day-by-day plan for light, sleep and caffeine. Everything stays on this device.",
  exampleHeading: "Example: Prague to San Francisco",
  planTrip: "Plan a trip",
  savedHeading: "Open a saved plan",
  savedLoading: "Looking for saved plans on this device.",
  savedNone: "No plans are saved on this device yet.",
  savedFailed:
    "Saved plans could not be read. This browser may be blocking site data for this site.",
  savedTrip: (from: string, to: string, date: string): string =>
    `${from} to ${to}, ${date}`,
  evidenceLink: "The research behind your plan",
  researchButton: "How it works",
  features: [
    {
      title: "Timed to your body clock",
      body: "Light, sleep, caffeine and naps, placed day by day around where your clock is, not where your watch is.",
    },
    {
      title: "Nothing leaves your device",
      body: "No account, no tracking, no server. Plans live in this browser and open offline at the gate.",
    },
    {
      title: "In your calendar",
      body: "Download the plan as a calendar file, or share it with a link that never touches a server.",
    },
  ],
  featuresHeading: "Why PhaseJumper",
} as const;

export const settingsMessages = {
  heading: "Settings",
  themeHeading: "Appearance",
  themeDark: "Dark",
  themeLight: "Light",
  dataHeading: "Your data",
  dataLede:
    "Plans are stored only in this browser. Export them to keep a copy or move them to another device.",
  exportButton: "Export plans (JSON)",
  exportEmpty: "There are no plans on this device to export.",
  exportFailed:
    "Plans could not be read for export. This browser may be blocking site data for this site.",
  exportDone: (count: number): string =>
    count === 1 ? "Exported 1 plan." : `Exported ${count} plans.`,
  importLabel: "Import plans (JSON)",
  importHint:
    "Choose a file exported from PhaseJumper, or a single trip in the same format as a share link.",
  importDone: (count: number): string =>
    count === 1 ? "Imported 1 plan." : `Imported ${count} plans.`,
  importTooLarge:
    "This file is larger than 2 MB, so it cannot be a PhaseJumper export. Choose the file you exported from Settings.",
  importNotJson:
    "This file is not valid JSON. Choose the .json file you exported from Settings, without editing it.",
  importNotPlans:
    "This file is JSON, but it does not contain PhaseJumper plans. Choose the file you exported from Settings.",
  importInvalid: (detail: string): string =>
    `Nothing was imported: ${detail}. Fix that trip in the file, or export it again.`,
  importFailed:
    "The plans in this file are valid, but this browser could not save them. Allow site data for this site, then try again.",
  forgetButton: "Forget all trips",
  forgetConfirm:
    "This deletes every plan saved in this browser. It cannot be undone. Export first if you want a copy.",
  forgetYes: "Yes, forget all trips",
  forgetCancel: "Cancel",
  forgetDone: "All trips were deleted from this device.",
  forgetFailed:
    "Trips could not be deleted. This browser may be blocking site data for this site. Reload and try again.",
  aboutHeading: "About",
  evidenceLink: "The research behind your plan",
  licence:
    "PhaseJumper is open source under the Apache License 2.0. The evidence page is licensed under CC BY 4.0.",
  backToSettings: "Back to Settings",
} as const;

/**
 * Legal copy (T12). Written by the maintainer; implementers wire it, never
 * edit it. TERMS_VERSION lives in terms.ts; acceptance text is fixed (§11.3).
 */
export const legalMessages = {
  heading: "Before your first plan",
  intro:
    "PhaseJumper is free and runs only in your browser. Please confirm both points to continue.",
  acceptWellness:
    "I understand this is general wellness information, not medical advice, and I use it at my own risk.",
  acceptAge: "I am 18 or older.",
  continue: "Continue",
  needBoth: "Confirm both points to continue.",
  saveFailed:
    "This browser could not store your answer, so you will be asked again next time. You can continue now.",
  readTerms: "Terms of use",
  readPrivacy: "Privacy notice",
  updatedHeading: "The terms have changed",
  updatedIntro:
    "The terms of use or privacy notice changed since you last accepted them. Please read them and confirm again to continue.",
  pageHeading: "Terms and privacy",
  legalLink: "Terms and privacy",
  melatoninQuestion: "I already use melatonin and want timing windows for it",
  melatoninNotice:
    "PhaseJumper only shows when research suggests melatonin can help move your body clock. It never suggests whether to use it, which product, or how much. In some countries melatonin is sold only with a doctor's order; follow the advice of whoever provided it.",
  melatoninCheckHeading: "Do any of these apply to you?",
  melatoninPregnant: "I am pregnant or might be pregnant",
  melatoninMedication: "I take other medication",
  melatoninUnder18: "I am under 18",
  melatoninBlocked:
    "Melatonin timing is not shown when any of these apply. Talk to a clinician before using melatonin.",
  exerciseNotice:
    "Check with a clinician before changing your exercise routine if you have a health condition.",
  reportButton: "Copy technical report",
  reportHint:
    "Copies the app and planner versions, your browser, the feature switches, a fingerprint of your latest trip (not the trip itself) and any planner warnings, for a bug report.",
  reportCopied: "Technical report copied.",
  reportManual: "Copy this report:",
  reportFailed:
    "The technical report could not be created. Reload the page and try again.",
} as const;

/** Feedback by email (Settings). Written by the maintainer; wire, never edit. */
export const feedbackMessages = {
  heading: "Feedback",
  intro:
    "Found a bug or missing something? Write to us. These links open your own email app; nothing is sent until you press send.",
  address: "feedback@phasejumper.world",
  bugLink: "Report a bug",
  featureLink: "Request a feature",
  bugSubject: "PhaseJumper bug report",
  featureSubject: "PhaseJumper feature request",
  bugBody: (report: string): string =>
    `What happened?\n\n\nWhat did you expect instead?\n\n\nSteps to reproduce:\n1. \n2. \n\n---\nTechnical report (no trip details; delete it if you prefer):\n${report}\n`,
  featureBody:
    "What would you like PhaseJumper to do?\n\n\nWhy would it help on your trips?\n\n",
  privacy:
    "Your email address and message are used only to answer your feedback. See the",
  privacyLink: "privacy notice",
  reportUnavailable: "(not available)",
} as const;

/** Round trips (outbound and return plans). Maintainer copy; wire, never edit. */
export const returnMessages = {
  heading: "Return flights",
  hint: "Add your flights home to plan the way back too. Times are local to each airport.",
  add: "Add return flights",
  addLeg: "Add another return flight",
  removeAll: "Remove return flights",
  legHeading: (index: number): string => `Return flight ${index}`,
  removeLeg: (index: number): string => `Remove return flight ${index}`,
  tripDaysFromFlights: (days: number): string =>
    days === 1
      ? "1 day at your destination, from your flights."
      : `${days} days at your destination, from your flights.`,
  beforeArrival:
    "Your return flight leaves before you arrive. Check the dates and times.",
  detected:
    "Your last flight goes back to where you started after a stay. Are these your flights home?",
  moveToReturn: "Move them to return flights",
  partsLabel: "Plan",
  outbound: "Outbound",
  return: "Return",
  shortStay:
    "Your stay is short, so the plan keeps you on home time and no return plan is needed.",
  savedRoundTrip: (from: string, to: string, date: string): string =>
    `${from} to ${to} and back, ${date}`,
} as const;

/** Shared plans and per-plan delete. Maintainer copy (privacy); never edit. */
export const sharedMessages = {
  label: "Shared plan",
  notice:
    "Someone shared this plan with you. It is shown on this device and is not saved unless you save it.",
  save: "Save to my plans",
  saving: "Saving…",
  saveFailed:
    "This plan could not be saved on this device. Allow site data for this site, then try again.",
  yourTrips: "Your trips",
  sharedWithYou: "Shared with you",
  delete: (label: string): string => `Delete ${label}`,
  deleteConfirm: "Delete this plan from this device? This cannot be undone.",
  deleteYes: "Delete",
  deleteCancel: "Cancel",
  deleteFailed:
    "This plan could not be deleted. Reload the page and try again.",
} as const;
