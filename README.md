# CASP — the Coding-Agent State Protocol

> ### Your agent says the phase shipped. Git says it didn't.
>
> CASP is a CLI that reads what your project **claims** about itself — current phase,
> next task, last commit, migrations applied — and checks every claim against what
> **git actually contains**. When they disagree, it **exits non-zero and your push is
> blocked**, so a state file that lies never reaches your remote.
>
> On top of that gate sits the half most people miss: **you stop hand-writing session
> prompts.** Queue the work once, and `casp next` hands your agent the next slice — in
> an order the validator has proven is executable.
>
> No LLM. No network. No account. The model holds the context; **CASP proves the state
> is true — against git.**

[![npm version](https://img.shields.io/npm/v/@justethales/casp.svg)](https://www.npmjs.com/package/@justethales/casp)
[![npm downloads](https://img.shields.io/npm/dm/@justethales/casp.svg)](https://www.npmjs.com/package/@justethales/casp)
[![license](https://img.shields.io/npm/l/@justethales/casp.svg)](https://github.com/ThalesGnimavo/casp/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/ThalesGnimavo/casp?style=social)](https://github.com/ThalesGnimavo/casp)

```bash
npm i -g @justethales/casp        # or: npx @justethales/casp <command>
casp init            # scaffold the casp/ layer in any repo
casp status          # one-screen "where am I"
casp check           # validate the state against git — exits 1 on drift
```

**C**oding-Agent · **S**tate · **P**rotocol. Works with **Claude Code**, **Cursor**, **Aider**, **Continue**, or any agent that can run a CLI. Node ≥ 20. No account, no telemetry, nothing leaves your machine.

---

## What it does, in six screens

Every image below is **real `casp` output**, byte for byte, captured on **0.14.1** against a
demo cockpit whose queue and history are genuinely chained — not a mockup, not an
AI-generated terminal, and not a screenshot anyone touched up. Reproduce them yourself with
[`docs/img/capture-readme-shots.sh`](https://github.com/ThalesGnimavo/casp/blob/main/docs/img/capture-readme-shots.sh)
— it refuses to run unless your installed `casp` matches the release it documents, so these
screenshots cannot quietly fall behind the binary. Screen 6 arrived with 0.15.0 and is a
**text** capture rather than a PNG — pasted verbatim from a real run, not yet part of that
script's set.

### 1 · A push that lies gets blocked

Your state file says phase 14 is next. Git says phase 14 shipped last week. `casp check`
compares the two and **exits 1**, so the push stops here — instead of at a code review
where someone eventually notices the work was done twice.

![casp check reporting drift and blocking the push](https://raw.githubusercontent.com/ThalesGnimavo/casp/main/docs/img/01-gate.png)

Every finding carries a stable rule code and a one-line `→ fix` hint, so an agent can
resolve it without re-reading docs. Install it once as a pre-push hook — `casp install-hook`
— and the gate stops depending on anyone remembering to run it.

---

### 2 · You stop hand-writing session prompts

This is the half that changes a working week. You write the plan **once**: each slice
becomes a file in your repo whose frontmatter declares what it comes after, and
`state.json.next_prompt` points at the head of the line.

```bash
casp new prompt --slug phase-16-team-permissions   # scaffold the next slice
casp next                                          # hand the head of the queue over
```

From then on a session opens with one command, and your agent gets a fully-formed prompt
nobody composed that morning:

![casp next printing the next session prompt in full](https://raw.githubusercontent.com/ThalesGnimavo/casp/main/docs/img/02-queue-hands-over.png)

**The refusal is what earns the trust.** Anything can print a file. `casp next` reads the
recorded state *before* it prints anything, and hands over nothing when the head of the
queue is a slice that already shipped:

![casp next refusing to hand over a slice that already shipped](https://raw.githubusercontent.com/ThalesGnimavo/casp/main/docs/img/02b-queue-refuses.png)

That is the specific afternoon this tool gives back: an agent starting confidently on last
week's work, because a file told it to.

The plan lives in the repo — reviewable in a PR, diffable, and readable by whatever model
you use next month.

> **Scope, stated honestly.** `casp next` **prints**. It never executes — your agent does
> that. CASP is what makes the handoff worth trusting, not an orchestrator. It proves the
> plan is *executable*; it never decides what the plan should be.

**And the queue never ends — it changes kind.** The day the last slice ships, the roadmap is
implemented and the project is not finished: how does it get known, what does it cost, who
answers the first hundred users, what is the next roadmap. Each of those is a **decision** before
it is code, and a decision is a session too. So a cockpit that has shipped is never allowed to
report nothing to start (`CASP-PROMPT-011`); what it queues instead is a **discussion prompt** —
`casp new discussion --slug after-the-roadmap` — a session with the human whose deliverable is
decisions written down and the prompts they produce. `casp next` announces the kind, so no
headless loop runs a conversation.

---

### 3 · The plan is checked as a plan, not just as a list

A queue is only as good as its order. CASP resolves the whole chain and **refuses a plan
that cannot be executed as written** — a slice declaring a predecessor that exists nowhere,
or a cycle no linear order can satisfy.

![casp check failing on a queued prompt whose declared predecessor resolves to nothing](https://raw.githubusercontent.com/ThalesGnimavo/casp/main/docs/img/03-plan-checked.png)

| Rule | What it refuses to let past |
|---|---|
| `CASP-PROMPT-001` | `next_prompt` points at a file that doesn't exist |
| `CASP-PROMPT-003` | `next_prompt` is a slice that **already shipped** — the re-do-last-week's-work bug |
| `CASP-PROMPT-005` | A shipped prompt with no session log to show for it |
| `CASP-PROMPT-007` | A `next_after` naming a slice that exists nowhere in the repo |
| `CASP-PROMPT-008` | A cycle — A after B, B after A — that no linear execution can satisfy |
| `CASP-PROMPT-009` | Two queued prompts claiming the same predecessor, so the order has two answers *(warn)* |
| `CASP-PROMPT-010` | A queued prompt no chain reaches, which will simply never run *(warn)* |
| `CASP-PROMPT-011` | A cockpit that has **shipped** and reports nothing to start — a finished roadmap is not a finished project; what follows is a **discussion prompt** |
| `CASP-SESSION-003` | A phase on the shipped scoreboard that no session log declares |

The severity split is deliberate: a dangling reference and a cycle are claims that
*cannot be true*, so they block the push. A fork or a parked prompt is *ambiguous* rather
than false — a deliberate parking lot is a legitimate way to work, and reddening it would
punish a real workflow.

**Opt-in, derived from your files, nothing to configure.** The canonical template ships
`next_after` as a placeholder, so a repo that never fills one in gets no finding at all —
not even a PASS. The first real declaration switches the category on. Once the chain is
coherent, `casp status --json` hands your agent the whole resolved order, head first.

---

### 4 · Where the project stands, in one screen

Come back after a week, or open the fifth project of the morning. One command replaces
reading `git log` and guessing.

![casp status showing current phase, next slice and recent commits](https://raw.githubusercontent.com/ThalesGnimavo/casp/main/docs/img/04-status.png)

Phase, what's next, what already shipped, the recent commits. `--json` hands the same
thing to an agent instead of a human, and `casp check --all` rolls up every cockpit under
a root — one report for a whole fleet of repos.

A real product isn't one feature; it's dozens of phases across API, web and mobile, shipped
over weeks by rotating sessions and agents. `casp/roadmap.md` keeps the scoreboard in the
repo, so nobody maintains it in a second place:

```
roadmap.md — phase scoreboard            13 shipped ▰▰▰▰▱▱ 22 total

  10  api     Realtime sync engine        shipped
  11  mobile  Push notifications          shipped
  12  mobile  Offline-first cache         shipped
  13  web     Team permissions            shipped
  14  web     Analytics dashboard ◂ NEXT  active
  15  api     Per-seat billing            queued
  16  mobile  Biometric login             queued
```

One ordered thread across forty phases, web *and* mobile — and any agent that opens the
repo knows which one is next, without being told and without re-shipping a shipped one.

---

### 5 · A number that stopped being true

Everything above validates what your project claims about *itself*. The facts layer covers
the claims in the documents *around* it — a unit cost derived from a config file, a figure
in a runbook, a percentage in a pricing note. None of those is state drift, so `casp check`
was always right to stay green on them, and always blind to them.

Declare the source once in `casp/facts.json`. When the source changes underneath the value,
the claim goes **stale** — mechanically, by comparing a hash, with no model reading your
prose. Here a provider migration rewrote the pricing config, and the unit cost derived from
it stopped being verified while the fact beside it stayed fresh:

![casp fact list showing one stale fact after its source config changed, next to a fact still fresh](https://raw.githubusercontent.com/ThalesGnimavo/casp/main/docs/img/05-fact-stale.png)

`casp fact stale` prints that as a work list; `casp check` turns it into a `CASP-FACT-002`
**FAIL** that blocks the push, same as any other drift.

Three comparisons, zero LLM: has the source changed since verification (a hash), has the
verification aged past its declared shelf life (a TTL), was a reproduction method ever
recorded (a presence test). A static registry also flags known false-measurement patterns —
`n_live_tup` read as an exact count, `EXPLAIN` without `ANALYZE` — because an estimate that
reads like a measurement is how a number gets believed for a month.

> **It proves freshness, never truth.** An unchanged source and an unexpired shelf life can
> both be right about freshness and wrong about the world, if the original verification was
> itself mistaken. What you get is that a claim nobody has re-checked stops being able to
> pass silently.

Opt-in like the chain rules: a cockpit with no `casp/facts.json` sees no `CASP-FACT-*`
finding at all.

### 6 · Two sessions, one repo, no collision

Everything above is the **durable** record: `state.json` syncs at session boundaries and git
is the witness. Between those boundaries there is a second problem, and it only appears once
you run more than one agent at a time. Session B has no way to know session A is halfway
through `src/billing/`. The usual answers are to coordinate by hand, or to pipe every session
into one shared stream — which puts every message in N contexts and invalidates N prompt
caches to tell N-1 sessions something they did not need.

`casp live` shares the **state** instead of the stream. A session declares what it holds:

```bash
casp live claim src/billing --label billing-train --ttl 120
```

Wire `casp live hook` as a `PreToolUse` hook (`casp live install` prints the block) and the
claim stops being a note in a doc. A foreign session's `Edit` on that path is refused before
it happens, with the owner named:

```
casp live: "src/billing/rates.ts" is claimed by billing-train (a3f9c1d2) until
2026-08-16T06:59:56.531Z. Work elsewhere, message that session, or have the human
release the claim (casp live release src/billing --session a3f9c1d2).
```

That message goes to stderr, which the harness hands back to the model — so the blocked
session is told who to talk to, not merely that it failed. Meanwhile the human — the one
reader for whom reading is free — gets the whole picture in one terminal, and no agent
context pays for it:

```
$ casp live claims
src/billing  billing-train (a3f9c1d2)  until 2026-08-16T06:59:56.531Z
app/mobile  mobile-train (7c21ba55)  until 2026-08-16T06:59:56.710Z

$ casp live tail
04:59:56  billing-train  claim   src/billing
04:59:56  mobile-train   claim   app/mobile
04:59:56  a3f9c1d2  edit    Edit   src/billing/invoice.ts
04:59:57  7c21ba55  edit    Write  app/mobile/screens/Cart.tsx
04:59:57  7c21ba55  denied  Edit   src/billing/rates.ts  held by a3f9c1d2
```

`casp live watch` is the same view that keeps printing as lines land.

**Two properties do the load-bearing work.**

*It fails open, absolutely.* A tool built to coordinate work must never be able to forbid it.
An expired claim, a claim whose process is gone, an unparseable timestamp, a corrupt claims
file, malformed hook input, an unknown event, any internal error — every one of them means
*no coordination*, never *no editing*. The only non-zero exit in the whole verb is a live
foreign claim on the exact path. And because the guard runs inside the session that would be
blocked, the off ramp lives outside it: `CASP_LIVE=0`, `casp live off`, or `casp live off
--global` for the whole machine.

*It never touches the gate.* `casp/live/` writes its own `.gitignore` on first touch, so
runtime churn never reaches `git status` and therefore never reaches `casp check`. Live does
not gate a push and check does not read live — they are two records with one wall between
them. No LLM, no network, no telemetry; polling a local file is the entire "real-time"
machinery.

> **`state.json` is the durable register; `casp live` is the in-flight one.** Both are
> records. Neither schedules, assigns, or runs anything — `casp live claim` states what a
> session holds and the guard refuses a write against it. What runs the sessions is still
> you.

Single-session projects can ignore this entirely: with no claims declared, nothing changes.

---

## Quickstart

```bash
npm i -g @justethales/casp
cd my-project
casp init                 # scaffold the layer
casp status               # where am I right now
casp check                # prove the state is true (exits 1 on drift)
```

`casp init` creates:

```
casp/
├── state.json          # machine-readable session state (the validator reads this)
├── now.md              # current focus (human-readable, one paragraph)
├── roadmap.md          # Next-3 to ship + phase scoreboard
├── README.md           # the protocol, in your repo
└── templates/
    ├── session-prompt.md
    ├── session-log.md
    └── audit-brief.md
```

Edit `casp/now.md`, `casp/roadmap.md` and `casp/state.json` to describe your project, draft
your first session prompt with `casp new prompt --slug phase-1-first-slice`, and run
`casp check` before every push. That is the whole loop.

When a newer CASP ships a better scaffold, run `casp upgrade` (`--dry-run` first if you want
to see the plan). It refreshes `casp/README.md` and `casp/templates/**` only, and stamps
`state.casp_version`; `now.md`, `roadmap.md` and every existing `state.json` value are left
byte-identical. `casp doctor` tells you when the cockpit is behind.

---

## Why this exists

You come back to a project after a week — or you juggle five at once. The agent reads a
state file that no longer matches reality, **confidently starts work that already shipped**,
and you burn an afternoon undoing it.

Boards, cards and spreadsheets don't save you: reconstructing context is manual, and the
agent can't read any of it. The state needs to be machine-readable, git-native — and
**provably true**.

```jsonc
// casp/state.json  ● DRIFTED
{
  "phase":       "13 — camera streaming",
  "next_prompt": "phases/14-camera.md",   // already shipped in v13.4
  "last_commit": "a1f3c9",                // not in git history
  "migrations":  ["0001"…"0007"]          // git stops at 0006
}
```

**The wedge: everyone *stores* context, CASP *validates* it.** The adjacent space — Mem0,
Letta, Zep, the git-native "memory" projects — all **store** what happened. Almost none
**verify** that the stored state still matches git reality. That verification is
`casp check`, and it is a hard pass/fail gate rather than a similarity score.

| | **CASP** | Memory layers · Mem0 / Letta / git-native "soul" |
|---|---|---|
| What it holds | **Project execution state** | User facts & preferences |
| Core operation | **Validates against git** | Stores & recalls |
| On conflict | **Deterministic check vs ground-truth** | Fuzzy similarity guess |
| When it runs | **Synchronous gate — blocks the push** | Async / eventual recall |
| Leaves your machine | **Never · zero telemetry** | Varies / cloud |

---

## Beside your existing stack

CASP replaces nothing in your workflow. It fills a gap the rest of the stack leaves open —
the **validated present tense** of a project, in a form your agent can read and act on.

| Layer | Tool | What it holds | The gap |
|---|---|---|---|
| **Intent** | Jira · Linear | What you *plan* to do | Drifts from reality, lives in the cloud, your agent can't reliably read it. |
| **Validated present** | **CASP** | Where the project **stands** now — and the **exact next move**, proven against git | *(the layer this table exists to name)* |
| **History & verification** | git · PR · CI | What changed · is it reviewed · does it build | A perfect record of the past — silent about what comes next. |

Git, PRs and CI don't know what ships next. CASP does.

---

## Three files. One thread.

No database. No service. No vector store. Three plain files an agent can read on the first
line of any session, scaffolded by `casp init` into `casp/`:

| File | Role | What it holds |
|---|---|---|
| `state.json` | source of truth | Machine-readable, per project: current phase, next phase, the exact next-prompt to execute, phases shipped, migrations applied, last commit, last session id. |
| `now.md` | for humans | The one-screen "where am I right now." Open it, get the thread back in five seconds — no archaeology. |
| `roadmap.md` | what ships next | The Next-3 to ship plus a phase scoreboard. The agent always knows the order of work. |

**Templates are gates, not guidance.** Canonical `session-prompt`, `session-log` and
`audit-brief` templates mean every session — human or agent — produces the same-shaped
artifacts. Structure is enforced, not suggested. Draft them with `casp new prompt|log` —
don't copy-paste a prior one.

---

## The command deck

### The five that are the protocol

Learn these and you are done. Everything after them is convenience.

| What you type | What it does for you |
|---|---|
| `casp init` | Adds a `casp/` folder to your repo. That folder **is** the thread your agent picks up at the start of every session. Nothing to configure, nothing to sign up for. |
| `casp status` | *"Where am I?"* in one screen — current phase, what's next, what already shipped, the last 10 commits. Type this after a week away instead of reading `git log` and guessing. |
| `casp check` | **The gate.** Proves the state file still matches git, and exits 1 when it doesn't. Run it before every push — or install it as a hook and stop having to remember. |
| `casp next` | Prints the exact prompt for the next session, straight from the state file. Hand it to your agent: no deciding what to work on, no hunting for where you stopped. It refuses to print while the state is drifted, so a bad session never starts. |
| `casp new` | Creates the next session prompt or session log from the canonical template, so every session — yours or an agent's — comes out the same shape instead of whatever the model felt like writing. |

### The full reference

The rest is tooling built on top of those five — reach for it when you need it. Every name
is trivially typed: one syllable, no homographs, the same in English, French or Spanish.

| Command | What it does |
|---|---|
| `casp init` | Scaffold the continuity layer (`casp/`) into any repo. Idempotent — re-running never overwrites existing files. |
| `casp upgrade` | Refresh an existing cockpit's **scaffolds** (`casp/README.md`, `casp/templates/**`) to the installed CLI and stamp its `casp_version`. **Never writes `now.md` or `roadmap.md`, and never templates over `state.json`** — the only state write is the additive version stamp; every other value stays byte-identical. `casp/README.md` **is** a scaffold and is replaced (the output line says so) — keep local notes in `now.md`. Never deletes, never writes through a symlink, idempotent, never gates. `--dry-run` prints the plan and writes nothing. The non-destructive counterpart to `init --force`, which overwrites everything. |
| `casp status` | One-screen snapshot: phase, next, what's shipped, last 10 commits. `--plain` strips ANSI. |
| `casp check` | The drift validator. Validates `state.json` against the filesystem and git. **Exits 1 on drift.** `--quiet` only prints on FAIL (CI-friendly); `--no-git` skips git-dependent checks; `--json` emits a machine-readable report with a stable schema ([docs/check-json.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/check-json.md)) — same checks, same exit code; `--all [root]` validates every cockpit under a root in one report. |
| `casp next` | Print the next session's prompt straight from `state.next_prompt` — pipe-friendly, exits non-zero when there's no actionable prompt. **Gates on drift:** runs the validator first and refuses to print on a drifted state (`--no-check` to start anyway, `--no-git` to skip git checks). The start boundary, symmetric with `install-hook`'s push boundary. |
| `casp ship <slug>` | Mark a phase shipped: flip its prompt to `status: shipped`, wire the `session_log` pointer, move the slug from `phases_queued` to `phases_shipped`. Pure state mutation — never touches git. |
| `casp close` | Bump `last_commit` / `last_session_id` from HEAD and the newest session log (confirm or override), then run `check`. Never commits — the operator owns the commit. |
| `casp new prompt --slug X` | Generate a gated session-prompt from the canonical template into `docs/plan/sessions/` (or your configured `sessions_dir`). |
| `casp new log --slug X` | Open a session-log in the shape every session shares, into `session-logs/` (or your configured `logs_dir`). |
| `casp install-hook` | Write `.git/hooks/pre-push` so `casp check --quiet` runs on every push — the gate stops depending on discipline. Refuses to clobber a foreign hook (`--force` to override); `--remove` uninstalls a hook CASP wrote. Explicit opt-in — `casp init` never installs it, and it never touches `core.hooksPath`. |
| `casp verify <commit>` | Run the validator against a historical commit in a throwaway worktree — proves whether that commit's recorded state was in sync. Exits with that verdict; never mutates the worktree, index or history. |
| `casp state diff [A] [B]` | Field-level diff of `casp/state.json` between two commits (default `HEAD~1` → `HEAD`), with element-level deltas for array fields. `--json` for data. |
| `casp audit status` / `bump` | The deep-audit watermark: separates the cheap per-merge gate (`check`, every session) from the expensive batch pass (adversarial sub-agent audit + full e2e + security review, on demand). `status` shows the unaudited range `last_deep_audit..HEAD` (`--json` for data); `bump [<sha>]` records HEAD as deep-audited. A **production-cutover gate, never a merge gate** — `check` doesn't block on it. Driven by the `/audit-batch` skill. |
| `casp live claim` / `release` / `claims` / `controller` / `watch` / `tail` / `hook` / `install` / `off` / `on` | Coordination between parallel sessions on **one machine** — the in-flight record beside the durable one. `claim` holds a repo-relative path prefix for a session with a TTL and a holder-liveness probe (overlap with a foreign claim is refused in both directions; segment-boundary prefixes, no globs). `hook` is one command wired for every harness event: as `PreToolUse` it refuses a file-writing tool call on a path a living foreign session holds (**the only non-zero exit in the verb**), otherwise it journals. `controller` declares the one session allowed to write shared state — the cockpit, session logs, root instruction files, lockfiles — and is **dormant unless a fleet is demonstrably flying**, so a solo session is never blocked from its own `casp/state.json`. `watch` / `tail` are the human's view of `casp/live/journal.jsonl`. **Fails open by contract** and stands down entirely on `CASP_LIVE=0` or `casp live off [--global]`. `casp/live/` is machine-local runtime state, self-gitignored — **`casp check` never reads it and it never gates a push**. **It guards path writes, not the side effects of shared state**: a `git commit` without a pathspec publishes the whole index, an install regenerates a shared lockfile — in-lane actions with out-of-lane effects that no claim sees ([threat model](https://github.com/ThalesGnimavo/casp/blob/main/docs/threat-model.md)). |
| `casp fact list` / `check` / `stale` / `verify <id>` | The facts layer (opt-in via `casp/facts.json` — see [docs/rules.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/rules.md#the-facts-layer)): claims verified once, kept fresh by comparing a source hash and a TTL, never by a model judging prose. `list`/`check`/`stale` are read-only; `verify <id>` replays the fact's declared method, shows the before/after, and asks for confirmation (`--yes` to skip it) before writing. The one deliberate code-execution surface in the binary — everything else only reads, and no gating path can reach it. |
| `casp rules` | List the verification rules `check` enforces — the stable `CASP-<AREA>-<NNN>` codes that appear on every finding. `--json` for data. |
| `casp explain <CODE>` | Print one rule's full definition: what it verifies, the evidence it inspects, and how to remediate. Accepts a code (`CASP-GIT-001`) or an internal finding id. |
| `casp doctor` | Read-only environment diagnostic for onboarding: Node, git, `casp/state.json`, the cockpit's CASP version, the resolved sessions/logs dirs, the pre-push hook and `core.hooksPath`. `PASS`/`WARN`/`FAIL` per line (`--json` for data). **Never gates** — always exits 0; it maps what to fix, `check` is the gate. |
| `casp version` | Print the version (same as `-V`). `--json` emits `{ name, version, node, schema_version }` — the machine handoff, where `schema_version` is the `check --json` report schema. |
| `casp help [command]` | The top-level overview, or one command's focused help (usage, every flag, real examples). `casp <command> --help` is equivalent. `casp help` exits 0 — the most natural thing a user types is first-class. |

---

## In your editor

CASP ships Claude Code slash-commands so the state lives where you already work. Drop them
in once:

```bash
cp -r node_modules/@justethales/casp/skills/casp ~/.claude/skills/
cp -r node_modules/@justethales/casp/skills/next ~/.claude/skills/
cp -r node_modules/@justethales/casp/skills/fleet ~/.claude/skills/
```

| Command | What it does |
|---|---|
| `/casp` | Read-only status — the agent reads the current thread before it writes a single line. |
| `/next` | Auto-start the next session straight from `state.next_prompt`. No copy-paste, no guessing. |
| `/fleet` | Coordinate several parallel agent sessions on one repository — one writer, N adversarial readers. Distributed by casp, **not part of CASP** (see below). |

Works with **Claude Code** · **Cursor** · **Aider** · **Continue** — anything that reads
files. The CLI is the contract; the slash-commands are an optional convenience.

### `fleet` is distributed by casp — it is not part of CASP

The package ships a `fleet` skill because parallel agent sessions are where state drift
hurts most. The boundary is strict, and each claim is testable:

- **`fleet` launches sessions, therefore it orchestrates — therefore it is never a CASP
  feature.** CASP validates recorded state against git; it does not launch, schedule, or
  assign anything.
- **No `casp check` rule reads `fleet` or anything it produces, and nothing in it gates a
  push.**
- **Its model default is empty.** The reasoning ships — a controller and its workers do
  not need to run at the same tier — but a model name never does: naming one would
  contradict a model-agnostic tool and date the file at the next release.

The skill's default shape is one writer plus N adversarial read-only reviewers, because
the measured value of a fleet is contradiction, not speed — and no speed gain is claimed.

---

## For engineering orgs

One agent doing the wrong thing costs an afternoon. A hundred agents doing it across a
hundred repos costs a quarter. CASP is the deterministic guardrail you drop into the
automation loop — the same shape in every project.

- **A required CI status check.** `casp check` sits in the same slot as lint and tests. A state that lies can't merge — drift is blocked at the org level, not left to anyone's discipline.
- **A guardrail for agent fleets.** Autonomous agents multiply mistakes. CASP hands every one of them the same validated thread to read and the same hard gate before it pushes. Automation without the duplicate-work tax.
- **An audit trail, for free.** Every state transition is a git commit. A complete, diffable, revertable record of how each project moved — `git log` *is* your compliance trail.
- **Passes infosec by design.** Local-only, zero telemetry, no cloud, no account. Nothing to vet, nothing to exfiltrate. The security review is one line: it never leaves the machine.

```yaml
# .github/workflows/ci.yml
jobs:
  state-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # casp checks against full git history
      - run: npx @justethales/casp check        # ✗ fails the build the moment state drifts
```

One protocol, every repo. **The same validated shape, org-wide.**

---

## The contract

A protocol earns adoption by being predictable. These don't bend.

1. **Validate state, not intent.** CASP checks what your repo *is*, never what you meant to do. Facts against git, every time.
2. **Templates are gates.** Canonical artifacts are enforced, not suggested. Every session comes out the same shape.
3. **`check` before every push.** The validator is not optional. A lying state never reaches your remote.
4. **Nothing leaves your machine.** Deterministic, git-native, local-only. Zero telemetry. No cloud, no account, no bill.

---

## What the validator catches

Every finding carries a **stable rule code** (`CASP-<AREA>-<NNN>`) and a one-line `→ fix`
hint, so the agent can resolve without re-reading docs — or run `casp explain <CODE>` for
the full definition. Among others:

- `CASP-PROMPT-001/003` — `next_prompt` points at a missing file, or one already `status: shipped`. *(The exact bug CASP was built to catch.)*
- `CASP-GIT-001` — `last_commit` not in `git log`, or inconsistent with HEAD.
- `CASP-SESSION-001` — `last_session_id` does not map to a session-log file.
- `CASP-SESSION-003` — a `phases_shipped[]` entry no session log declares. *(Opt-in by declaration; pre-adoption history stays exempt.)*
- `CASP-FACT-002` — a declared fact's `source_hash` no longer matches its source. *(Opt-in via `casp/facts.json`: proves a claim's source changed since it was verified — never that the claim itself is true.)*
- `CASP-STATE-003` — `phases_shipped[]` has duplicates.
- `CASP-MIGRATION-002` — `migrations_applied[]` does not match the migrations directory.
- `CASP-PROMPT-005` — a session prompt is `status: shipped` but its `session_log` is missing.
- `CASP-PROMPT-011` — the cockpit has shipped and `next_prompt` is empty over an empty queue. *(A finished roadmap is not a finished project: queue a `kind: discussion` prompt.)*
- `CASP-WORKTREE-001` — uncommitted changes in `casp/`, the sessions dir, or the logs dir.
- `CASP-IO-001` — a file the gate had to read could not be opened (mode `000`, a directory squatting a `*.md` path, a symlink cycle). *(A gate that crashes is not a verdict: the run completes, `--json` still parses, and the finding names the path and the reason.)*

See the full catalogue with `casp rules` or in [docs/rules.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/rules.md).
A claim the validator **cannot verify** — a missing backing directory for claimed migrations,
shipped phases, or a session id — is a `FAIL`, never a silent green.

The exit-code contract — clean → exit 0, drift → exit 1 — is covered by `npm test`, so the
CI gate stays real.

**What CASP proves — and what it doesn't.** A clean `casp check` proves the *recorded
execution state* is consistent with *git evidence*. It deliberately says nothing about
whether your code is correct, deployed, or bug-free — that's tests, review and CI. The
precise scope is in [docs/what-casp-proves.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/what-casp-proves.md);
the security posture (repository content is untrusted input, git is invoked without a shell
for any interpolated value) is in [docs/threat-model.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/threat-model.md).

**Layout is yours.** Prompts default to `docs/plan/sessions` and logs to `session-logs`, but
a project that already has its own structure sets `"sessions_dir"` and/or `"logs_dir"` in
`state.json` — both optional — and the whole protocol (`check`, `new`, `ship`, `close`)
validates against that real layout instead of forcing CASP's. CASP fits your repo; you don't
refactor for CASP.

Need the report as data instead of text? `casp check --json` emits the same findings as
structured PASS/WARN/FAIL with a stable, documented schema — for CI annotations, webhooks,
and roll-ups. See [docs/check-json.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/check-json.md).

---

## What this is NOT

- **Not a task tracker.** Use Linear, Jira, GitHub Issues. CASP is about *which session ships next*, not *which issues are open*.
- **Not an AI memory / RAG layer.** It validates project state against git; it doesn't store user facts or do similarity recall.
- **Not an orchestrator.** `casp next` prints a prompt; it never runs a session. `casp live` records which session holds which path and refuses a write against it; it does not launch, schedule, sequence or assign anything. That is a deliberate design limit, not a missing feature.
- **Not a CI tool.** It runs locally. You can wire `casp check` into CI as a pre-push gate, but it doesn't replace your test runner.
- **Not opinionated about your code.** Rust, Python, TypeScript, Go — CASP cares about session state, not your stack.
- **Not a replacement for `CLAUDE.md`.** That's your project's constitution (rules, conventions). CASP is the operating state on top of it.

---

## Roadmap

- **0.4** — `casp ship` + `casp close` (the close loop, automated), optional migrations (non-code projects carry no migration noise), and `casp check --all` for fleets. *Shipped.*
- **0.5** — Configurable paths (`sessions_dir` / `logs_dir` state keys) so a project validates against its real layout instead of adopting CASP's. *Shipped.*
- **0.6** — Both session boundaries become gates, plus inspection. `casp install-hook` writes `casp check --quiet` into your pre-push hook (the *push* boundary); `casp next` refuses to start a session on a drifted state (the *start* boundary); `casp status --json` gives the structured session handoff; `casp verify <commit>` + `casp state diff` make "git log is your compliance trail" inspectable. *Shipped.*
- **0.7** — First-class `casp help` (exit 0) with a focused per-command block for every verb. *Shipped.*
- **0.8** — Stable **rule codes** (`CASP-<AREA>-<NNN>`) on every finding, with `casp rules` / `casp explain <CODE>`; published **JSON Schemas** for `state.json` and the `check --json` report; an injection-safe git path for untrusted state values; and precise "what CASP proves / does not prove" + threat-model docs. *Shipped.*
- **0.9** — DX + machine-handoff: `casp doctor` (a read-only environment diagnostic that never gates), `casp version --json`, and additive `expected` / `actual` fields on `check --json` findings. *Shipped.*
- **0.10** — `casp audit status` / `casp audit bump`: the deep-audit watermark that separates the cheap per-merge gate from the expensive batch pass. A production-cutover gate, never a merge gate. *Shipped.*
- **0.11** — `CASP-SESSION-003`: every `phases_shipped[]` entry must be declared by a session log. The mapping is declared, never inferred from filenames; adoption is derived from the data, so a repo with pre-CASP history is never retroactively reddened. *Shipped.*
- **0.12** — `casp upgrade`: refresh an existing cockpit's scaffolds to a newer CASP without touching a byte of its data. The protocol's own continuity across releases. *Shipped.*
- **0.13** — `CASP-PROMPT-007` … `010`: prompt-chain integrity — a `next_after`-declared queue is checked as an ordered, executable plan. `casp status --json` gains the resolved `queue`. *Shipped.*
- **0.14** — The facts layer: `casp/facts.json` (opt-in) declares claims verified once and kept fresh by comparing a source hash and a TTL, never by a model reading prose — plus a static trap registry for known false-measurement patterns, and compare-and-swap on every `state.json` write so two agents racing the same cockpit get an honest refusal instead of a silent clobber. *Shipped.*
- **0.15** — `casp live`: the in-flight record beside the durable one. Advisory path claims with a TTL and a holder-liveness probe, an append-only journal fed by harness lifecycle hooks, a `PreToolUse` guard that refuses a write onto a living foreign claim, and `casp live watch` for the human. Fail-open by contract, self-gitignored, and walled off from the gate — `check` never reads it. *Shipped.*
- **0.16** — `fleet`, distributed by casp and **not part of CASP**: a fourth Claude Code skill for parallel sessions on one repository — one writer plus N adversarial read-only reviewers, contradiction rather than speed, gate isolability as a per-project property to measure, commits by pathspec. No `casp check` rule reads it. *Shipped.*
- **0.17** — `CASP-PROMPT-011` and the **discussion prompt**: a cockpit that has shipped never reports nothing to start. `casp new discussion --slug <slug>` scaffolds a `kind: discussion` prompt — a session with the human whose deliverable is decisions (distribution, pricing, support, the next roadmap) and the prompts they produce; `casp next` announces the kind. Exempt while nothing has shipped, so `init` stays green. *Shipped.*
- **Demand-gated** — native binaries, a narrow `casp rollback` (state mutation only, never code), a CI status-check installer, a generic webhook notifier (user-owned outbound, off by default).

Cut from earlier drafts, deliberately: `casp lint` (an LLM verb inside the CASP binary —
even advisory — would undercut the deterministic claim; prose-vs-reality checking belongs in
your agent, which can read `casp/` today for free).

Vote on the roadmap with [GitHub issues / reactions](https://github.com/ThalesGnimavo/casp/issues).

---

## FAQ

**Does this require Claude Code?** No. The CLI works standalone with any agent that runs shell commands. The `/casp` and `/next` slash-commands are an optional bundle for Claude Code users.

**Is CASP an AI memory product?** No — that's the wedge. Memory tools (Mem0, Letta, Zep) *store and recall*. CASP *validates project execution state against git* and blocks the push on drift. Different artifact, different operation.

**So the queue is just a TODO list?** A TODO list can't refuse. The queue is validated against git and the files on disk: a head that doesn't exist, one that already shipped, or a chain that can't be executed in any order fails the gate and blocks the push.

**Does it work for Cursor, Aider, Continue?** Yes. The CLI is just a CLI; any agent that runs shell commands and reads files can use it.

**What about Python, Rust, Go projects?** The CLI is Node-only (TypeScript via `tsx`). Use it via `npx` without committing Node as a project dependency. A binary distribution is on the roadmap.

**Is any data sent anywhere?** No. Zero network calls. Zero telemetry. CASP reads your filesystem and your `git`. Nothing leaves your machine.

**Why "CASP"?** **C**oding-**A**gent **S**tate **P**rotocol — the name says exactly what the artifact is. An earlier name for this tool collided with a well-known Red Hat project of the same name; CASP relaunches it as a *protocol*, the way MCP did for model context.

**Where do I report bugs or request features?** [github.com/ThalesGnimavo/casp/issues](https://github.com/ThalesGnimavo/casp/issues)

---

## License

MIT. Use it, fork it, ship it.

Built by **[Juste A. Gnimavo](https://justegnimavo.com)** — Chief AI-Augmented Architect and
solo founder of ZeroSuite, running seven production products with Claude as the only
engineer, from Abidjan, Côte d'Ivoire. CASP is the layer that keeps months of AI-driven
sessions from collapsing into drift. The partnership behind it is documented in the open at
[thalesandhisaictoclaude.com](https://thalesandhisaictoclaude.com).

If CASP saves you 30 minutes a week, that's enough payback. If you want to say thanks: star
the [GitHub repo](https://github.com/ThalesGnimavo/casp), or [say hi on X](https://x.com/ThalesGnimavo).

---

*CASP — the Coding-Agent State Protocol. The model holds the context; CASP proves the state is true — against git.*
