/**
 * 0.4 verbs + optional-migrations + --all.
 *
 *   ship   — flip a prompt to shipped, wire its log, move the slug; idempotent.
 *   close  — bump last_commit/last_session_id from HEAD + newest log; NEVER commits.
 *   migrations — entirely optional: absent → no finding at all; claimed-with-no-dir → FAIL.
 *   check --all — one report across every cockpit under a root; exits 1 if any FAILs.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}
function run(cwd, ...args) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}
function readState(dir) {
  return JSON.parse(readFileSync(join(dir, 'casp', 'state.json'), 'utf8'));
}
function writeState(dir, state) {
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
}

// Sentinel: an extraState value of DEL removes that key entirely (vs. null,
// which is a legitimate parked value the validator must keep).
const DEL = Symbol('delete-key');

/**
 * A committed cockpit with one queued phase, a matching prompt and a session
 * log. `extraState` overrides top-level state keys; DEL removes a key.
 */
function scaffold(extraState = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'casp-verb-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');

  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });

  const sessionId = '26-06-15-001-first-slice';
  writeFileSync(join(dir, 'session-logs', `${sessionId}.md`), '# first slice\n');
  writeFileSync(
    join(dir, 'docs', 'plan', 'sessions', 'PHASE-1-FIRST-SLICE.md'),
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\ndrafted_at: 2026-06-15\n---\n\n# Phase 1 — first slice\n'
  );
  const state = {
    updated_at: '2026-06-15',
    last_session_id: sessionId,
    last_commit: 'pending',
    current_phase: 'phase-1-first-slice',
    next_phase: 'phase-2',
    next_prompt: 'docs/plan/sessions/PHASE-1-FIRST-SLICE.md',
    phases_shipped: [],
    phases_queued: ['phase-1-first-slice'],
    ...extraState
  };
  for (const k of Object.keys(extraState)) if (extraState[k] === DEL) delete state[k];
  writeState(dir, state);

  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return { dir, sessionId };
}

const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

/* ---- init out-of-box experience -------------------------------------- */

