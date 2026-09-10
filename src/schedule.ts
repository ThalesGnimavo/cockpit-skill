/**
 * The schedule layer — proving a DATED CLAIM against the phase lists and the
 * calendar, never proposing one.
 *
 * A cockpit's roadmap carries dates and its `state.json` carries phases;
 * nothing connected the two, so operators wrote `launch_date` /
 * `feature_freeze` straight into `state.json` as unschematized fields that
 * `casp check` tolerated and nothing verified. A dated claim nobody confronts
 * with the calendar does not go stale — it goes false. Same reversal as the
 * facts layer (src/facts.ts): CASP cannot prove a schedule is ACHIEVABLE, but
 * it can prove a recorded schedule contradicts itself, names a phase that does
 * not exist, or has quietly slipped into the past.
 *
 * OPT-IN, same posture as the facts layer: no `casp/schedule.json` ⇒ zero
 * CASP-SCHEDULE-* findings, not even a PASS.
 *
 * THE ONE INVARIANT, and it is a guard rail with a test behind it
 * (`test/schedule.test.mjs`, "clock invariance"): the CASP-SCHEDULE-* family
 * NEVER changes the exit code because of the clock. A passed date is a WARN.
 * Lateness honestly recorded is the record being CORRECT, not drift. FAIL is
 * reserved for a schedule that contradicts itself — a comparison of the file
 * against itself and against the phase lists, both of which are in the repo.
 *
 * This module is pure: it reads files and returns an analysis. It never prints,
 * never exits, never runs git. `today` is always injected by the caller, never
 * read from the environment inside a comparison — that is what makes the
 * invariance test possible.
 */

import { existsSync } from 'node:fs';
import { describeFsFailure, readTextFile } from './shared.js';

export interface ScheduleAnchor {
  id: string;
  date: string;
  /** Tolerated, never parsed — see loadSchedule's contract. */
  note?: string;
}

export interface ScheduleDue {
  phase: string;
  date: string;
  /** Optional anchor id this phase must land strictly before. */
  before?: string;
  note?: string;
}

export interface ScheduleFile {
  schema_version?: number;
  anchors?: ScheduleAnchor[];
  due?: ScheduleDue[];
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A date CASP will compare: `YYYY-MM-DD` and a real day. No time, no zone, no
 *  relative expression — a zone makes the same file resolve differently on two
 *  machines, which is the determinism bug in miniature. */
export function isDayString(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  // Rejects 2026-02-30, which Date.parse would otherwise roll over.
  return new Date(t).toISOString().slice(0, 10) === value;
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );
}

/** `day` shifted by `n` days, as `YYYY-MM-DD`. Throws a RangeError past the
 *  representable date range — callers that take `n` from a CLI flag must bound
 *  it first (see `windowCutoff` in src/pace.ts). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/* Not exported: the only legitimate entry point is analyzeSchedule, which pairs
   the parse with the "present but unusable" distinction check.ts depends on. */
/** Parses casp/schedule.json. null on a missing/unreadable/unparseable file OR
 *  a shape that is not even minimally a schedule file (an object) — check.ts
 *  turns the last case into a single FAIL rather than silent adoption. */
function loadSchedule(path: string): ScheduleFile | null {
  const raw = readTextFile(path);
  if (!raw.ok) return null;
  try {
    const parsed = JSON.parse(raw.content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as ScheduleFile;
  } catch {
    return null;
  }
}

/**
 * Structural validation — the CASP-SCHEDULE-001 surface. Returns every problem
 * found, each as a SENTENCE (never a stack): a malformed date, an unknown
 * `before`, a duplicate anchor id all have different remediations and the
 * operator gets to see all of them in one run.
 */
export function validateSchedule(file: ScheduleFile): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(file.schema_version)) {
    errors.push('schema_version is missing or is not an integer');
  }

  const anchors = file.anchors;
  const anchorIds = new Set<string>();
  if (anchors !== undefined) {
    if (!Array.isArray(anchors)) {
      errors.push('anchors must be an array');
    } else {
      anchors.forEach((a, i) => {
        if (!a || typeof a !== 'object' || Array.isArray(a)) {
          errors.push(`anchors[${i}] is not an object`);
          return;
        }
        if (typeof a.id !== 'string' || a.id.trim().length === 0) {
          errors.push(`anchors[${i}] has no id`);
        } else if (anchorIds.has(a.id)) {
          errors.push(`anchors[${i}] repeats the anchor id '${a.id}' — ids must be unique`);
        } else {
          anchorIds.add(a.id);
        }
        if (!isDayString(a.date)) {
          errors.push(
            `anchors[${i}] ('${String(a.id ?? '?')}') has date '${String(a.date ?? '')}' — expected YYYY-MM-DD`
          );
        }
      });
    }
  }

  const due = file.due;
  if (due !== undefined) {
    if (!Array.isArray(due)) {
      errors.push('due must be an array');
    } else {
      due.forEach((d, i) => {
        if (!d || typeof d !== 'object' || Array.isArray(d)) {
          errors.push(`due[${i}] is not an object`);
          return;
        }
        if (typeof d.phase !== 'string' || d.phase.trim().length === 0) {
          errors.push(`due[${i}] has no phase`);
        }
        if (!isDayString(d.date)) {
          errors.push(
            `due[${i}] ('${String(d.phase ?? '?')}') has date '${String(d.date ?? '')}' — expected YYYY-MM-DD`
          );
        }
        if (d.before !== undefined) {
          if (typeof d.before !== 'string' || !anchorIds.has(d.before)) {
            errors.push(
              `due[${i}] ('${String(d.phase ?? '?')}') declares before '${String(d.before)}', which is not a declared anchor id`
            );
          }
        }
      });
    }
  }

  return errors;
}

