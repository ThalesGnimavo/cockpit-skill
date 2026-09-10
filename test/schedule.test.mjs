/**
 * The schedule layer — both directions, and the two guard rails.
 *
 * The two tests that matter most here are the LAST two: severity-pinned (004 is
 * WARN) and clock-invariant (the same fixture a year apart yields an identical
 * FAIL set). They are the mechanical form of the boundary this phase was
 * arbitrated on — the clock may add a WARN and may never add a FAIL. A future
 * edit that inverts either one has to break this suite loudly, which is the
 * whole point of writing them down.
 *
 * Runs the BUILT binary (dist/cli.js) for the verb tests and imports the built
 * modules for the pure ones; `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
const run = (cwd, ...args) =>
  spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, CASP_ASCII: '1' } });
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

/** A committed cockpit; `state` overrides the defaults, `schedule` writes
 *  casp/schedule.json when given (a string is written verbatim — that is how the
 *  malformed cases are built). */
function scaffold({ state = {}, schedule, commitDate } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'casp-sched-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');
  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });

  writeFileSync(join(dir, 'session-logs', '26-06-15-001-first-slice.md'), '# first slice\n');
  writeFileSync(
    join(dir, 'docs', 'plan', 'sessions', 'PHASE-1-FIRST-SLICE.md'),
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\n---\n\n# Phase 1\n'
  );
  writeFileSync(
    join(dir, 'casp', 'state.json'),
    JSON.stringify(
      {
        updated_at: '2026-06-15',
        last_session_id: '26-06-15-001-first-slice',
        last_commit: 'pending',
        current_phase: 'phase-0',
        next_phase: 'phase-1-first-slice',
        next_prompt: 'docs/plan/sessions/PHASE-1-FIRST-SLICE.md',
        phases_shipped: ['phase-0'],
        phases_queued: ['phase-1-first-slice'],
        phases_backlog: [],
        ...state
      },
      null,
      2
    ) + '\n'
  );
  if (schedule !== undefined) {
    writeFileSync(
      join(dir, 'casp', 'schedule.json'),
      typeof schedule === 'string' ? schedule : JSON.stringify(schedule, null, 2) + '\n'
    );
  }
  git(dir, 'add', '-A');
  if (commitDate) {
    execFileSync('git', ['commit', '-q', '-m', 'init', '--date', commitDate], {
      cwd: dir,
      stdio: 'ignore',
      env: { ...process.env, GIT_COMMITTER_DATE: commitDate }
    });
  } else {
    git(dir, 'commit', '-q', '-m', 'init');
  }
  return dir;
}

const codes = (dir, ...extra) => {
  const r = run(dir, 'check', '--json', ...extra);
  return JSON.parse(r.stdout).findings.map((f) => f.rule);
};
const scheduleCodes = (dir) => codes(dir).filter((c) => c && c.startsWith('CASP-SCHEDULE'));

/* ---- opt-in is real --------------------------------------------------- */

test('no casp/schedule.json ⇒ zero CASP-SCHEDULE-* findings, not even a PASS', () => {
  const dir = scaffold();
  try {
    assert.deepEqual(scheduleCodes(dir), [], 'the layer must be silent until adopted');
  } finally {
    cleanup(dir);
  }
});

/* ---- 001: the file validates, or it does not -------------------------- */

test('CASP-SCHEDULE-001 fires on a malformed file and not on a valid one', () => {
  const bad = scaffold({ schedule: '{ this is not json' });
  try {
    assert.ok(scheduleCodes(bad).includes('CASP-SCHEDULE-001'));
    assert.equal(JSON.parse(run(bad, 'check', '--json').stdout).summary.fail > 0, true);
  } finally {
    cleanup(bad);
  }
  const good = scaffold({ schedule: { schema_version: 1, anchors: [], due: [] } });
  try {
    const found = scheduleCodes(good);
    assert.deepEqual(found, ['CASP-SCHEDULE-001'], 'a valid file emits the 001 PASS and nothing else');
    const report = JSON.parse(run(good, 'check', '--json').stdout);
    assert.equal(report.summary.fail, 0);
  } finally {
    cleanup(good);
  }
});