test('fresh casp init → casp check is green out of the box (0 FAIL)', () => {
  // The first command a new user runs after init is check (init says so). It
  // must not FAIL on a next_prompt file init itself forgot to create.
  const dir = mkdtempSync(join(tmpdir(), 'casp-init-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    const init = run(dir, 'init');
    assert.equal(init.status ?? 0, 0, init.stderr);
    // init scaffolds the first prompt it points at.
    assert.ok(
      existsSync(join(dir, 'docs', 'plan', 'sessions', 'PHASE-1-FIRST-SLICE.md')),
      'init must create the prompt state.next_prompt points at'
    );
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');
    const r = run(dir, 'check', '--json');
    const report = JSON.parse(r.stdout);
    assert.equal(report.summary.fail, 0, 'fresh init must check with 0 FAIL');
    assert.equal(r.status, 0, 'fresh init → check exits 0');
  } finally {
    cleanup(dir);
  }
});

/* ---- ship ------------------------------------------------------------- */

test('ship: queued phase → prompt shipped, log wired, slug moved', () => {
  const { dir, sessionId } = scaffold();
  try {
    const r = run(dir, 'ship', 'phase-1-first-slice');
    assert.equal(r.status, 0, r.stderr);
    const prompt = readFileSync(
      join(dir, 'docs', 'plan', 'sessions', 'PHASE-1-FIRST-SLICE.md'),
      'utf8'
    );
    assert.match(prompt, /^status: shipped$/m);
    assert.match(prompt, new RegExp(`^session_log: session-logs/${sessionId}\\.md$`, 'm'));
    const s = readState(dir);
    assert.deepEqual(s.phases_queued, []);
    assert.deepEqual(s.phases_shipped, ['phase-1-first-slice']);
  } finally {
    cleanup(dir);
  }
});

test('ship: unknown slug → exit 1, no state change', () => {
  const { dir } = scaffold();
  try {
    const before = readFileSync(join(dir, 'casp', 'state.json'), 'utf8');
    const r = run(dir, 'ship', 'no-such-phase');
    assert.equal(r.status, 1);
    assert.equal(readFileSync(join(dir, 'casp', 'state.json'), 'utf8'), before);
  } finally {
    cleanup(dir);
  }
});

test('ship: unknown slug that MATCHES a prompt filename leaves the prompt untouched', () => {
  // The transaction-semantics guard: a slug can normalize-match a prompt file
  // yet not be in phases_queued. Validation must happen before any write, so
  // the prompt frontmatter must NOT be mutated when the command fails.
  const { dir } = scaffold();
  try {
    const promptPath = join(dir, 'docs', 'plan', 'sessions', 'PHASE-ORPHAN.md');
    const original =
      '---\nstatus: queued\nsession_id: pending\nsession_log: pending\n---\n\n# Orphan\n';
    writeFileSync(promptPath, original);
    // 'orphan' is NOT in phases_queued, but normalize-matches PHASE-ORPHAN.md.
    const r = run(dir, 'ship', 'orphan');
    assert.equal(r.status, 1, 'unknown slug must fail');
    assert.equal(
      readFileSync(promptPath, 'utf8'),
      original,
      'the prompt file must be byte-identical — no partial mutation on failure'
    );
  } finally {
    cleanup(dir);
  }
});

test('ship: re-run on an already-shipped slug is idempotent (no dupe)', () => {
  const { dir } = scaffold();
  try {
    assert.equal(run(dir, 'ship', 'phase-1-first-slice').status, 0);
    assert.equal(run(dir, 'ship', 'phase-1-first-slice').status, 0);
    const s = readState(dir);
    assert.deepEqual(s.phases_shipped, ['phase-1-first-slice'], 'no duplicate on re-ship');
    assert.deepEqual(s.phases_queued, []);
  } finally {
    cleanup(dir);
  }
});

test('ship: refuses when there is no real session-log id', () => {
  const { dir } = scaffold({ last_session_id: 'pending' });
  try {
    const r = run(dir, 'ship', 'phase-1-first-slice');
    assert.equal(r.status, 1, 'shipping with no log id must refuse, not write session_log: pending');
  } finally {
    cleanup(dir);
  }
});

/* ---- close ------------------------------------------------------------ */

test('close --yes: bumps last_commit to HEAD + last_session_id, and NEVER commits', () => {
  const { dir, sessionId } = scaffold();
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8'
    }).trim();
    const commitsBefore = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8'
    }).trim();

    run(dir, 'close', '--yes');

    const s = readState(dir);
    assert.equal(s.last_commit, head, 'last_commit set to current HEAD');
    assert.equal(s.last_session_id, sessionId, 'last_session_id set to newest log');

    // The hard invariant: close did not commit. The state change is uncommitted
    // and the commit count is unchanged.
    const commitsAfter = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8'
    }).trim();
    assert.equal(commitsAfter, commitsBefore, 'close must not create a commit');
    const porcelain = execFileSync('git', ['status', '--porcelain', 'casp/state.json'], {
      cwd: dir,
      encoding: 'utf8'
    });
    assert.match(porcelain, /casp\/state\.json/, 'the state bump is left uncommitted for the operator');
  } finally {
    cleanup(dir);
  }
});

/* ---- the blank-cockpit class (CASP-PROMPT-001 / -005) ----------------- */

// Field history: a session closed with next_prompt set to the STRING "none"
// while phases_queued still held eleven phases. The next session opened on a
// cockpit reporting nothing to do, and the operator had to re-derive the
// backlog by hand from a file that already knew it. Two independent defects
// made that possible, so there are two rules and two tests.

test('next_prompt: the placeholder string "none" FAILs as a placeholder, not as a missing file', () => {
  const { dir } = scaffold({ next_prompt: 'none' });
  try {
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 1);
    const report = JSON.parse(r.stdout);
    const f = report.findings.find((x) => x.id === 'next_prompt.exists');
    assert.ok(f && f.severity === 'fail', 'a placeholder pointer is drift');
    // The distinction is the whole point: "points at a missing file" sends the
    // operator off to create none.md, which is not what anybody wants.
    assert.match(f.label, /placeholder/i, `expected a placeholder verdict, got: ${f.label}`);
    assert.doesNotMatch(f.label, /missing file/i);
  } finally {
    cleanup(dir);
  }
});

