# Roadmap

> **Updated** : 2026-07-21 (session 26-07-21-002 — 0.12.0 shipped).
> **Source of truth** : this file + `docs/plan/sessions/*.md` (status frontmatter) + `session-logs/`.
> **Maintenance rule** : update at the end of every session that ships something or surfaces a blocker.
> **Note** : the validated order below was approved on 2026-06-10, materialized as drafted prompts. Commit SHAs were re-stamped after the 2026-06-17 history rewrite; reference session-log filenames (stable) over SHAs.

---

## Now — Next to ship

| # | Item | Prompt | Status |
|---|------|--------|--------|
| 1 | **Site propagation for 0.18.0** — the ninth rule area, the `casp schedule` verb and the severity doctrine reach `casp.sh` in every language; the site's own `casp-rule-count` fact is re-verified against the binary. **Gated on the npm publish of 0.18.0**, which is a CEO act. | `docs/plan/sessions/PHASE-SITE-SCHEDULE-SURFACE.md` | queued |

**Sequencing note (2026-09-10).** `schedule-layer` shipped as 0.18.0 and the site now describes
eight rule areas where the binary enforces nine. A site that understates the product is a false
claim of the same family the product refuses, so propagation heads the queue ahead of
`demand-gated-tail`, which still waits on a real signal.

If you reach for anything BELOW Next, stop and check why.

---

## Blocked / parked

| Item | State | Note |
|------|-------|------|
| `casp.sh` + `llms.txt` sync | ongoing (website side) | Site roadmap advertised through 0.9 on 2026-07-15 (`roadmap.html` en/fr/es/de); the 0.10.0 card + `llms.txt` version bump belong to the `casp-website` cockpit (auto-deploys on push), never a core session. |
| Demand-gated tail | parked (marker) | `PHASE-DEMAND-GATED-TAIL.md` is a queue marker — each item ships only on a real signal, split into its own prompt with CEO trigger validation. |
| `casp chain <N>` — first-class session marathon | parked (gated on real-marathon evidence) | Promote the user-level `/chain` skill (`~/.claude/skills/chain/SKILL.md`, created 2026-07-16; **rewritten 2026-07-18 to a headless per-phase runner** — one fresh `claude -p "/next"` session per phase, deterministic `casp check` verification between phases, escalation digest at chain end) into a casp-distributed concept. **Gate : ships ONLY IF the /chain skill workflow succeeds in real marathons** (evidence = downstream session logs + memory `chain-skill-session-marathon`). Landing spot if the gate opens : the optional Claude Code `skills/` bundle, **never a CLI verb** — orchestration stays out of the binary (anti-roadmap). CEO decision 2026-07-16 : dedicated session only after the gating evidence exists — do not start before. |

---

## Queued — validated order (after Next)

2. Demand-gated tail (CI status-check installer, `notify --webhook` with a **structural** committed-token check, narrow `rollback`, native binaries, `timeline`/`metrics`, slash-command distribution) — `docs/plan/sessions/PHASE-DEMAND-GATED-TAIL.md` — **do not execute as one session.**

---

## Shipped this week

| Date | Commit | Title | Notes |
|------|--------|-------|-------|
| 2026-09-10 | `59be086` | **0.18.0** — the schedule layer : opt-in `casp/schedule.json`, four `CASP-SCHEDULE-*` rules, the `casp schedule` verb, the board in `status` and `close` | 231 → 256 tests; the clock may add a WARN and may never add a FAIL, pinned by two tests; **published to npm 2026-09-10** — shasum `59be086a5b364c68984e79398a26e5160917bc5f`, 50 files, verified from the registry |
| 2026-09-05 | `d815b77` | **0.17.0** — `CASP-PROMPT-011` + the `kind: discussion` prompt : a finished roadmap is not a finished project | 231/231 tests; published 2026-09-05 |
| 2026-07-21 | `9cfe9ef` | **0.12.0** — `casp upgrade` : non-destructive scaffold refresh + additive `casp_version` stamp + `doctor` staleness WARN | 118/118 tests; sequenced ahead of `facts-layer` because 0.11.0's template change was otherwise unadoptable; audit GO-WITH-FIXES, five fixes folded in; **not yet published to npm** |
| 2026-07-21 | `0f67e23` | **0.11.0** — `CASP-SESSION-003` : shipped phases declared by a session log | 102/102 tests; first new drift category since rule codes; opt-in by declaration, derived adoption window, pre-adoption history exempt; **not yet published to npm** |
| 2026-07-19 | `f682356` | **0.10.0** — `casp audit` deep-audit watermark + `/audit-batch` skill | 92/92 tests; published; cockpit bump regularized 2026-07-20 (retrospective log) |
| 2026-07-15 | `590b979` | **0.9.0** — `casp doctor`, `casp version --json`, structured findings | 87/87 tests; published |
| 2026-07-14 | `015c72f` | **0.8.0** — stable rule codes, injection-safe git, JSON Schemas | 74/74 tests; published |
| 2026-06-17 | `0460e07` | **0.7.0** — `casp help` first-class + per-command help | 63/63 tests; tooling ergonomics, `check` semantics unchanged |
| 2026-06-17 | `f55fb83` | **0.6.0** — `install-hook`, `next` drift-gate, `status --json`, `verify` + `state diff` | 54/54 tests; published to npm; both session boundaries now gated |
| 2026-06-16 | `40e74fa` | 0.5.0 — configurable `sessions_dir` / `logs_dir` | 34 tests; published |
| 2026-06-16 | `302c6e6` | 0.4.2 — `check --all <absolute path>` no longer doubles the path | 30 tests; published |
| 2026-06-15 | `2c4211f` | 0.4.1 — fresh `init` checks green out of the box | published |
| 2026-06-15 | — | 0.4.0 — `ship`/`close` verbs, optional migrations, `check --all` | 28 tests; published |

