/**
 * `casp schedule` — a printer, and deliberately nothing more.
 *
 * Four blocks, and THE ORDER IS THE ARGUMENT:
 *   1. the measured pace, before any claim — what git says actually happened;
 *   2. the derived length of the queue, labelled as arithmetic;
 *   3. the recorded claims, marked against today;
 *   4. the contradictions `casp check` would emit, with their remediation.
 *
 * Measurement first, claims second: a reader who sees the recorded date before
 * the real rate reads the date as a plan. Refusing to print the derived date
 * while printing the quotient would be theatre — the reader adds it to today in
 * their head either way. What is refused is a number whose METHOD is invisible:
 * the window, the commits used and the arithmetic share the screen with it.
 *
 * This verb never gates. Exit 0 on any readable project, drift included; exit 1
 * only when the cockpit itself cannot be read — the same contract as `casp
 * status` (docs/status-json.md).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';
import {
  c,
  describeFsFailure,
  glyphs,
  loadState,
  pkgVersion,
  readTextFile,
  setCharset,
  setColor,
  todayISO,
  type State
} from './shared.js';
import { analyzeSchedule, phaseListsOf, type PhaseLists, type ScheduleAnalysis } from './schedule.js';
import { deriveLength, measurePace, sampleHistory, DEFAULT_WINDOW_WEEKS, WALK_CAP, type Pace } from './pace.js';
import { nextClaimLine, timelineLine } from './board.js';

/** The stable `casp schedule --json` contract (docs/schedule-json.md). Bumps
 *  only on a breaking shape change; additive fields do not bump it. */
export const SCHEDULE_SCHEMA_VERSION = 1;

function getWindow(args: string[]): number {
  const i = args.indexOf('--since');
  if (i === -1) return DEFAULT_WINDOW_WEEKS;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_WINDOW_WEEKS;
}

function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function paceSentence(pace: Pace): string {
  if (!pace.measurable) return pace.reason;
  return `${round(pace.perWeek)} phase${pace.perWeek === 1 ? '' : 's'} per week`;
}

interface Assembled {
  today: string;
  lists: PhaseLists;
  analysis: ScheduleAnalysis;
  pace: Pace;
  derived: ReturnType<typeof deriveLength>;
}

export function assemble(root: string, state: State, today: string, windowWeeks: number): Assembled {
  const lists = phaseListsOf(state);
  const analysis = analyzeSchedule(join(root, 'casp', 'schedule.json'), lists, today);
  const pace = measurePace(sampleHistory(root), today, windowWeeks);
  return { today, lists, analysis, pace, derived: deriveLength(lists.queued.length, pace, today) };
}

function buildReport(a: Assembled): Record<string, unknown> {
  const adopted = a.analysis.adopted;
  const malformed = adopted && a.analysis.malformed;
  return {
    schema_version: SCHEDULE_SCHEMA_VERSION,
    casp_version: pkgVersion(),
    today: a.today,
    adopted,
    malformed,
    malformed_detail: malformed ? (a.analysis as { detail: string }).detail : null,
    phases: {
      shipped: a.lists.shipped.length,
      queued: a.lists.queued.length,
      backlog: a.lists.backlog.length
    },
    pace: a.pace.measurable
      ? {
          measurable: true,
          window_weeks: a.pace.windowWeeks,
          walk_cap: WALK_CAP,
          commits_in_window: a.pace.commitsInWindow,
          first_commit: a.pace.first.sha,
          first_date: a.pace.first.date,
          last_commit: a.pace.last.sha,
          last_date: a.pace.last.date,
          span_days: a.pace.spanDays,
          phases_shipped_delta: a.pace.shippedDelta,
          phases_per_week: round(a.pace.perWeek),
          reason: null
        }
      : {
          measurable: false,
          window_weeks: a.pace.windowWeeks,
          walk_cap: WALK_CAP,
          commits_in_window: a.pace.commitsInWindow,
          first_commit: null,
          first_date: null,
          last_commit: null,
          last_date: null,
          span_days: null,
          phases_shipped_delta: null,
          phases_per_week: null,
          reason: a.pace.reason
        },
    // Arithmetic over the measured pace, never a forecast: null whenever the
    // pace is not measurable or the queue is empty. A consumer that treats this
    // as a commitment is misreading a quotient.
    derived: a.derived
      ? { queued: a.derived.queued, weeks: round(a.derived.weeks, 1), date: a.derived.date, method: 'phases_queued ÷ measured pace — arithmetic, not a forecast' }
      : null,
    // The LIST only. The timeline drawing is a reading aid for a terminal; a
    // picture is not a machine contract.
    claims:
      adopted && !malformed
        ? (a.analysis as { claims: unknown[] }).claims
        : [],
    findings:
      adopted && !malformed
        ? (a.analysis as { findings: unknown[] }).findings
        : []
  };
}

function head(label: string): void {
  console.log('');
  console.log(c.bold(label));
  console.log(c.gray('─'.repeat(Math.max(label.length, 40))));
}

/**
 * The human rendering, shared verbatim with `casp close` (§ 4c). One renderer,
 * never two: a second one drifts from the first and then the close prints a
 * different picture from the verb.
 */
