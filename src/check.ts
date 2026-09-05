/**
 * `casp check` — validate state.json against filesystem + git + prompt frontmatter.
 *
 * The wedge of the whole protocol: everyone STORES state, CASP VALIDATES it
 * against git ground-truth. Exits 1 on any FAIL so it works as a real CI status
 * check / pre-push gate — not a decorative log. Use --quiet to suppress PASS
 * lines (CI-friendly). Use --json for a machine-readable report (stable schema,
 * documented in docs/check-json.md) — same checks, same exit code, different
 * format only. Use --all to validate every casp/ cockpit under a root.
 *
 * The per-root validation lives in `checkOne(root)` and is pure — it returns
 * findings, never prints, never exits. `runCheck` is the thin shell that picks
 * single-root vs --all, renders (human or JSON), and owns the exit code.
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { exit } from 'node:process';
import {
  c,
  describeFsFailure,
  git,
  gitArgs,
  isDir,
  isPlaceholderPath,
  pkgVersion,
  readDirEntries,
  readFrontmatter,
  readStateFile,
  resolveDirs,
  type FsFailure
} from './shared.js';
import { ruleFor } from './rules.js';
import { analyzeChain } from './chain.js';
import { analyzeFacts } from './facts.js';

type Severity = 'pass' | 'warn' | 'fail';
export interface Finding {
  id: string;
  severity: Severity;
  label: string;
  detail: string;
  fix?: string;
  // Optional structured diff, set only where a single expected-vs-actual pair is
  // natural (last_commit, next_prompt status, migrations). Additive: absent →
  // emitted as null in --json, never surfaced in the human report.
  expected?: string | null;
  actual?: string | null;
}

/**
 * The stable `--json` report contract (documented in docs/check-json.md).
 * `schema_version` only bumps on a breaking change to this shape — additive
 * fields do not bump it. The verdict logic is shared with the human report;
 * `--json` changes the format, never the outcome.
 */
export const JSON_SCHEMA_VERSION = 1;

export function summarize(findings: Finding[]): {
  pass: number;
  warn: number;
  fail: number;
} {
  return {
    pass: findings.filter((f) => f.severity === 'pass').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    fail: findings.filter((f) => f.severity === 'fail').length
  };
}

function buildReport(findings: Finding[]): Record<string, unknown> {
  const summary = summarize(findings);
  const exitCode = summary.fail > 0 ? 1 : 0;
  return {
    schema_version: JSON_SCHEMA_VERSION,
    casp_version: pkgVersion(),
    verdict: exitCode === 0 ? 'clean' : 'drift',
    exit_code: exitCode,
    summary,
    findings: findings.map((f) => ({
      id: f.id,
      rule: ruleFor(f.id)?.code ?? null,
      severity: f.severity,
      label: f.label,
      detail: f.detail,
      fix: f.fix ?? null,
      // Additive structured diff (schema stays v1). null when this finding has
      // no single expected-vs-actual pair — the common case.
      expected: f.expected ?? null,
      actual: f.actual ?? null
    }))
  };
}

function emitJson(findings: Finding[]): never {
  const report = buildReport(findings);
  console.log(JSON.stringify(report, null, 2));
  exit(report.exit_code as number);
}

/**
 * Validate one cockpit rooted at `root`. Pure: returns findings, never prints,
 * never exits. The terminal cases (no state file / invalid JSON) return a
 * single `state.file` finding and run nothing further.
 */
