/**
 * `casp next` — print the next session's prompt, straight from state.next_prompt.
 *
 * The CLI analogue of the `/next` slash-command: it resolves the canonical next
 * move from casp/state.json and emits the prompt so a human (or an agent piping
 * the output) can start executing immediately — no copy-paste, no guessing.
 *
 * Exits non-zero when there is no actionable next prompt, so it composes safely
 * in scripts.
 *
 * The PRE-SESSION GATE: before printing, `next` runs the validator in-process
 * (the same `checkOne` the `check` verb uses — never shells out to itself) and
 * REFUSES on drift — drift summary to stderr, no prompt on stdout, exit 1. This
 * closes the START boundary symmetrically with `install-hook`'s push boundary:
 * a harness can't auto-advance into the next session on top of a lying state.
 * `--no-check` is the explicit escape hatch; `next` never RUNS anything after
 * printing — it stays a printer, not a runner (anti-roadmap).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';
import { c, describeFsFailure, isPlaceholderPath, loadState, readFrontmatter, readTextFile } from './shared.js';
import { checkOneSafe, summarize } from './check.js';

const ROOT = process.cwd();
const STATE = join(ROOT, 'casp', 'state.json');

export function runNext(args: string[]): void {
  const noCheck = args.includes('--no-check');
  const noGit = args.includes('--no-git');

  if (!existsSync(STATE)) {
    console.error(c.red('no casp/state.json found'));
    console.error(c.gray('  → run `npx @justethales/casp init` first'));
    exit(1);
  }
  const state = loadState(STATE);
  if (!state) {
    console.error(c.red('casp/state.json is not valid JSON'));
    exit(1);
  }

  const rawNext = state.next_prompt;
  const placeholder = isPlaceholderPath(rawNext);
  const nextPrompt = rawNext && !placeholder ? String(rawNext) : '';

  if (!nextPrompt) {
    // Report the QUEUE, not just the empty field. The operator's question is
    // never "is this string empty" — it is "is there anything to do", and the
    // answer to that lives in phases_queued. A cockpit that prints "empty"
    // while holding a dozen queued phases sends the operator off to re-derive
    // by hand a backlog the state file already knows.
    const queued = Array.isArray(state.phases_queued) ? state.phases_queued.map(String) : [];

    if (placeholder) {
      console.error(c.red(`state.next_prompt is a placeholder, not a path: "${String(rawNext)}"`));
      console.error(c.gray('  → this format has no string sentinel for "nothing queued": use a path, or null.'));
    } else {
      console.error(c.yellow('state.next_prompt is empty.'));
    }

    if (queued.length > 0) {
      console.error('');
      console.error(c.red(`but phases_queued holds ${queued.length} phase(s) — the cockpit is contradicting itself:`));
      for (const q of queued.slice(0, 5)) console.error(c.gray(`    - ${q}`));
      if (queued.length > 5) console.error(c.gray(`    … +${queued.length - 5} more`));
      console.error('');
      console.error(c.gray('  → point next_prompt at the prompt file for the head of that queue.'));
      console.error(c.gray('  → if the head has no prompt file, draft it: `npx @justethales/casp new prompt --slug <slug>`'));
      console.error(c.gray('    a phase with no prompt file is an intention, not a queue entry.'));
    } else {
      console.error(c.gray('  → set it in casp/state.json, or draft one: `npx @justethales/casp new prompt --slug <slug>`'));
    }
    exit(1);
  }

  const path = join(ROOT, nextPrompt);
  if (!existsSync(path)) {
    console.error(c.red(`state.next_prompt points at a missing file: ${nextPrompt}`));
    console.error(c.gray('  → `npx @justethales/casp check` will flag this. Fix state.next_prompt or draft the prompt.'));
    exit(1);
  }

  // Fail closed and LEGIBLY: a prompt the process cannot open is not a prompt
  // it may start a session on, and the operator gets a sentence, not a trace.
  const read = readFrontmatter(path);
  if (!read.ok) {
    console.error(c.red(`next_prompt ${describeFsFailure(read.error)}: ${nextPrompt}`));
    console.error(c.gray('  → `npx @justethales/casp check` reports this as CASP-IO-001. Make the file readable, then retry.'));
    exit(1);
  }
  const fm = read.fm;
  const status = fm ? String(fm.status ?? '?') : '(no frontmatter)';
  if (status === 'shipped') {
    console.error(
      c.red(`next_prompt is already SHIPPED: ${nextPrompt}`)
    );
    console.error(
      c.gray('  → casp was not bumped after that session. Run `npx @justethales/casp check` and reconcile before starting.')
    );
    exit(1);
  }

  // PRE-SESSION GATE — refuse to hand out the next prompt on a drifted state,
  // unless explicitly waived. Run the validator in-process and block on any FAIL.
  // (Missing-file / shipped-prompt drift is already caught above with sharper
  // messages; this catches the rest — stale last_commit, unmappable claims, etc.)
  if (!noCheck) {
    const findings = checkOneSafe(ROOT, { noGit });
    const { fail } = summarize(findings);
    if (fail > 0) {
      console.error(c.red(`✗ state has drifted — refusing to start the next session.`));
      for (const f of findings) {
        if (f.severity !== 'fail') continue;
        console.error(`  ${c.red('FAIL')} ${f.label}${f.detail ? c.gray(` · ${f.detail}`) : ''}`);
        if (f.fix) console.error(`         ${c.cyan('→')} ${c.gray(f.fix)}`);
      }
      console.error('');
      console.error(c.gray('  → run `casp check` to see the full report, reconcile the state, then retry.'));
      console.error(c.gray('  → or `casp next --no-check` to start anyway (you own the drift).'));
      exit(1);
    }
  }

  // Header to stderr (human context), prompt body to stdout (pipe-friendly).
  const kind = fm ? String(fm.kind ?? 'session') : 'session';
  console.error(c.bold(`next prompt`) + ` · ${c.cyan(nextPrompt)} · status ${c.green(status)}` + (kind !== 'session' ? ` · kind ${c.yellow(kind)}` : ''));
  if (kind === 'discussion') {
    // The head of the queue is a conversation, not a build. Say so before the
    // body, on stderr, so a headless loop reading stdout still gets the prompt
    // and the human reading the terminal gets the warning first.
    console.error(c.yellow('this prompt is a DISCUSSION: its deliverable is decisions written down with the human, and the prompts they produce — not code. Do not run it headless.'));
  }
  console.error(c.gray('─'.repeat(70)));
  const body = readTextFile(path);
  if (!body.ok) {
    // The gate passed a moment ago and the file went away under us — say so.
    console.error(c.red(`next_prompt ${describeFsFailure(body.error)}: ${nextPrompt}`));
    exit(1);
  }
  process.stdout.write(body.content);
  exit(0);
}
