/**
 * The facts layer — casp/facts.json, CASP-FACT-001..006, and `casp fact`.
 *
 * Each rule test replays one shape from the 2026-07-20 founding incident (see
 * docs/plan/sessions/PHASE-FACTS-LAYER.md): CASP proves FRESHNESS, never truth
 * — a source hash unchanged, a TTL unexpired, a method recorded. No LLM ever
 * compares a claimed value to prose; only presence/hash/date comparisons.
 *
 * OPT-IN is the load-bearing property here, same as CASP-SESSION-003 and
 * CASP-PROMPT-007..010: a cockpit with no casp/facts.json must see literally
 * zero CASP-FACT-* findings, not even a PASS.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
function sha256(buf) {
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`;
}
// TTL math is against the real wall clock (todayISO() in src/shared.ts), so
// fixture dates are computed relative to now rather than hardcoded — a
// hardcoded date would silently drift from WARN to FAIL as time passes.
function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
function commit(dir, msg) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
}

/** A clean, committed cockpit — casp init plus one real commit, no facts.json. */
function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-facts-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');
  const r = run(dir, 'init');
  assert.equal(r.status, 0, r.stderr);
  commit(dir, 'init');
  return dir;
}

function writeFacts(dir, facts, traps) {
  const body = { schema_version: 1, facts };
  if (traps) body.traps = traps;
  mkdirSync(join(dir, 'casp'), { recursive: true });
  writeFileSync(join(dir, 'casp', 'facts.json'), JSON.stringify(body, null, 2) + '\n');
}

const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

function factFindings(dir) {
  const r = run(dir, 'check', '--no-git', '--json');
  const report = JSON.parse(r.stdout);
  return report.findings.filter((f) => f.id.startsWith('fact.'));
}

test('no casp/facts.json → zero CASP-FACT-* findings, not even a PASS', () => {
  const dir = scaffold();
  try {
    assert.deepEqual(factFindings(dir), []);
    assert.equal(run(dir, 'check', '--no-git').status, 0);
  } finally {
    cleanup(dir);
  }
});

test('malformed casp/facts.json → single FAIL under CASP-FACT-001, not a crash', () => {
  const dir = scaffold();
  try {
    mkdirSync(join(dir, 'casp'), { recursive: true });
    writeFileSync(join(dir, 'casp', 'facts.json'), '{ not json');
    commit(dir, 'bad facts.json');
    const findings = factFindings(dir);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'fact.file');
    assert.equal(findings[0].severity, 'fail');
    assert.equal(findings[0].rule, 'CASP-FACT-001');
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-001: source path that does not resolve in the repo → FAIL', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [
      {
        id: 'gone',
        value: 'x',
        source: 'no/such/file.json',
        verified_at: '2026-07-20',
        ttl_days: 30
      }
    ]);
    commit(dir, 'fact with missing source');
    const findings = factFindings(dir);
    const f = findings.find((x) => x.id === 'fact.source.gone');
    assert.equal(f.severity, 'fail');
    assert.equal(f.rule, 'CASP-FACT-001');
  } finally {
    cleanup(dir);
  }
});

