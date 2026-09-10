/**
 * `casp status` — read-only one-screen snapshot.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  c,
  describeFsFailure,
  git,
  loadState,
  pkgVersion,
  readFrontmatter,
  readTextFile,
  resolveDirs,
  setColor,
  glyphs,
  setCharset,
  todayISO,
  type State
} from './shared.js';
import { checkOneSafe, summarize } from './check.js';
import { analyzeChain } from './chain.js';
import { progressLine } from './board.js';
import { phaseListsOf } from './schedule.js';
import { scheduleStatusLine } from './schedule-report.js';

const ROOT = process.cwd();
const STATE = join(ROOT, 'casp', 'state.json');
const NOW = join(ROOT, 'casp', 'now.md');
const ROADMAP = join(ROOT, 'casp', 'roadmap.md');

// The stable `casp status --json` contract (documented in docs/status-json.md).
// Same stability promise as check-json: this only bumps on a breaking shape
// change; additive fields do not bump it. `status` reports, it never gates — so
// the embedded check verdict carries `fail`/`drift` but status still exits 0.
const STATUS_SCHEMA_VERSION = 1;

function readProjectMeta(): { name: string; version: string | null } {
  const raw = readTextFile(join(ROOT, 'package.json'));
  if (raw.ok) {
    try {
      const pkg = JSON.parse(raw.content) as { name?: string; version?: string };
      return { name: pkg.name ?? 'casp-managed-project', version: pkg.version ?? null };
    } catch {
      /* fall through */
    }
  }
  return { name: 'casp-managed-project', version: null };
}

/**
 * `status --json` never leaves stdout empty.
 *
 * `checkOneSafe` guards the embedded verdict, but everything else assembled
 * below — the git probes, the project metadata, the chain analysis — runs BEFORE
 * the single `console.log`. A throw anywhere in there produced exactly the
 * defect this hardening exists to remove, one function over: empty stdout and a
 * non-zero exit from a verb documented never to gate.
 *
 * So the assembly is wrapped, and the fallback is still a VALID v1 document: the
 * fields the caller is contractually promised, with nulls where nothing could be
 * computed, and the exit stays 0. status reports; it does not gate.
 */