test('next_prompt: placeholders are caught case- and .md-insensitively', () => {
  for (const value of ['NONE', ' n/a ', 'TBD', '-', 'none.md']) {
    const { dir } = scaffold({ next_prompt: value });
    try {
      const report = JSON.parse(run(dir, 'check', '--json').stdout);
      const f = report.findings.find((x) => x.id === 'next_prompt.exists');
      assert.ok(f && f.severity === 'fail', `'${value}' must not pass as a path`);
      assert.match(f.label, /placeholder/i, `'${value}' should read as a placeholder`);
    } finally {
      cleanup(dir);
    }
  }
});

test('next_prompt: null while phases are queued → FAIL (parked must be true)', () => {
  const { dir } = scaffold({
    next_prompt: null,
    next_phase: null,
    phases_queued: ['phase-2-second-slice', 'phase-3-third-slice']
  });
  try {
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 1);
    const report = JSON.parse(r.stdout);
    const f = report.findings.find((x) => x.id === 'next_prompt.parked_while_queued');
    assert.ok(f && f.severity === 'fail', 'an empty pointer over a non-empty queue is a contradiction');
    // The operator must get the COUNT back — the number is the thing that makes
    // the contradiction obvious at a glance.
    assert.match(f.detail, /2/, `the finding should report the queue depth: ${f.detail}`);
    assert.match(f.detail, /phase-2-second-slice/);
  } finally {
    cleanup(dir);
  }
});

test('next_prompt: null with an empty queue stays a legitimate park — while nothing has shipped', () => {
  const { dir } = scaffold({ next_prompt: null, next_phase: null, phases_queued: [], phases_shipped: [] });
  try {
    const report = JSON.parse(run(dir, 'check', '--json').stdout);
    const f = report.findings.find((x) => x.id === 'next_prompt.parked_while_queued');
    assert.ok(f && f.severity === 'pass', 'parking is legal — it just has to be honest');
    // Not started is not finished: the never-empty rule stays silent on a fresh cockpit.
    assert.equal(report.findings.find((x) => x.id === 'next_prompt.never_empty_after_shipping'), undefined);
  } finally {
    cleanup(dir);
  }
});

test('next_prompt: null, empty queue, but phases HAVE shipped → FAIL CASP-PROMPT-011', () => {
  const { dir } = scaffold({
    next_prompt: null,
    next_phase: null,
    phases_queued: [],
    phases_shipped: ['phase-1-first-slice']
  });
  try {
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 1, 'a finished roadmap is not a finished project');
    const report = JSON.parse(r.stdout);
    const f = report.findings.find((x) => x.id === 'next_prompt.never_empty_after_shipping');
    assert.ok(f && f.severity === 'fail');
    assert.equal(f.rule, 'CASP-PROMPT-011');
    assert.match(f.fix, /discussion/i, `the remediation names the discussion prompt: ${f.fix}`);
    assert.match(f.detail, /1/, `the finding reports how much has shipped: ${f.detail}`);
  } finally {
    cleanup(dir);
  }
});

test('a queued discussion prompt at the head satisfies the never-empty rule, and `casp next` announces its kind', () => {
  const { dir } = scaffold({
    next_prompt: 'docs/plan/sessions/DISCUSSION-AFTER-THE-ROADMAP.md',
    next_phase: 'discussion-after-the-roadmap',
    phases_queued: ['discussion-after-the-roadmap'],
    phases_shipped: ['phase-1-first-slice']
  });
  try {
    writeFileSync(
      join(dir, 'docs', 'plan', 'sessions', 'DISCUSSION-AFTER-THE-ROADMAP.md'),
      '---\nstatus: queued\nkind: discussion\nsession_id: pending\nsession_log: pending\ndrafted_at: 2026-06-15\n---\n\n# Discussion — after the roadmap\n'
    );
    const report = JSON.parse(run(dir, 'check', '--json').stdout);
    const f = report.findings.find((x) => x.id === 'next_prompt.never_empty_after_shipping');
    assert.ok(f && f.severity === 'pass', 'a discussion prompt is something to start');
    const n = run(dir, 'next', '--no-check');
    assert.equal(n.status, 0);
    assert.match(n.stderr, /DISCUSSION/, 'the human is told the head of the queue is a conversation');
    assert.match(n.stderr, /kind/);
    assert.match(n.stdout, /after the roadmap/);
  } finally {
    cleanup(dir);
  }
});

