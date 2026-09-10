---
phase: site-schedule-surface
---

# 26-09-10-003 — site-schedule-surface: the 0.18.0 surface reaches casp.sh

Propagation session. No change to `casp-core` code: the wording was already decided in
`CHANGELOG.md`, `README.md` and `docs/rules.md` when `schedule-layer` shipped. What
changed is the public description of the tool on casp.sh, plus this cockpit's close loop
and one new queued slice that a measurement made during the session produced.

Precondition checked first, as the prompt requires: `npm view @justethales/casp version`
→ `0.18.0`. The site never advertises a verb `npm install` cannot deliver.

## Measured against the published binary, not from memory

```
npx --yes @justethales/casp@0.18.0 rules | grep -c '^  CASP-'   → 35
areas: FACT GIT IO MIGRATION PROMPT SCHEDULE SESSION STATE WORKTREE   (9)
per area: FACT 6 · GIT 1 · IO 2 · MIGRATION 3 · PROMPT 12 · SCHEDULE 4 · SESSION 3 · STATE 3 · WORKTREE 1
CASP-SCHEDULE-001 FAIL · 002 WARN · 003 FAIL · 004 WARN
```

The four severities were read from `src/schedule.ts` and the `check.ts` wiring rather
than from the prompt that asserted them; both agree.

## What shipped on the site

Eighteen language pages gain one card describing `casp schedule`: the opt-in posture (a
cockpit with no `casp/schedule.json` emits no `CASP-SCHEDULE-*` finding at all), the
severity doctrine (a schedule that contradicts itself is a FAIL; a missed date is a WARN
and never blocks a push; the clock can add a WARN and can never add a FAIL), and the
exclusions (no estimation, planning, assignment, capacity, Gantt, tracker, reminder or
calendar sync). `roadmap.html` gains a 0.18 entry in its four language blocks. `llms.txt`
moves to 35 rules across 9 areas and 0.18.0.

The site's five-verb command deck was left intact. `init`, `status`, `check`, `next`,
`new` are the protocol canon; `schedule` is tooling ergonomics, like `live`, `upgrade`
and `audit`, all of which are described in prose on that page and not in that table.
Adding a sixth row would also have broken a section heading that reads "Five verbs" in
eighteen languages.

## The recorded method was itself a false measurement — new slice queued

The site's `casp-rule-count` fact recorded the method
`npx --yes @justethales/casp rules | grep -c '^  CASP-'`. Replayed today on a machine
whose registry reports `latest = 0.18.0`, it returns **31**. `npx` with no version
specifier reused a cached 0.17.0. The pinned form returns **35**. Nothing in the output
names the version that ran, and every `casp fact check` assertion passed throughout: the
fact was inside its TTL, its method was recorded, its source resolved.

This is not a stale fact. It is a method that names one thing and measures another —
precisely the family `src/traps.ts` exists to catch, and one that bites any project whose
fact is "what the published tool does". `PHASE-NPX-CACHE-TRAP` is queued with the
measurement above as its evidence: a built-in WARN trap for an unpinned `npx` / `npm exec`
/ `bunx` / `pnpm dlx` invocation, with tests that every pinned form stays silent.

`PHASE-DEMAND-GATED-TAIL` was re-chained behind it (`next_after: PHASE-NPX-CACHE-TRAP`),
so the head stays a slice that can actually move; the tail remains gated on a real demand
signal, not on a date.

## Verification

`casp check` on the site cockpit: 29 PASS, 0 WARN, 0 FAIL, exit 0. Eighteen headless
renders at 390 / 768 / 1280 px reported zero horizontal overflow, and the new card was
inspected as rendered — the overflow number alone proves nothing here, because the cards
carry a scroll-reveal class and a full-page capture of never-scrolled content is empty
without being at fault. The second pass used temporary out-of-repository copies with the
reveal forced visible; no repository file was modified for it.

Not done, and stated rather than implied: no `freeze` capture of a real `casp schedule`
run was produced, so the site describes the verb without showing it. That capture is due
whenever the launch post for this release is written.
