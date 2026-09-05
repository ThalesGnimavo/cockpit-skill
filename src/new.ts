/**
 * `casp new prompt|discussion|log --slug <kebab-id>` — copy a template, interpolate.
 *
 * `discussion` scaffolds a prompt whose session is a conversation with the human, not
 * code: the file the CASP-PROMPT-011 remediation asks for once a roadmap is done.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';
import { c, loadState, readDirEntries, resolveDirs, todayISO } from './shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Sub-templates (session-prompt, session-log, audit-brief) live at
// templates/templates/ — the same path they end up at inside the user's
// scaffolded casp/. Init copies the whole tree ; `new` reads from the
// nested sub-dir only.
const TEMPLATES = join(__dirname, '..', 'templates', 'templates');

function nextLogIndex(dir: string): string {
  const listed = readDirEntries(dir);
  if (!listed.ok) return '001';
  const today = todayISO();
  const yymmdd = today.slice(2).replace(/-/g, '-'); // YY-MM-DD
  const todayLogs = listed.entries.filter(
    (f) => f.startsWith(yymmdd) && f.endsWith('.md')
  );
  const maxNNN = todayLogs.reduce((max, f) => {
    const m = f.match(/^\d{2}-\d{2}-\d{2}-(\d{3})/);
    if (!m) return max;
    return Math.max(max, parseInt(m[1], 10));
  }, 0);
  return String(maxNNN + 1).padStart(3, '0');
}

function getArg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  return args[i + 1];
}

export function runNew(args: string[]): void {
  const [kind, ...rest] = args;
  if (kind !== 'prompt' && kind !== 'discussion' && kind !== 'log') {
    console.error(c.red(`unknown new kind: ${kind}`));
    console.error(c.gray('  → use `casp new prompt --slug X`, `casp new discussion --slug X` or `casp new log --slug X`'));
    exit(1);
  }
  const slug = getArg(rest, '--slug');
  if (!slug) {
    console.error(c.red('--slug <kebab-id> is required'));
    exit(1);
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    console.error(c.red(`slug must be kebab-case (a-z, 0-9, -): got '${slug}'`));
    exit(1);
  }

  const root = process.cwd();
  const today = todayISO();
  // Honor configured sessions_dir / logs_dir when state declares them; fall back
  // to the defaults (including the pre-init case where there is no state yet).
  const dirs = resolveDirs(root, loadState(join(root, 'casp', 'state.json')) ?? {});

  if (kind === 'prompt' || kind === 'discussion') {
    const dir = dirs.sessionsAbs;
    mkdirSync(dir, { recursive: true });
    const upper = slug.toUpperCase();
    // A discussion prompt is named for what it is: the sessions dir reads as a
    // plan, and a human must see at a glance which entries need a human.
    const filename =
      kind === 'discussion' && !upper.startsWith('DISCUSSION-') ? `DISCUSSION-${upper}.md` : `${upper}.md`;
    const dest = join(dir, filename);
    if (existsSync(dest)) {
      console.error(c.red(`already exists: ${relative(root, dest)}`));
      exit(1);
    }
    const src = join(TEMPLATES, kind === 'discussion' ? 'discussion-prompt.md' : 'session-prompt.md');
    const raw = readFileSync(src, 'utf8');
    const out = raw
      .split('YYYY-MM-DD').join(today)
      .split('<id>-<slug>').join(slug);
    writeFileSync(dest, out);
    console.log(`${c.green('write')}   ${relative(root, dest)}`);
    console.log('');
    if (kind === 'discussion') {
      console.log(c.gray('next: list the decisions the human must take — one question, one recommendation each'));
    } else {
      console.log(c.gray('next: edit the prompt to fill the <placeholders>'));
    }
    console.log(c.gray('      then update casp/state.json next_prompt to point at this file'));
    return;
  }

  if (kind === 'log') {
    const dir = dirs.logsAbs;
    mkdirSync(dir, { recursive: true });
    const yymmdd = today.slice(2);
    const nnn = nextLogIndex(dir);
    const filename = `${yymmdd}-${nnn}-${slug}.md`;
    const dest = join(dir, filename);
    if (existsSync(dest)) {
      console.error(c.red(`already exists: ${relative(root, dest)}`));
      exit(1);
    }
    const src = join(TEMPLATES, 'session-log.md');
    const raw = readFileSync(src, 'utf8');
    const out = raw
      .split('YY-MM-DD-NNN').join(`${yymmdd}-${nnn}`)
      .split('YY-MM-DD').join(yymmdd);
    writeFileSync(dest, out);
    console.log(`${c.green('write')}   ${relative(root, dest)}`);
    console.log('');
    console.log(c.gray(`session id: ${yymmdd}-${nnn}-${slug}`));
    console.log(c.gray('next: edit the log, then update casp/state.json last_session_id'));
    return;
  }
}