test('`casp new discussion` scaffolds a kind: discussion prompt named DISCUSSION-<SLUG>', () => {
  const { dir } = scaffold({});
  try {
    const r = run(dir, 'new', 'discussion', '--slug', 'after-the-roadmap');
    assert.equal(r.status, 0, r.stderr);
    const file = join(dir, 'docs', 'plan', 'sessions', 'DISCUSSION-AFTER-THE-ROADMAP.md');
    const body = readFileSync(file, 'utf8');
    assert.match(body, /^kind: discussion$/m);
    assert.match(body, /^status: queued$/m);
    assert.match(body, /CASP-PROMPT-011/);
  } finally {
    cleanup(dir);
  }
});

test('casp next: an empty pointer over a queue reports the queue, not just "empty"', () => {
  const { dir } = scaffold({
    next_prompt: null,
    next_phase: null,
    phases_queued: ['phase-2-second-slice']
  });
  try {
    const r = run(dir, 'next', '--no-check');
    assert.equal(r.status, 1);
    // stderr must name the backlog: the operator's question is "is there
    // anything to do", and answering "the field is empty" is not an answer.
    assert.match(r.stderr, /phases_queued holds 1/i, r.stderr);
    assert.match(r.stderr, /phase-2-second-slice/, r.stderr);
  } finally {
    cleanup(dir);
  }
});

/* ---- optional migrations --------------------------------------------- */

test('migrations: no keys at all → no migration finding, exit 0', () => {
  // A non-code cockpit: park next so the only question is migration silence.
  // phases_queued is emptied along with the pointer -- parking is a claim about
  // the whole state, not just one field, and CASP-PROMPT-005 now enforces that.
  // Nulling next_prompt while leaving a phase queued is the contradiction the
  // rule exists to catch, so a fixture that did it would be testing migrations
  // through a cockpit that lies.
  const { dir } = scaffold({
    migrations_applied: DEL,
    migrations_dir: DEL,
    next_prompt: null,
    next_phase: null,
    phases_queued: []
  });
  try {
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 0, r.stdout);
    const report = JSON.parse(r.stdout);
    assert.ok(
      !report.findings.some((f) => f.id.startsWith('migrations')),
      'a project with no migration keys gets no migration finding — not even a PASS'
    );
  } finally {
    cleanup(dir);
  }
});

test('migrations: migrations_applied set but migrations_dir absent → FAIL', () => {
  const { dir } = scaffold({
    migrations_applied: ['0001_init'],
    migrations_dir: DEL
  });
  try {
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 1);
    const report = JSON.parse(r.stdout);
    const f = report.findings.find((x) => x.id === 'migrations.dir');
    assert.ok(f && f.severity === 'fail', 'a claim with no dir to verify against must FAIL');
  } finally {
    cleanup(dir);
  }
});

/* ---- check --all ------------------------------------------------------ */

function fleet() {
  const root = mkdtempSync(join(tmpdir(), 'casp-fleet-'));
  // Cockpit A: clean (parked). Cockpit B: drifted (next_prompt missing).
  for (const [name, drift] of [['a', false], ['b', true]]) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    mkdirSync(join(dir, 'casp'), { recursive: true });
    const state = {
      updated_at: '2026-06-15',
      last_session_id: 'pending',
      last_commit: 'pending',
      current_phase: 'phase-0',
      next_phase: drift ? 'phase-1' : null,
      next_prompt: drift ? 'docs/plan/sessions/MISSING.md' : null,
      phases_shipped: [],
      phases_queued: []
    };
    writeState(dir, state);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');
  }
  return root;
}

test('check --all: one clean + one drifted cockpit → exit 1', () => {
  const root = fleet();
  try {
    const r = run(root, 'check', '--all');
    assert.equal(r.status, 1, 'any cockpit FAIL blocks the aggregate');
    assert.match(r.stdout, /2 cockpit/);
    assert.match(r.stdout, /FAIL/);
  } finally {
    cleanup(root);
  }
});

