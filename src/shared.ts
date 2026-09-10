/**
 * Shared helpers — ANSI colors, git, frontmatter parsing.
 */

import { execSync, execFileSync } from 'node:child_process';
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
  renameSync,
  unlinkSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** sha256 of file content, formatted `sha256:<hex>` — the one hash format used
 *  both by declared facts (`casp/facts.json`) and by the state compare-and-swap
 *  below. Accepts a Buffer or string so callers reading a file with readFileSync
 *  (no encoding) or already-decoded text both work without a re-encode step. */
export function sha256(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

/** sha256 of a file's current content, or null when the file cannot be read —
 *  missing, unreadable, a directory. Never throws: a hash that cannot be taken
 *  is an absent hash, and every caller already treats null as "cannot compare". */
export function fileHash(path: string): string | null {
  const r = readBytes(path);
  return r.ok ? sha256(r.content) : null;
}

// Single source of truth: read package.json at runtime so the CLI strings can
// never drift from the published package again. dist/*.js lives in dist/,
// package.json one level up (npm always ships package.json).
function readPkg(): { name?: string; version?: string } {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(
      readFileSync(join(here, '..', 'package.json'), 'utf8')
    ) as { name?: string; version?: string };
  } catch {
    return {};
  }
}

export function pkgVersion(): string {
  return readPkg().version ?? '0.0.0';
}

export function pkgName(): string {
  return readPkg().name ?? '@justethales/casp';
}

export const COLOR_ON = stdout.isTTY && !process.env.NO_COLOR;