test('external: source with no label → CASP-FACT-001 FAIL', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [
      { id: 'bad-external', value: 'x', source: 'external:', verified_at: '2026-07-20', ttl_days: 30 }
    ]);
    commit(dir, 'external with no label');
    const f = factFindings(dir).find((x) => x.id === 'fact.source.bad-external');
    assert.equal(f.severity, 'fail');
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-002: source changed after verification → FAIL (the founding incident\'s core case)', () => {
  const dir = scaffold();
  try {
    mkdirSync(join(dir, 'backend', 'config'), { recursive: true });
    const cfgPath = join(dir, 'backend', 'config', 'pricing.json');
    writeFileSync(cfgPath, JSON.stringify({ cost_per_minute_usd: 0.05 }));
    const hashAtVerification = sha256(readFileSync(cfgPath));
    writeFacts(dir, [
      {
        id: 'unit-cost-per-minute',
        value: '0.05 USD/min',
        source: 'backend/config/pricing.json',
        source_hash: hashAtVerification,
        method: "jq '.cost_per_minute_usd' backend/config/pricing.json",
        verified_at: '2026-07-01',
        ttl_days: 90
      }
    ]);
    commit(dir, 'declare unit cost fact');

    // Clean at first: hash matches what was just recorded.
    let f = factFindings(dir).find((x) => x.id === 'fact.hash.unit-cost-per-minute');
    assert.equal(f.severity, 'pass');

    // The provider migration: the source changes, the fact is never re-verified.
    writeFileSync(cfgPath, JSON.stringify({ cost_per_minute_usd: 0.012 }));
    commit(dir, 'provider migration divides cost by four');

    f = factFindings(dir).find((x) => x.id === 'fact.hash.unit-cost-per-minute');
    assert.equal(f.severity, 'fail');
    assert.equal(f.rule, 'CASP-FACT-002');
    assert.match(f.detail, /source changed since verification/);
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-002: repo-relative source with no source_hash recorded → FAIL', () => {
  const dir = scaffold();
  try {
    mkdirSync(join(dir, 'backend'), { recursive: true });
    writeFileSync(join(dir, 'backend', 'x.json'), '{}');
    writeFacts(dir, [
      { id: 'no-hash', value: 'x', source: 'backend/x.json', verified_at: '2026-07-20', ttl_days: 30 }
    ]);
    commit(dir, 'fact with no source_hash');
    const f = factFindings(dir).find((x) => x.id === 'fact.hash.no-hash');
    assert.equal(f.severity, 'fail');
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-003: expired TTL → WARN, then FAIL past double the TTL', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [
      { id: 'warn-me', value: 'x', source: 'external:console', verified_at: isoDaysAgo(15), ttl_days: 10 },
      { id: 'fail-me', value: 'x', source: 'external:console', verified_at: isoDaysAgo(25), ttl_days: 10 }
    ]);
    commit(dir, 'stale facts');
    const findings = factFindings(dir);
    const warn = findings.find((x) => x.id === 'fact.ttl.warn-me');
    const fail = findings.find((x) => x.id === 'fact.ttl.fail-me');
    assert.equal(warn.severity, 'warn');
    assert.equal(fail.severity, 'fail');
    assert.equal(fail.rule, 'CASP-FACT-003');
  } finally {
    cleanup(dir);
  }
});

test('external: source with no ttl_days → FAIL (the only guard an out-of-repo fact gets)', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [{ id: 'no-ttl', value: 'x', source: 'external:console', verified_at: '2026-07-20' }]);
    commit(dir, 'external fact with no ttl');
    const f = factFindings(dir).find((x) => x.id === 'fact.ttl.no-ttl');
    assert.equal(f.severity, 'fail');
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-004: used_in path missing the casp:fact marker → WARN', () => {
  const dir = scaffold();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'summary.md'), 'The cost is 0.012 $/min, no marker here.\n');
    writeFacts(dir, [
      {
        id: 'marked',
        value: '0.012 USD/min',
        source: 'external:console',
        verified_at: '2026-07-20',
        ttl_days: 30,
        used_in: ['docs/summary.md']
      }
    ]);
    commit(dir, 'fact cited without a marker');
    const f = factFindings(dir).find((x) => x.id.startsWith('fact.used_in.marked.'));
    assert.equal(f.severity, 'warn');
    assert.equal(f.rule, 'CASP-FACT-004');
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-004: used_in path WITH the marker → PASS', () => {
  const dir = scaffold();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(
      join(dir, 'docs', 'summary.md'),
      'The cost is <!-- casp:fact marked -->0.012 $/min<!-- /casp:fact -->.\n'
    );
    writeFacts(dir, [
      {
        id: 'marked',
        value: '0.012 USD/min',
        source: 'external:console',
        verified_at: '2026-07-20',
        ttl_days: 30,
        used_in: ['docs/summary.md']
      }
    ]);
    commit(dir, 'fact cited with a marker');
    const f = factFindings(dir).find((x) => x.id.startsWith('fact.used_in.marked.'));
    assert.equal(f.severity, 'pass');
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-005: no method recorded → WARN', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [{ id: 'no-method', value: 'x', source: 'external:console', verified_at: '2026-07-20', ttl_days: 30 }]);
    commit(dir, 'fact with no method');
    const f = factFindings(dir).find((x) => x.id === 'fact.method.no-method');
    assert.equal(f.severity, 'warn');
    assert.equal(f.rule, 'CASP-FACT-005');
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-006: n_live_tup without count( → FAIL (the ~40x row-count misread)', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [
      {
        id: 'row-count',
        value: '2',
        source: 'external:prod-db',
        method: "select n_live_tup from pg_stat_user_tables where relname='voice_sessions'",
        verified_at: '2026-07-20',
        ttl_days: 30
      }
    ]);
    commit(dir, 'row count from a planner estimate');
    const f = factFindings(dir).find((x) => x.id === 'fact.trap.row-count');
    assert.equal(f.severity, 'fail');
    assert.equal(f.rule, 'CASP-FACT-006');
    assert.match(f.detail, /pg-live-tup-estimate/);
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-006: n_live_tup PAIRED with count( → no trap, PASS', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [
      {
        id: 'row-count-ok',
        value: '80',
        source: 'external:prod-db',
        method: 'select count(*) from voice_sessions',
        verified_at: '2026-07-20',
        ttl_days: 30
      }
    ]);
    commit(dir, 'a real count');
    const f = factFindings(dir).find((x) => x.id === 'fact.trap.row-count-ok');
    assert.equal(f.severity, 'pass');
  } finally {
    cleanup(dir);
  }
});