test('check --all --json: per-cockpit array with stable per-report shape', () => {
  const root = fleet();
  try {
    const r = run(root, 'check', '--all', '--json');
    assert.equal(r.status, 1);
    const report = JSON.parse(r.stdout);
    assert.ok(Array.isArray(report.cockpits) && report.cockpits.length === 2);
    for (const c of report.cockpits) {
      assert.equal(typeof c.root, 'string');
      assert.equal(c.schema_version, 1);
      assert.ok(['clean', 'drift'].includes(c.verdict));
      assert.ok(Array.isArray(c.findings));
    }
    assert.ok(report.cockpits.some((c) => c.verdict === 'drift'));
    assert.ok(report.cockpits.some((c) => c.verdict === 'clean'));
  } finally {
    cleanup(root);
  }
});

test('check --all: no cockpit under root → exit 0, not an error', () => {
  const root = mkdtempSync(join(tmpdir(), 'casp-empty-'));
  try {
    const r = run(root, 'check', '--all');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no casp\/ cockpit found/);
  } finally {
    cleanup(root);
  }
});

/* ---- configurable paths (0.5.0): sessions_dir / logs_dir ------------- */

/**
 * A cockpit whose prompts and logs live at CUSTOM paths declared in state, not
 * the protocol defaults. Mirrors a project (e.g. a downstream project) onboarding CASP onto
 * its existing layout instead of adopting docs/plan/sessions + session-logs.
 */
function scaffoldCustom({ sessionsDir, logsDir }) {
  const dir = mkdtempSync(join(tmpdir(), 'casp-cfgpath-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');

  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, ...sessionsDir.split('/')), { recursive: true });
  mkdirSync(join(dir, ...logsDir.split('/')), { recursive: true });

  const sessionId = '26-06-15-001-first-slice';
  writeFileSync(join(dir, ...logsDir.split('/'), `${sessionId}.md`), '# first slice\n');
  writeFileSync(
    join(dir, ...sessionsDir.split('/'), 'PHASE-1-FIRST-SLICE.md'),
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\ndrafted_at: 2026-06-15\n---\n\n# Phase 1\n'
  );
  const state = {
    updated_at: '2026-06-15',
    last_session_id: sessionId,
    last_commit: 'pending',
    current_phase: 'phase-1-first-slice',
    next_phase: 'phase-2',
    next_prompt: `${sessionsDir}/PHASE-1-FIRST-SLICE.md`,
    phases_shipped: [],
    phases_queued: ['phase-1-first-slice'],
    sessions_dir: sessionsDir,
    logs_dir: logsDir
  };
  writeState(dir, state);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return { dir, sessionId, sessionsDir, logsDir };
}

test('custom sessions_dir / logs_dir: clean repo at non-default layout → exit 0', () => {
  const { dir } = scaffoldCustom({ sessionsDir: 'planning/prompts', logsDir: 'logs' });
  try {
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 0, r.stdout);
    const report = JSON.parse(r.stdout);
    assert.equal(report.summary.fail, 0, 'a coherent custom-layout cockpit is clean');
    // The log-exists PASS must reference the RESOLVED path, not the default.
    const f = report.findings.find((x) => x.id === 'last_session.log_exists');
    assert.equal(f.severity, 'pass');
    assert.ok(f.detail.startsWith('logs/'), 'PASS detail prints the resolved logs_dir, not session-logs/');
  } finally {
    cleanup(dir);
  }
});

test('custom logs_dir claimed but the CUSTOM dir is missing → exit 1 (no false green)', () => {
  const { dir, logsDir } = scaffoldCustom({ sessionsDir: 'planning/prompts', logsDir: 'logs' });
  try {
    rmSync(join(dir, logsDir), { recursive: true, force: true });
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 1, 'a claim against a missing CUSTOM dir must FAIL');
    const report = JSON.parse(r.stdout);
    const f = report.findings.find((x) => x.id === 'last_session.logs_dir');
    assert.ok(f && f.severity === 'fail', 'the missing custom logs dir surfaces as a fail');
    assert.ok(f.detail.includes('logs/'), 'the FAIL names the resolved custom path');
    // It must NOT have silently passed against the default session-logs/ that does not exist either.
    assert.ok(!report.findings.some((x) => x.detail && x.detail.includes('session-logs/')),
      'no message should reference the hardcoded default path');
  } finally {
    cleanup(dir);
  }
});

