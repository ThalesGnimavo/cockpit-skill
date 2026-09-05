/**
 * The rule registry — the public catalogue of what `casp check` verifies.
 *
 * Every finding `casp check` emits carries a stable rule code (CASP-<AREA>-<NNN>)
 * derived here from its internal id. The code is the PUBLIC, versioned identifier:
 * safe to reference in docs, CI dashboards, and `casp explain <CODE>`. Internal
 * finding ids may be refactored freely; codes are a compatibility surface and
 * change only through an explicit deprecation, never silently.
 *
 * A rule states WHAT is verified and against WHICH evidence — deliberately narrow.
 * CASP verifies recorded state claims against repository evidence. It does NOT
 * verify that the code is correct, that a feature is deployed, or that a migration
 * ran on a remote database. See docs/what-casp-proves.md and docs/rules.md.
 *
 * No LLM, no network — this registry is static data, like the rest of the binary.
 */

export interface Rule {
  /** Stable public identifier, e.g. CASP-GIT-001. */
  code: string;
  /** Short human title. */
  title: string;
  /** Area bucket: STATE | PROMPT | SESSION | GIT | MIGRATION | FACT | IO | WORKTREE. */
  area: string;
  /** The normative claim this rule verifies. */
  verifies: string;
  /** The evidence it inspects to decide pass/fail. */
  evidence: string;
  /** General direction to remediate a failure. */
  remediation: string;
  /** Maps an internal finding id to this rule. First match in RULES wins. */
  matches: (id: string) => boolean;
}

