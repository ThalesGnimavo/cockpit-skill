# CASP verification rules

Every finding `casp check` emits carries a stable **rule code** of the form
`CASP-<AREA>-<NNN>`. The code is the public, versioned identifier — safe to
reference in docs, CI dashboards, and issue trackers. Internal finding ids may be
refactored freely; **codes are a compatibility surface and change only through an
explicit deprecation, never silently.**

The authoritative, always-current definitions live in the binary:

```bash
casp rules                 # list every rule (add --json for data)
casp explain CASP-GIT-001  # one rule: what it verifies, evidence, remediation
```

`casp check --json` includes the `rule` code on every finding, and
`casp check` prints it next to each WARN/FAIL so you can jump straight to
`casp explain <CODE>`.

A rule states **what** is verified and against **which evidence** — deliberately
narrow. CASP verifies recorded state claims against repository evidence; it does
not verify that your code is correct, deployed, or bug-free. See
[what-casp-proves.md](./what-casp-proves.md).

## The catalogue

> Snapshot for the current release. `casp rules` is the source of truth.

| Code | Area | Title |
|---|---|---|
| `CASP-STATE-001` | STATE | state.json present and valid JSON |
| `CASP-STATE-002` | STATE | Required state keys present |
| `CASP-STATE-003` | STATE | phases_shipped has no duplicates |
| `CASP-PROMPT-001` | PROMPT | next_prompt file exists |
| `CASP-PROMPT-002` | PROMPT | next_prompt has frontmatter |
| `CASP-PROMPT-003` | PROMPT | next_prompt is not already shipped |
| `CASP-PROMPT-004` | PROMPT | Session prompts have parseable frontmatter |
| `CASP-PROMPT-005` | PROMPT | Shipped prompts have a resolvable session_log |
| `CASP-PROMPT-006` | PROMPT | Prompt status values are canonical |
| `CASP-PROMPT-007` | PROMPT | next_after resolves to a real slice |
| `CASP-PROMPT-008` | PROMPT | The next_after chain is acyclic |
| `CASP-PROMPT-009` | PROMPT | No two queued prompts claim the same predecessor |
| `CASP-PROMPT-010` | PROMPT | Every chained queued prompt is reachable from next_prompt |
| `CASP-PROMPT-011` | PROMPT | A cockpit that has shipped never reports nothing to start |
| `CASP-SESSION-001` | SESSION | last_session_id maps to a session log |
| `CASP-SESSION-002` | SESSION | Shipped history directories exist |
| `CASP-SESSION-003` | SESSION | Shipped phases are declared by a session log |
| `CASP-GIT-001` | GIT | last_commit is consistent with git history |
| `CASP-MIGRATION-001` | MIGRATION | Claimed migrations have a directory to verify against |
| `CASP-MIGRATION-002` | MIGRATION | migrations_applied matches the migrations directory |
| `CASP-MIGRATION-003` | MIGRATION | Untracked migrations on disk (advisory) |
| `CASP-FACT-001` | FACT | Declared fact source resolves |
| `CASP-FACT-002` | FACT | source_hash matches the source's current content |
| `CASP-FACT-003` | FACT | Fact has not exceeded its TTL |
| `CASP-FACT-004` | FACT | used_in documents carry the fact's marker |
| `CASP-FACT-005` | FACT | Fact records a reproduction method |
| `CASP-FACT-006` | FACT | method does not match a known measurement trap |
| `CASP-SCHEDULE-001` | SCHEDULE | schedule.json validates |
| `CASP-SCHEDULE-002` | SCHEDULE | A dated phase exists in a phase list |
| `CASP-SCHEDULE-003` | SCHEDULE | The schedule does not contradict itself |
| `CASP-SCHEDULE-004` | SCHEDULE | A queued dated phase has not silently slipped into the past |
| `CASP-IO-001` | IO | Repository content the gate needs is readable |
| `CASP-IO-002` | IO | The validation run completed |
| `CASP-WORKTREE-001` | WORKTREE | State surface is committed |

## Severity

- **fail** — blocks the push (`casp check` exits 1). A recorded claim contradicts
  git evidence, or a claim cannot be verified at all.
- **warn** — advisory, never blocks (exit stays 0). A likely mistake or an
  expected pre-first-session placeholder (`pending`).
- **pass** — the claim was checked and holds.

The exit-code contract (clean → 0, drift → 1) is covered by the test suite, so
the CI gate stays real.

## Opt-in rules

Two categories stay **completely silent** until a repo adopts the convention they
read, so adding them could not redden a cockpit that had not opted in:

- `CASP-SESSION-003` reads the `phase:` key in session-log frontmatter. No log
  declares a phase → no finding.
- `CASP-PROMPT-007` … `CASP-PROMPT-010` read the `next_after:` key in prompt
  frontmatter. No **queued** prompt declares a real predecessor → no finding.
  The canonical template ships `next_after: <previous-session-id-or-prompt-slug>`,
  so an unedited placeholder, an empty value and `null` are not declarations.