export function checkOne(root: string, opts: { noGit?: boolean } = {}): Finding[] {
  const noGit = opts.noGit ?? false;
  const STATE_PATH = join(root, 'casp', 'state.json');

  const findings: Finding[] = [];
  function record(
    id: string,
    severity: Severity,
    label: string,
    detail: string,
    fix?: string,
    extra?: { expected?: string | null; actual?: string | null }
  ): void {
    findings.push({
      id,
      severity,
      label,
      detail,
      fix,
      expected: extra?.expected ?? null,
      actual: extra?.actual ?? null
    });
  }

  /**
   * Repository content that the gate needed to read and could not. The path and
   * the reason are both in the finding, because "something is unreadable" is not
   * actionable and "EACCES" alone does not say what CASP was trying to prove.
   *
   * FAIL, always: an unverifiable claim is not a passing claim. The gate is
   * allowed to say "I could not check this" — it is not allowed to say "clean".
   */
  const reportedUnreadable = new Set<string>();
  function recordUnreadable(what: string, rel: string, e: FsFailure): void {
    // One path, one finding. `next_prompt` normally lives inside sessions_dir,
    // so the same file is reached by the next_prompt block AND by the sessions
    // walk; without this the report names it twice, with two labels and one
    // remediation, and the drift count reads 2 for a single defect. First
    // caller wins — it is the more specific one ("next_prompt", not "prompt").
    if (reportedUnreadable.has(rel)) return;
    reportedUnreadable.add(rel);
    record(
      `io.${rel}`,
      'fail',
      `${what} ${describeFsFailure(e)}`,
      rel,
      e.reason === 'is-directory'
        ? 'a directory is squatting a path CASP reads as a file — move or rename it'
        : e.reason === 'not-a-regular-file'
          ? 'CASP reads this path as a document — a pipe or device cannot be one; move or rename it'
          : e.reason === 'vanished'
            ? 'the tree changed under the run — re-run `casp check` on a settled tree'
            : 'make the file readable (chmod), or remove it — CASP cannot validate what it cannot open'
    );
  }

  const stateRead = readStateFile(STATE_PATH);
  if (!stateRead.ok && stateRead.kind === 'io' && stateRead.error.reason === 'vanished') {
    record(
      'state.file',
      'fail',
      'no casp/state.json found',
      STATE_PATH,
      'run `npx @justethales/casp init` first'
    );
    return findings;
  }
  if (!stateRead.ok && stateRead.kind === 'io') {
    // Present but unopenable. Saying "not valid JSON" here would send the
    // operator to fix a syntax error that does not exist.
    recordUnreadable('casp/state.json', relative(root, STATE_PATH) || 'casp/state.json', stateRead.error);
    return findings;
  }
  if (!stateRead.ok || !stateRead.state) {
    record(
      'state.file',
      'fail',
      'casp/state.json is not valid JSON',
      STATE_PATH,
      'fix the JSON syntax (a trailing comma or unquoted key, usually)'
    );
    return findings;
  }
  const state = stateRead.state;

  // Resolve the state-surface dirs from state (defaults when unset). Computed
  // here — after state loads — so the optional sessions_dir / logs_dir keys are
  // honored everywhere below. SESSIONS_DIR / LOGS_DIR are the absolute forms;
  // dirs.*Rel is what every message and git pathspec prints (the RESOLVED path,
  // not the hardcoded default).
  const dirs = resolveDirs(root, state);
  const SESSIONS_DIR = dirs.sessionsAbs;
  const LOGS_DIR = dirs.logsAbs;

  /* 1. Required keys ----------------------------------------------------- */

  // Keys that must be present AND non-null.
  const requiredNonNull = [
    'updated_at',
    'last_session_id',
    'last_commit',
    'current_phase',
    'phases_shipped'
  ] as const;
  for (const key of requiredNonNull) {
    if (state[key] === undefined || state[key] === null) {
      record(
        `state.shape.${key}`,
        'fail',
        'state.json missing required key',
        `key '${key}' is missing`,
        `add "${key}": <value> to casp/state.json`
      );
    } else {
      record(`state.shape.${key}`, 'pass', `state.json has '${key}'`, '');
    }
  }

  // next_phase / next_prompt MUST be present as keys, but may be null — a
  // project can legitimately have no queued next slice (parked, launch hold,
  // roadmap complete). The key being absent is still a shape error; an explicit
  // null is a valid "parked" state, not drift.
  for (const key of ['next_phase', 'next_prompt'] as const) {
    if (!(key in state)) {
      record(
        `state.shape.${key}`,
        'fail',
        'state.json missing required key',
        `key '${key}' is missing`,
        `add "${key}": null to casp/state.json (use null when there is no queued next slice)`
      );
    } else if (state[key] === null) {
      record(
        `state.shape.${key}`,
        'pass',
        `state.json '${key}' is null (parked — no queued next slice)`,
        ''
      );
    } else {
      record(`state.shape.${key}`, 'pass', `state.json has '${key}'`, '');
    }
  }

  /* 1b. parked is only honest when the queue is actually empty ----------- */

  // The failure this closes: a cockpit reporting "nothing to start" while its
  // own backlog holds a dozen phases. `next_prompt: null` was an unconditional
  // PASS labelled "parked — no queued next slice", and nothing ever compared
  // that claim against phases_queued. So an agent that could not resolve a
  // path (typically because the next phase had no prompt file drafted yet)
  // could null the field, pass the gate, and hand the next session a blank
  // cockpit. The information was never lost — it sat in phases_queued, which
  // no reader consulted.
  //
  // Parked stays legitimate: it just has to be TRUE. Empty queue, empty
  // pointer — pass. Non-empty queue, empty pointer — the two halves of the
  // state contradict each other, and the operator gets the count back.
  {
    const queued = Array.isArray(state.phases_queued) ? state.phases_queued : [];
    const pointerEmpty =
      state.next_prompt === null ||
      state.next_prompt === undefined ||
      (typeof state.next_prompt === 'string' &&
        (state.next_prompt.trim() === '' || isPlaceholderPath(state.next_prompt)));

    if (pointerEmpty && queued.length > 0) {
      const head = queued.slice(0, 3).map((q) => String(q));
      const more = queued.length > head.length ? `, +${queued.length - head.length} more` : '';
      record(
        'next_prompt.parked_while_queued',
        'fail',
        'the cockpit reports nothing to start while phases are queued',
        `next_prompt is empty but phases_queued holds ${queued.length}: ${head.join(', ')}${more}`,
        'point next_prompt at the prompt file for the head of the queue. If that phase has no prompt file yet, DRAFT IT — a phase with no prompt is an intention, not a queue entry. Only null next_prompt when phases_queued is genuinely empty.',
        { expected: 'a path to the head of the queue', actual: JSON.stringify(state.next_prompt ?? null) }
      );
    } else if (pointerEmpty) {
      record(
        'next_prompt.parked_while_queued',
        'pass',
        'next_prompt is empty and the queue is empty too (genuinely parked)',
        ''
      );
    }

    /* 1c. a cockpit that has shipped never reports nothing to start ------- */

    // The failure this closes: the roadmap is fully implemented, the queue is
    // empty, the pointer is null, the gate says PASS — and the next session
    // opens on a blank. But a finished roadmap is not a finished project:
    // distribution, pricing, support, the next roadmap all remain, and each of
    // them is a DECISION before it is code. A decision is a session too: a
    // discussion prompt (frontmatter `kind: discussion`) whose deliverable is
    // written decisions and the prompts they produce. So once anything has
    // shipped, an empty pointer is drift, not rest.
    //
    // The exemption is deliberate: a cockpit that has shipped nothing is "not
    // started", not "finished" — `casp init` stays green out of the box, and a
    // fresh state with an honest null pointer keeps passing.
    const shipped = Array.isArray(state.phases_shipped) ? state.phases_shipped : [];
    if (pointerEmpty && queued.length === 0 && shipped.length > 0) {
      record(
        'next_prompt.never_empty_after_shipping',
        'fail',
        'the cockpit has shipped and reports nothing to start',
        `next_prompt is empty, the queue is empty, and phases_shipped holds ${shipped.length}: a finished roadmap is not a finished project`,
        'queue a DISCUSSION prompt (`casp new discussion --slug <slug>`): what comes after the roadmap — distribution, pricing, support, the next roadmap — is a decision to obtain from the human, and a decision is a session. Point next_prompt at it.',
        { expected: 'a path to a queued prompt (kind: discussion when the roadmap is done)', actual: JSON.stringify(state.next_prompt ?? null) }
      );
    } else if (shipped.length > 0) {
      record(
        'next_prompt.never_empty_after_shipping',
        'pass',
        'the cockpit has shipped and still names something to start',
        ''
      );
    }
  }

  /* 2. next_prompt resolves --------------------------------------------- */

  // A non-string next_prompt (a number, a list, an object — state.json accepts
  // any JSON) used to reach join() and throw ERR_INVALID_ARG_TYPE, taking the
  // WHOLE report down with a raw stack trace: the gate crashed instead of
  // reporting drift. Same class as the scalar-state.json crash fixed in 0.12.1.
  // A value that is not a path is a shape error, and shape errors are findings.
  if (state.next_prompt !== undefined && state.next_prompt !== null && typeof state.next_prompt !== 'string') {
    record(
      'next_prompt.exists',
      'fail',
      'state.json.next_prompt is not a string',
      `next_prompt is a ${Array.isArray(state.next_prompt) ? 'list' : typeof state.next_prompt} — it must be a repo-relative path, or null when there is no queued next slice`,
      'set next_prompt to a path like "docs/plan/sessions/PHASE-<slug>.md", or to null',
      { expected: 'a repo-relative path (or null)', actual: JSON.stringify(state.next_prompt) }
    );
  } else if (state.next_prompt && isPlaceholderPath(state.next_prompt)) {
    // The string 'none' is NOT a path and NOT a deliberate park — it is an
    // operator (or agent) reaching for a sentinel this format never defined.
    // It used to land in the branch below and be reported as "points at a
    // missing file", whose remediation ("draft the prompt at that path") is
    // nonsense: nobody wants a file called none.md. Worse, the string is
    // truthy, so every downstream reader that guards on `state.next_prompt`
    // believed a next slice existed. Own the case explicitly and say which of
    // the two real values the operator meant.
    record(
      'next_prompt.exists',
      'fail',
      'state.json.next_prompt is a placeholder, not a path',
      `next_prompt is "${state.next_prompt}" — this format has no string sentinel for "nothing queued"`,
      'set next_prompt to the path of the next prompt file, or to null (the parked value). Note that null is only valid when phases_queued is empty.',
      { expected: 'a repo-relative path, or null', actual: JSON.stringify(state.next_prompt) }
    );
  } else if (state.next_prompt) {
    const path = join(root, state.next_prompt);
    if (!existsSync(path)) {
      record(
        'next_prompt.exists',
        'fail',
        'state.json.next_prompt points at a missing file',
        `${state.next_prompt} does not exist`,
        `draft the prompt at that path (try \`npx @justethales/casp new prompt --slug <slug>\`) OR fix state.json.next_prompt`
      );
    } else {
      record(
        'next_prompt.exists',
        'pass',
        'next_prompt file exists',
        state.next_prompt
      );

      const read = readFrontmatter(path);
      const fm = read.ok ? read.fm : null;
      if (!read.ok) {
        recordUnreadable('next_prompt', state.next_prompt, read.error);
      } else if (!fm) {
        record(
          'next_prompt.frontmatter',
          'fail',
          'next_prompt has no frontmatter',
          `${state.next_prompt} should start with --- ... ---`,
          `add status / session_id / drafted_at frontmatter`
        );
      } else {
        const status = String(fm.status ?? '');
        if (status === 'shipped') {
          record(
            'next_prompt.status',
            'fail',
            'next_prompt is already SHIPPED',
            `${state.next_prompt} has status: shipped — casp was not bumped after that session`,
            `either update state.json.next_prompt to the real next slice, or re-execute the shipped prompt explicitly`,
            { expected: 'queued', actual: 'shipped' }
          );
        } else if (status === 'queued' || status === 'in-progress') {
          record(
            'next_prompt.status',
            'pass',
            `next_prompt status is '${status}'`,
            state.next_prompt
          );
        } else {
          record(
            'next_prompt.status',
            'warn',
            'next_prompt has unusual status',
            `status='${status}' — expected 'queued' or 'in-progress'`,
            `set status: queued in the prompt frontmatter`,
            { expected: 'queued', actual: status }
          );
        }
      }
    }
  }

  /* 3. last_session_id → log -------------------------------------------- */

  // A state claim must be verifiable or the check FAILs — a check that cannot
  // find what it needs never reports green. A placeholder ('pending', fresh
  // init) is not a claim: WARN, consistent with last_commit='pending'.
  if (state.last_session_id === 'pending') {
    record(
      'last_session.log_exists',
      'warn',
      "last_session_id is 'pending'",
      'expected before the first session closes',
      'set last_session_id when the first session log is written'
    );
  } else if (
    typeof state.last_session_id === 'string' &&
    state.last_session_id.trim() === ''
  ) {
    // Empty string is neither a session id nor the 'pending' placeholder —
    // treating it as "no claim" would be a silent green.
    record(
      'last_session.id_empty',
      'fail',
      'last_session_id is empty',
      `'' is neither a session id nor the 'pending' placeholder`,
      "set last_session_id to the real session id (or 'pending' before the first session)"
    );
  } else if (state.last_session_id) {
    if (!isDir(LOGS_DIR)) {
      record(
        'last_session.logs_dir',
        'fail',
        `cannot verify last_session_id: ${dirs.logsRel}/ is not a directory`,
        `state claims session ${state.last_session_id} but ${dirs.logsRel}/ is missing (or not a directory)`,
        `create ${dirs.logsRel}/ and write the log OR fix last_session_id`
      );
    } else {
      const logPath = join(LOGS_DIR, `${state.last_session_id}.md`);
      if (existsSync(logPath)) {
        record(
          'last_session.log_exists',
          'pass',
          'last_session_id has a matching session log',
          `${dirs.logsRel}/${state.last_session_id}.md`
        );
      } else {
        record(
          'last_session.log_exists',
          'fail',
          'last_session_id does not map to a session log',
          `expected ${dirs.logsRel}/${state.last_session_id}.md`,
          `write the session log (try \`npx @justethales/casp new log --slug <slug>\`) OR fix last_session_id`
        );
      }
    }
  }

  /* 3b. phases_shipped claims a history → its dirs must exist ------------ */

  if (Array.isArray(state.phases_shipped) && state.phases_shipped.length > 0) {
    const historyDirs: Array<[string, string, string]> = [
      [SESSIONS_DIR, `${dirs.sessionsRel}/`, 'sessions_dir'],
      [LOGS_DIR, `${dirs.logsRel}/`, 'logs_dir']
    ];
    for (const [dir, name, key] of historyDirs) {
      if (!isDir(dir)) {
        record(
          `shipped_history.${key}`,
          'fail',
          `cannot verify shipped history: ${name} not found`,
          `state claims ${state.phases_shipped.length} shipped phase(s) but ${name} is missing (or not a directory)`,
          `create ${name} (the protocol's prompts and logs live there) OR empty phases_shipped`
        );
      }
    }
  }

  /* 3c. phases_shipped → declaring session log --------------------------- */

  // The scoreboard must not claim more than the record supports: a phase listed
  // in phases_shipped should have a session log that says so.
  //
  // The mapping is DECLARED, never inferred. A log opts in with a `phase:` key
  // in its frontmatter (a scalar id, or a list when one session shipped several).
  // Filenames are deliberately not consulted: a log named
  // `26-07-19-001-0-10-0-audit-watermark.md` versus the phase id
  // `0.10.0-audit-watermark` would need exactly the fuzzy match this category
  // refuses to make. If the mapping needs a guess, there is no finding.
  //
  // ADOPTION IS DERIVED, not configured. phases_shipped is ordered and
  // append-only, so the first entry any log declares marks where the convention
  // was adopted; from that index on, every entry must be declared. Entries
  // before it predate adoption and are exempt — a repo that adopts CASP with
  // history behind it is not asked to invent logs it never wrote, and a repo
  // that never adopts the key gets no finding at all (silence, like migrations).
  // Backfilling an old log only moves the window earlier; it never fabricates.
  if (
    Array.isArray(state.phases_shipped) &&
    state.phases_shipped.length > 0 &&
    isDir(LOGS_DIR)
  ) {
    const declared = new Set<string>();
    const logsDir = readDirEntries(LOGS_DIR);
    if (!logsDir.ok) recordUnreadable(`${dirs.logsRel}/`, dirs.logsRel, logsDir.error);
    for (const entry of logsDir.ok ? logsDir.entries : []) {
      if (!entry.endsWith('.md')) continue;
      const logPath = join(LOGS_DIR, entry);
      const read = readFrontmatter(logPath);
      // A log this process could not read is repo content the gate needed and
      // did not get: a finding, never a crash and never a silent skip.
      //
      // `vanished` is NOT exempt here, though it is tempting: this walk builds
      // the set of DECLARED phases, and a log that disappears mid-walk empties
      // that set, which collapses the adoption window and silences the whole
      // `shipped_log` category — turning a genuine FAIL into no output at all.
      // A category that cannot see all its evidence must not conclude.
      if (!read.ok) {
        recordUnreadable('session log', relative(root, logPath), read.error);
        continue;
      }
      const value = read.fm?.phase;
      if (typeof value === 'string') {
        if (value.trim()) declared.add(value.trim());
      } else if (Array.isArray(value)) {
        for (const v of value) {
          if (typeof v === 'string' && v.trim()) declared.add(v.trim());
        }
      }
    }

    // No log declares a phase → the convention is not adopted here. Silence.
    const shipped = state.phases_shipped;
    const from = shipped.findIndex((p) => declared.has(p));
    // from === -1: logs declare phases, but none of them is in phases_shipped
    // yet (a template placeholder, or a log written before its state bump).
    // The window never opens, so there is nothing to enforce — silence, not a
    // finding built on a slice(-1) that would check only the last entry.
    if (declared.size > 0 && from !== -1) {
      const inWindow = shipped.slice(from);
      // Deduplicated: a repeated phases_shipped entry is CASP-STATE-003's finding
      // to report, and naming it twice here would read as two separate gaps.
      const undeclared = [...new Set(inWindow.filter((p) => !declared.has(p)))];

      // Pre-adoption entries are exempt, but never silently: the count is stated
      // so a green line can't be read as "all of history is logged".
      const scope =
        from > 0
          ? `${inWindow.length} phase(s) since '${shipped[from]}' (${from} pre-adoption entr${from === 1 ? 'y' : 'ies'} exempt)`
          : `all ${inWindow.length} shipped phase(s)`;

      if (undeclared.length === 0) {
        record(
          'shipped_log.declared',
          'pass',
          'every shipped phase has a declaring session log',
          scope
        );
      } else {
        record(
          'shipped_log.declared',
          'fail',
          `${undeclared.length} shipped phase(s) have no session log`,
          `${undeclared.join(', ')} — not declared by any \`phase:\` in ${dirs.logsRel}/`,
          `add \`phase: <id>\` to the frontmatter of the log that shipped it (or write the missing log) OR remove the entry from phases_shipped`,
          // A real diffable pair, per docs/check-json.md: what the window
          // requires vs what is actually missing from it.
          { expected: inWindow.join(', '), actual: undeclared.join(', ') }
        );
      }
    }
  }

  /* 4. last_commit vs git ----------------------------------------------- */

  if (!noGit && state.last_commit && state.last_commit !== 'pending') {
    const head = git('rev-parse --short HEAD', root);
    if (!head) {
      record('last_commit.git', 'warn', 'cannot run git', 'is this a repo?');
    } else if (
      head.startsWith(state.last_commit) ||
      state.last_commit.startsWith(head)
    ) {
      record(
        'last_commit.git',
        'pass',
        'last_commit matches HEAD',
        `state=${state.last_commit} HEAD=${head}`
      );
    } else {
      // last_commit is repo content — inject-safe form (a crafted value can't
      // reach a shell; it becomes one invalid ref → git errors → '' → FAIL).
      const exists = gitArgs(['rev-parse', '--verify', `${state.last_commit}^{commit}`], root);
      if (exists) {
        // The canonical close loop ends with a state-bump commit: the session
        // is committed, last_commit is set to that SHA, and the bump itself is
        // committed — moving HEAD one past last_commit. That is not drift.
        // PASS when last_commit is the parent of HEAD and HEAD touches only
        // the state surface; anything else stays WARN.
        const parent = git('rev-parse --short HEAD^', root);
        const isParent =
          parent.length > 0 &&
          (parent.startsWith(state.last_commit) ||
            state.last_commit.startsWith(parent));
        const touched = git('diff-tree --no-commit-id --name-only -r HEAD', root)
          .split('\n')
          .filter(Boolean);
        const STATE_SURFACE = ['casp/', `${dirs.sessionsRel}/`, `${dirs.logsRel}/`];
        const bumpOnly =
          touched.length > 0 &&
          touched.every((f) => STATE_SURFACE.some((p) => f.startsWith(p)));
        if (isParent && bumpOnly) {
          record(
            'last_commit.git',
            'pass',
            'last_commit is the parent of HEAD (state-bump commit)',
            `state=${state.last_commit} HEAD=${head} touches only the state surface`
          );
        } else {
          record(
            'last_commit.git',
            'warn',
            'last_commit is in history but not at HEAD',
            `state=${state.last_commit} HEAD=${head}`,
            `if the new commits are out-of-band work, bump state.last_commit to ${head}`,
            { expected: head, actual: state.last_commit }
          );
        }
      } else {
        record(
          'last_commit.git',
          'fail',
          'last_commit not found in git',
          `state=${state.last_commit} does not exist in this repo`,
          `set state.last_commit to a real SHA (HEAD = ${head})`,
          { expected: head, actual: state.last_commit }
        );
      }
    }
  } else if (state.last_commit === 'pending') {
    record(
      'last_commit.git',
      'warn',
      "last_commit is 'pending'",
      'expected after first commit of session, before push',
      'bump state.last_commit to the commit SHA before push'
    );
  }

  /* 5. phases_shipped uniqueness ---------------------------------------- */

  if (Array.isArray(state.phases_shipped)) {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const p of state.phases_shipped) {
      if (seen.has(p)) dupes.push(p);
      seen.add(p);
    }
    if (dupes.length) {
      record(
        'phases_shipped.unique',
        'fail',
        'phases_shipped has duplicates',
        dupes.join(', '),
        'dedupe the array'
      );
    } else {
      record(
        'phases_shipped.unique',
        'pass',
        `phases_shipped is unique (${state.phases_shipped.length} entries)`,
        ''
      );
    }
  }

  /* 6. migrations_applied (opt-in) -------------------------------------- */

  // Migrations are entirely optional. A project that tracks none (no
  // migrations_dir, no/empty migrations_applied) gets no migration finding at
  // all — silence, not a green line — so non-code cockpits carry no noise.
  const migrationsClaimed =
    Array.isArray(state.migrations_applied) &&
    state.migrations_applied.length > 0;
  if (dirs.migrationsRel === null || dirs.migrationsAbs === null) {
    if (migrationsClaimed) {
      // A claim with nothing to verify it against is drift, not a skip.
      record(
        'migrations.dir',
        'fail',
        'migrations_applied is set but migrations_dir is absent',
        `state claims ${(state.migrations_applied as string[]).length} migration(s) with no migrations_dir to verify against`,
        'set state.migrations_dir to the migrations directory OR empty migrations_applied'
      );
    }
    // else: this project has no migration concept → skip silently.
  } else {
    const migrationsDir = dirs.migrationsAbs;
    if (migrationsClaimed && !isDir(migrationsDir)) {
      // The canonical false-green: state claims applied migrations, the dir is
      // gone — the old behavior silently skipped and reported green.
      record(
        'migrations.dir',
        'fail',
        `cannot verify migrations_applied: ${dirs.migrationsRel}/ not found`,
        `state claims ${(state.migrations_applied as string[]).length} migration(s) but the directory is missing`,
        'create the migrations directory OR fix state.migrations_dir OR empty migrations_applied'
      );
    } else if (Array.isArray(state.migrations_applied) && isDir(migrationsDir)) {
      // Migration files: SQL (drizzle, raw) or Python (alembic). Dunder entries
      // (__init__.py, __pycache__) are infrastructure, not migrations.
      const dir = readDirEntries(migrationsDir);
      // The directory is there and cannot be listed. Comparing against an empty
      // listing would print every declared migration as "disk-missing" — a
      // fabricated diff. Report what is actually wrong, and skip the comparison
      // (only this block: the rest of the report is still worth having).
      const onDisk = (dir.ok ? dir.entries : [])
        .filter((f) => /\.(sql|py)$/.test(f) && !f.startsWith('__'))
        .map((f) => f.replace(/\.(sql|py)$/, ''))
        .sort();
      const inState = [...state.migrations_applied].sort();
      const missingFromState = onDisk.filter((m) => !inState.includes(m));
      const missingFromDisk = inState.filter((m) => !onDisk.includes(m));
      if (!dir.ok) {
        recordUnreadable(`${dirs.migrationsRel}/`, dirs.migrationsRel, dir.error);
      } else if (missingFromState.length || missingFromDisk.length) {
        record(
          'migrations.match',
          'fail',
          `migrations_applied does not match ${dirs.migrationsRel}/`,
          `state-missing: ${missingFromState.join(', ') || '(none)'} · disk-missing: ${missingFromDisk.join(', ') || '(none)'}`,
          'add missing-from-state to state.migrations_applied OR remove ghosts',
          { expected: onDisk.join(', '), actual: inState.join(', ') }
        );
      } else if (onDisk.length > 0) {
        record(
          'migrations.match',
          'pass',
          `migrations_applied matches ${dirs.migrationsRel}/ (${onDisk.length} files)`,
          ''
        );
      }
    } else if (!Array.isArray(state.migrations_applied) && isDir(migrationsDir)) {
      // migrations_dir is configured and the directory exists, but state does
      // not declare migrations_applied at all. If the directory actually holds
      // migration files, the cockpit is blind to them — a likely mis-config.
      // WARN, not FAIL: a genuinely empty dir is legitimate (fresh project), so
      // only flag when files are present. Non-blocking by design.
      const dir = readDirEntries(migrationsDir);
      const onDisk = dir.ok
        ? dir.entries.filter((f) => /\.(sql|py)$/.test(f) && !f.startsWith('__'))
        : [];
      if (!dir.ok) {
        recordUnreadable(`${dirs.migrationsRel}/`, dirs.migrationsRel, dir.error);
      } else if (onDisk.length > 0) {
        record(
          'migrations.untracked',
          'warn',
          `${dirs.migrationsRel}/ holds ${onDisk.length} migration file(s) but migrations_applied is not set`,
          'state does not track any migrations while the configured directory contains some',
          'add the applied migrations to state.migrations_applied OR remove migrations_dir if unused'
        );
      }
    }
  }

  /* 7. Session prompt frontmatter --------------------------------------- */

  const VALID_STATUS = new Set(['queued', 'in-progress', 'shipped', 'archived']);
  if (isDir(SESSIONS_DIR)) {
    const sessionsDir = readDirEntries(SESSIONS_DIR);
    if (!sessionsDir.ok) {
      recordUnreadable(`${dirs.sessionsRel}/`, dirs.sessionsRel, sessionsDir.error);
    }
    const prompts = (sessionsDir.ok ? sessionsDir.entries : [])
      .filter((f) => f.endsWith('.md'))
      .map((f) => join(SESSIONS_DIR, f));

    let shippedWithoutLog = 0;
    let invalidStatusValues: string[] = [];
    // Entries that could not be read at all are counted out of the PASS lines
    // below — "all N prompt(s) have canonical status" must never include a
    // prompt whose status nobody was able to look at.
    let unreadable = 0;

    for (const p of prompts) {
      const rel = relative(root, p);
      const read = readFrontmatter(p);
      if (!read.ok) {
        // A directory named `*.md`, a mode-000 prompt, a FIFO: enumerated as a
        // prompt, so it is a claim the gate needed and did not get. `vanished`
        // included — the walk's own status/session_log findings go missing with
        // it, and a claim nobody could examine is not a claim that passed.
        recordUnreadable('prompt', rel, read.error);
        unreadable++;
        continue;
      }
      const fm = read.fm;
      if (!fm) {
        record(
          `prompt.${rel}.frontmatter`,
          'warn',
          'prompt has no parsable frontmatter',
          rel
        );
        continue;
      }
      const status = String(fm.status ?? '');
      if (!VALID_STATUS.has(status)) {
        invalidStatusValues.push(`${rel} status='${status}'`);
      }
      if (status === 'shipped') {
        const logField = String(fm.session_log ?? '');
        if (!logField || logField === 'pending') {
          shippedWithoutLog++;
          record(
            `prompt.${rel}.session_log`,
            'fail',
            'shipped prompt has no session_log pointer',
            rel,
            `set session_log: ${dirs.logsRel}/<id>.md in the frontmatter`
          );
        } else {
          // A phase shipped across several sessions lists its logs as a YAML
          // list or a comma-separated string. Every entry must resolve.
          const rawLog = fm.session_log;
          const entries = (
            Array.isArray(rawLog) ? rawLog.map(String) : logField.split(',')
          )
            .map((s) => s.trim())
            .filter(Boolean);
          const missing = entries.filter((e) => !existsSync(join(root, e)));
          if (missing.length) {
            record(
              `prompt.${rel}.session_log_exists`,
              'fail',
              "shipped prompt's session_log file is missing",
              `${rel} -> ${missing.join(', ')}`,
              'either write the missing log(s) OR fix the pointer (repo-relative paths, comma-separated)'
            );
          }
        }
      }
    }

    const readable = prompts.length - unreadable;
    if (invalidStatusValues.length) {
      record(
        'prompts.status_values',
        'warn',
        'some prompts have non-canonical status values',
        invalidStatusValues.join(' · '),
        `use one of: ${[...VALID_STATUS].join(' | ')}`
      );
    } else if (readable > 0) {
      record(
        'prompts.status_values',
        'pass',
        `all ${readable} prompt(s) have canonical status`,
        ''
      );
    }
    if (shippedWithoutLog === 0 && readable > 0) {
      record(
        'prompts.shipped_logged',
        'pass',
        'every shipped prompt has a session_log pointer',
        ''
      );
    }
  }

  /* 7b. Prompt-chain integrity (opt-in via `next_after`) ------------------ */

  // The queue is the product's second half: you plan a run of prompts once and
  // execute one slice per session. Everything above validates the HEAD of that
  // queue and the integrity of what already shipped — nothing validated the
  // ordering of what has not run yet. These four findings do.
  //
  // ADOPTION IS DERIVED, never configured (no new state key). `next_after` is a
  // declaration like `phase:` in a session log: the canonical template ships a
  // literal placeholder, so an unedited value is not a claim and produces
  // nothing. A repo where no queued prompt declares a real predecessor gets no
  // finding at all — silence, exactly as CASP-SESSION-003 stays silent where no
  // log declares a phase. Shipped prompts are resolution targets, never
  // subjects: history is not re-litigated.
  //
  // Severity split: a dangling reference and a cycle are claims that CANNOT be
  // true — the plan is unexecutable as written, so they gate. A fork or an
  // orphan is AMBIGUOUS rather than false, and a deliberate parking lot of
  // queued-but-unchained prompts is a legitimate way to work; reddening it
  // would punish a real workflow.
  {
    const chain = analyzeChain(root, state, dirs);
    if (chain && chain.adopted) {
      const skipped =
        chain.skipped > 0
          ? ` (${chain.skipped} queued prompt(s) declare no next_after — not a claim, skipped)`
          : '';

      for (const d of chain.dangling) {
        record(
          `prompt_chain.dangling.${d.rel}`,
          'fail',
          'next_after names a slice that resolves to nothing',
          `${d.rel} → '${d.value}' matches no prompt, session log, or phase id`,
          `point next_after at an existing prompt slug, session id, or phase id — or remove the key`,
          { expected: 'a resolvable slice', actual: d.value }
        );
      }

      for (const ring of chain.cycles) {
        const shown = ring.length === 1 ? `${ring[0]} → itself` : `${ring.join(' → ')} → ${ring[0]}`;
        record(
          `prompt_chain.cycle.${ring[0]}`,
          'fail',
          'the next_after chain contains a cycle',
          shown,
          'break the ring — no linear execution can satisfy it'
        );
      }

      for (const f of chain.forks) {
        // Show each claimant's own spelling: two prompts can name one slice
        // differently ('PHASE-A' and 'phase-a'), and a message that printed
        // only the canonical name would look like the operator wrote something
        // they never wrote.
        const spellings = [...new Set(f.claims.map((x) => x.value))];
        const how =
          spellings.length > 1
            ? f.claims.map((x) => `${x.rel} (as '${x.value}')`).join(', ')
            : f.claims.map((x) => x.rel).join(', ');
        record(
          `prompt_chain.fork.${f.target}`,
          'warn',
          `${f.claims.length} queued prompts declare the same predecessor`,
          `${f.target} — claimed by ${how}`,
          'chain them in sequence so "what runs after that slice" has one answer'
        );
      }

      for (const rel of chain.orphans) {
        record(
          `prompt_chain.orphan.${rel}`,
          'warn',
          'a queued prompt is unreachable from next_prompt',
          `${rel} declares a predecessor but no chain from the head reaches it`,
          'chain it onto the queue, or leave next_after unset to park it deliberately'
        );
      }

      // The scope line is emitted either way. When the chain is coherent it is
      // the PASS; when it is not, it still states what was examined and what
      // was skipped — the count must not vanish exactly when the report is
      // non-trivial (spec: never silent).
      const coherent =
        chain.dangling.length === 0 &&
        chain.cycles.length === 0 &&
        chain.forks.length === 0 &&
        chain.orphans.length === 0;
      record(
        coherent ? 'prompt_chain.coherent' : 'prompt_chain.scope',
        'pass',
        coherent
          ? 'the queued next_after chain is coherent'
          : 'the queued next_after chain was checked',
        `${chain.declaring} chained prompt(s)${skipped}`
      );
    }
  }

  /* 7c. Facts layer (opt-in via casp/facts.json) -------------------------- */

  // OPT-IN, same posture as CASP-SESSION-003 / CASP-PROMPT-007..010: a cockpit
  // that never scaffolds casp/facts.json gets NO CASP-FACT-* finding — not even
  // a PASS. This proves freshness, never truth: a source hash unchanged and a
  // TTL unexpired mean "verified recently against this evidence", not "correct".
  {
    const factsPath = join(root, 'casp', 'facts.json');
    const analysis = analyzeFacts(root, factsPath);
    if (analysis.adopted && analysis.malformed) {
      record(
        'fact.file',
        'fail',
        'casp/facts.json is present but not valid',
        analysis.detail,
        'fix the JSON, or remove the file to opt back out of the facts layer'
      );
    } else if (analysis.adopted && !analysis.malformed) {
      for (const check of analysis.checks) {
        record(
          `fact.source.${check.id}`,
          check.source.ok ? 'pass' : 'fail',
          check.source.ok
            ? `fact '${check.id}': source resolves`
            : `fact '${check.id}': source does not resolve`,
          check.source.detail,
          check.source.ok ? undefined : 'point source at an existing repo path, or prefix external: OR remove the fact'
        );

        if (check.hash.applicable) {
          record(
            `fact.hash.${check.id}`,
            check.hash.ok ? 'pass' : 'fail',
            check.hash.ok
              ? `fact '${check.id}': source_hash matches`
              : `fact '${check.id}': source_hash does not match current source`,
            check.hash.detail,
            check.hash.ok ? undefined : `casp fact verify ${check.id}`
          );
        }

        record(
          `fact.ttl.${check.id}`,
          check.ttl.severity,
          check.ttl.severity === 'pass'
            ? `fact '${check.id}': within TTL`
            : check.ttl.severity === 'warn'
              ? `fact '${check.id}': past TTL`
              : `fact '${check.id}': more than double the TTL`,
          check.ttl.detail,
          check.ttl.severity === 'pass' ? undefined : `casp fact verify ${check.id}`
        );

        for (const u of check.usedIn) {
          record(
            `fact.used_in.${check.id}.${u.path}`,
            u.ok ? 'pass' : 'warn',
            u.ok
              ? `fact '${check.id}': ${u.path} carries its marker`
              : `fact '${check.id}': ${u.path} does not carry its marker`,
            u.detail,
            u.ok ? undefined : `add <!-- casp:fact ${check.id} --> … <!-- /casp:fact --> in ${u.path}, or fix/remove the used_in entry`
          );
        }

        record(
          `fact.method.${check.id}`,
          check.method.ok ? 'pass' : 'warn',
          check.method.ok ? `fact '${check.id}': method recorded` : `fact '${check.id}': no method recorded`,
          check.method.detail,
          check.method.ok ? undefined : 'record the command/query/console path that produced the value'
        );

        if (check.trap.applicable) {
          record(
            `fact.trap.${check.id}`,
            check.trap.hit ? 'fail' : 'pass',
            check.trap.hit
              ? `fact '${check.id}': method matches a known measurement trap`
              : `fact '${check.id}': method matches no known trap`,
            check.trap.detail,
            check.trap.hit ? 'use a real measurement, not an estimate that reads like one — then re-verify' : undefined
          );
        }
      }
    }
    // else: no casp/facts.json — this project has not adopted the facts layer,
    // skip entirely (silence, exactly like an unconfigured migrations_dir).
  }

  /* 8. Working tree clean for casp + sessions + logs -------------------- */

  if (!noGit) {
    // sessionsRel / logsRel come from state (repo content) — inject-safe form.
    const dirty = gitArgs(
      ['status', '--porcelain', 'casp', dirs.sessionsRel, dirs.logsRel],
      root
    );
    if (dirty) {
      record(
        'workdir.clean',
        'warn',
        'casp / sessions / logs have uncommitted changes',
        dirty.split('\n').slice(0, 5).join(' · '),
        'commit + push before the session closes'
      );
    } else {
      record('workdir.clean', 'pass', 'casp + sessions + logs are committed', '');
    }
  }

  return findings;
}