export type ClaimKind = 'anchor' | 'due';
export type ClaimState = 'ahead' | 'due' | 'passed';

export interface ScheduleClaim {
  kind: ClaimKind;
  /** Anchor id, or the phase name for a due. */
  id: string;
  date: string;
  /** For a due: which of the three phase lists holds it, or null when it holds none. */
  list: 'shipped' | 'queued' | 'backlog' | null;
  before: string | null;
  /** ahead / due (today) / passed — computed against the injected `today`. */
  state: ClaimState;
  /** Signed days from today to the claim: negative once passed. */
  days: number;
}

export interface ScheduleFinding {
  code: string;
  severity: 'warn' | 'fail';
  label: string;
  detail: string;
  fix: string;
}

export type ScheduleAnalysis =
  | { adopted: false }
  | { adopted: true; malformed: true; detail: string }
  | {
      adopted: true;
      malformed: false;
      file: ScheduleFile;
      claims: ScheduleClaim[];
      findings: ScheduleFinding[];
    };

export interface PhaseLists {
  shipped: string[];
  queued: string[];
  backlog: string[];
}

/** The three phase lists as the join key the whole layer uses. Tolerant by
 *  design: a cockpit with no phases_backlog reports none rather than failing —
 *  the schedule layer never adds a requirement to state.json. */
export function phaseListsOf(state: { [k: string]: unknown }): PhaseLists {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  return {
    shipped: arr(state.phases_shipped),
    queued: arr(state.phases_queued),
    backlog: arr(state.phases_backlog)
  };
}

function listOf(phase: string, lists: PhaseLists): ScheduleClaim['list'] {
  if (lists.shipped.includes(phase)) return 'shipped';
  if (lists.queued.includes(phase)) return 'queued';
  if (lists.backlog.includes(phase)) return 'backlog';
  return null;
}

function stateOf(date: string, today: string): { state: ClaimState; days: number } {
  const days = daysBetween(today, date);
  return { state: days > 0 ? 'ahead' : days === 0 ? 'due' : 'passed', days };
}

/**
 * The whole layer, in one pure pass.
 *
 * Severity doctrine, restated where it is enforced:
 *   002 WARN — phases get renamed mid-flight; failing the push for that teaches
 *              people to delete the schedule, which is the opposite of the goal.
 *   003 FAIL — the file contradicts itself or the phase lists. No clock.
 *   004 WARN — a date has passed. THE CLOCK CAN ADD A WARN AND NEVER A FAIL.
 *
 * Shipped phases are never inspected by 003 or 004: history is not drift.
 */