- `CASP-FACT-001` … `CASP-FACT-006` read `casp/facts.json`. No such file → no
  finding at all, not even a PASS. See [the facts layer](#the-facts-layer) below.
- `CASP-SCHEDULE-001` … `CASP-SCHEDULE-004` read `casp/schedule.json`. No such file →
  no finding at all, not even a PASS. The example ships under `casp/templates/`, so
  `casp init` never adopts the layer on your behalf: copy it up one level to opt in.
  See [the schedule layer](#the-schedule-layer) below.
- `CASP-PROMPT-011` reads `phases_shipped`. Nothing shipped → no finding: a cockpit
  that has not started is not one that has finished. Once anything has shipped, an
  empty `next_prompt` over an empty queue is a FAIL — **a finished roadmap is not a
  finished project.** Distribution, pricing, support, the next roadmap: each is a
  decision before it is code, and a decision is a session too. The remediation is a
  **discussion prompt** (`casp new discussion --slug <slug>`, frontmatter
  `kind: discussion`) whose deliverable is written decisions and the prompts they
  produce. `casp next` announces the kind so nobody runs it headless.

Adoption is derived from the data in all three cases — there is no state key to
set and nothing to configure.

## The facts layer

`casp/facts.json` declares claims a project has verified once and wants to keep
fresh — a unit cost derived from a config file, a percentage in a summary doc,
a row count read off a live database. CASP cannot prove any of these are
**true**; it can prove one has stopped being **verified**: the source it came
from changed (`source_hash`), the verification aged past its declared shelf
life (`ttl_days`), or no reproduction method was ever recorded (`method`). Three
comparisons, zero model — the same shape as `migrations_applied`.

```jsonc
{
  "schema_version": 1,
  "facts": [
    {
      "id": "unit-cost-per-minute",
      "value": "0.012 USD/min",
      "source": "backend/config/pricing.json",
      "source_hash": "sha256:…",
      "method": "jq '.providers.current.cost_per_minute_usd' backend/config/pricing.json",
      "verified_at": "2026-07-20",
      "ttl_days": 90,
      "used_in": ["docs/unit-economics.md"]
    }
  ]
}
```

A document in `used_in` cites the fact with an HTML-comment marker CASP checks
for **presence only** — never the value written around it, which would require
parsing prose:

```markdown
The unit cost is <!-- casp:fact unit-cost-per-minute -->0.012 $/min<!-- /casp:fact -->.
```

`casp fact list|check|stale` are read-only; `casp fact verify <id>` is the one
mutating verb — it replays the fact's `method`, shows the before/after, and asks
for confirmation before writing the new `value` / `source_hash` / `verified_at`.
See `docs/what-casp-proves.md` for what this layer explicitly does **not**
prove.

### What `next_after` may name

A declaration resolves against evidence the validator already reads. Every match
is an **exact string** after a documented normalization; filenames are never
fuzzy-matched, and a reference that would need a guess simply does not resolve.

| Form | Example | Resolved against |
|---|---|---|
| Prompt filename stem | `PHASE-AUTH-GATE` | the sessions directory |
| …lowercased | `phase-auth-gate` | the sessions directory |
| …slug (scaffold `PHASE-` prefix removed) | `auth-gate` | the sessions directory |
| Session id | `26-07-21-001-auth-gate` | `<logs_dir>/<id>.md` |
| Phase id | `0.11.0-auth-gate` | `phases_shipped` / `phases_queued` / `current_phase` / `next_phase` |

A **shipped** prompt is a valid target — a chain legitimately terminates on the
slice that ran before it — but never a subject: its own `next_after` is history
and is not re-litigated.

## The schedule layer

`casp/schedule.json` records **dated claims** about a project's phases: `anchors`
(fixed dates the project is organised around) and `due` (a date on a phase). CASP
verifies the recorded schedule against the phase lists and the calendar. It does
not estimate, does not propose a date, and does not order the queue.

```jsonc
{
  "schema_version": 1,
  "anchors": [                                   // ordered: position IS the chronology
    { "id": "freeze", "date": "2026-12-01" },
    { "id": "launch", "date": "2027-01-02" }
  ],
  "due": [
    { "phase": "multi-service-projects", "date": "2026-10-04", "before": "freeze" },
    { "phase": "deploy-diagnostics",     "date": "2026-10-18" }
  ]
}
```

The join key is the **phase name** — the unit `phases_shipped` / `phases_queued` /
`phases_backlog` already verify. Dates are `YYYY-MM-DD` only: no time, no zone, no
relative expression, because a zone makes the same file resolve differently on two
machines.

### Severity doctrine — the clock can add a WARN and can never add a FAIL

This is the boundary the layer was designed around, and two tests enforce it.

- **A schedule that contradicts itself is a FAIL** (`003`): anchors declared out of
  order, or a queued phase dated on or after the anchor it says it lands `before`.
  No clock is involved — this compares the file against itself and against the phase
  lists, both of which are in the repository and falsifiable.
- **A late phase honestly recorded is a WARN** (`004`), always. A missed date is the
  record being *correct* about a project that slipped; drift is the record being
  *wrong*. Blocking a push for lateness would teach operators to delete the
  schedule, which removes the evidence the gate exists to check.
- **A renamed phase is a WARN** (`002`), for the same reason: phases get renamed
  mid-flight, and a rename must not stop a push.
- **Shipped phases are never inspected** by `003` or `004`. History is not drift.

`CASP-FACT-003` also reads today's date, so "no clock in the gate" was never the
doctrine. The doctrine is a deterministic comparison of a recorded claim against a
defined evidence source; the calendar is one *when the user recorded the date*. What
is forbidden is narrower and testable: **nothing in this family may change the exit
code because of the clock.**

### Reading it

`casp schedule` prints the pace measured from git, the derived length of the queue,
every recorded claim marked against today, and the contradictions above — see
[schedule-json.md](./schedule-json.md) for the machine-readable form.