/**
 * `checkOne` with a floor under it.
 *
 * Every read path above returns a result instead of throwing, so this should
 * never fire — that is the point: the fix is the read paths, and this is the
 * backstop, not the fix. If it ever does fire, the run still produces a REPORT
 * (a `--json` consumer gets a parseable document; a human gets a FAIL line)
 * rather than a Node stack trace and an empty stdout.
 *
 * It fails CLOSED. Swallowing the error into an exit-0 pass would turn a loud
 * crash into a silent green, which is strictly worse than the bug it replaces.
 */
export function checkOneSafe(root: string, opts: { noGit?: boolean } = {}): Finding[] {
  try {
    return checkOne(root, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      {
        id: 'check.incomplete',
        severity: 'fail',
        label: 'the validation run could not complete',
        detail: message.split('\n')[0],
        fix: 'this is a casp bug — please report it with the command and the message above',
        expected: null,
        actual: null
      }
    ];
  }
}

/* Human report rendering — extracted so single-root and --all share it. ---- */

export function printReport(findings: Finding[], quiet: boolean): void {
  const { pass, warn, fail } = summarize(findings);
  const head = `${c.bold('casp:check')} · ${pass} PASS · ${warn > 0 ? c.yellow(`${warn} WARN`) : `${warn} WARN`} · ${fail > 0 ? c.red(`${fail} FAIL`) : `${fail} FAIL`}`;
  console.log('');
  console.log(head);
  console.log(c.gray('─'.repeat(70)));
  for (const f of findings) {
    const tag =
      f.severity === 'pass'
        ? c.green('PASS')
        : f.severity === 'warn'
          ? c.yellow('WARN')
          : c.red('FAIL');
    if (f.severity === 'pass' && quiet) continue;
    const detail = f.detail ? c.gray(` · ${f.detail}`) : '';
    // Surface the stable rule code on actionable findings only (warn/fail), so a
    // reader can `casp explain <CODE>`. PASS lines stay uncluttered.
    const code = f.severity !== 'pass' ? `${c.gray(ruleFor(f.id)?.code ?? '')} ` : '';
    console.log(`  ${tag}  ${code}${f.label}${detail}`);
    if (f.fix && f.severity !== 'pass') {
      console.log(`        ${c.cyan('→')} ${c.gray(f.fix)}`);
    }
  }
  console.log('');
  if (fail > 0) {
    console.log(
      c.red(`✗ ${fail} drift${fail > 1 ? 's' : ''} detected. Push blocked — fix before push.`)
    );
  } else if (warn > 0) {
    console.log(c.yellow(`⚠ ${warn} warning${warn > 1 ? 's' : ''} (not blocking).`));
  } else {
    console.log(c.green('✓ state in sync with git. Clear for push.'));
  }
  console.log('');
}

