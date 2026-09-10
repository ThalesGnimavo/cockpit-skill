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
 *  parse is skipped, not fatal: the walk is evidence gathering, not validation. */
export function sampleHistory(root: string, cap: number = WALK_CAP): PaceSample[] {
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
  const cutoff = addDays(today, -windowWeeks * 7);
  const inWindow = samples.filter((s) => daysBetween(cutoff, s.date) >= 0);
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
      reason: `no phase shipped between ${first.date} and ${last.date} — there is no rate to report`
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
