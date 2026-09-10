---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-09-10
next_after: PHASE-SCHEDULE-LAYER
---

# Session — site-schedule-surface : the schedule layer reaches casp.sh, in every language

**Project root.** `casp-website` (the site repo), with `casp-core` read-only as the source of
truth for every claim. **Expected size.** 3-5 h, solo, mechanical.

> **Why.** The 0.18.0 release added a ninth rule area, a new verb and an opt-in file. The site
> is the public description of what `casp check` verifies; a site that lists eight areas while
> the binary enforces nine is a false claim about the product, of exactly the kind the product
> exists to refuse. This is a **propagation** session — the wording is decided upstream, in
> `CHANGELOG.md`, `README.md` and `docs/rules.md`; nothing is invented here.

## PRECONDITION — check it first, and stop if it fails

**`@justethales/casp@0.18.0` must be live on npm before this session touches the site.**

```
npm view @justethales/casp version
```

Publishing is a CEO-gated act and is **not** part of this session. If the published version is
still below 0.18.0, stop, say so, and leave the queue head where it is: a site advertising a
verb `npm install` cannot deliver is worse than a site one release behind.

## CONTEXT — what changed since the parent prompt was drafted

`schedule-layer` shipped in `casp-core` (see the 0.18.0 entry in `CHANGELOG.md` and the session
log named by `casp/state.json`'s `last_session_id`). What is now public surface:

- an **opt-in** `casp/schedule.json` (`schemas/schedule.schema.json`), with `anchors` and `due`;
- four rules in a ninth area, `SCHEDULE` — `001` FAIL (does not validate), `002` WARN (dates a
  phase no list holds), `003` FAIL (contradicts itself), `004` WARN (a queued date has passed);
- one verb, `casp schedule [--since <weeks>] [--plain] [--json]`, which reports and never gates;
- a progress line in `casp status`, and `casp close` now ending on the board.

## MUST HAVE

1. **Every rule-count / area-count claim on the site is re-verified against the binary**, not
   against memory. `node casp-core/dist/cli.js rules --json` is the evidence. This includes
   `casp-website/casp/facts.json`, which carries a `casp-rule-count` fact: re-verify it and
   record the new hash, or the facts layer will WARN on its own site.
2. **The verb table gains `casp schedule`**, in `index.html` and in **every** language page
   (18 translations + `index.html` + `roadmap.html` where relevant). Command names, flag names,
   `PASS`/`WARN`/`FAIL`, code blocks and the npm line stay verbatim English — they are
   screenshots of reality. The prose around them is translated with full diacritics and correct
   typography in every language; if quality for a language cannot be assured, leave that page's
   existing text and note it, rather than shipping a poor version.
3. **One paragraph of severity doctrine**, wherever the site describes what `check` blocks on:
   *a schedule that contradicts itself is a FAIL; a missed date is a WARN and never blocks a
   push; the clock can add a WARN and can never add a FAIL.* This is the claim most likely to be
   misread as "casp does project management", so it is stated, not implied.
4. **The anti-roadmap section stays intact and gains the new exclusions** — no estimation, no
   planning, no assignees, no capacity, no Gantt, no tracker, no reminders, no calendar sync.
   The `fleet.html` precedent applies: something distributed by casp is not part of CASP, and
   something the tool refuses to do is stated where a reader looks for it.
5. **Wiring, which is not automatic**: `scripts/gen_sitemap.py` if a page is added; `llms.txt`
   if it is kept feature-aware; `hreflang` only for languages that actually exist.
6. **Proof assets are real outputs only.** If a terminal capture is added, it is a real
   `casp schedule` run captured with `freeze` — never a mockup, never an AI-generated terminal.

## DO NOT

- **Do not push `casp-website`.** A push deploys to production immediately. Draft, run the
  site's own `casp check`, complete its close loop, and stop — the push is a CEO decision.
- Do not publish anything to npm.
- Do not restate the wedge in new words. Never "memory", "remembers", "recall"; validate, not
  store; deterministic, not probabilistic; no superlatives, no "first/only/best"; no model name
  in evergreen copy.
- Do not add analytics, telemetry, or any outbound call to the site.
- Do not invent a date, a roadmap item, or a pace anywhere in the copy.

## AT END OF SESSION

Both cockpits close cleanly: the site's own `casp check` = 0 with its state bump, and a
technical-only session log in each repo that has one. Draft the successor prompt and chain it.