/* --all: discover and validate every cockpit under a root. ----------------- */

const WALK_SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build']);

function findCockpits(root: string): string[] {
  const found: string[] = [];
  // Track resolved real paths so a symlink cycle (a/b -> ../a) can't recurse
  // forever — the walk crosses arbitrary user trees under --all.
  const visited = new Set<string>();
  const walk = (dir: string): void => {
    let real: string;
    try {
      real = realpathSync(dir);
    } catch {
      return;
    }
    if (visited.has(real)) return;
    visited.add(real);

    if (existsSync(join(dir, 'casp', 'state.json'))) found.push(dir);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith('.') || WALK_SKIP.has(entry)) continue;
      if (entry === 'casp') continue; // the cockpit itself holds no nested cockpits
      const sub = join(dir, entry);
      try {
        if (statSync(sub).isDirectory()) walk(sub);
      } catch {
        /* unreadable entry — skip */
      }
    }
  };
  walk(root);
  return found;
}

function runAll(root: string, opts: { json: boolean; quiet: boolean; noGit: boolean }): never {
  const cockpits = findCockpits(root);

  if (cockpits.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ root, cockpits: [] }, null, 2));
      exit(0);
    }
    console.log('');
    console.log(c.yellow(`no casp/ cockpit found under ${root}`));
    console.log(c.gray('  → run `npx @justethales/casp init` in a project first'));
    console.log('');
    exit(0);
  }

  const results = cockpits.map((dir) => ({
    root: relative(root, dir) || basename(dir) || '.',
    findings: checkOneSafe(dir, { noGit: opts.noGit })
  }));

  const anyFail = results.some((r) => summarize(r.findings).fail > 0);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          root,
          cockpits: results.map((r) => ({
            root: r.root,
            ...buildReport(r.findings)
          }))
        },
        null,
        2
      )
    );
    exit(anyFail ? 1 : 0);
  }

  let totPass = 0;
  let totWarn = 0;
  let totFail = 0;
  for (const r of results) {
    const s = summarize(r.findings);
    totPass += s.pass;
    totWarn += s.warn;
    totFail += s.fail;
  }
  console.log('');
  console.log(
    `${c.bold('casp:check --all')} · ${cockpits.length} cockpit${cockpits.length > 1 ? 's' : ''} · ${totPass} PASS · ${totWarn > 0 ? c.yellow(`${totWarn} WARN`) : `${totWarn} WARN`} · ${totFail > 0 ? c.red(`${totFail} FAIL`) : `${totFail} FAIL`}`
  );
  for (const r of results) {
    const s = summarize(r.findings);
    const verdict =
      s.fail > 0
        ? c.red('FAIL')
        : s.warn > 0
          ? c.yellow('WARN')
          : c.green('PASS');
    console.log('');
    console.log(`${verdict}  ${c.cyan(r.root)}  ${c.gray(`(${s.pass}/${s.warn}/${s.fail})`)}`);
    for (const f of r.findings) {
      if (f.severity === 'pass') continue; // --all summary shows only WARN/FAIL per cockpit
      const tag = f.severity === 'fail' ? c.red('FAIL') : c.yellow('WARN');
      const detail = f.detail ? c.gray(` · ${f.detail}`) : '';
      console.log(`    ${tag}  ${f.label}${detail}`);
      if (f.fix) console.log(`          ${c.cyan('→')} ${c.gray(f.fix)}`);
    }
  }
  console.log('');
  if (anyFail) {
    console.log(c.red(`✗ drift in at least one cockpit. Push blocked.`));
  } else if (totWarn > 0) {
    console.log(c.yellow(`⚠ ${totWarn} warning${totWarn > 1 ? 's' : ''} across cockpits (not blocking).`));
  } else {
    console.log(c.green('✓ every cockpit in sync with git. Clear for push.'));
  }
  console.log('');
  exit(anyFail ? 1 : 0);
}