test('schema rejections are sentences, not stacks — bad date, unknown before, duplicate id', () => {
  const cases = [
    [{ schema_version: 1, due: [{ phase: 'phase-1-first-slice', date: '2026-02-30' }] }, /expected YYYY-MM-DD/],
    [
      {
        schema_version: 1,
        anchors: [{ id: 'freeze', date: '2026-12-01' }],
        due: [{ phase: 'phase-1-first-slice', date: '2026-10-01', before: 'nope' }]
      },
      /not a declared anchor id/
    ],
    [
      {
        schema_version: 1,
        anchors: [
          { id: 'freeze', date: '2026-12-01' },
          { id: 'freeze', date: '2026-12-02' }
        ]
      },
      /ids must be unique/
    ]
  ];
  for (const [schedule, pattern] of cases) {
    const dir = scaffold({ schedule });
    try {
      const r = run(dir, 'check', '--json');
      const finding = JSON.parse(r.stdout).findings.find((f) => f.rule === 'CASP-SCHEDULE-001');
      assert.ok(finding, 'a structural problem must surface as 001');
      assert.equal(finding.severity, 'fail');
      assert.match(finding.detail, pattern);
      assert.doesNotMatch(r.stderr, /at Object\.|node:internal/, 'never a stack trace');
    } finally {
      cleanup(dir);
    }
  }
});

/* ---- 002: a dated phase exists in a phase list ------------------------ */

test('CASP-SCHEDULE-002 fires on an unknown phase, not on a known one, and is WARN', () => {
  const miss = scaffold({ schedule: { schema_version: 1, due: [{ phase: 'ghost-phase', date: '2099-01-01' }] } });
  try {
    const f = JSON.parse(run(miss, 'check', '--json').stdout).findings.find(
      (x) => x.rule === 'CASP-SCHEDULE-002'
    );
    assert.ok(f, '002 must fire');
    assert.equal(f.severity, 'warn', 'a renamed phase must never block a push');
    assert.equal(JSON.parse(run(miss, 'check', '--json').stdout).summary.fail, 0);
  } finally {
    cleanup(miss);
  }
  const hit = scaffold({
    schedule: { schema_version: 1, due: [{ phase: 'phase-1-first-slice', date: '2099-01-01' }] }
  });
  try {
    assert.ok(!scheduleCodes(hit).includes('CASP-SCHEDULE-002'));
  } finally {
    cleanup(hit);
  }
});

/* ---- 003: the file contradicts itself. FAIL, no clock ----------------- */

test('CASP-SCHEDULE-003 fires on descending anchors and on a due past its anchor', () => {
  const descending = scaffold({
    schedule: {
      schema_version: 1,
      anchors: [
        { id: 'launch', date: '2027-01-02' },
        { id: 'freeze', date: '2026-12-01' }
      ]
    }
  });
  try {
    const f = JSON.parse(run(descending, 'check', '--json').stdout).findings.find(
      (x) => x.rule === 'CASP-SCHEDULE-003'
    );
    assert.ok(f && f.severity === 'fail', 'anchors out of order is a FAIL');
  } finally {
    cleanup(descending);
  }

  const late = scaffold({
    schedule: {
      schema_version: 1,
      anchors: [{ id: 'freeze', date: '2026-12-01' }],
      due: [{ phase: 'phase-1-first-slice', date: '2026-12-15', before: 'freeze' }]
    }
  });
  try {
    assert.ok(scheduleCodes(late).includes('CASP-SCHEDULE-003'));
  } finally {
    cleanup(late);
  }

  const ok = scaffold({
    schedule: {
      schema_version: 1,
      anchors: [
        { id: 'freeze', date: '2026-12-01' },
        { id: 'launch', date: '2027-01-02' }
      ],
      due: [{ phase: 'phase-1-first-slice', date: '2026-11-01', before: 'freeze' }]
    }
  });
  try {
    assert.ok(!scheduleCodes(ok).includes('CASP-SCHEDULE-003'));
  } finally {
    cleanup(ok);
  }
});

