---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-06-10
next_after: PHASE-QUEUE-NEVER-EMPTY
---

# Session — demand-gated-tail : holding prompt (DO NOT EXECUTE without a signal)

> **Status : QUEUED as a placeholder.** Validated Tier-3 — each item here is
> demand-gated: it ships only when a real signal exists (user ask, org
> adoption, CEO call). Before executing ANY item, split it into its own
> prompt and get explicit CEO validation of the trigger.

**Items, in validated order:**

1. **CI status-check installer** — drop the GitHub Action the homepage advertises.
2. **`casp notify --webhook <url>`** — user-owned outbound, off by default,
   secrets from env, `status` redacts. **Constraint (CEO-validated): the
   committed-token check must be STRUCTURAL — the config must reference env
   vars, FAIL on any inline value. Never entropy-based "looks like a token"
   heuristics — that is the cry-wolf failure class CASP rejects.**
   Notify-on-red (drift on a scheduled run) before notify-on-close. Named
   platform adapters (Discord/Slack/Twilio/…): never in core.
3. **`casp rollback`** — state-mutation only (flip prompt to queued, pop
   phases_shipped, reset next_prompt, then require check green). Never touches
   code or git history. If it can't stay that narrow: cut it.
4. **Native binaries** — when a real non-Node org asks. Not before.
5. **`casp timeline` / `casp metrics`** — local-compute only, no network, no LLM.
6. **Slash-command distribution** — `/casp` + `/next` as installable skills;
   includes reconciling the stale `/cockpit` naming.

## DO NOT
- Do not execute this prompt as a single session. It is a queue marker.