// Ordered by area, then number. `matches` keys off the internal finding ids
// emitted in check.ts — kept in lockstep by the rules-coverage test, which fails
// if any emitted id maps to no rule.
export const RULES: Rule[] = [
  {
    code: 'CASP-STATE-001',
    title: 'state.json present and valid JSON',
    area: 'STATE',
    verifies: 'casp/state.json exists at the project root and parses as JSON.',
    evidence: 'The file casp/state.json on disk.',
    remediation: 'Run `casp init`, or fix the JSON syntax (a trailing comma or unquoted key, usually).',
    matches: (id) => id === 'state.file'
  },
  {
    code: 'CASP-STATE-002',
    title: 'Required state keys present',
    area: 'STATE',
    verifies:
      'The required keys (updated_at, last_session_id, last_commit, current_phase, phases_shipped) are present and non-null; next_phase and next_prompt are present (an explicit null is a valid "parked" value).',
    evidence: 'The parsed contents of casp/state.json.',
    remediation: 'Add the missing key to casp/state.json (use null for next_phase / next_prompt when there is no queued next slice).',
    matches: (id) => id.startsWith('state.shape.')
  },
  {
    code: 'CASP-STATE-003',
    title: 'phases_shipped has no duplicates',
    area: 'STATE',
    verifies: 'Every entry in phases_shipped is unique — no phase is recorded as shipped twice.',
    evidence: 'The phases_shipped array in casp/state.json.',
    remediation: 'Dedupe the phases_shipped array.',
    matches: (id) => id === 'phases_shipped.unique'
  },
  {
    code: 'CASP-PROMPT-001',
    title: 'next_prompt file exists',
    area: 'PROMPT',
    verifies:
      'state.next_prompt is a real path resolving to a file on disk — not a placeholder word (none / n/a / tbd / -), which is truthy and therefore makes every downstream reader believe a next slice exists.',
    evidence: 'The path state.next_prompt, resolved against the project root.',
    remediation:
      'Draft the prompt at that path (`casp new prompt --slug <slug>`) OR fix state.next_prompt. Never a placeholder word: the only two valid values are a path and null.',
    matches: (id) => id === 'next_prompt.exists'
  },
  {
    code: 'CASP-PROMPT-005',
    title: 'next_prompt is not empty while phases are queued',
    area: 'PROMPT',
    verifies:
      'next_prompt is only empty/null when phases_queued is empty too. "Parked" must be TRUE: a cockpit that reports nothing to start while its own backlog holds queued phases is contradicting itself, and the next session opens on a blank.',
    evidence: 'state.next_prompt compared against state.phases_queued.',
    remediation:
      'Point next_prompt at the prompt file for the head of phases_queued. If that phase has no prompt file, draft it — a phase with no prompt is an intention, not a queue entry.',
    matches: (id) => id === 'next_prompt.parked_while_queued'
  },
  {
    code: 'CASP-PROMPT-002',
    title: 'next_prompt has frontmatter',
    area: 'PROMPT',
    verifies: 'The next_prompt file begins with a parseable YAML frontmatter block.',
    evidence: 'The leading --- ... --- block of the next_prompt file.',
    remediation: 'Add status / session_id / drafted_at frontmatter to the prompt.',
    matches: (id) => id === 'next_prompt.frontmatter'
  },
  {
    code: 'CASP-PROMPT-003',
    title: 'next_prompt is not already shipped',
    area: 'PROMPT',
    verifies:
      'The next_prompt frontmatter status is a startable value (queued / in-progress), never "shipped" — the exact drift CASP was built to catch.',
    evidence: 'The status field in the next_prompt frontmatter.',
    remediation: 'Point state.next_prompt at the real next slice, or re-execute the shipped prompt explicitly.',
    matches: (id) => id === 'next_prompt.status'
  },
  {
    code: 'CASP-PROMPT-004',
    title: 'Session prompts have parseable frontmatter',
    area: 'PROMPT',
    verifies: 'Every prompt file in the sessions directory begins with parseable YAML frontmatter.',
    evidence: 'Each *.md file in the resolved sessions_dir.',
    remediation: 'Give the prompt a --- ... --- frontmatter block with at least a status.',
    matches: (id) => id.startsWith('prompt.') && id.endsWith('.frontmatter')
  },
  {
    code: 'CASP-PROMPT-005',
    title: 'Shipped prompts have a resolvable session_log',
    area: 'PROMPT',
    verifies:
      'A prompt marked status: shipped declares a session_log pointer, and every file it names exists.',
    evidence: 'The session_log field of each shipped prompt, resolved against the project root.',
    remediation: 'Set session_log: <logs_dir>/<id>.md and write the log(s) — repo-relative paths, comma-separated or a YAML list.',
    matches: (id) =>
      (id.startsWith('prompt.') &&
        (id.endsWith('.session_log') || id.endsWith('.session_log_exists'))) ||
      id === 'prompts.shipped_logged'
  },
  {
    code: 'CASP-PROMPT-006',
    title: 'Prompt status values are canonical',
    area: 'PROMPT',
    verifies: 'Every session prompt carries a status from the canonical set: queued, in-progress, shipped, archived.',
    evidence: 'The status field of each prompt in the sessions directory.',
    remediation: 'Use one of: queued | in-progress | shipped | archived.',
    matches: (id) => id === 'prompts.status_values'
  },
  {
    code: 'CASP-PROMPT-007',
    title: 'next_after resolves to a real slice',
    area: 'PROMPT',
    verifies:
      'Every queued prompt that declares a `next_after` names a slice that exists: a prompt in the sessions directory (by filename stem, its lowercase form, or its slug with the scaffold’s PHASE- prefix removed), a session id that maps to a log, or a phase id declared by state. A dangling reference makes the plan unexecutable as written, so it gates. Adoption is derived from the data: `next_after` is optional, and an unedited template placeholder, an empty value or null is not a declaration and produces no finding.',
    evidence:
      'The `next_after` frontmatter of each queued prompt, resolved against the sessions directory, the logs directory and state’s phase vocabulary. Filenames are never fuzzy-matched — every identity is an exact string after a documented normalization.',
    remediation:
      'Point next_after at an existing prompt slug, session id, or phase id — or remove the key to park the prompt.',
    matches: (id) =>
      id.startsWith('prompt_chain.dangling.') ||
      id === 'prompt_chain.coherent' ||
      id === 'prompt_chain.scope'
  },
  {
    code: 'CASP-PROMPT-008',
    title: 'The next_after chain is acyclic',
    area: 'PROMPT',
    verifies:
      'The queued prompts’ `next_after` references form no ring — including a prompt naming itself. A cycle is a claim that cannot be true: no linear execution satisfies it, so it gates.',
    evidence: 'The predecessor graph built from the `next_after` frontmatter of queued prompts.',
    remediation: 'Break the ring — one of the prompts in it must run first.',
    matches: (id) => id.startsWith('prompt_chain.cycle.')
  },
  {
    code: 'CASP-PROMPT-009',
    title: 'No two queued prompts claim the same predecessor',
    area: 'PROMPT',
    verifies:
      'At most one queued prompt declares any given `next_after` target, so "what runs after that slice" has exactly one answer. Advisory (WARN): a fork is ambiguous, not false.',
    evidence: 'The `next_after` values of every queued prompt, grouped by target.',
    remediation: 'Chain the prompts in sequence instead of hanging both off the same predecessor.',
    matches: (id) => id.startsWith('prompt_chain.fork.')
  },
  {
    code: 'CASP-PROMPT-010',
    title: 'Every chained queued prompt is reachable from next_prompt',
    area: 'PROMPT',
    verifies:
      'A queued prompt that declares a `next_after` is reachable by following the chain forward from state.next_prompt — otherwise it will simply never run. Advisory (WARN): a deliberate parking lot of queued prompts is a legitimate way to work, and a prompt with no `next_after` is parked by definition and never reported.',
    evidence: 'The successor graph walked from the prompt named by state.next_prompt.',
    remediation: 'Chain it onto the queue, or leave next_after unset to park it deliberately.',
    matches: (id) => id.startsWith('prompt_chain.orphan.')
  },
  {
    code: 'CASP-PROMPT-011',
    title: 'A cockpit that has shipped never reports nothing to start',
    area: 'PROMPT',
    verifies:
      'When phases_shipped is non-empty, next_prompt is never empty/null — even with an empty queue. A finished roadmap is not a finished project: distribution, pricing, support, the next roadmap. What follows is a decision, and a decision is a session too — a DISCUSSION prompt (frontmatter kind: discussion) whose deliverable is written decisions and the prompts they produce, not code. A cockpit that has shipped nothing yet is exempt: not started is not finished.',
    evidence: 'state.next_prompt compared against state.phases_shipped and state.phases_queued.',
    remediation:
      'Queue a discussion prompt (`casp new discussion --slug <slug>`), fill the decisions it must obtain from the human, and point next_prompt at it. Never null next_prompt on a cockpit that has shipped.',
    matches: (id) => id === 'next_prompt.never_empty_after_shipping'
  },
  {
    code: 'CASP-SESSION-001',
    title: 'last_session_id maps to a session log',
    area: 'SESSION',
    verifies:
      'last_session_id resolves to an existing <logs_dir>/<id>.md file (a "pending" placeholder before the first session is a WARN, not a claim).',
    evidence: 'The logs directory and the file named by last_session_id.',
    remediation: 'Write the session log (`casp new log --slug <slug>`) OR fix last_session_id.',
    matches: (id) => id.startsWith('last_session.')
  },
  {
    code: 'CASP-SESSION-002',
    title: 'Shipped history directories exist',
    area: 'SESSION',
    verifies: 'When phases_shipped is non-empty, the sessions and logs directories it implies exist.',
    evidence: 'The resolved sessions_dir and logs_dir on disk.',
    remediation: 'Create the directories (the protocol’s prompts and logs live there) OR empty phases_shipped.',
    matches: (id) => id.startsWith('shipped_history.')
  },
  {
    code: 'CASP-SESSION-003',
    title: 'Shipped phases are declared by a session log',
    area: 'SESSION',
    verifies:
      'Every phases_shipped entry from the point of adoption onward is declared by a `phase:` key in some session log’s frontmatter. Adoption is derived from the data: the first entry any log declares opens the window, and earlier entries are exempt as pre-adoption. A repo where no log declares a phase gets no finding at all.',
    evidence:
      'The `phase:` frontmatter key across every .md file in the resolved logs_dir, compared against phases_shipped. Filenames are never consulted — the mapping is declared, never inferred.',
    remediation:
      'Add `phase: <id>` to the frontmatter of the log that shipped it (or write the missing log) OR remove the entry from phases_shipped.',
    matches: (id) => id.startsWith('shipped_log.')
  },
  {
    code: 'CASP-GIT-001',
    title: 'last_commit is consistent with git history',
    area: 'GIT',
    verifies:
      'last_commit is HEAD, or the parent of HEAD via a state-bump commit that touches only the state surface, or at minimum a real commit in the repository. A SHA absent from history is drift; "pending" before the first push is a WARN.',
    evidence: 'git rev-parse / rev-list over the repository history (never a shell — the value is passed inject-safe).',
    remediation: 'Bump state.last_commit to a real SHA (usually HEAD after the session commit).',
    matches: (id) => id === 'last_commit.git'
  },
  {
    code: 'CASP-MIGRATION-001',
    title: 'Claimed migrations have a directory to verify against',
    area: 'MIGRATION',
    verifies: 'When migrations_applied is non-empty, migrations_dir is set and the directory exists — a claim with nothing to check it against is drift.',
    evidence: 'state.migrations_dir and that directory on disk.',
    remediation: 'Set migrations_dir to the migrations directory (and create it) OR empty migrations_applied.',
    matches: (id) => id === 'migrations.dir'
  },
  {
    code: 'CASP-MIGRATION-002',
    title: 'migrations_applied matches the migrations directory',
    area: 'MIGRATION',
    verifies: 'The set of migrations in state.migrations_applied matches the .sql/.py migration files on disk (dunder infrastructure files excluded).',
    evidence: 'The migration files in the resolved migrations_dir vs migrations_applied.',
    remediation: 'Add missing-from-state entries to migrations_applied OR remove ghost entries.',
    matches: (id) => id === 'migrations.match'
  },
  {
    code: 'CASP-MIGRATION-003',
    title: 'Untracked migrations on disk (advisory)',
    area: 'MIGRATION',
    verifies: 'A configured migrations_dir holds migration files, but state declares no migrations_applied at all — a likely mis-configuration. Advisory (WARN): never blocks a push.',
    evidence: 'Migration files present in migrations_dir while migrations_applied is absent.',
    remediation: 'Add the applied migrations to state.migrations_applied OR remove migrations_dir if unused.',
    matches: (id) => id === 'migrations.untracked'
  },
  {
    code: 'CASP-FACT-001',
    title: 'Declared fact source resolves',
    area: 'FACT',
    verifies:
      'When casp/facts.json declares a fact, its source is either a repo-relative path that exists or an external: label. Opt-in: a cockpit with no facts.json emits no CASP-FACT-* finding at all.',
    evidence: 'casp/facts.json (existence and shape) and, for a repo-relative source, that path on disk.',
    remediation: 'Fix the source path to an existing file, or prefix an out-of-repo source with external: OR remove the fact.',
    matches: (id) => id === 'fact.file' || id.startsWith('fact.source.')
  },
  {
    code: 'CASP-FACT-002',
    title: 'source_hash matches the source\'s current content',
    area: 'FACT',
    verifies:
      'A repo-relative fact source carries source_hash (sha256 at verification time); the hash CASP recomputes now must still match. This is the one rule that would have caught the founding incident: a unit cost derived from a config file, never recalculated after the file changed underneath it.',
    evidence: 'sha256 of the current content at the resolved source path vs facts.json\'s recorded source_hash.',
    remediation: 'Re-verify the fact (casp fact verify <id>) to record the new value and hash, or the source has drifted and the fact is stale.',
    matches: (id) => id.startsWith('fact.hash.')
  },
  {
    code: 'CASP-FACT-003',
    title: 'Fact has not exceeded its TTL',
    area: 'FACT',
    verifies:
      'verified_at + ttl_days has not passed (WARN once past, FAIL past double the TTL). Every fact must declare ttl_days — an external: source has no hash to fall back on, so the TTL is its only guard.',
    evidence: 'Today\'s date vs facts.json\'s verified_at and ttl_days.',
    remediation: 'Re-verify the fact (casp fact verify <id>) or raise ttl_days if the cadence was wrong.',
    matches: (id) => id.startsWith('fact.ttl.')
  },
  {
    code: 'CASP-FACT-004',
    title: 'used_in documents carry the fact\'s marker',
    area: 'FACT',
    verifies:
      'Every path in a fact\'s used_in exists and contains a `<!-- casp:fact <id> -->` marker. Advisory (WARN): checks the marker\'s PRESENCE only, never the value written around it — comparing a number in prose would require parsing natural language.',
    evidence: 'The literal marker string in each used_in file.',
    remediation: 'Add the <!-- casp:fact <id> -->…<!-- /casp:fact --> marker where the value is cited, or fix/remove the used_in entry.',
    matches: (id) => id.startsWith('fact.used_in.')
  },
  {
    code: 'CASP-FACT-005',
    title: 'Fact records a reproduction method',
    area: 'FACT',
    verifies:
      'method is present and non-empty. Advisory (WARN): a value with no recorded method is not reproducible or auditable after the fact.',
    evidence: 'facts.json\'s method field for the fact.',
    remediation: 'Record the command, query, or console path that produced the value.',
    matches: (id) => id.startsWith('fact.method.')
  },
  {
    code: 'CASP-FACT-006',
    title: 'method does not match a known measurement trap',
    area: 'FACT',
    verifies:
      'method does not match a pattern in the trap registry (src/traps.ts) or a project-declared trap in facts.json — a known way to produce an ESTIMATE that reads like a measurement (a planner row-count guess, EXPLAIN without ANALYZE, a single instantaneous sample). This is the rule that would have caught n_live_tup read as an exact row count.',
    evidence: 'method\'s text against the static trap registry.',
    remediation: 'Use a real measurement (e.g. count(*) instead of a planner estimate) and re-verify.',
    matches: (id) => id.startsWith('fact.trap.')
  },
  {
    code: 'CASP-IO-001',
    title: 'Repository content the gate needs is readable',
    area: 'IO',
    verifies:
      'Every file CASP must open to verify a claim can actually be opened: the cockpit, the next_prompt, each session prompt and session log, the state-surface directories. A path that exists and cannot be read — mode 000, a directory squatting a *.md path, a symlink cycle, a file deleted mid-run — is reported as a finding, never as a crash and never as a silent skip. FAIL, because an unverifiable claim is not a passing claim: the gate may say "I could not check this", never "clean".',
    evidence:
      'The read itself. The finding carries the path and the operating system\'s reason (EACCES, EISDIR, ELOOP, ENOENT…) verbatim.',
    remediation:
      'Make the path readable (chmod), move the directory squatting a file path, or remove the file so there is no claim left to verify.',
    matches: (id) => id.startsWith('io.')
  },
  {
    code: 'CASP-IO-002',
    title: 'The validation run completed',
    area: 'IO',
    verifies:
      'The check itself ran to the end. This is a backstop, not a check on your repository: every read path returns a result instead of throwing, so an unexpected error reaching here is a CASP bug. It fails CLOSED — the run still produces a parseable report carrying the failure, rather than a stack trace and an empty stdout.',
    evidence: 'An unexpected exception escaping the validator.',
    remediation: 'Report it, with the command and the message shown in the finding.',
    matches: (id) => id === 'check.incomplete'
  },
  {
    code: 'CASP-WORKTREE-001',
    title: 'State surface is committed',
    area: 'WORKTREE',
    verifies: 'casp/, the sessions directory, and the logs directory have no uncommitted changes when the session closes. Advisory (WARN).',
    evidence: 'git status --porcelain over the state-surface paths (passed inject-safe).',
    remediation: 'Commit + push the state surface before the session closes.',
    matches: (id) => id === 'workdir.clean'
  }
];

const BY_CODE = new Map(RULES.map((r) => [r.code.toUpperCase(), r]));

/** The stable rule code for a finding id, or null if none maps (a coverage bug). */
export function ruleFor(id: string): Rule | null {
  for (const r of RULES) if (r.matches(id)) return r;
  return null;
}

/** Resolve a rule by its code (case-insensitive) or an internal finding id. */
export function resolveRule(query: string): Rule | null {
  const byCode = BY_CODE.get(query.toUpperCase());
  if (byCode) return byCode;
  return ruleFor(query);
}
