---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-09-10
next_after: PHASE-QUEUE-NEVER-EMPTY
---

# Session — schedule-layer : dated claims become evidence, and the clock never moves the exit code

**Project root.** `casp-core`. **Target release.** 0.18.0. **Expected size.** 5-7 h, solo.

> **Why.** A cockpit's roadmap carries dates. Its `state.json` carries phases. Nothing connects
> the two, so no verb can answer the one question every operator eventually asks: *when does
> this end?* Answering it today means reading a roadmap by hand, counting logs by calendar
> date to derive a rate, and doing the arithmetic on paper — from inputs that are already in
> `state.json` and in git. Worse: a downstream cockpit has already written `launch_date` and
> `feature_freeze` into its `state.json` as unschematized fields, tolerated by `casp check` and
> verified by nothing. Someone needed this and wrote it into the file anyway, where it silently
> rots. A dated claim nobody confronts with the calendar does not become stale, it becomes
> false — the mechanism `CASP-FACT-003` already exists for.
>
> **Goal.** An opt-in `casp/schedule.json` that `casp check` verifies against the phase lists and
> the calendar, and one printer verb that measures the shipping pace from git and states the
> derived length of the queue — arithmetic, never a forecast.

## The boundary, decided before the first line

**Four forks, each closed with a reason. Reopen one only with a counter-argument, in writing.**