test('CASP-FACT-006: project-declared trap (facts.json `traps`) also FAILs', () => {
  const dir = scaffold();
  try {
    writeFacts(
      dir,
      [
        {
          id: 'project-specific',
          value: 'x',
          source: 'external:console',
          method: 'run legacy-estimate-script.sh',
          verified_at: '2026-07-20',
          ttl_days: 30
        }
      ],
      ['legacy-estimate-script.sh']
    );
    commit(dir, 'project trap');
    const f = factFindings(dir).find((x) => x.id === 'fact.trap.project-specific');
    assert.equal(f.severity, 'fail');
  } finally {
    cleanup(dir);
  }
});

/* ---- casp fact list | check | stale | verify --------------------------- */

test('casp fact list: prints inventory, --json is machine-readable', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [
      // Verified TODAY, not on a fixed date: `fresh` is computed against the wall clock,
      // and a hard-coded 2026-07-20 made this assertion rot 30 days later.
      { id: 'a', value: '1', source: 'external:x', verified_at: isoDaysAgo(0), ttl_days: 30 }
    ]);
    commit(dir, 'one fact');
    const human = run(dir, 'fact', 'list');
    assert.equal(human.status, 0);
    assert.match(human.stdout, /\ba\b/);
    const json = run(dir, 'fact', 'list', '--json');
    const arr = JSON.parse(json.stdout);
    assert.equal(arr.length, 1);
    assert.equal(arr[0].id, 'a');
    assert.equal(arr[0].fresh, true);
  } finally {
    cleanup(dir);
  }
});

test('casp fact check: FACT-only subset, exits 1 on a FAIL, silent+0 with no facts.json', () => {
  const clean = scaffold();
  try {
    const r = run(clean, 'fact', 'check');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /not adopted/);
  } finally {
    cleanup(clean);
  }

  const dir = scaffold();
  try {
    writeFacts(dir, [{ id: 'bad', value: 'x', source: 'nope.json', verified_at: '2026-07-20', ttl_days: 30 }]);
    commit(dir, 'bad fact');
    const r = run(dir, 'fact', 'check');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /CASP-FACT-001/);
  } finally {
    cleanup(dir);
  }
});

test('casp fact stale: lists only what expired or drifted, exit 1 when non-empty', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [
      { id: 'fresh-one', value: '1', source: 'external:x', verified_at: isoDaysAgo(1), ttl_days: 90 },
      { id: 'stale-one', value: '1', source: 'external:x', verified_at: isoDaysAgo(20), ttl_days: 10 }
    ]);
    commit(dir, 'mixed freshness');
    const r = run(dir, 'fact', 'stale', '--json');
    const arr = JSON.parse(r.stdout);
    assert.equal(arr.length, 1);
    assert.equal(arr[0].id, 'stale-one');
    assert.equal(r.status, 1);
  } finally {
    cleanup(dir);
  }
});