test('history is not drift: a SHIPPED phase past its anchor fires neither 003 nor 004', () => {
  const dir = scaffold({
    state: { phases_shipped: ['phase-0', 'old-slice'], phases_queued: ['phase-1-first-slice'] },
    schedule: {
      schema_version: 1,
      anchors: [{ id: 'freeze', date: '2020-01-01' }],
      due: [{ phase: 'old-slice', date: '2020-06-01', before: 'freeze' }]
    }
  });
  try {
    const found = scheduleCodes(dir);
    assert.ok(!found.includes('CASP-SCHEDULE-003'), 'a shipped phase cannot contradict a schedule');
    assert.ok(!found.includes('CASP-SCHEDULE-004'), 'a shipped phase cannot be late');
  } finally {
    cleanup(dir);
  }
});

/* ---- 004: the clock, and only ever as a WARN -------------------------- */

test('CASP-SCHEDULE-004 fires on a passed date for a queued phase, and is WARN', () => {
  const past = scaffold({
    schedule: { schema_version: 1, due: [{ phase: 'phase-1-first-slice', date: '2020-01-01' }] }
  });
  try {
    const report = JSON.parse(run(past, 'check', '--json').stdout);
    const f = report.findings.find((x) => x.rule === 'CASP-SCHEDULE-004');
    assert.ok(f, '004 must fire on a queued phase whose date has passed');
    assert.equal(f.severity, 'warn', 'SEVERITY PINNED: lateness honestly recorded is not drift');
    assert.equal(report.summary.fail, 0, 'a missed date must never block a push');
    assert.equal(run(past, 'check').status, 0, 'and must never change the exit code');
  } finally {
    cleanup(past);
  }

  const future = scaffold({
    schedule: { schema_version: 1, due: [{ phase: 'phase-1-first-slice', date: '2099-01-01' }] }
  });
  try {
    assert.ok(!scheduleCodes(future).includes('CASP-SCHEDULE-004'));
  } finally {
    cleanup(future);
  }
});

test('CASP-SCHEDULE-004 also fires when the anchor a queued phase is bound to has passed', () => {
  const dir = scaffold({
    schedule: {
      schema_version: 1,
      anchors: [{ id: 'freeze', date: '2020-01-01' }],
      due: [{ phase: 'phase-1-first-slice', date: '2019-06-01', before: 'freeze' }]
    }
  });
  try {
    const report = JSON.parse(run(dir, 'check', '--json').stdout);
    assert.ok(report.findings.some((x) => x.rule === 'CASP-SCHEDULE-004'));
    assert.equal(report.summary.fail, 0);
  } finally {
    cleanup(dir);
  }
});

/* ---- THE GUARD RAIL: the clock never moves the exit code -------------- */

test('clock invariance: the same fixture one year apart yields an identical FAIL set', async () => {
  const { checkOne } = await import('../dist/check.js');
  const dir = scaffold({
    schedule: {
      schema_version: 1,
      anchors: [
        { id: 'freeze', date: '2026-12-01' },
        { id: 'launch', date: '2027-01-02' }
      ],
      due: [
        { phase: 'phase-1-first-slice', date: '2026-12-15', before: 'freeze' },
        { phase: 'ghost-phase', date: '2026-10-01' }
      ]
    }
  });
  try {
    const failsAt = (today) =>
      checkOne(dir, { today })
        .filter((f) => f.severity === 'fail')
        .map((f) => f.id)
        .sort();
    const before = failsAt('2026-01-01');
    const after = failsAt('2027-01-01');
    assert.deepEqual(
      before,
      after,
      'THE INVARIANT: moving the clock a year may change WARNs, never the FAIL set'
    );
    assert.ok(before.length > 0, 'the fixture must actually contain a clock-independent FAIL');
  } finally {
    cleanup(dir);
  }
});

/* ---- the drawings are deterministic ----------------------------------- */