export function printSchedule(a: Assembled): void {
  head('PACE (measured from git)');
  if (a.pace.measurable) {
    console.log(`  ${c.cyan(paceSentence(a.pace))}`);
    console.log(
      c.gray(
        `  window ${a.pace.windowWeeks} weeks · ${a.pace.commitsInWindow} state commit(s) · ${a.pace.first.sha} (${a.pace.first.date}) → ${a.pace.last.sha} (${a.pace.last.date})`
      )
    );
    console.log(
      c.gray(
        `  method ${a.pace.shippedDelta} phase(s) shipped over ${a.pace.spanDays} day(s), from phases_shipped in casp/state.json at each commit (walk capped at ${WALK_CAP})`
      )
    );
  } else {
    console.log(`  ${c.yellow('pace is not measurable')} ${c.gray(`— ${a.pace.reason}`)}`);
  }

  head('DERIVED LENGTH');
  if (a.derived) {
    console.log(
      `  ${a.derived.queued} queued ÷ ${round(a.pace.measurable ? a.pace.perWeek : 0)}/week = ${c.cyan(`${round(a.derived.weeks, 1)} weeks`)} → ${c.cyan(a.derived.date)}`
    );
    console.log(c.gray('  at the measured pace — arithmetic, not a forecast. Phases are not uniform.'));
  } else if (a.lists.queued.length === 0) {
    console.log(c.gray('  nothing queued — no length to derive'));
  } else {
    console.log(c.gray('  no measured pace, so no derived length. casp never invents a rate.'));
  }

  head('RECORDED CLAIMS');
  if (!a.analysis.adopted) {
    console.log(c.gray('  no casp/schedule.json — this cockpit records no dates (see templates/schedule.json)'));
  } else if (a.analysis.malformed) {
    console.log(`  ${c.red('casp/schedule.json is present but not valid')}`);
    console.log(c.gray(`  ${a.analysis.detail}`));
  } else if (a.analysis.claims.length === 0) {
    console.log(c.gray('  casp/schedule.json records no anchor and no due date'));
  } else {
    const tl = timelineLine(a.analysis.claims, a.today, glyphs.utf8);
    if (tl) {
      console.log(`  ${c.gray(tl.track)}`);
      if (tl.labels) console.log(`  ${c.gray(tl.labels)}`);
      console.log('');
    }
    for (const claim of [...a.analysis.claims].sort((x, y) => x.date.localeCompare(y.date))) {
      const mark =
        claim.state === 'passed'
          ? c.yellow('passed')
          : claim.state === 'due'
            ? c.cyan('due   ')
            : c.green('ahead ');
      const when =
        claim.days === 0
          ? 'today'
          : claim.days > 0
            ? `in ${claim.days}d`
            : `${-claim.days}d ago`;
      const where = claim.kind === 'anchor' ? 'anchor' : (claim.list ?? c.yellow('no list'));
      console.log(
        `  ${mark}  ${claim.date}  ${claim.id.padEnd(28).slice(0, 28)} ${c.gray(`${where} · ${when}`)}`
      );
    }
  }

  head('CONTRADICTIONS');
  const findings = a.analysis.adopted && !a.analysis.malformed ? a.analysis.findings : [];
  if (!a.analysis.adopted) {
    console.log(c.gray('  none — nothing recorded to contradict'));
  } else if (a.analysis.malformed) {
    console.log(`  ${c.red('CASP-SCHEDULE-001')} casp/schedule.json does not validate`);
    console.log(`        ${c.cyan('→')} ${c.gray('fix the JSON, or remove the file to opt back out of the schedule layer')}`);
  } else if (findings.length === 0) {
    console.log(c.green('  none — the recorded schedule agrees with itself and with the phase lists'));
  } else {
    for (const f of findings) {
      const tag = f.severity === 'fail' ? c.red('FAIL') : c.yellow('WARN');
      console.log(`  ${tag}  ${c.gray(f.code)} ${f.label}`);
      console.log(`        ${c.gray(f.detail)}`);
      console.log(`        ${c.cyan('→')} ${c.gray(f.fix)}`);
    }
  }
  console.log('');
  console.log(
    c.gray('casp records and verifies dated claims; it never proposes one. A missed date is a WARN, never a blocked push.')
  );
  console.log('');
}

/** The one status line the schedule layer adds to `casp status` (§ 4). */
export function scheduleStatusLine(root: string, state: State, today: string): string | null {
  const path = join(root, 'casp', 'schedule.json');
  if (!existsSync(path)) return null;
  const analysis = analyzeSchedule(path, phaseListsOf(state), today);
  if (!analysis.adopted) return null;
  if (analysis.malformed) return `schedule  ${'casp/schedule.json does not validate'}`;
  return nextClaimLine(analysis.claims, glyphs.utf8);
}

export function runSchedule(args: string[]): void {
  if (args.includes('--plain')) {
    setColor(false);
    setCharset(false);
  }
  const root = process.cwd();
  const statePath = join(root, 'casp', 'state.json');
  if (!existsSync(statePath)) {
    console.error(c.red('no casp/state.json found'));
    console.error(c.gray('  → run `npx @justethales/casp init` first'));
    exit(1);
  }
  const state = loadState(statePath);
  if (!state) {
    const probe = readTextFile(statePath);
    console.error(
      c.red(
        probe.ok
          ? 'casp/state.json is not valid JSON'
          : `casp/state.json ${describeFsFailure(probe.error)}`
      )
    );
    exit(1);
  }

  const a = assemble(root, state, todayISO(), getWindow(args));
  if (args.includes('--json')) {
    console.log(JSON.stringify(buildReport(a), null, 2));
    return;
  }
  printSchedule(a);
}
