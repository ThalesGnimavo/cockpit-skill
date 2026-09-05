/**
 * help — `casp help`, `casp help <command>`, and `casp <command> --help`.
 *
 * One structured registry is the source of truth for per-command help. The
 * top-level block stays hand-authored (it groups verbs for scanning) but pulls
 * its command list from the same canon so the two can never name different
 * verbs. No LLM, no network — this is a static, deterministic surface, like the
 * rest of the binary.
 *
 * Keep this usage-focused, not marketing: "what is CASP" is one tight paragraph
 * plus a pointer to casp.sh. The binary ships a frozen snapshot; the site stays
 * current.
 */

import { pkgVersion } from './shared.js';

interface CmdHelp {
  /** The verb as typed. */
  name: string;
  /** One line — why this command exists. Shown in the unknown-command list. */
  summary: string;
  /** 1-2 sentences expanding the summary, printed at the top of the block. */
  blurb: string;
  /** Usage line(s), each printed verbatim under USAGE. */
  usage: string[];
  /** [flag, description] rows. */
  flags?: [string, string][];
  /** [command, inline comment] rows — 1-2 real examples. */
  examples?: [string, string][];
}

// The protocol canon (five verbs) followed by the 0.4+ tooling ergonomics, in
// the order a user meets them. `help` is itself a command and lists last.
const COMMANDS: CmdHelp[] = [
  {
    name: 'init',
    summary: 'Scaffold the casp/ continuity layer in this repo',
    blurb:
      'Writes casp/state.json and the session prompt/log layout, plus the first ' +
      'queued prompt, so `casp check` is green out of the box.',
    usage: ['casp init'],
    examples: [['casp init', 'in a fresh repo']]
  },
  {
    name: 'upgrade',
    summary: "Refresh an existing cockpit's scaffolds — never touches your data",
    blurb:
      'Brings casp/README.md and casp/templates/** up to the installed CLI, and ' +
      'stamps the cockpit with that version. It NEVER writes now.md or roadmap.md ' +
      'and never templates over state.json — the only state write is the additive ' +
      'version stamp, every existing value stays byte-identical. It never deletes, ' +
      'it is idempotent, and it never gates (check is the gate). This is the ' +
      'non-destructive counterpart to `init --force`, which overwrites everything.',
    usage: ['casp upgrade [--dry-run] [--plain]'],
    flags: [
      ['--dry-run, -n', 'Print the plan, write nothing'],
      ['--plain', 'No color (for pipes and logs)']
    ],
    examples: [
      ['casp upgrade', "adopt a newer release's scaffolds"],
      ['casp upgrade --dry-run', 'see exactly what would change first']
    ]
  },
  {
    name: 'status',
    summary: 'Print a one-screen snapshot of where the project stands',
    blurb:
      'A read-only dashboard: current phase, next prompt, last commit and ' +
      'session, with an embedded check verdict. Reporting, never gating — ' +
      'always exits 0.',
    usage: ['casp status [--plain] [--json]'],
    flags: [
      ['--plain', 'No color (for pipes and logs)'],
      [
        '--json',
        'Machine-readable snapshot + embedded check verdict (stable schema)'
      ]
    ],
    examples: [
      ['casp status', 'at session start'],
      ['casp status --json', 'feed a dashboard or another tool']
    ]
  },
  {
    name: 'check',
    summary: 'Validate state.json against git — exits 1 on drift',
    blurb:
      'The gate. Deterministic and local-only: compares casp/state.json with ' +
      'what git actually shows and blocks the push the moment they disagree. ' +
      'Exit 0 clean, exit 1 drift.',
    usage: ['casp check [--quiet] [--json] [--all [root]]'],
    flags: [
      ['--quiet', 'Suppress output unless a FAIL — CI-friendly'],
      ['--json', 'Machine-readable report (stable schema); still exits 1 on drift'],
      [
        '--all [root]',
        'Validate every casp/ cockpit under root (default cwd), one report'
      ]
    ],
    examples: [
      ['casp check', 'before every git push — mandatory'],
      ['casp check --all ~/projects', 'sweep a whole fleet']
    ]
  },
  {
    name: 'next',
    summary: "Print the next session's prompt — refuses on drift",
    blurb:
      'Runs the validator first, then prints the prompt state.next_prompt ' +
      'points at. If the state has drifted it refuses, so you never start a ' +
      'session on a lie.',
    usage: ['casp next [--no-check] [--no-git]'],
    flags: [
      ['--no-check', 'Skip the validator and print the prompt anyway'],
      ['--no-git', 'Skip the git-dependent checks (validate state shape only)']
    ],
    examples: [['casp next', 'surface the exact next move']]
  },
  {
    name: 'new',
    summary: 'Copy a session prompt, a discussion prompt or a log template into place',
    blurb:
      'Scaffolds a new session prompt, discussion prompt or log from the template, into the ' +
      'configured sessions_dir / logs_dir (defaults docs/plan/sessions and ' +
      'session-logs). A discussion prompt (frontmatter kind: discussion) is a session with the ' +
      'human whose deliverable is decisions, not code — what a cockpit queues once its roadmap ' +
      'is implemented (CASP-PROMPT-011).',
    usage: [
      'casp new prompt --slug <kebab-id>',
      'casp new discussion --slug <kebab-id>',
      'casp new log --slug <kebab-id>'
    ],
    flags: [['--slug <kebab-id>', 'The phase / log identifier (required)']],
    examples: [
      ['casp new prompt --slug phase-2-auth-flow', 'draft the next prompt'],
      ['casp new discussion --slug after-the-roadmap', 'queue the decisions that follow a finished roadmap'],
      ['casp new log --slug phase-2-auth-flow', "this session's log"]
    ]
  },
  {
    name: 'ship',
    summary: 'Mark a phase shipped — flip the prompt, wire its log, move the slug',
    blurb:
      'Records that a queued phase is done: flips its prompt frontmatter to ' +
      'shipped, wires the session_log pointer, and moves the slug from queued ' +
      'to shipped. No git.',
    usage: ['casp ship <slug>'],
    examples: [['casp ship phase-2-auth-flow', 'after the work is committed']]
  },
  {
    name: 'close',
    summary: 'Bump last_commit / last_session_id from HEAD + newest log',
    blurb:
      'The end-of-session state bump: sets last_commit to HEAD and ' +
      'last_session_id to the newest log, then runs check. Never commits — it ' +
      'leaves the bump staged for you to review and commit.',
    usage: ['casp close [--yes]'],
    flags: [['--yes', 'Skip the confirmation prompt']],
    examples: [['casp close', 'at session close, before the state-bump commit']]
  },
  {
    name: 'install-hook',
    summary: 'Write a pre-push hook that runs casp check on every push',
    blurb:
      'Installs .git/hooks/pre-push so the gate runs automatically before each ' +
      'push — drift can never reach the remote.',
    usage: ['casp install-hook [--force] [--remove]'],
    flags: [
      ['--force', 'Replace an existing / foreign pre-push hook'],
      ['--remove', 'Uninstall the casp hook']
    ],
    examples: [['casp install-hook', 'make the gate automatic']]
  },
  {
    name: 'verify',
    summary: 'Run the validator against a historical commit',
    blurb:
      'Checks out a past commit in a throwaway worktree and runs the validator ' +
      "against it — proves whether that commit's recorded state was in sync. " +
      'Exits with that verdict.',
    usage: ['casp verify <commit>'],
    examples: [
      ['casp verify HEAD~3', 'was the state honest 3 commits ago?'],
      ['casp verify a1b2c3d', 'audit a specific commit']
    ]
  },
  {
    name: 'state',
    summary: 'Field-level diff of casp/state.json between two commits',
    blurb:
      'Shows what changed in state.json between two commits — which fields ' +
      'moved, were added, or removed.',
    usage: ['casp state diff [A] [B]'],
    flags: [['--json', 'Emit the diff as data instead of a table']],
    examples: [
      ['casp state diff', 'HEAD~1 vs HEAD'],
      ['casp state diff HEAD~3 HEAD', 'across the last three commits']
    ]
  },
  {
    name: 'audit',
    summary: 'Track the deep-audit watermark — what is unaudited since the last batch pass',
    blurb:
      'Separates cheap per-merge proof (gated by check, every session) from the ' +
      'expensive batch pass (adversarial sub-agent audit + full e2e + security ' +
      'review, on demand). `status` shows last_deep_audit..HEAD; `bump` records ' +
      'HEAD as deep-audited. A production-cutover gate, never a merge gate — the ' +
      '`/audit-batch` skill drives it.',
    usage: ['casp audit status [--json]', 'casp audit bump [<sha>]'],
    flags: [['--json', 'Emit the status as data (status subcommand)']],
    examples: [
      ['casp audit status', 'what is unaudited before a cutover?'],
      ['casp audit bump', 'record HEAD as deep-audited (after a GO)']
    ]
  },
  {
    name: 'fact',
    summary: 'Manage casp/facts.json — claims verified once, kept fresh (opt-in)',
    blurb:
      'CASP cannot prove a claim is true, only that it has stopped being ' +
      'verified: its source changed, its TTL expired, or no method was ever ' +
      'recorded. A repo with no casp/facts.json sees none of this. `verify` is ' +
      'the one mutating subcommand, and the only place CASP runs repository ' +
      'content: it asks before executing the declared method, then again before ' +
      'writing the result. No TTY means it refuses rather than assumes, and no ' +
      'gate ever calls it.',
    usage: [
      'casp fact list [--json]',
      'casp fact check [--json]',
      'casp fact verify <id> [--yes]',
      'casp fact stale [--json]'
    ],
    flags: [
      ['--json', 'Emit the result as data'],
      ['--yes', 'verify: skip both prompts — runs the method AND writes, unattended']
    ],
    examples: [
      ['casp fact stale', 'what needs re-verifying before this goes in a doc?'],
      ['casp fact verify unit-cost-per-minute', 'replay the method, confirm, write']
    ]
  },
  {
    name: 'live',
    summary: 'Ephemeral coordination between parallel sessions (claims, journal, watch)',
    blurb:
      'Advisory path claims with a TTL and a liveness check, an append-only ' +
      'journal every session writes through its harness hooks, and a live view ' +
      'for the human. Wired as a PreToolUse hook, `casp live hook` blocks a ' +
      "foreign edit on a claimed path (exit 2) and names the owner. Everything " +
      'is machine-local runtime state under casp/live/ (self-gitignored) — ' +
      '`casp check` never reads it, and every internal failure fails OPEN: a ' +
      'dead session, a corrupt file or a disabled switch can only ever mean ' +
      '"no coordination", never "no editing". Disable instantly with ' +
      '`casp live off [--global]` or CASP_LIVE=0.',
    usage: [
      'casp live claim <path> [...] [--label <name>] [--ttl <min>] [--note <text>]',
      'casp live release <path> [...] | --mine',
      'casp live claims [--json]',
      'casp live controller [--label <name>] [--ttl <min>] [--release]',
      'casp live log <type> [--msg <text>] [--paths a,b]',
      'casp live tail [-n <count>]',
      'casp live watch',
      'casp live hook',
      'casp live install',
      'casp live off [--global] / casp live on [--global]'
    ],
    flags: [
      ['--label', 'claim/controller: human name for the session shown in views'],
      ['--ttl', 'claim: minutes before the claim self-expires (default 480)'],
      ['--session', 'override the session id (default: CLAUDE_CODE_SESSION_ID)'],
      ['--global', 'off/on: machine-wide switch (~/.casp/live.off)'],
      ['--json', 'claims: emit as data (adds `enforcing`: false when a switch is off)']
    ],
    examples: [
      ['casp live claim src/mobile --label mobile-train', 'hold a subtree for this session'],
      ['casp live watch', 'the human view: who does what, live'],
      ['casp live off --global', 'emergency: stand every guard down, machine-wide']
    ]
  },
  {
    name: 'rules',
    summary: 'List the verification rules casp check enforces',
    blurb:
      'Prints the catalogue of stable rule codes (CASP-<AREA>-<NNN>) with their ' +
      'titles — the public identifiers that appear on every check finding.',
    usage: ['casp rules [--json]'],
    flags: [['--json', 'Emit the catalogue as data']],
    examples: [['casp rules', 'see every rule the gate enforces']]
  },
  {
    name: 'explain',
    summary: "Print one rule's full definition",
    blurb:
      'Given a rule code (or an internal finding id), prints what the rule ' +
      'verifies, the evidence it inspects, and how to remediate a failure.',
    usage: ['casp explain <CODE> [--json]'],
    flags: [['--json', 'Emit the rule as data']],
    examples: [
      ['casp explain CASP-GIT-001', 'why did last_commit fail?'],
      ['casp explain CASP-PROMPT-003', 'the already-shipped-prompt rule']
    ]
  },
  {
    name: 'doctor',
    summary: 'Diagnose the environment (Node, git, cockpit, hook) — never gates',
    blurb:
      'A read-only onboarding diagnostic: checks Node version, the git binary ' +
      'and repository, casp/state.json, the resolved sessions/logs directories, ' +
      'the pre-push hook and core.hooksPath. Reports PASS/WARN/FAIL per line but ' +
      'ALWAYS exits 0 — it maps what to fix, it never blocks (check is the gate).',
    usage: ['casp doctor [--plain] [--json]'],
    flags: [
      ['--plain', 'No color (for pipes and logs)'],
      ['--json', 'Machine-readable diagnostic (stable schema); still exits 0']
    ],
    examples: [
      ['casp doctor', 'is this machine set up to run casp?'],
      ['casp doctor --json', 'feed onboarding automation']
    ]
  },
  {
    name: 'version',
    summary: 'Print the version — plain, or a JSON handoff with --json',
    blurb:
      'Prints the version string (identical to `casp -V`). With --json, emits ' +
      '{ name, version, node, schema_version } — the version handoff for ' +
      'agent-to-agent negotiation, where schema_version is the check --json ' +
      'report schema version.',
    usage: ['casp version [--json]'],
    flags: [['--json', 'Emit { name, version, node, schema_version } as data']],
    examples: [
      ['casp version', 'the version string'],
      ['casp version --json', 'the machine-readable handoff']
    ]
  },
  {
    name: 'help',
    summary: 'Print help — top-level, or focused on one command',
    blurb:
      'With no argument, the top-level overview. With a command name, that ' +
      "command's focused help. `casp <command> --help` is equivalent.",
    usage: ['casp help [command]'],
    examples: [
      ['casp help', 'the overview'],
      ['casp help check', 'everything about the gate']
    ]
  }
];