test('progress line is an exact string, in both charsets', async () => {
  const { progressLine } = await import('../dist/board.js');
  assert.equal(
    progressLine(30, 10, 3, true),
    'progress  ██████████████████░░░░░░  30 shipped · 10 queued · 3 backlog'
  );
  assert.equal(
    progressLine(30, 10, 3, false),
    'progress  ##################......  30 shipped - 10 queued - 3 backlog'
  );
  // The clamps: a non-zero count never renders as its opposite.
  assert.match(progressLine(1, 999, 0, false), /^progress {2}#\.{23} {2}1 shipped/);
  assert.match(progressLine(999, 1, 0, false), /^progress {2}#{23}\. {2}999 shipped/);
  assert.match(progressLine(0, 0, 0, false), /^progress {2}\.{24} {2}0 shipped/);
});

test('timeline line is an exact string, in both charsets', async () => {
  const { timelineLine } = await import('../dist/board.js');
  const claims = [
    { kind: 'anchor', id: 'freeze', date: '2027-01-01', list: null, before: null, state: 'ahead', days: 0 },
    { kind: 'due', id: 'slice', date: '2026-07-02', list: 'queued', before: null, state: 'ahead', days: 0 }
  ];
  const utf8 = timelineLine(claims, '2026-01-01', true);
  assert.equal(
    utf8.track,
    '2026-01-01 ·●──────────────────┬───────────────────┼· 2027-01-01'
  );
  assert.equal(utf8.labels, ' '.repeat(31) + 'slice' + ' '.repeat(15) + 'freeze');
  const ascii = timelineLine(claims, '2026-01-01', false);
  assert.equal(
    ascii.track,
    '2026-01-01 .o------------------+-------------------|. 2027-01-01'
  );
  // today wins its column: it is drawn last on purpose.
  const sameDay = timelineLine(claims, '2026-07-02', false);
  assert.match(sameDay.track, /o/);
  assert.equal(timelineLine([], '2026-01-01', true), null);
});

/* ---- the verb --------------------------------------------------------- */

test('casp schedule: one state commit → no rate invented, exit 0', () => {
  const dir = scaffold();
  try {
    const r = run(dir, 'schedule', '--plain');
    assert.equal(r.status ?? 0, 0, 'schedule reports, it never gates');
    assert.match(r.stdout, /pace is not measurable/);
    assert.doesNotMatch(r.stdout, /phases per week/);
    const j = JSON.parse(run(dir, 'schedule', '--json').stdout);
    assert.equal(j.pace.measurable, false);
    assert.equal(j.pace.phases_per_week, null, 'never invent a rate');
    assert.equal(j.derived, null, 'no pace ⇒ no derived length');
  } finally {
    cleanup(dir);
  }
});

test('casp schedule: N seeded state commits → the exact measured pace', () => {
  const today = new Date();
  const iso = (daysAgo) =>
    new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 19) + 'Z';
  // The seed commit sits OUTSIDE the 8-week window on purpose: the window is the
  // claim, so a test that let the seed leak into it would measure something else.
  const dir = scaffold({ commitDate: iso(120) });
  try {
    const bump = (shipped, when) => {
      const state = JSON.parse(
        execFileSync('git', ['show', 'HEAD:casp/state.json'], { cwd: dir, encoding: 'utf8' })
      );
      state.phases_shipped = shipped;
      writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
      execFileSync('git', ['add', 'casp/state.json'], { cwd: dir, stdio: 'ignore' });
      execFileSync('git', ['commit', '-q', '-m', 'bump', '--date', when], {
        cwd: dir,
        stdio: 'ignore',
        env: { ...process.env, GIT_COMMITTER_DATE: when }
      });
    };
    // 14 days apart, 2 phases shipped between them ⇒ exactly 1 per week.
    bump(['phase-0', 'seed'], iso(14));
    bump(['phase-0', 'seed', 'a', 'b'], iso(0));

    const j = JSON.parse(run(dir, 'schedule', '--json').stdout);
    assert.equal(j.pace.measurable, true);
    assert.equal(j.pace.commits_in_window, 2, 'the seed commit is outside the window');
    assert.equal(j.pace.span_days, 14);
    assert.equal(j.pace.phases_shipped_delta, 2);
    assert.equal(j.pace.phases_per_week, 1, 'two phases over fourteen days is one per week');
    assert.equal(j.pace.window_weeks, 8, 'the window is always reported next to the rate');
    assert.equal(j.derived.weeks, 1, 'one queued phase at one per week');
    // --since narrows the window and says so.
    assert.equal(
      JSON.parse(run(dir, 'schedule', '--json', '--since', '1').stdout).pace.window_weeks,
      1
    );
  } finally {
    cleanup(dir);
  }
});

test('casp schedule --json carries the claim list and no drawing', () => {
  const dir = scaffold({
    schedule: {
      schema_version: 1,
      anchors: [{ id: 'freeze', date: '2099-12-01' }],
      due: [{ phase: 'phase-1-first-slice', date: '2099-11-01', before: 'freeze' }]
    }
  });
  try {
    const j = JSON.parse(run(dir, 'schedule', '--json').stdout);
    assert.equal(j.claims.length, 2);
    assert.deepEqual(
      j.claims.map((c) => c.kind).sort(),
      ['anchor', 'due']
    );
    assert.equal(j.claims.find((c) => c.kind === 'due').list, 'queued');
    assert.equal(j.findings.length, 0);
    assert.ok(!JSON.stringify(j).includes('─'), 'no drawing in a machine contract');
  } finally {
    cleanup(dir);
  }
});

test('casp schedule on an unreadable cockpit exits 1; on a readable one always 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-sched-bare-'));
  try {
    assert.equal(run(dir, 'schedule').status, 1, 'no cockpit is unreadable input');
  } finally {
    cleanup(dir);
  }
  const drifted = scaffold({ state: { next_prompt: 'docs/plan/sessions/GONE.md' } });
  try {
    assert.equal(run(drifted, 'check').status, 1, 'the fixture really is in drift');
    assert.equal(run(drifted, 'schedule', '--plain').status ?? 0, 0, 'schedule still exits 0');
  } finally {
    cleanup(drifted);
  }
});

