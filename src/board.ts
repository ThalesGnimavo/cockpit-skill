/**
 * The board — the two drawings the cockpit is allowed to print.
 *
 * Both are drawn from COUNTS and RECORDED DATES, never from an estimate: a
 * progress bar over the three phase lists, and a timeline over the dates in
 * casp/schedule.json. Nothing here forecasts, orders or assigns; a picture the
 * tool computed from a guess would be the PM surface the anti-roadmap forbids.
 *
 * Pure string functions, no colour, no printing, no clock of their own —
 * `today` is injected. That is what lets the tests assert the drawings as EXACT
 * strings in both charsets: a drawing nobody pins drifts silently, which is the
 * class of defect this project exists to remove.
 *
 * Charset degradation follows the colour helper's posture (src/shared.ts):
 * detect once, expose the branch as an argument so both paths are testable.
 */

import { daysBetween, type ScheduleClaim } from './schedule.js';

const BAR_WIDTH = 24;
const TRACK_WIDTH = 40;

interface Glyphs {
  full: string;
  empty: string;
  sep: string;
  track: string;
  cap: string;
  anchor: string;
  due: string;
  today: string;
}

const UTF8: Glyphs = {
  full: '█',
  empty: '░',
  sep: '·',
  track: '─',
  cap: '·',
  anchor: '┼',
  due: '┬',
  today: '●'
};

const ASCII: Glyphs = {
  full: '#',
  empty: '.',
  sep: '-',
  track: '-',
  cap: '.',
  anchor: '|',
  due: '+',
  today: 'o'
};

export function glyphsFor(utf8: boolean): Glyphs {
  return utf8 ? UTF8 : ASCII;
}

/**
 * `progress  ████████████░░░░░░░░░░░░  40 shipped · 2 queued · 0 backlog`
 *
 * Shipped fills the bar, queued is the empty part, backlog is NAMED but not
 * DRAWN — a backlog has no committed length, so giving it bar territory would
 * draw a claim nobody made. The clamps keep a non-zero count from rendering as
 * a full or an empty bar: rounding must never say "done" when one slice is
 * still queued.
 */
export function progressLine(
  shipped: number,
  queued: number,
  backlog: number,
  utf8: boolean
): string {
  const g = glyphsFor(utf8);
  const total = shipped + queued;
  let filled = total > 0 ? Math.round((shipped / total) * BAR_WIDTH) : 0;
  if (shipped > 0 && filled === 0) filled = 1;
  if (queued > 0 && filled === BAR_WIDTH) filled = BAR_WIDTH - 1;
  const bar = g.full.repeat(filled) + g.empty.repeat(BAR_WIDTH - filled);
  return `progress  ${bar}  ${shipped} shipped ${g.sep} ${queued} queued ${g.sep} ${backlog} backlog`;
}

export interface Timeline {
  /** The track line, dates at both ends. */
  track: string;
  /** The label row, aligned under the track. Empty string when nothing fits. */
  labels: string;
}

/**
 * The recorded claims as one line, today marked.
 *
 * A reading aid on top of the list, never a replacement — the list below it
 * carries every claim, including the ones whose label could not be placed
 * without overlapping. `--json` carries the list only: a drawing is not a
 * machine contract.
 */
export function timelineLine(
  claims: ScheduleClaim[],
  today: string,
  utf8: boolean
): Timeline | null {
  if (claims.length === 0) return null;
  const g = glyphsFor(utf8);

  const dates = [...claims.map((c) => c.date), today].sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
  const span = daysBetween(start, end);

  const columnOf = (date: string): number =>
    span <= 0 ? 0 : Math.round((daysBetween(start, date) / span) * (TRACK_WIDTH - 1));

  const cells = Array.from({ length: TRACK_WIDTH }, () => g.track);
  // Anchors first, dues over them, today last: when two claims land on the same
  // column the marker that survives is the one the reader most needs to see.
  const placed: { col: number; label: string }[] = [];
  for (const kind of ['anchor', 'due'] as const) {
    for (const claim of claims.filter((c) => c.kind === kind)) {
      const col = columnOf(claim.date);
      cells[col] = kind === 'anchor' ? g.anchor : g.due;
      placed.push({ col, label: claim.id });
    }
  }
  cells[columnOf(today)] = g.today;

  const track = `${start} ${g.cap}${cells.join('')}${g.cap} ${end}`;

  // Greedy left-to-right placement; a label that would overlap its neighbour is
  // dropped rather than shifted — a shifted label points at the wrong date.
  const prefix = ' '.repeat(start.length + 2);
  let row = '';
  for (const p of placed.sort((a, b) => a.col - b.col || a.label.localeCompare(b.label))) {
    if (p.col < row.length) continue;
    row += ' '.repeat(p.col - row.length) + p.label;
  }
  return { track, labels: row.length > 0 ? prefix + row : '' };
}

/**
 * `schedule  next: freeze 2026-12-01 · in 82 days` — the single line `casp
 * status` adds when the file exists. The NEXT unshipped claim only: status is a
 * one-screen snapshot, and the whole list has its own verb.
 */
export function nextClaimLine(claims: ScheduleClaim[], utf8: boolean): string | null {
  const g = glyphsFor(utf8);
  const pending = claims
    .filter((c) => c.list !== 'shipped')
    .sort((a, b) => a.date.localeCompare(b.date));
  const ahead = pending.find((c) => c.days >= 0) ?? pending[0];
  if (!ahead) return null;
  const when =
    ahead.days > 0
      ? `in ${ahead.days} day${ahead.days === 1 ? '' : 's'}`
      : ahead.days === 0
        ? 'today'
        : `${-ahead.days} day${ahead.days === -1 ? '' : 's'} ago`;
  return `schedule  next: ${ahead.id} ${ahead.date} ${g.sep} ${when}`;
}