1. **The clock enters `casp check` at WARN, never at FAIL.** "No clock in the gate" is not the
   doctrine — `CASP-FACT-003` reads `todayISO()` today (`src/facts.ts`, `src/rules.ts` records
   its evidence as *today's date vs verified_at*). The doctrine is a deterministic comparison of
   a recorded claim against a defined evidence source, and the calendar is one when the user
   recorded the date. The discipline kept from that debate is narrower and testable: **the
   `CASP-SCHEDULE-*` family never changes the exit code because of the clock.** A passed date is
   a WARN. Lateness honestly recorded is the record being correct, not drift.
2. **A separate file, not a block in `state.json`.** This is the `facts.json` bucket (0.11): an
   opt-in file with its own schema and its own deterministic drift family.
   `schemas/state.schema.json` is not touched — protocol frozen, tooling grows.
3. **The join key is the phase name**, the unit `phases_shipped` / `phases_queued` /
   `phases_backlog` already verify. Not the prompt path, which is one indirection away and
   renames more often.
4. **There is a verb, and it prints a date.** Refusing to print the date while printing the
   quotient is theatre — the reader adds it to today. What is refused is a number whose method is
   invisible: the window, the commits used and the method share the screen with the date.

## MUST HAVE

### 1. `casp/schedule.json` and `schemas/schedule.schema.json`

```jsonc
{
  "schema_version": 1,
  "anchors": [                                   // ordered: position IS the declared chronology
    { "id": "freeze", "date": "2026-12-01" },
    { "id": "launch", "date": "2027-01-02" }
  ],
  "due": [
    { "phase": "multi-service-projects", "date": "2026-10-04", "before": "freeze" },
    { "phase": "deploy-diagnostics",     "date": "2026-10-18" }
  ]
}
```

- Dates are `YYYY-MM-DD` only — no time, no zone, no relative expression. A zone makes the same
  file resolve differently on two machines, which is the determinism bug in miniature.
- Anchors are an ordered array; there is no separate `order` field, because a second declaration
  of the same thing is one more thing that can contradict itself.
- `before` is optional and names an anchor id; unknown id or duplicate ids are schema failures.
- No free-text field is parsed. `note` may be tolerated as an ignored field; nothing reads it.
- Wire the schema into `test/schemas.test.mjs` like `facts.schema.json`. Absent file ⇒ zero
  `CASP-SCHEDULE-*` findings, the contract `docs/rules.md` states under *Opt-in rules*.
- Ship `templates/schedule.json` as a copyable example and mention it in `templates/README.md`.
  **`casp init` does not create it and `casp upgrade` does not insert it** — verify the second
  claim on this cockpit rather than trusting it.

### 2. Four rules — new area `SCHEDULE`, the ninth

| Code | Severity | Fires when | Clock |
|---|---|---|---|
| `CASP-SCHEDULE-001` | FAIL | `casp/schedule.json` exists and does not validate | no |
| `CASP-SCHEDULE-002` | WARN | a `due.phase` names a phase absent from all three phase lists | no |
| `CASP-SCHEDULE-003` | FAIL | the schedule contradicts itself: anchors not strictly ascending, or a queued/backlog phase whose `date` is on or after the anchor it declares `before` | no |
| `CASP-SCHEDULE-004` | WARN | a queued/backlog phase's `date`, or the anchor it is bound to, is in the past | **yes** |

- Shipped phases are never inspected by 003 or 004: history is not drift.
- 002 is WARN because phases get renamed mid-flight; failing the push for that teaches people to
  delete the schedule, the opposite of the goal. Write the reason in the CHANGELOG.
- Findings are pushed from `checkOne` in `src/check.ts` next to the facts layer (§ 7c); entries
  in `src/rules.ts` with `verifies` / `evidence` / `remediation`; `test/rules.test.mjs` fails on
  an id that maps to no rule. `casp explain CASP-SCHEDULE-00N` works for all four.
- **`today` is injected through a `checkOne` option**, not an environment variable — tests
  control it without adding a shell-level way to fake freshness. Leave `CASP-FACT-003` as it is;
  this session does not touch the facts layer.

### 3. `casp schedule [--json] [--since <weeks>]` — a printer

Exit 0 on a readable project, exit 1 only for unreadable input, like `casp next` and
`casp status`. Four blocks, in this order — the order is the argument:

1. **Measured pace, before any claim.** Walk `git log --format='%H %aI' -- casp/state.json`,
   read `phases_shipped.length` from each blob, take the deltas over the window (default 8 weeks,
   `--since` overrides; cap the walk at a stated commit count). Print the window, the first and
   last commit used and the commit count. Fewer than two data points, a shallow clone, a
   one-commit state: one sentence saying the pace is not measurable, no derived length, exit 0.
   Never invent a rate. Averaging the whole history is wrong for any project whose pace changed;
   that is why the window is recent by default and always printed.
2. **Derived length.** `phases_queued.length ÷ pace` in weeks, and the date it lands on,
   labelled *at the measured pace — arithmetic, not a forecast*. Phases are not uniform; the
   printed method is what lets the reader discount.
3. **Recorded claims**, every anchor and due, marked `ahead` / `due` / `passed` against today.
4. **Contradictions** — the findings `casp check` would emit, with their remediation.

`--json` follows `docs/check-json.md` conventions: `schemas/schedule-result.schema.json`,
covered in `test/schemas.test.mjs`, documented in `docs/schedule-json.md`. `src/cli.ts` gains
`case 'schedule':`; `casp help` and `docs/verbs.md` (or wherever the verb table lives) list it.

### 4. `casp status` — one line

When the file exists: the next unshipped due (or anchor) and its distance in days. Nothing
more. Check whether `docs/status-json.md` and `JSON_SCHEMA_VERSION` need a bump — never add a
field to a documented JSON contract silently; `test/status-json.test.mjs` exists to catch that.

### 5. Docs

- `docs/rules.md`: the four codes in the catalogue, the `SCHEDULE` area, and one paragraph of
  severity doctrine next to them: a late phase honestly recorded is a WARN; a schedule that
  contradicts itself is a FAIL; the clock can add a WARN and can never add a FAIL.
- `docs/what-casp-proves.md`: under *What CASP does NOT prove* — that a schedule is achievable.
  CASP verifies a recorded schedule against the phase lists and the calendar; it does not
  estimate, and a green `casp check` says nothing about whether the dates are realistic.
- `README.md`: a short section; the queue stays the lead. The three testable claims: casp
  records and verifies dated claims, it never proposes one; a missed date is not drift and never
  fails a push; `casp schedule` measures pace from git and prints arithmetic, not a forecast.
- `CHANGELOG.md` 0.18.0, in the 0.16.0 voice: what was measured, what was ruled out and why, the
  test count before and after.

### 6. Tests — both directions, and the two guards

- **Opt-in is real**: no `casp/schedule.json` ⇒ zero findings whose code starts with
  `CASP-SCHEDULE`, asserted on the finding list, not on stdout.
- Each rule fires on a purpose-built fixture and does not fire on its negative. Four pairs. For
  003 and 004 the negative includes a **shipped** phase past its date — history is not drift.
- **Severity pinned**: 004 is WARN. **Clock invariance pinned**: run `checkOne` on the same fixture
  with `today` one year apart and assert the set of FAIL findings is identical. These two tests
  are the guard rail for fork 1; a future edit that inverts them must break the suite loudly.
- Schema: a malformed date, an unknown `before`, a duplicate anchor id are rejected with a
  sentence, not a stack.
- `casp schedule` on a fixture with one state commit prints the claims, the "not measurable"
  sentence, exits 0. On a fixture with N seeded state commits, the exact pace.
- `test/hostile-fs.test.mjs`: an unreadable and a truncated `schedule.json` — `checkOneSafe`
  returns, never throws.

## DO NOT

- **No FAIL that depends on the clock.** Not "just this one", not for a passed anchor.
- **No new dependency.** Date arithmetic is `Date.parse` on ISO strings, or it does not happen.
- **No planning, no estimation.** The verb never assigns work to a week, never proposes a date,
  never orders the queue by urgency, never records a pace in the file — a recorded pace drifts
  from the measured one by construction. Measure live, every time.
- **No second "done" register.** No milestone status, no exit criteria, no proof field: that is
  `phases_shipped`, already verified against git.
- **No PM surface.** No decision gates, no hours ledger, no capacity, no WIP limit, no assignees,
  no dependencies between items — `next_after` already encodes order and is already gated.
- **No rendering, no reminders, no daemon, no external calendar import or sync.** Local,
  invoked, deterministic. State all of these as ruled out in the CHANGELOG so they do not return
  as proposals.
- **No automatic migration** of any unknown `launch_date` / `feature_freeze` field found in a
  downstream `state.json`. Reinterpreting a user's field as protocol is not a move this tool
  makes.
- **No skill and no website change in this session.** The skill is deferred, not refused: the
  discipline it would teach (close the scope before dating it, measure before estimating, state
  the buffer as a ratio) can be a page in `docs/` first, and ships as a skill when someone asks —
  the `fleet` sequence. The site is a separate mechanical session after the npm publish (18
  translations; the `fleet.html` precedent).
- Do not publish to npm inside this session without the CEO's go.

## AT END OF SESSION

`npm run build`, `npm test` (count before and after), `casp check` on this cockpit with the raw
output pasted, a technical-only session log in `session-logs/`, the state bump
(`last_commit`, `last_session_id`, `schedule-layer` to `phases_shipped`, `next_prompt` to the
next queued slice). Commit by pathspec. Draft the follow-up site prompt and chain it.