export function analyzeSchedule(
  schedulePath: string,
  lists: PhaseLists,
  today: string
): ScheduleAnalysis {
  const file = loadSchedule(schedulePath);
  if (file === null) {
    if (!existsSync(schedulePath)) return { adopted: false };
    const raw = readTextFile(schedulePath);
    return {
      adopted: true,
      malformed: true,
      detail: raw.ok
        ? 'expected a JSON object with optional `anchors` and `due` arrays'
        : `casp/schedule.json ${describeFsFailure(raw.error)}`
    };
  }

  const errors = validateSchedule(file);
  if (errors.length > 0) {
    return { adopted: true, malformed: true, detail: errors.join('; ') };
  }

  const anchors = (file.anchors ?? []) as ScheduleAnchor[];
  const dues = (file.due ?? []) as ScheduleDue[];
  const anchorById = new Map(anchors.map((a) => [a.id, a]));

  const claims: ScheduleClaim[] = [
    ...anchors.map((a): ScheduleClaim => {
      const s = stateOf(a.date, today);
      return { kind: 'anchor', id: a.id, date: a.date, list: null, before: null, ...s };
    }),
    ...dues.map((d): ScheduleClaim => {
      const s = stateOf(d.date, today);
      return {
        kind: 'due',
        id: d.phase,
        date: d.date,
        list: listOf(d.phase, lists),
        before: d.before ?? null,
        ...s
      };
    })
  ];

  const findings: ScheduleFinding[] = [];

  /* 002 — a due names a phase no list holds. WARN. No clock. */
  for (const d of dues) {
    if (listOf(d.phase, lists) === null) {
      findings.push({
        code: 'CASP-SCHEDULE-002',
        severity: 'warn',
        label: `schedule: '${d.phase}' is in no phase list`,
        detail: `casp/schedule.json dates '${d.phase}' (${d.date}), which appears in neither phases_shipped, phases_queued nor phases_backlog`,
        fix: 'rename the due to match the phase, or drop the entry — a date on a phase that does not exist dates nothing'
      });
    }
  }

  /* 003 — the schedule contradicts itself. FAIL. No clock. */
  // Anchors are an ordered array: their POSITION is the declared chronology, so
  // a later position holding an earlier date is the file disagreeing with itself.
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const cur = anchors[i];
    if (daysBetween(prev.date, cur.date) <= 0) {
      findings.push({
        code: 'CASP-SCHEDULE-003',
        severity: 'fail',
        label: `schedule: anchors are not in ascending order`,
        detail: `'${prev.id}' (${prev.date}) is declared before '${cur.id}' (${cur.date}), which is not later`,
        fix: 'reorder the anchors array, or fix the dates — position IS the declared chronology'
      });
    }
  }
  for (const d of dues) {
    if (!d.before) continue;
    const list = listOf(d.phase, lists);
    // History is not drift: a shipped phase that landed after its anchor is a
    // fact about the past, not a contradiction to fix.
    if (list !== 'queued' && list !== 'backlog') continue;
    const anchor = anchorById.get(d.before);
    if (!anchor) continue; // unreachable: validateSchedule already FAILed it
    if (daysBetween(d.date, anchor.date) <= 0) {
      findings.push({
        code: 'CASP-SCHEDULE-003',
        severity: 'fail',
        label: `schedule: '${d.phase}' is not dated before '${d.before}'`,
        detail: `'${d.phase}' is due ${d.date} but declares before '${d.before}' (${anchor.date})`,
        fix: `move '${d.phase}' earlier than ${anchor.date}, move the anchor, or drop the before declaration`
      });
    }
  }

  /* 004 — a date has passed. WARN, and the ONLY rule here that reads the clock.
   *
   * THIS BLOCK STAYS LAST, and the order is load-bearing. check.ts derives each
   * finding's id from its INDEX in this array; emitting the clock-dependent rule
   * after every clock-independent one is what keeps FAIL ids identical whatever
   * the date. The clock-invariance test compares FAIL ids, so moving this block
   * above 003 breaks the suite — which is the intent. */
  for (const d of dues) {
    const list = listOf(d.phase, lists);
    if (list !== 'queued' && list !== 'backlog') continue;
    const own = stateOf(d.date, today);
    if (own.state === 'passed') {
      findings.push({
        code: 'CASP-SCHEDULE-004',
        severity: 'warn',
        label: `schedule: '${d.phase}' is past its recorded date`,
        detail: `due ${d.date}, ${-own.days} day${own.days === -1 ? '' : 's'} ago, and still ${list}`,
        fix: 'ship it, re-date it, or move it to the backlog — a missed date honestly recorded is not drift and never blocks a push'
      });
      continue;
    }
    // A phase can be on time against its own date and already behind the anchor
    // it was bound to — the anchor is the claim that matters to the reader.
    if (d.before) {
      const anchor = anchorById.get(d.before);
      if (anchor && stateOf(anchor.date, today).state === 'passed') {
        findings.push({
          code: 'CASP-SCHEDULE-004',
          severity: 'warn',
          label: `schedule: '${d.phase}' is bound to a passed anchor`,
          detail: `'${d.before}' was ${anchor.date}, and '${d.phase}' is still ${list}`,
          fix: 'move the anchor, drop the binding, or accept the slip — recorded lateness is the record being correct'
        });
      }
    }
  }

  return { adopted: true, malformed: false, file, claims, findings };
}