---

## Phase scoreboard

| Phase | Status | Session log | Notes |
|-------|--------|-------------|-------|
| 0.1.0 — Initial release (`cockpit`) | shipped | — (pre-cockpit era) | 2026-05-30 |
| 0.2.0 — CASP rebrand + `casp next` + exit-code test | shipped | — (pre-cockpit era) | 2026-06-08 |
| 0.2.2 — parked-state fix + runtime version | shipped | — (pre-cockpit era) | 2026-06-09 |
| 0.2.3 — autonomous-era repositioning (docs) | shipped | — (pre-cockpit era) | 2026-06-10 |
| 0.2.4 — `check --json` + CASP-on-CASP | shipped | `session-logs/26-06-10-001-check-json-and-roadmap-proposal.md` | published |
| 0.3.0 — correctness fixes (false-green, state-bump) | shipped | `session-logs/26-06-10-002-false-green-and-state-bump-fixes.md` | verdict-changing |
| 0.3.1 — Alembic + multi-log field fixes | shipped | `session-logs/26-06-10-003-field-fixes-and-zerosuite-rollout.md` | published |
| 0.4.0 — `ship`/`close`, opt-in migrations, `check --all` | shipped | `session-logs/26-06-15-001-0-4-close-loop.md` | published |
| 0.4.1 — fresh `init` checks green out of the box | shipped | `session-logs/26-06-15-002-init-fix.md` | published |
| 0.4.2 — `check --all <absolute path>` fix | shipped | `session-logs/26-06-16-001-check-all-abspath-fix.md` | published |
| 0.5.0 — configurable `sessions_dir` / `logs_dir` | shipped | `session-logs/26-06-16-002-configurable-paths.md` | published |
| 0.6.0 — `install-hook` (pre-push gate) | shipped | `session-logs/26-06-17-001-install-hook.md` | published |
| 0.6.0 — `next` drift-gate + `status --json` + `verify` + `state diff` | shipped | `session-logs/26-06-17-002-0-6-0-bundle.md` | published |
| 0.7.0 — `casp help` first-class + per-command help | shipped | `session-logs/26-06-17-003-casp-help.md` | not yet published |
| positioning-deterministic-floor | shipped | `session-logs/26-06-17-004-positioning-deterministic-floor.md` | copy / positioning |
| positioning-subwedge-site | shipped | `session-logs/26-06-17-005-subwedge-site-propagation.md` | copy / positioning |
| 0.8.0 — rule codes, JSON Schemas, injection-safe git path | shipped | `session-logs/26-07-14-001-0-8-0-hardening-rule-codes.md` | see CHANGELOG |
| 0.9.0 — `doctor`, `version --json`, expected/actual on findings | shipped | `session-logs/26-07-15-001-0-9-0-doctor-version.md` | see CHANGELOG |
| 0.10.0 — `casp audit` deep-audit watermark + `/audit-batch` | shipped | `session-logs/26-07-19-001-0-10-0-audit-watermark.md` | retrospective log — shipped without a cockpit bump, regularized 2026-07-20 |
| check-shipped-log | queued | _(pending)_ | verdict-changing |
| facts-layer | queued | _(pending)_ | sequenced 2026-07-20, after check-shipped-log — prove freshness, not truth |
| upgrade-command | queued | _(pending)_ | sequenced 2026-07-18, after check-shipped-log; 2026-07-20 : after facts-layer |
| demand-gated-tail | queued (marker) | _(pending)_ | per-item triggers required |