export function runCheck(args: string[]): void {
  const json = args.includes('--json');
  const quiet = args.includes('--quiet');
  const noGit = args.includes('--no-git');
  const all = args.includes('--all');

  if (all) {
    // Optional positional root after --all (first non-flag arg); default cwd.
    // resolve() (not join()) so an ABSOLUTE root is used as-is — join(cwd, abs)
    // would concatenate them into a doubled path. Relative roots still resolve
    // against cwd.
    const rootArg = args.find((a) => !a.startsWith('--'));
    const root = rootArg ? resolve(process.cwd(), rootArg) : process.cwd();
    runAll(root, { json, quiet, noGit });
    return; // runAll is `never`, but make the single-root path unreachable explicitly
  }

  const root = process.cwd();
  const findings = checkOneSafe(root, { noGit });

  if (json) emitJson(findings);

  // Terminal cases keep their original short, custom stderr message (not the
  // full report block) so single-root output stays byte-identical to before.
  if (findings.length === 1 && findings[0].id === 'state.file') {
    const f = findings[0];
    if (f.label === 'no casp/state.json found') {
      console.error(c.red('FAIL') + ` no casp/state.json found at ${f.detail}`);
      console.error(c.gray('       → run `npx @justethales/casp init` first'));
    } else {
      console.error(c.red('FAIL') + ' casp/state.json is not valid JSON');
    }
    exit(1);
  }

  const fail = summarize(findings).fail;
  if (!quiet || fail > 0) {
    printReport(findings, quiet);
  }
  exit(fail > 0 ? 1 : 0);
}
