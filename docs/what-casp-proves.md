# What CASP proves — and what it does not

CASP's wedge is a precise claim, and its precision is the point:

> **The model holds the context. CASP proves the state is true — against git.**

Read exactly: CASP proves that a project's **recorded execution state** is
**consistent with the evidence git can show** — the commit history, HEAD, the
working tree, the migrations directory, and the frontmatter of the prompts and
logs the state points at. Every verdict is a deterministic comparison of a
recorded claim against a defined evidence source. Nothing probabilistic enters
the gate.

That is a strong, narrow guarantee. Keeping it narrow is what keeps it true.

## What CASP proves

When `casp check` exits 0, it has verified — for every rule in the active set
(see `casp rules`) — that:

- `state.next_prompt` points at a file that exists and is **not already
  shipped** (the exact drift CASP was built to catch);
- `state.last_commit` is a real commit in this repository's history, consistent
  with HEAD;
- `state.last_session_id` maps to a session-log file that exists;
- `phases_shipped` has no duplicates;
- `migrations_applied` matches the migration files on disk (when the project
  tracks migrations);
- every shipped prompt carries a resolvable `session_log`;
- the state surface (`casp/`, sessions, logs) has no uncommitted changes;
- when a project opts in with `casp/facts.json` (see `docs/rules.md`): every
  declared fact's source still resolves, its `source_hash` still matches, it
  has not exceeded its `ttl_days`, and its `method` matches no known
  measurement trap.

Each of these is a claim with a **defined verifier and an accepted evidence
source**. `casp explain <CODE>` prints the exact claim, evidence, and
remediation for any rule.

## What CASP does NOT prove

CASP verifies only the claims it has a rule for, against the evidence git can
provide. A clean `casp check` deliberately says **nothing** about:

- **that the code is correct** — that a feature works, or that the software is
  bug-free. Tests and review cover code; CASP covers recorded state.
- **that a feature is deployed** — code existing in git is not the same as code
  running in production.
- **that a migration ran on a remote database** — CASP sees the migration
  *files*, not the state of any live database.
- **that business requirements were met** — CASP does not read intent, only the
  recorded state and the repository.
- **that every statement an agent made is true** — only the specific state
  claims a rule covers are checked.
- **infrastructure, secrets, or anything outside the repository** — CASP reads
  your filesystem and your `git`, nothing else.
- **that a schedule is achievable.** CASP verifies a *recorded* schedule against
  the phase lists and the calendar: that it does not contradict itself, that it
  dates phases which exist, and that a queued phase has not silently slipped into
  the past. It does not estimate, does not propose a date, and says nothing about
  whether the dates are realistic. A green `casp check` on a cockpit with a
  `casp/schedule.json` means the record is coherent, never that the plan will
  hold. `casp schedule` prints a pace *measured* from git and the arithmetic that
  follows from it — a quotient, never a forecast.

This is why CASP is a **complement**, not a replacement. It is the deterministic
floor beneath tests, review, and CI — the one check that is a mechanical
comparison of recorded state against git evidence, not a judgement about your
code. Two agents agreeing that a phase is done is not evidence; a `last_commit`
that resolves in `git log` is.

## What the facts layer proves — and its sharper limit

`casp/facts.json` (opt-in — see `docs/rules.md`) extends this to claims that
live **outside** state entirely: a unit cost, a percentage in a summary
document, a row count read off a live system. The same narrowness applies, one
level sharper:

- **CASP proves a fact's FRESHNESS, never its truth.** A clean `CASP-FACT-002`
  /`CASP-FACT-003` pair means "the source this value came from has not changed,
  and the verification has not aged out" — not "the value is correct".
- **A fact whose source never moved can be wrong from day one.** If the
  original verification was itself mistaken, an unchanged `source_hash` and an
  unexpired `ttl_days` will both report fresh. CASP will be right about
  freshness and wrong about substance — it has no way to tell the difference,
  and does not claim to.
- **The trap registry (`src/traps.ts`) catches only the traps it knows.** The
  incident that motivated this layer was a judgment error, not a freshness
  error — a PostgreSQL planner estimate (`n_live_tup`) read as an exact row
  count, off by roughly 40x. `CASP-FACT-006` catches that specific, cataloged
  shape. The next unknown measurement trap will pass silently. Recording
  `method` (`CASP-FACT-005`) does not prevent the next misjudgment; it makes
  today's misjudgment **auditable after the fact**, which the founding incident
  had none of.
- **The value itself is never compared.** `CASP-FACT-004` checks that a
  document citing a fact carries the `<!-- casp:fact <id> -->` marker — never
  the number written around it. Comparing that would mean parsing prose, which
  means a model, which is the line this product does not cross (see `casp lint`,
  cut deliberately, in the README).

> **Memory preserves a record. CASP checks defined claims against evidence.**
> It does not make an agent smarter — it makes the workflow harder to fool.
> The facts layer moves the question from "is this true?" — which no
> deterministic tool can answer — to "when was this last verified, how, and has
> its source moved since?" That is real progress. It is not truth.