function emitStatusJson(state: State, opts: { noGit?: boolean }): void {
  try {
    console.log(JSON.stringify(buildStatusReport(state, opts), null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(
      JSON.stringify(
        {
          schema_version: STATUS_SCHEMA_VERSION,
          casp_version: pkgVersion(),
          project: { name: 'casp-managed-project', version: null },
          git: { head: null, branch: null, dirty_files: 0, ahead: null },
          state: {
            current_phase: state.current_phase ?? null,
            next_phase: state.next_phase ?? null,
            next_prompt: state.next_prompt ? String(state.next_prompt) : null,
            next_prompt_status: null,
            next_prompt_exists: false,
            last_session_id: state.last_session_id ?? null,
            last_commit: state.last_commit ?? null,
            phases_shipped_count: Array.isArray(state.phases_shipped)
              ? state.phases_shipped.length
              : 0,
            phases_queued_count: Array.isArray(state.phases_queued)
              ? state.phases_queued.length
              : 0
          },
          // The snapshot could not be assembled, so it carries no verdict —
          // `null` rather than a fabricated 'clean'. Additive field; schema
          // stays v1, and a consumer that ignores it sees the documented shape.
          check: { verdict: null, pass: 0, warn: 0, fail: 0 },
          queue: null,
          error: message.split('\n')[0]
        },
        null,
        2
      )
    );
  }
  // status reports, it does not gate: a valid cockpit always exits 0, even on drift.
}

function buildStatusReport(state: State, opts: { noGit?: boolean }): Record<string, unknown> {
  const meta = readProjectMeta();
  const head = git('rev-parse --short HEAD');
  const branch = git('rev-parse --abbrev-ref HEAD');
  const dirtyOut = git('status --short');
  const aheadOut = git('rev-list --count @{u}..HEAD').trim();

  const nextPrompt = state.next_prompt ? String(state.next_prompt) : null;
  const nextPromptPath = nextPrompt ? join(ROOT, nextPrompt) : null;
  let nextPromptStatus: string | null = null;
  let nextPromptExists = false;
  if (nextPromptPath && existsSync(nextPromptPath)) {
    nextPromptExists = true;
    // Unreadable → the status is simply unknown (null), exactly as it is for a
    // prompt with no frontmatter. `check` below carries the FAIL; status reports.
    const read = readFrontmatter(nextPromptPath);
    nextPromptStatus = read.ok && read.fm ? String(read.fm.status ?? '?') : null;
  }

  // Embed the validator verdict, computed in-process — the same checkOne the
  // `check` and `next` verbs run. status NEVER shells out and NEVER gates on it.
  const findings = checkOneSafe(ROOT, { noGit: opts.noGit });
  const sum = summarize(findings);

  const chain = analyzeChain(ROOT, state, resolveDirs(ROOT, state));
  const chainOrder = chain?.order ?? null;

  const report = {
    schema_version: STATUS_SCHEMA_VERSION,
    casp_version: pkgVersion(),
    project: { name: meta.name, version: meta.version },
    git: {
      head: head || null,
      branch: branch || null,
      dirty_files: dirtyOut ? dirtyOut.split('\n').filter((l) => l.trim()).length : 0,
      ahead: aheadOut && /^\d+$/.test(aheadOut) ? Number(aheadOut) : null
    },
    state: {
      current_phase: state.current_phase ?? null,
      next_phase: state.next_phase ?? null,
      next_prompt: nextPrompt,
      next_prompt_status: nextPromptStatus,
      next_prompt_exists: nextPromptExists,
      last_session_id: state.last_session_id ?? null,
      last_commit: state.last_commit ?? null,
      phases_shipped_count: Array.isArray(state.phases_shipped) ? state.phases_shipped.length : 0,
      phases_queued_count: Array.isArray(state.phases_queued) ? state.phases_queued.length : 0
    },
    check: {
      verdict: sum.fail > 0 ? 'drift' : 'clean',
      pass: sum.pass,
      warn: sum.warn,
      fail: sum.fail
    },
    // The resolved queue order, head first — useful to an agent planning more
    // than one session ahead. Additive (schema stays v1), and NEVER gating:
    // `queue` is null when the chain is not adopted or not coherent, and status
    // still exits 0 either way. The chain's integrity is `check`'s business.
    queue: chainOrder
  };
  return report;
}

function section(label: string, body: string): void {
  console.log('');
  console.log(c.bold(label));
  console.log(c.gray('─'.repeat(Math.max(label.length, 40))));
  console.log(body);
}

export function runStatus(args: string[]): void {
  if (args.includes('--plain')) {
    setColor(false);
    setCharset(false);
  }

  if (!existsSync(STATE)) {
    console.error(c.red('no casp/state.json found'));
    console.error(c.gray('  → run `npx @justethales/casp init` first'));
    process.exit(1);
  }
  const state = loadState(STATE);
  if (!state) {
    // Present and unopenable is not a syntax error — say which one it is. Both
    // still exit 1: docs/status-json.md exempts an invalid cockpit from the
    // always-0 contract. Anything READABLE below exits 0, drift included.
    const probe = readTextFile(STATE);
    console.error(
      c.red(
        probe.ok
          ? 'casp/state.json is not valid JSON'
          : `casp/state.json ${describeFsFailure(probe.error)}`
      )
    );
    process.exit(1);
  }

  // Machine-readable snapshot: the structured session handoff. Always exits 0 on
  // a valid cockpit (reporting, not gating). Documented in docs/status-json.md.
  if (args.includes('--json')) {
    emitStatusJson(state, { noGit: args.includes('--no-git') });
    return;
  }

  const head = git('rev-parse --short HEAD') || '(no git)';
  const branch = git('rev-parse --abbrev-ref HEAD') || '(no git)';
  const dirty = git('status --short');
  const ahead = git('rev-list --count @{u}..HEAD').trim();
  const log10 = git('log --oneline -10');

  const meta = readProjectMeta();
  const pkgName = meta.name;
  const pkgVer = meta.version ? `@${meta.version}` : '';

  console.log('');
  console.log(
    c.bold(`${pkgName}${pkgVer}`) +
      ` · branch ${c.cyan(branch)} · HEAD ${c.cyan(head)}`
  );
  if (dirty) {
    const lines = dirty.split('\n').length;
    console.log(
      c.yellow(`  ⚠ working tree has ${lines} uncommitted file${lines > 1 ? 's' : ''}`)
    );
  }
  if (ahead && ahead !== '0') {
    console.log(
      c.yellow(`  ⚠ ${ahead} commit${ahead === '1' ? '' : 's'} ahead of upstream`)
    );
  }

  const summary = [
    `  current_phase    ${c.cyan(String(state.current_phase ?? '-'))}`,
    `  next_phase       ${c.cyan(String(state.next_phase ?? '-'))}`,
    `  next_prompt      ${c.cyan(String(state.next_prompt ?? '-'))}`,
    `  last_session_id  ${c.gray(String(state.last_session_id ?? '-'))}`,
    `  last_commit      ${c.gray(String(state.last_commit ?? '-'))}`
  ].join('\n');
  section('STATE', summary);

  // The board, always: nothing in the close protocol produced a picture of where
  // the project stands, so no session showed one and the operator rebuilt it by
  // hand. Drawn from the three phase lists — counts, never an estimate.
  const lists = phaseListsOf(state);
  console.log('');
  console.log(
    '  ' +
      progressLine(
        lists.shipped.length,
        lists.queued.length,
        lists.backlog.length,
        glyphs.utf8
      )
  );
  const scheduleLine = scheduleStatusLine(ROOT, state, todayISO());
  if (scheduleLine) console.log('  ' + c.gray(scheduleLine));

  const nextPromptPath = state.next_prompt ? join(ROOT, String(state.next_prompt)) : null;
  if (nextPromptPath && existsSync(nextPromptPath)) {
    const read = readFrontmatter(nextPromptPath);
    const fm = read.ok ? read.fm : null;
    const status = read.ok
      ? fm
        ? String(fm.status ?? '?')
        : '(no frontmatter)'
      : `(${describeFsFailure(read.error)})`;
    const sessionLog = fm ? String(fm.session_log ?? 'pending') : '?';
    const statusColor =
      status === 'shipped'
        ? c.red(status)
        : status === 'queued'
          ? c.green(status)
          : c.yellow(status);
    const body = [
      `  path     ${c.cyan(String(state.next_prompt))}`,
      `  status   ${statusColor}`,
      `  log      ${c.gray(sessionLog)}`
    ].join('\n');
    section('NEXT PROMPT', body);

    const body2 = readTextFile(nextPromptPath);
    if (body2.ok) {
      const afterFm = body2.content.replace(/^---\n[\s\S]*?\n---\n/, '');
      const lines = afterFm.split('\n').slice(0, 8);
      for (const l of lines) {
        if (!l.trim()) continue;
        console.log(c.gray('  ' + l.slice(0, 100)));
      }
    } else {
      console.log(c.yellow(`  ⚠ the prompt body ${describeFsFailure(body2.error)}`));
    }
  } else if (state.next_prompt) {
    section(
      'NEXT PROMPT',
      c.red(`  ✗ ${state.next_prompt} does not exist on disk`)
    );
  }

  if (log10) {
    section(
      'RECENT COMMITS',
      log10
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n')
    );
  }

  const now = readTextFile(NOW);
  if (now.ok) {
    const m = now.content.match(/## Current focus[^\n]*\n\n([\s\S]*?)(?:\n---|\n##)/);
    if (m) {
      const focus = m[1].trim().split('\n').slice(0, 4).join('\n');
      section(
        'CURRENT FOCUS',
        focus
          .split('\n')
          .map((l) => `  ${l}`)
          .join('\n')
      );
    }
  }

  const roadmap = readTextFile(ROADMAP);
  if (roadmap.ok) {
    const m = roadmap.content.match(/## Now — Next 3[^\n]*\n([\s\S]*?)(?:\n---|\n## )/);
    if (m) {
      const block = m[1]
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .slice(0, 8)
        .map((l) => '  ' + l.slice(0, 140))
        .join('\n');
      section('NEXT 3', block);
    }
  }

  console.log('');
  console.log(
    c.gray('run `npx @justethales/casp check` to validate, `npx @justethales/casp status` to refresh')
  );
  console.log('');
}