test('casp fact verify <id> --yes: replays method, writes value/hash/verified_at', () => {
  const dir = scaffold();
  try {
    mkdirSync(join(dir, 'cfg'), { recursive: true });
    writeFileSync(join(dir, 'cfg', 'x.json'), JSON.stringify({ v: 7 }));
    writeFacts(dir, [
      {
        id: 'v',
        value: '999 (stale)',
        source: 'cfg/x.json',
        source_hash: 'sha256:deadbeef',
        method: "node -e \"console.log(require('./cfg/x.json').v)\"",
        verified_at: '2020-01-01',
        ttl_days: 30
      }
    ]);
    commit(dir, 'fact to verify');
    const r = run(dir, 'fact', 'verify', 'v', '--yes');
    assert.equal(r.status, 0, r.stderr);
    const facts = JSON.parse(readFileSync(join(dir, 'casp', 'facts.json'), 'utf8'));
    const fact = facts.facts.find((f) => f.id === 'v');
    assert.equal(fact.value, '7');
    assert.match(fact.source_hash, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(fact.source_hash, 'sha256:deadbeef');
    assert.notEqual(fact.verified_at, '2020-01-01');
  } finally {
    cleanup(dir);
  }
});

test('casp fact verify <id>: refuses without confirmation in a non-interactive shell and no --yes', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [
      { id: 'v', value: 'x', source: 'external:console', method: 'echo hi', verified_at: '2026-07-20', ttl_days: 30 }
    ]);
    commit(dir, 'fact');
    const r = run(dir, 'fact', 'verify', 'v');
    assert.equal(r.status, 1);
    const facts = JSON.parse(readFileSync(join(dir, 'casp', 'facts.json'), 'utf8'));
    assert.equal(facts.facts[0].value, 'x', 'nothing written without confirmation');
  } finally {
    cleanup(dir);
  }
});

// The regression that matters most in this file. The test above asserts nothing
// was WRITTEN; until 0.14.0 shipped, nothing asserted nothing was RUN — and the
// implementation executed the method first and only then asked "write this
// fact?". So the refusal test passed while `casp fact verify <id>` on an
// untrusted repo executed arbitrary shell with no TTY, no --yes and no consent.
// `method` is repository content; the confirmation has to gate the execution,
// not the persistence. Assert the side effect, not just the state file.
test('casp fact verify <id>: without confirmation the method DOES NOT RUN', () => {
  const dir = scaffold();
  try {
    const sentinel = join(dir, 'method-executed.txt');
    writeFacts(dir, [
      {
        id: 'v', value: 'x', source: 'external:console',
        method: `echo ran > ${JSON.stringify(sentinel)}`,
        verified_at: '2026-07-20', ttl_days: 30,
      },
    ]);
    commit(dir, 'fact');

    const r = run(dir, 'fact', 'verify', 'v');

    assert.equal(r.status, 1, 'must refuse, not proceed');
    assert.equal(existsSync(sentinel), false, 'the method must not execute without consent');
    assert.match(r.stderr + r.stdout, /refusing to run/i, 'the refusal must name execution, not writing');
    const facts = JSON.parse(readFileSync(join(dir, 'casp', 'facts.json'), 'utf8'));
    assert.equal(facts.facts[0].value, 'x', 'nothing written either');
  } finally {
    cleanup(dir);
  }
});

test('casp fact verify <id> --yes: the method runs (the opt-in still works)', () => {
  const dir = scaffold();
  try {
    const sentinel = join(dir, 'method-executed.txt');
    writeFacts(dir, [
      {
        id: 'v', value: 'x', source: 'external:console',
        method: `echo ran > ${JSON.stringify(sentinel)}; echo 99`,
        verified_at: '2026-07-20', ttl_days: 30,
      },
    ]);
    commit(dir, 'fact');

    const r = run(dir, 'fact', 'verify', 'v', '--yes');

    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(sentinel), true, '--yes is the explicit opt-in and must still run');
    const facts = JSON.parse(readFileSync(join(dir, 'casp', 'facts.json'), 'utf8'));
    assert.equal(facts.facts[0].value, '99');
  } finally {
    cleanup(dir);
  }
});

test('casp fact verify <id>: the method is printed before anything is decided', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [
      { id: 'v', value: 'x', source: 'external:console', method: 'echo CANARY', verified_at: '2026-07-20', ttl_days: 30 },
    ]);
    commit(dir, 'fact');
    const r = run(dir, 'fact', 'verify', 'v');
    // Refused — but the operator must have been shown what they were refusing.
    assert.match(r.stdout, /echo CANARY/, 'the command must be visible before the gate');
  } finally {
    cleanup(dir);
  }
});

test('casp fact verify <id>: unknown id → exit 1, nothing written', () => {
  const dir = scaffold();
  try {
    writeFacts(dir, [{ id: 'a', value: 'x', source: 'external:console', verified_at: '2026-07-20', ttl_days: 30 }]);
    commit(dir, 'fact');
    const r = run(dir, 'fact', 'verify', 'nope', '--yes');
    assert.equal(r.status, 1);
  } finally {
    cleanup(dir);
  }
});
