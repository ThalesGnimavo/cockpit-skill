# What I'm doing NOW

> **Updated** : 2026-09-05 (session 26-09-05-001 — 0.17.0, published).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**0.18.0 built — a dated claim nobody confronts with the calendar goes false, not stale.** An opt-in `casp/schedule.json` (anchors + per-phase due dates, joined on the phase name) is verified by four new `CASP-SCHEDULE-*` rules in a ninth area, and `casp schedule` prints the pace **measured** from the history of `casp/state.json`, the derived length of the queue, the recorded claims and the contradictions. The boundary is mechanical, not editorial: a schedule that contradicts itself is a FAIL, a missed date is a WARN, and two tests pin it — severity, and that moving the clock a year changes no FAIL. `casp status` now draws a progress line on every run and `casp close` ends on the board. 231 → 251 tests, `casp check` = 0. **Not published**: the npm publish of 0.18.0 is a CEO act.

## Concrete next action if I have…

### 15 minutes

`npm view @justethales/casp version` — if it still reads 0.17.0, the publish of 0.18.0 is owed and is the CEO's to make. Nothing else is owed from a core session.

### 1 hour

Nothing in `casp-core`. The head of the queue is `PHASE-SITE-SCHEDULE-SURFACE`, which is a `casp-website` session and is **gated on the publish** — a site advertising a verb `npm install` cannot deliver is worse than a site one release behind.

### Half a day

Once 0.18.0 is live on npm: run `PHASE-SITE-SCHEDULE-SURFACE`. It is mechanical propagation — the wording is already decided in `CHANGELOG.md`, `README.md` and `docs/rules.md`, and nothing is invented there. It ends drafted, not pushed: pushing `casp-website` deploys to production.

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **Anything in `PHASE-DEMAND-GATED-TAIL.md`** — queue marker, demand-gated; a demand signal and an explicit go before any of it runs.
- **Wiring path claims into any launcher** — ruled out on measurement (see CHANGELOG 0.16.0). Do not re-propose without a measurement that overturns the 14/1/2 count.
- **Teaching `casp check` to read `casp/live/` or the fleet skill** — the wall is the product.
- **`casp chain <N>`** — parked, gated on real-marathon evidence (see roadmap).
- **`casp lint`** — cut for good.

---

## Constraints active today

- `npm publish` is a separate, deliberately gated act — never bundled into a routine feature session.
- This is a **public** repo: session logs, phase prompts + `state.json` `notes` stay technical-only (CHANGELOG register). Private context goes to `private-docs/` (see `casp-sh/CLAUDE.md` §3).
- `npx @justethales/casp check` is mandatory before push when the casp state was bumped.

---

## How to use this file

- **Start of session** : `npx @justethales/casp status` reads this + state.json + the next-prompt preview + last 10 commits in one command.
- **End of session** : overwrite the three blocks (focus, next-actions-by-budget, don't-get-distracted). No paragraphs, no narrative — mirror the shape of this file.
- **Before push** : `npx @justethales/casp check` exits 0. If FAIL, fix inline.
- **When "don't get distracted" feels limiting** : that's the point. If you need to break it, justify in `roadmap.md` first.