export const c = {
  red: (s: string) => (COLOR_ON ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (COLOR_ON ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (COLOR_ON ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (COLOR_ON ? `\x1b[36m${s}\x1b[0m` : s),
  gray: (s: string) => (COLOR_ON ? `\x1b[90m${s}\x1b[0m` : s),
  bold: (s: string) => (COLOR_ON ? `\x1b[1m${s}\x1b[0m` : s)
};

export function setColor(on: boolean): void {
  // Used by --plain to disable colors mid-run.
  Object.keys(c).forEach((k) => {
    if (!on) (c as Record<string, (s: string) => string>)[k] = (s: string) => s;
  });
}

/**
 * Shell-based git. The command string is interpolated into a shell, so it MUST
 * only ever receive STATIC, literal arguments (`git('rev-parse --short HEAD')`).
 * Never pass a value read from casp/state.json or from a CLI argument through
 * here — a crafted value like `HEAD; rm -rf ~` would run in the shell. For any
 * interpolated/untrusted input use `gitArgs()` below, which cannot be injected.
 */
export function git(cmd: string, cwd: string = process.cwd()): string {
  try {
    return execSync(`git ${cmd}`, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

/**
 * Injection-safe git: arguments are passed as an argv array to `execFileSync`,
 * so NO shell is involved and no value can break out of its argument slot. This
 * is the required form for any git call that interpolates untrusted input —
 * values read from casp/state.json (last_commit, sessions_dir, logs_dir, …) or
 * from CLI arguments. A hostile value becomes a single, invalid git argument
 * (git errors, we return ''), never a shell command. Same '' -on-failure and
 * trimmed-stdout contract as git().
 */
export function gitArgs(args: string[], cwd: string = process.cwd()): string {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

/* Hostile filesystem — the one door repository content is read through. --------
 *
 * `existsSync` answers "is there a name here", never "can this process open it".
 * A file that exists and cannot be read — mode 000, a directory squatting a
 * `*.md` path, a symlink cycle, a file deleted between the check and the open —
 * used to throw straight out of whichever verb happened to touch it, which turns
 * a gate into a stack trace. A gate that crashes is not a verdict.
 *
 * So every read of REPOSITORY CONTENT goes through the helpers below, which
 * return a discriminated result instead of throwing. Scattering try/catch at
 * each call site would work exactly once; a single door is what keeps the next
 * reader from reintroducing the bug.
 */

/** Why a path could not be read. Deliberately coarse — four reasons the
 *  operator can act on, not a mirror of errno. */
export type ReadFailure = 'unreadable' | 'is-directory' | 'not-a-regular-file' | 'vanished';

export interface FsFailure {
  reason: ReadFailure;
  /** Node's errno name (EACCES, EISDIR, ELOOP, ENOENT…), or 'UNKNOWN' when the
   *  thrown value carried none. Kept verbatim: it is what the operator will
   *  recognise and what `ls -l` will explain. Empty when the condition was
   *  detected by inspection rather than by a failed syscall — there is no errno
   *  to quote, and inventing one would be a lie. */
  code: string;
  /** The path as the caller gave it. */
  path: string;
}

export type FileRead<T> = { ok: true; content: T } | { ok: false; error: FsFailure };
export type DirRead = { ok: true; entries: string[] } | { ok: false; error: FsFailure };

export function classifyFsError(err: unknown, path: string): FsFailure {
  const raw = (err as NodeJS.ErrnoException | null)?.code;
  const code = typeof raw === 'string' ? raw : 'UNKNOWN';
  // ENOENT/ENOTDIR after an existsSync that said yes is a genuine TOCTOU: the
  // tree changed under us. EISDIR is a shape error. Everything else — EACCES,
  // EPERM, ELOOP, EIO, EMFILE — the process simply cannot read it.
  const reason: ReadFailure =
    code === 'ENOENT' || code === 'ENOTDIR'
      ? 'vanished'
      : code === 'EISDIR'
        ? 'is-directory'
        : 'unreadable';
  return { reason, code, path };
}

/** The one phrasing of a read failure, shared by every finding and diagnostic
 *  so the same condition never reads two different ways. */
export function describeFsFailure(e: FsFailure): string {
  const what =
    e.reason === 'vanished'
      ? 'vanished while being read'
      : e.reason === 'is-directory'
        ? 'is a directory, not a file'
        : e.reason === 'not-a-regular-file'
          ? 'is not a regular file (a pipe, socket or device)'
          : 'is unreadable';
  return e.code ? `${what} (${e.code})` : what;
}

/**
 * The guard that must run BEFORE any open, and the reason both readers below
 * start with a `stat`.
 *
 * `readFileSync` on a FIFO with no writer does not fail — it BLOCKS in `open(2)`,
 * forever. No `try`/`catch` catches a hang, and a pre-push gate that never
 * returns is worse than one that crashes: it produces no verdict *and* no exit
 * code, wedging the terminal or running CI out to its own timeout. Sockets and
 * devices are the same family. So a path CASP intends to read as a document must
 * be a REGULAR file, established by inspection first.
 *
 * The stat→open window is a genuine TOCTOU, and it is accepted: it narrows a
 * systematic hang to a race, which is the best a local CLI can do without
 * `O_NONBLOCK` plumbing that Node does not expose to `readFileSync`.
 */
export function regularFileFailure(path: string): FsFailure | null {
  const kind = pathKind(path);
  if (kind === 'file') return null;
  if (kind === 'dir') return { reason: 'is-directory', code: 'EISDIR', path };
  // Cannot stat it at all: it is gone, or a parent is unsearchable. The open
  // below would report the difference; here it is simply not readable as a file.
  if (kind === null) return { reason: 'vanished', code: '', path };
  return { reason: 'not-a-regular-file', code: '', path };
}

export function readTextFile(path: string): FileRead<string> {
  const notRegular = regularFileFailure(path);
  if (notRegular) return { ok: false, error: notRegular };
  try {
    return { ok: true, content: readFileSync(path, 'utf8') };
  } catch (err) {
    return { ok: false, error: classifyFsError(err, path) };
  }
}

export function readBytes(path: string): FileRead<Buffer> {
  const notRegular = regularFileFailure(path);
  if (notRegular) return { ok: false, error: notRegular };
  try {
    return { ok: true, content: readFileSync(path) };
  } catch (err) {
    return { ok: false, error: classifyFsError(err, path) };
  }
}

export function readDirEntries(path: string): DirRead {
  try {
    return { ok: true, entries: readdirSync(path) };
  } catch (err) {
    return { ok: false, error: classifyFsError(err, path) };
  }
}

/** statSync that cannot throw. `null` when the path cannot be stat'd at all
 *  (missing, or an unreadable parent directory). */
export function pathKind(path: string): 'file' | 'dir' | 'other' | null {
  try {
    const s = statSync(path);
    return s.isDirectory() ? 'dir' : s.isFile() ? 'file' : 'other';
  } catch {
    return null;
  }
}

/** A claim's backing path must be a real directory — a file squatting the path
 *  is as unverifiable as a missing one. Never throws (an unreadable parent used
 *  to take statSync down with it). */
export function isDir(path: string): boolean {
  return pathKind(path) === 'dir';
}

export type FrontmatterRead =
  | { ok: true; fm: Record<string, unknown> | null }
  | { ok: false; error: FsFailure };

/**
 * The leading `--- … ---` block of a markdown file.
 *
 * Two outcomes that must not be conflated, which is why this returns a result
 * and not a bare `null`: content that is MALFORMED (no block, unparseable YAML)
 * degrades to `{ ok: true, fm: null }` and stays a WARN-level finding, exactly
 * as docs/threat-model.md promises; a file that could not be READ is `ok: false`
 * and becomes a FAIL — an unverifiable claim is not a passing claim.
 */
export function readFrontmatter(filePath: string): FrontmatterRead {
  const raw = readTextFile(filePath);
  if (!raw.ok) return raw;
  const m = raw.content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { ok: true, fm: null };
  try {
    return { ok: true, fm: parseYaml(m[1]) as Record<string, unknown> };
  } catch {
    return { ok: true, fm: null };
  }
}

/**
 * Placeholder strings an operator or agent reaches for when they have nothing
 * to point at: 'none', 'n/a', 'tbd', '-'. This format has exactly two ways to
 * say "no next slice" — a real path, or null — and neither of them is a word.
 *
 * These matter because they are TRUTHY. `if (state.next_prompt)` treats "none"
 * as a live pointer, so the placeholder does not park the cockpit, it makes it
 * lie: the gate reports a missing file, and every reader downstream believes a
 * next slice exists. Recognising the class by name lets the tooling say which
 * of the two real values was meant instead of guessing at a filename.
 */
const PLACEHOLDER_PATHS = new Set([
  'none', 'null', 'nil', 'n/a', 'na', 'tbd', 'tba', 'todo', 'unknown',
  '-', '--', '?', 'x', 'empty', 'nothing', 'aucun', 'rien'
]);

export function isPlaceholderPath(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  if (!v) return false;
  // '.md' is stripped so a literal `none.md` — the file an operator creates
  // after the gate tells them to "draft the prompt at that path" — is caught
  // as the same mistake rather than passing as a legitimate prompt.
  return PLACEHOLDER_PATHS.has(v.endsWith('.md') ? v.slice(0, -3) : v);
}

export interface State {
  // The CASP version that last scaffolded or upgraded this cockpit. Written by
  // `casp init`, refreshed by `casp upgrade`. OPTIONAL — a cockpit scaffolded
  // before the stamp existed has none and must never turn `check` red. The name
  // is namespaced: state.json has always accepted arbitrary extra keys, so a
  // bare `version` would collide with an operator's own product version.
  casp_version?: string;
  updated_at?: string;
  last_session_id?: string;
  last_commit?: string;
  current_phase?: string;
  next_phase?: string;
  next_prompt?: string;
  phases_shipped?: string[];
  phases_queued?: string[];
  // Named but never drawn by the progress bar, and never given a length: a
  // backlog is what has not been committed to. Read by the schedule layer as a
  // third place a dated phase may legitimately live.
  phases_backlog?: string[];
  migrations_applied?: string[];
  // The commit that last passed the batch deep audit (`/audit-batch`): adversarial
  // sub-agent review + full e2e + security pass. Everything after it on the branch
  // is unaudited. OPTIONAL — a project that doesn't run the batch pass never sets
  // it. Managed by `casp audit bump`, read by `casp audit status`. Never a merge
  // gate; a production-cutover gate.
  last_deep_audit?: string;
  // All three are OPTIONAL. sessions_dir / logs_dir default to the protocol's
  // canonical layout; a project that keeps that layout sets neither. migrations
  // has no default — a project with no migration concept reports none.
  sessions_dir?: string;
  logs_dir?: string;
  migrations_dir?: string;
  [k: string]: unknown;
}

// The protocol's canonical layout — the defaults when state declares no override.
export const DEFAULT_SESSIONS_DIR = 'docs/plan/sessions';
export const DEFAULT_LOGS_DIR = 'session-logs';

/**
 * The three state-surface directories, resolved from state in ONE place so every
 * verb computes them identically. Returns each in two forms: repo-relative
 * (`*Rel`, for messages, git pathspecs and the state-bump surface match) and
 * absolute (`*Abs`, for filesystem calls). `sessions`/`logs` always resolve (to
 * the defaults when unset); `migrations` is null when the project declares none.
 */
export interface ResolvedDirs {
  sessionsRel: string;
  logsRel: string;
  migrationsRel: string | null;
  sessionsAbs: string;
  logsAbs: string;
  migrationsAbs: string | null;
}

export function resolveDirs(root: string, state: State): ResolvedDirs {
  const pick = (v: unknown, fallback: string): string =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;
  const sessionsRel = pick(state.sessions_dir, DEFAULT_SESSIONS_DIR);
  const logsRel = pick(state.logs_dir, DEFAULT_LOGS_DIR);
  const migrationsRel =
    typeof state.migrations_dir === 'string' && state.migrations_dir.trim()
      ? state.migrations_dir.trim()
      : null;
  return {
    sessionsRel,
    logsRel,
    migrationsRel,
    sessionsAbs: join(root, sessionsRel),
    logsAbs: join(root, logsRel),
    migrationsAbs: migrationsRel ? join(root, migrationsRel) : null
  };
}

/**
 * The cockpit itself, with the read failure kept distinct from the parse
 * failure. `casp check` needs the difference to say "unreadable (EACCES)"
 * instead of the flatly wrong "not valid JSON"; every other verb collapses
 * both into null via `loadState` below.
 */
export type StateRead =
  | { ok: true; state: State; raw: Buffer }
  | { ok: false; kind: 'io'; error: FsFailure }
  | { ok: false; kind: 'parse' };

export function readStateFile(path: string): StateRead {
  const raw = readBytes(path);
  if (!raw.ok) return { ok: false, kind: 'io', error: raw.error };
  try {
    return { ok: true, state: JSON.parse(raw.content.toString('utf8')) as State, raw: raw.content };
  } catch {
    return { ok: false, kind: 'parse' };
  }
}

export function loadState(path: string): State | null {
  const r = readStateFile(path);
  // `!r.state` also rejects a file whose whole content is `null` — JSON.parse
  // succeeds on it, and every caller here means "an object I can read keys off".
  return r.ok && r.state ? r.state : null;
}

/** loadState() plus the hash of the exact bytes read — the "as read" fingerprint
 *  a mutator threads through to saveState()'s compare-and-swap so a write can
 *  refuse if another process touched the file in between. */
export function loadStateWithHash(path: string): { state: State; hash: string } | null {
  const r = readStateFile(path);
  return r.ok ? { state: r.state, hash: sha256(r.raw) } : null;
}

/** Thrown by saveState() when expectedHash is given and no longer matches what
 *  is on disk — another process wrote casp/state.json after this one read it.
 *  No lock, no merge: an honest refusal, nothing written. */
export class StateConflictError extends Error {
  constructor(path: string) {
    super(`${path} changed on disk since it was read — refusing to overwrite (re-run the command)`);
    this.name = 'StateConflictError';
  }
}

// Round-trips state.json: parse order is preserved, so mutating arrays/fields
// in place keeps the file's key order. 2-space indent + trailing newline match
// what `init` scaffolds and what every state-bump commit has written so far.
export function saveState(path: string, state: State, expectedHash?: string): void {
  // Write to a sibling temp file and rename over the target. rename(2) is atomic
  // within a filesystem, so a crash or a full disk mid-write leaves the previous
  // state.json intact instead of a truncated one. A naked writeFileSync here can
  // destroy the cockpit it is trying to update — and this function is shared by
  // every verb that mutates state (ship, close, audit, upgrade).
  //
  // Atomicity protects a PARTIAL write (crash/full-disk mid-write); it does not
  // protect an OVERWRITTEN one. Two agents writing the same casp/ in parallel is
  // a real observed mode, not a hypothetical — the implicit model up to here was
  // "one agent, one session, one branch". When the caller passes expectedHash
  // (the hash of the file as it read it), re-hash the CURRENT on-disk content
  // right before the rename and refuse the write on any mismatch. The residual
  // TOCTOU window between this check and the rename is accepted: it is narrow,
  // and a local CLI has no business promising serializability.
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
    if (expectedHash !== undefined && fileHash(path) !== expectedHash) {
      throw new StateConflictError(path);
    }
    renameSync(tmp, path);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best-effort cleanup — the original is what matters and it is untouched */
    }
    throw err;
  }
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Charset detection, for the two drawings the cockpit prints (the progress bar
 * in `casp status`, the timeline in `casp schedule`).
 *
 * Same posture as COLOR_ON above: detect once, expose a setter so `--plain` and
 * the tests can force either branch. A bare environment (no locale variables at
 * all — the common case inside CI containers and spawned test processes) is
 * treated as UTF-8 capable, because it is; only a locale that EXPLICITLY says
 * something else (LANG=C, POSIX, an 8859 charset) degrades. `CASP_ASCII=1`
 * forces the degraded charset from outside, which is how the exact-string tests
 * cover the fallback without inventing a locale.
 */
function detectUtf8(): boolean {
  if (process.env.CASP_ASCII === '1') return false;
  const locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG;
  if (!locale) return true;
  return /utf-?8/i.test(locale);
}

export const glyphs = { utf8: detectUtf8() };

export function setCharset(utf8: boolean): void {
  glyphs.utf8 = utf8;
}
