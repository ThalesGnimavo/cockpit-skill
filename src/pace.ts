/**
 * Measured pace — how fast this project has actually been shipping phases,
 * read from git, never recorded anywhere.
 *
 * The file records CLAIMS; the pace is a MEASUREMENT, and the two must not be
 * stored in the same place. A pace written into casp/schedule.json drifts from
 * the real one by construction the moment the project speeds up or stalls, and
 * then the tool would be asserting a number nothing verifies — the exact defect
 * the facts layer exists to catch. So it is measured live, every time, from the
 * one artifact git already witnesses: the history of casp/state.json.
 *
 * The window is RECENT by default and always printed. Averaging the whole
 * history is wrong for any project whose pace changed, and every project's pace
 * changes; a rate whose window is invisible is a number the reader cannot
 * discount. Fewer than two usable data points ⇒ NO rate at all. Never invent one.
 */

import { gitArgs } from './shared.js';
import { addDays, daysBetween } from './schedule.js';

/** Hard cap on the history walk: a long-lived cockpit has hundreds of state
 *  commits and the window discards them anyway. Stated in the output. */
export const WALK_CAP = 400;
export const DEFAULT_WINDOW_WEEKS = 8;
/** Ceiling on --since. A hundred years is past any real project and keeps the
 *  date arithmetic inside the range Date can represent — without it, a large
 *  --since produced a RangeError and a "this is a casp bug" message on a
 *  perfectly readable cockpit, which contradicts the verb's exit contract. */
export const MAX_WINDOW_WEEKS = 5200;

/** The cutoff a window implies, or null when the arithmetic would leave the
 *  representable range. Never throws: the caller is a reporting verb. */
export function windowCutoff(today: string, weeks: number): string | null {
  const clamped = Math.min(Math.max(Math.floor(weeks), 1), MAX_WINDOW_WEEKS);
  try {
    return addDays(today, -clamped * 7);
  } catch {
    return null;
  }
}

export interface PaceSample {
  sha: string;
  date: string;
  shipped: number;
}

export type Pace =
  | { measurable: false; windowWeeks: number; commitsInWindow: number; reason: string }
  | {
      measurable: true;
      windowWeeks: number;
      commitsInWindow: number;
      first: PaceSample;
      last: PaceSample;
      spanDays: number;
      shippedDelta: number;
      /** Phases per week over the window. Always > 0 when measurable. */
      perWeek: number;
    };

/** Every commit that touched casp/state.json, newest first, with the count of
 *  phases_shipped recorded in that commit's blob. A commit whose blob does not
 *  parse is skipped, not fatal: the walk is evidence gathering, not validation.
 *
 *  `since` bounds the EXPENSIVE half. The log itself is one cheap spawn whose
 *  output is small; reading a blob is a spawn per commit, and on a two-year-old
 *  cockpit the window discards almost all of them. Filtering here rather than in
 *  measurePace is the difference between ~12 spawns and 400 on every `casp
 *  close`. It filters rather than breaks on the first old commit, because a
 *  rebase can leave author dates out of order in the log. */
export function sampleHistory(
  root: string,
  opts: { cap?: number; since?: string } = {}
): PaceSample[] {
  const cap = opts.cap ?? WALK_CAP;
  const log = gitArgs(
    ['log', `--max-count=${cap}`, '--format=%H %aI', '--', 'casp/state.json'],
    root
  );
  if (!log) return [];
  const samples: PaceSample[] = [];
  for (const line of log.split('\n')) {
    const sp = line.indexOf(' ');
    if (sp === -1) continue;
    const sha = line.slice(0, sp);
    const date = line.slice(sp + 1, sp + 11);
    if (opts.since && daysBetween(opts.since, date) < 0) continue;
    const blob = gitArgs(['show', `${sha}:casp/state.json`], root);
    if (!blob) continue;
    try {
      const parsed = JSON.parse(blob) as { phases_shipped?: unknown };
      if (!Array.isArray(parsed.phases_shipped)) continue;
      samples.push({ sha: sha.slice(0, 7), date, shipped: parsed.phases_shipped.length });
    } catch {
      continue;
    }
  }
  return samples;
}

/**
 * The rate over the window, or an honest refusal.
 *
 * `samples` is newest-first (as `sampleHistory` returns it). The window is
 * anchored on TODAY, not on the newest commit: a cockpit whose last state
 * commit is six months old has not been shipping at its old pace, and pinning
 * the window to that commit would report as if it had.
 */
export function measurePace(
  samples: PaceSample[],
  today: string,
  windowWeeks: number = DEFAULT_WINDOW_WEEKS
): Pace {
  const cutoff = windowCutoff(today, windowWeeks);
  const inWindow = cutoff
    ? samples.filter((s) => daysBetween(cutoff, s.date) >= 0)
    : samples;
  const base = { windowWeeks, commitsInWindow: inWindow.length };

  if (samples.length === 0) {
    return { ...base, measurable: false, reason: 'no commit in this repository touches casp/state.json' };
  }
  if (inWindow.length < 2) {
    return {
      ...base,
      measurable: false,
      reason: `only ${inWindow.length} state commit${inWindow.length === 1 ? '' : 's'} in the last ${windowWeeks} weeks — two are needed to measure anything`
    };
  }

  const last = inWindow[0];
  const first = inWindow[inWindow.length - 1];
  const spanDays = daysBetween(first.date, last.date);
  const shippedDelta = last.shipped - first.shipped;

  if (spanDays <= 0) {
    return { ...base, measurable: false, reason: 'every state commit in the window lands on the same day — no span to divide by' };
  }
  if (shippedDelta <= 0) {
    return {
      ...base,
      measurable: false,
      // Deliberately "did not grow" and not "nothing shipped": the delta is a
      // difference of LIST SIZES, so a rename inside the window (one entry out,
      // one in) reads as zero. Saying "no phase shipped" there would be a false
      // sentence about a window in which a phase did ship.
      reason: `phases_shipped did not grow between ${first.date} and ${last.date} — no rate to report (a rename inside the window reads as zero: the delta is a difference of list sizes, not a count of shipping events)`
    };
  }

  return {
    ...base,
    measurable: true,
    first,
    last,
    spanDays,
    shippedDelta,
    perWeek: (shippedDelta / spanDays) * 7
  };
}

export interface Derived {
  queued: number;
  weeks: number;
  date: string;
}

/** queued ÷ pace. ARITHMETIC, NOT A FORECAST — the caller is required to print
 *  the method next to it, which is the only thing that lets a reader discount a
 *  number computed from phases that are not uniform. */
export function deriveLength(queued: number, pace: Pace, today: string): Derived | null {
  if (!pace.measurable || queued <= 0) return null;
  const weeks = queued / pace.perWeek;
  return { queued, weeks, date: addDays(today, Math.round(weeks * 7)) };
}