test('custom shipped_history dirs missing → both FAIL with resolved names', () => {
  const { dir, sessionsDir, logsDir } = scaffoldCustom({ sessionsDir: 'planning/prompts', logsDir: 'logs' });
  try {
    rmSync(join(dir, sessionsDir.split('/')[0]), { recursive: true, force: true });
    rmSync(join(dir, logsDir), { recursive: true, force: true });
    const state = readState(dir);
    state.next_prompt = null;
    state.next_phase = null;
    state.last_session_id = 'pending';
    state.phases_shipped = ['phase-1-first-slice'];
    writeState(dir, state);
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 1);
    const report = JSON.parse(r.stdout);
    const sd = report.findings.find((x) => x.id === 'shipped_history.sessions_dir');
    const ld = report.findings.find((x) => x.id === 'shipped_history.logs_dir');
    assert.ok(sd && sd.severity === 'fail' && sd.detail.includes('planning/prompts/'));
    assert.ok(ld && ld.severity === 'fail' && ld.detail.includes('logs/'));
  } finally {
    cleanup(dir);
  }
});

test('custom dirs: new / ship / close all honor the configured layout', () => {
  const { dir, sessionsDir, logsDir, sessionId } = scaffoldCustom({
    sessionsDir: 'planning/prompts',
    logsDir: 'logs'
  });
  try {
    // new prompt → written into the custom sessions dir.
    const np = run(dir, 'new', 'prompt', '--slug', 'phase-2-thing');
    assert.equal(np.status ?? 0, 0, np.stderr);
    assert.ok(
      existsSync(join(dir, ...sessionsDir.split('/'), 'PHASE-2-THING.md')),
      'new prompt must write into the configured sessions_dir'
    );
    assert.ok(
      !existsSync(join(dir, 'docs', 'plan', 'sessions')),
      'new prompt must NOT fall back to the default dir'
    );
    // new log → written into the custom logs dir.
    const nl = run(dir, 'new', 'log', '--slug', 'a-log');
    assert.equal(nl.status ?? 0, 0, nl.stderr);
    assert.ok(
      readdirSync(join(dir, logsDir)).some((f) => f.endsWith('-a-log.md')),
      'new log must write into the configured logs_dir'
    );
    // ship → wires a session_log pointer rooted at the custom logs dir.
    const sh = run(dir, 'ship', 'phase-1-first-slice');
    assert.equal(sh.status, 0, sh.stderr);
    const prompt = readFileSync(
      join(dir, ...sessionsDir.split('/'), 'PHASE-1-FIRST-SLICE.md'),
      'utf8'
    );
    assert.match(prompt, new RegExp(`^session_log: ${logsDir}/${sessionId}\\.md$`, 'm'),
      'ship must point session_log at the configured logs_dir');
  } finally {
    cleanup(dir);
  }
});

test('check --all <absolute root>: resolves the absolute path, not join(cwd, root)', () => {
  // Regression for the 0.4.1 bug: an ABSOLUTE root arg was join()ed to the cwd,
  // producing a doubled path ("no cockpit found"). Run from a DIFFERENT cwd and
  // pass the fleet's absolute path — it must be used as-is.
  const root = fleet();
  const elsewhere = mkdtempSync(join(tmpdir(), 'casp-cwd-'));
  try {
    const r = run(elsewhere, 'check', '--all', root);
    assert.doesNotMatch(r.stdout, /no casp\/ cockpit found/, 'absolute root must not be joined to cwd');
    assert.match(r.stdout, /2 cockpit/, 'both cockpits under the absolute root are found');
    assert.equal(r.status, 1, 'the drifted cockpit still blocks the aggregate');
  } finally {
    cleanup(root);
    cleanup(elsewhere);
  }
});
