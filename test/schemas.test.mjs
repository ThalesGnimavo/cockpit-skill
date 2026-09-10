/**
 * Published JSON Schemas stay in sync with what the binary actually emits.
 *
 * We do not bundle a JSON-Schema validator (zero extra deps): instead we assert
 * the structural contract — every `required` key a schema declares is actually
 * produced by `casp init` (state) and `casp check --json` (result). If init or
 * the report shape drifts from the published schema, this fails.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const SCHEMA_DIR = fileURLToPath(new URL('../schemas/', import.meta.url));

const readSchema = (name) => JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf8'));
function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}
function run(cwd, ...args) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('every published schema parses and declares Draft 2020-12', () => {
  for (const name of [
    'state.schema.json',
    'check-result.schema.json',
    'facts.schema.json',
    'schedule.schema.json',
    'schedule-result.schema.json'
  ]) {
    const s = readSchema(name);
    assert.match(s.$schema, /2020-12/, `${name} declares the draft`);
    assert.ok(s.$id && s.title && s.type === 'object');
  }
});

test('casp init produces every required key of state.schema.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-schema-state-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    const r = run(dir, 'init');
    assert.equal(r.status, 0, r.stderr);
    const state = JSON.parse(readFileSync(join(dir, 'casp', 'state.json'), 'utf8'));
    const schema = readSchema('state.schema.json');
    for (const key of schema.required) {
      assert.ok(key in state, `init must scaffold the schema-required key '${key}'`);
    }
    assert.ok(Array.isArray(state.phases_shipped), 'phases_shipped is an array');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('casp check --json matches the required shape of check-result.schema.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-schema-result-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    run(dir, 'init');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');

    const r = run(dir, 'check', '--json');
    const report = JSON.parse(r.stdout);
    const schema = readSchema('check-result.schema.json');
    for (const key of schema.required) {
      assert.ok(key in report, `check --json must emit top-level '${key}'`);
    }
    const findingRequired = schema.properties.findings.items.required;
    for (const f of report.findings) {
      for (const key of findingRequired) {
        assert.ok(key in f, `each finding must carry '${key}'`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('templates/schedule.json satisfies schedule.schema.json, and init does NOT scaffold it', () => {
  const schema = readSchema('schedule.schema.json');
  const example = JSON.parse(
    readFileSync(fileURLToPath(new URL('../templates/templates/schedule.json', import.meta.url)), 'utf8')
  );
  for (const key of schema.required) {
    assert.ok(key in example, `the shipped example must carry '${key}'`);
  }
  const anchorRequired = schema.properties.anchors.items.required;
  for (const a of example.anchors) {
    for (const key of anchorRequired) assert.ok(key in a, `each anchor carries '${key}'`);
  }
  const dueRequired = schema.properties.due.items.required;
  for (const d of example.due) {
    for (const key of dueRequired) assert.ok(key in d, `each due carries '${key}'`);
  }

  // OPT-IN IS STRUCTURAL, not a promise in prose: the example ships under the
  // scaffolds directory precisely so `casp init` copies it to casp/templates/
  // and never to casp/schedule.json. A cockpit is opted out until someone
  // deliberately copies the file up one level.
  const dir = mkdtempSync(join(tmpdir(), 'casp-schema-sched-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    assert.equal(run(dir, 'init').status, 0);
    assert.equal(
      existsSync(join(dir, 'casp', 'schedule.json')),
      false,
      'casp init must not adopt the schedule layer on the user\'s behalf'
    );
    assert.ok(existsSync(join(dir, 'casp', 'templates', 'schedule.json')), 'the example ships');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('casp schedule --json matches the required shape of schedule-result.schema.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-schema-sched-result-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    run(dir, 'init');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');

    const report = JSON.parse(run(dir, 'schedule', '--json').stdout);
    const schema = readSchema('schedule-result.schema.json');
    for (const key of schema.required) {
      assert.ok(key in report, `schedule --json must emit top-level '${key}'`);
    }
    for (const key of schema.properties.pace.required) {
      assert.ok(key in report.pace, `pace must carry '${key}'`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