/** Every valid verb, in canon order — the single naming source. */
export const COMMAND_NAMES: string[] = COMMANDS.map((c) => c.name);

const BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

/** Render one command's focused help block. Returns null for an unknown verb. */
export function commandHelp(name: string): string | null {
  const cmd = BY_NAME.get(name);
  if (!cmd) return null;

  const lines: string[] = [];
  lines.push('');
  lines.push(`casp ${cmd.name} — ${cmd.summary}`);
  lines.push('');
  lines.push(wrap(cmd.blurb, 78));
  lines.push('');
  lines.push('USAGE');
  for (const u of cmd.usage) lines.push(`  ${u}`);

  if (cmd.flags?.length) {
    lines.push('');
    lines.push('FLAGS');
    const w = Math.max(0, ...cmd.flags.map(([f]) => f.length));
    for (const [flag, desc] of cmd.flags) {
      lines.push(`  ${flag.padEnd(w)}   ${desc}`);
    }
  }

  if (cmd.examples?.length) {
    lines.push('');
    lines.push('EXAMPLES');
    const w = Math.max(0, ...cmd.examples.map(([ex]) => ex.length));
    for (const [ex, comment] of cmd.examples) {
      lines.push(`  ${ex.padEnd(w)}   # ${comment}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/** The graceful unknown-command message: name the miss, list the valid verbs. */
export function unknownCommandMessage(name: string): string {
  return [
    `no such command: ${name}`,
    '',
    `valid commands: ${COMMAND_NAMES.join(', ')}`,
    'run `casp help <command>` for details.'
  ].join('\n');
}

/** The top-level help block. Hand-grouped for scanning; loop model up front. */
export function topLevelHelp(version: string = pkgVersion()): string {
  return `
casp ${version} — the Coding-Agent State Protocol

The protocol that refuses to let your state lie: a git-native, local-only state
file every AI coding agent can read, plus a validator that blocks the push the
moment your project drifts. Deterministic, zero telemetry, model-agnostic.

USAGE
  casp <command> [options]

THE LOOP
  init → status → (work) → check → ship / close → push
  Scaffold once, snapshot at session start, do the work, then gate on check.
  Record the shipped phase with ship/close and push. check is the only hard
  gate — exit 1 blocks the push; everything else just keeps the state honest.

COMMANDS
  init                          Scaffold the casp/ continuity layer in this repo
  upgrade                       Refresh an existing cockpit's scaffolds to this
                                  CLI and stamp its version — never touches
                                  state.json values, now.md or roadmap.md
                                  (--dry-run to preview)
  status                        Print one-screen snapshot (use --plain for no color)
  status --json                 Machine-readable snapshot + embedded check verdict
                                  (stable schema; always exits 0 — reporting, not gating)
  check                         Validate state.json against git — exits 1 on drift
  check --quiet                 Same, suppress output unless FAIL (CI-friendly)
  check --json                  Same checks, machine-readable JSON report (stable schema)
  check --all [root]            Validate every casp/ cockpit under a root, one report
  next                          Print the next session's prompt from state.next_prompt
                                  — refuses on drift (runs the validator first);
                                  --no-check to start anyway, --no-git to skip git checks
  ship <slug>                   Mark a phase shipped: flip prompt to shipped, wire log,
                                  move slug queued → shipped (no git)
  close                         Bump last_commit / last_session_id from HEAD + newest log,
                                  then run check (no git)
  new prompt --slug <kebab-id>  Copy session-prompt template to the sessions dir
                                  (default docs/plan/sessions; set sessions_dir to override)
  new discussion --slug <id>    Copy discussion-prompt template to the sessions dir
                                  (a session with the human: decisions, not code)
  new log --slug <kebab-id>     Copy session-log template to the logs dir
                                  (default session-logs; set logs_dir to override)
  install-hook                  Write .git/hooks/pre-push so casp check runs on
                                  every push (--force to replace a foreign hook,
                                  --remove to uninstall)
  verify <commit>               Run the validator against a historical commit
                                  (in a throwaway worktree); exits with its verdict
  state diff [A] [B]            Field-level diff of casp/state.json between two
                                  commits (default HEAD~1 → HEAD; --json for data)
  audit status                  What is unaudited since the last deep-audit watermark
  audit bump [<sha>]            Record a commit as deep-audited (production-cutover
                                  gate, never a merge gate)
  fact list                     Inventory of casp/facts.json with each fact's freshness
                                  (opt-in — silent with no facts.json)
  fact check                    FACT-only subset of check (--json for data)
  fact verify <id>              Replay a fact's method, show before/after, confirm, write
                                  (--yes to skip the prompt)
  fact stale                    Facts that expired or drifted — the re-verify work list
  live claim <path>             Hold a path for this session (TTL + liveness;
                                  a dead session never blocks anyone)
  live watch                    Live view of the shared journal — the human's
                                  whole-fleet stream, zero agent context cost
  live hook                     The harness hook entry: guards claimed paths
                                  (PreToolUse, fail-open) and feeds the journal
  live controller               Declare this session the fleet controller —
                                  sole writer of reserved shared paths while
                                  another lane is live (dormant when solo)
  live off [--global]           Emergency stand-down, no settings edit needed
  rules                         List the verification rules check enforces
                                  (stable CASP-<AREA>-<NNN> codes; --json for data)
  explain <CODE>                Print one rule's full definition (verifies /
                                  evidence / remediation); e.g. CASP-GIT-001
  doctor                        Diagnose the environment (Node, git, cockpit,
                                  pre-push hook, core.hooksPath) — PASS/WARN/FAIL
                                  per line; never gates (always exits 0)
  version                       Print the version; --json for a machine handoff
                                  { name, version, node, schema_version }
  help [command]                This overview, or one command's focused help

GLOBAL
  -h, --help                    Print this help (or \`casp <command> --help\`)
  -V, --version                 Print version (\`casp version --json\` for data)

EXAMPLES
  casp init                     # in a fresh repo
  casp status                   # at session start
  casp check                    # before git push — mandatory, blocks on drift
  casp next                     # surface the exact next move
  casp help check               # focused help for one command

LEARN MORE
  https://casp.sh
  https://github.com/ThalesGnimavo/casp
`;
}

/**
 * `casp help [command]` dispatch. Returns the exit code: 0 for the overview or
 * a known command, 1 for an unknown one (written to stderr). The first
 * non-flag arg is the target so `casp help --foo check` still resolves check.
 */
export function runHelp(rest: string[]): number {
  const target = rest.find((a) => !a.startsWith('-'));
  if (!target) {
    console.log(topLevelHelp());
    return 0;
  }
  const block = commandHelp(target);
  if (block) {
    console.log(block);
    return 0;
  }
  console.error(unknownCommandMessage(target));
  return 1;
}

/** Soft-wrap a paragraph to `width` columns on word boundaries. */
function wrap(text: string, width: number): string {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out.join('\n');
}
