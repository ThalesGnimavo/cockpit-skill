---
status: shipped
session_id: 26-09-05-001-queue-never-empty
session_log: session-logs/26-09-05-001-queue-never-empty.md
drafted_at: 2026-09-05
next_after: PHASE-FLEET-SHIPS-WITH-CASP
---

# Session — queue-never-empty : a finished roadmap is not a finished project

> **Status : SHIPPED** (0.17.0, 2026-09-05). Written at the CEO's request the day a product
> cockpit (`tap.ci`) closed its last queued chantier and set `next_prompt: null` with an empty
> queue — and `casp check` said PASS, "genuinely parked". The CEO's objection, verbatim in
> substance: *the queue must never be empty; what follows an implemented roadmap is a
> conversation with the CEO — how does the product get known (search, social, video,
> professional networks), what next — and that conversation is a session too.*
>
> **Goal.** A cockpit that has shipped never reports nothing to start; the thing it queues when
> the roadmap is done is a **discussion prompt**, scaffolded by the tool and announced by
> `casp next`.

## MUST HAVE

1. `CASP-PROMPT-011` — FAIL when `phases_shipped` non-empty, `phases_queued` empty, `next_prompt`
   empty. Exempt while nothing has shipped (`casp init` stays green).
2. `kind: discussion` prompt: template `templates/templates/discussion-prompt.md`,
   `casp new discussion --slug <slug>` → `DISCUSSION-<SLUG>.md`.
3. `casp next` announces the kind on stderr; stdout unchanged.
4. Docs: rules.md, README (rule table, § 2, catches, roadmap), schema descriptions, CHANGELOG,
   `skills/next`. Tests for the rule (both branches), the head-of-queue discussion, the scaffold.

## DO NOT

- Do not make the rule fire on a fresh cockpit — not started is not finished.
- Do not let the binary decide WHAT the discussion is about beyond naming the four decisions every
  finished roadmap owes (next roadmap, distribution, pricing, support): the content is the human's.
- Do not publish to npm inside this session without the CEO's go.