/* ---- status and close print the board --------------------------------- */

test('casp status always draws the progress line, and the schedule line when adopted', () => {
  const plain = scaffold();
  try {
    const r = run(plain, 'status', '--plain');
    assert.match(r.stdout, /progress {2}[#.]{24} {2}1 shipped - 1 queued - 0 backlog/);
    assert.doesNotMatch(r.stdout, /schedule {2}next:/, 'no file ⇒ no schedule line');
  } finally {
    cleanup(plain);
  }
  const dated = scaffold({
    schedule: { schema_version: 1, due: [{ phase: 'phase-1-first-slice', date: '2099-11-01' }] }
  });
  try {
    const r = run(dated, 'status', '--plain');
    assert.match(r.stdout, /schedule {2}next: phase-1-first-slice 2099-11-01/);
  } finally {
    cleanup(dated);
  }
});

test('casp close ends on the board', () => {
  const dir = scaffold({
    schedule: { schema_version: 1, due: [{ phase: 'phase-1-first-slice', date: '2099-11-01' }] }
  });
  try {
    const r = run(dir, 'close', '--yes');
    assert.match(r.stdout, /casp\/state\.json bumped/);
    assert.match(r.stdout, /progress {2}[#.]{24}/, 'the close must show where the project stands');
    assert.match(r.stdout, /RECORDED CLAIMS/, 'and the schedule rendering when the file exists');
    assert.match(r.stdout, /casp:check/, 'the check verdict is still printed');
  } finally {
    cleanup(dir);
  }
});

/* ---- hostile filesystem ----------------------------------------------- */

test('an unreadable or truncated schedule.json returns a finding, never a throw', async () => {
  const { checkOneSafe } = await import('../dist/check.js');
  const truncated = scaffold({ schedule: '{"schema_version": 1, "anchors": [' });
  try {
    const findings = checkOneSafe(truncated);
    assert.ok(Array.isArray(findings), 'checkOneSafe returns');
    assert.ok(findings.some((f) => f.id === 'schedule.file' && f.severity === 'fail'));
  } finally {
    cleanup(truncated);
  }

  const unreadable = scaffold({ schedule: { schema_version: 1 } });
  try {
    chmodSync(join(unreadable, 'casp', 'schedule.json'), 0o000);
    const findings = checkOneSafe(unreadable);
    assert.ok(Array.isArray(findings));
    assert.ok(findings.some((f) => f.id === 'schedule.file'));
  } finally {
    try {
      chmodSync(join(unreadable, 'casp', 'schedule.json'), 0o644);
    } catch {
      /* best effort */
    }
    cleanup(unreadable);
  }
});
