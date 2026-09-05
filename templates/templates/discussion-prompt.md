---
status: queued
kind: discussion
session_id: pending
session_log: pending
drafted_at: YYYY-MM-DD
next_after: <previous-session-id-or-prompt-slug>
---

# Discussion — <Concise title> : what comes after the roadmap

> **Status : QUEUED. Kind : DISCUSSION.** This session is a conversation with the human, not a
> build. Its deliverable is **decisions written down** and **the prompts they produce** — no
> code. It exists because a finished roadmap is not a finished project: a cockpit that has
> shipped never reports nothing to start (`CASP-PROMPT-011`).
>
> **Why now.** One sentence — what just shipped, and why the next step is a decision rather than
> a slice.

**Project root.** `<absolute-path>`
**Session log target.** `session-logs/YY-MM-DD-NNN-<slug>.md`.
**Decision record target.** `<docs/decisions/YYYY-MM-DD-<slug>.md — or the project's existing arbitration file>`.

---

## HOW THIS SESSION RUNS

1. Read the state (`casp/now.md`, `casp/roadmap.md`) and **every deferred item** listed below.
   Re-verify each one in the code before repeating it: a deferred item may have shipped since.
2. For each decision below, present **one question, one recommendation, one line of trade-off**.
   The agent takes a position first; the human decides.
3. Write every decision to the decision record — the reason that decided, not only the conclusion.
4. Draft the prompt(s) the decisions produce (`casp new prompt --slug <slug>`), chain them with
   `next_after`, and point `next_prompt` at the head.
5. Close like any session: log, state bump, `casp check` 0 FAIL, commit, push.

---

## WHAT REMAINS FROM THE ROADMAP (deferred items, verified)

- **<Deferred item>** — where it lives (`file:line`), why it was deferred, what unblocks it.
- **<Deferred item>** — same.

---

## DECISIONS TO OBTAIN (one question, one recommendation each)

1. **The next roadmap.** <What are the candidates? Which one does the agent recommend, and why?>
2. **Distribution — how does the product get known?** <Field channels, partners, paid channels
   (search, social, video, professional networks), content, referrals. Budget, sequence, the one
   message to lead with. The agent recommends a sequence, not a list.>
3. **Pricing.** <What the launch tariff was for, when it ends, what replaces it.>
4. **Support and operations.** <Who answers, on which channel, with which tooling; what the
   first hundred users will break.>
5. **<Project-specific decision>** — <question + recommendation>.

---

## DO NOT

- **Do not write product code in this session.** A discussion that turns into a build has skipped
  the decision it existed to obtain.
- **Do not run this prompt headless.** It needs the human; `casp next` says so.
- **Do not leave a decision implicit.** "We'll see" is a deferred item, and goes in the record as
  one, with an owner and a date.

---

## AT END OF SESSION

1. Decision record written, one entry per decision, with the reason that decided.
2. The prompt(s) the decisions produce are drafted, chained, and `next_prompt` points at the head.
3. Session log written : `npx @justethales/casp new log --slug <slug>`, then fill.
4. `casp/state.json` bumped, `casp/now.md` and `casp/roadmap.md` rewritten.
5. **`npx @justethales/casp check`** — 0 FAIL. Commit, push.

---

*A discussion prompt is the answer to "what now?" once the roadmap is implemented. The queue never
ends: it changes kind.*
