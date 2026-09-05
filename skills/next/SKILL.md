---
name: next
description: |
  Start the next implementation session. Reads casp/state.json for the
  next_prompt field, opens the named prompt file, then begins executing it
  as the canonical instruction for the session. Works in any project with a
  casp/ directory. Falls back to roadmap.md Next-3 when no next_prompt is
  set, and to git log + open questions when no casp state exists at all. Removes
  the friction of having to paste the previous session's end message or
  re-orient the agent on session start.
---

# /next — Start the next implementation session

You are an **execution agent**, not a reporter. The user typed `/next` because they want work to begin. Your job is to (1) discover what the next session is, (2) load its full context, (3) start executing it. Do NOT stop and ask "shall I proceed" — proceed.

This is the opposite of `/casp` in posture : casp reports, next acts.

---

## Pre-flight (run once, in parallel)

```bash
pwd
test -d casp && echo "casp:yes" || echo "casp:no"
git rev-parse --short HEAD 2>/dev/null
git rev-parse --abbrev-ref HEAD 2>/dev/null
git status --short
git log --oneline -5
test -f package.json && jq -r '.name + "@" + (.version // "unversioned")' package.json 2>/dev/null
```

Surface the project name + commit + branch at the top of your reply (one line).

---

## Validate the state first

```bash
npx @justethales/casp check --quiet 2>&1 | tail -5
echo "exit:$?"
```

If `casp check` exits non-zero (FAIL) : **STOP.** The previous session didn't close cleanly. Surface the FAIL findings to the user and ask whether to (a) fix the drift inline first, (b) re-execute the prompt the state points at, (c) start something else. Don't paper over drift by executing on top of it — that compounds the problem.

If 0 FAIL : proceed.

---

## Decide what to execute

### Path A — casp state present and `next_prompt` set (the happy path)

```bash
test -f casp/state.json && jq -r '.next_prompt // "none"' casp/state.json
test -f casp/state.json && jq -r '.current_phase, .next_phase' casp/state.json
```

When `next_prompt` is a real path (not `"none"`, not empty, not null) :

```bash
npx @justethales/casp next      # prints the canonical next-session prompt
```

The file is the canonical instruction for this session. Read it fully.

**Validate before executing :**
- Frontmatter `status:` should be `queued` (not `shipped`). The `casp check` ran above catches this, but verify by eye on the prompt.
- Frontmatter `next_after:` should reference the most recent shipped work.
- The prompt's `## CONTEXT` section should mention the most recent commit hash.

**When validation passes :** announce in one sentence what you're about to do. Then **begin the work** — Build step 1, then 2, then 3. Do NOT pause to re-confirm scope ; the prompt IS the scope.

### Path B — casp state present but `next_prompt` is `none` / missing

```bash
test -f casp/roadmap.md && sed -n '/## Now — Next 3/,/^---$/p' casp/roadmap.md
ls docs/plan/sessions/*.md 2>/dev/null | head -20
grep -l '^status: queued' docs/plan/sessions/*.md 2>/dev/null
```

When the roadmap Next-1 names a prompt file that exists and has `status: queued`, treat that as `next_prompt` and continue with Path A.

When no clear next-prompt can be derived, surface the Next-3 from `roadmap.md` and ask the user which to start. Don't guess.

**If `phases_shipped` is non-empty, an empty `next_prompt` is drift, not rest** (`CASP-PROMPT-011`, 0.17). Run `casp check` and say so. The fix is never to invent a slice: a finished roadmap owes decisions — distribution, pricing, support, the next roadmap — and a decision is a session too. Scaffold it with `casp new discussion --slug <slug>`, list the decisions with one question and one recommendation each, point `next_prompt` at it, and stop: the human fills the questions in.

### A `kind: discussion` prompt at the head

`casp next` announces it on stderr. This session is a **conversation**, not a build: re-verify every deferred item the prompt lists against the code (some may have shipped), take a position on every decision before asking, record each decision with the reason that decided it, draft the prompt(s) the decisions produce and chain them with `next_after`. **Write no product code.** Never run this prompt headless.

### Path C — no casp state at all

```bash
test -f README.md && head -20 README.md
test -d docs/plan/sessions && ls docs/plan/sessions/*.md 2>/dev/null
git log --oneline -10
```

Report what you see + suggest `npx @justethales/casp init`. The skill is degraded but useful — at least it does the inspection legwork.

---

## During execution

- **Honor the prompt's `## DO NOT` section literally.** Scope creep guard.
- **Honor the prompt's `## AT END OF SESSION` section literally.** In particular, the steps about session log + casp state update + next-session prompt drafting + `casp check` + commit + push are non-negotiable.
- **If the prompt's MUST list is larger than the session can realistically cover, surface the call out loud before starting.** Quote the prompt back and propose the cut.
- **If the prompt assumes a file / env var / external state that doesn't exist, stop immediately.** Surface the missing precondition.

---

## When the prompt finishes

The prompt's `## AT END OF SESSION` already covers commit + push + casp state bump + next-session prompt drafting + `casp check`. Don't add extra ceremony.

If the prompt is silent on the next-session prompt draft, draft it anyway via `npx @justethales/casp new prompt --slug <next-slug>`.

---

## Rules

- **Never paste a long copy of `casp/now.md` or the prompt body into your reply.** The user reads files themselves ; your job is to act.
- **Never report "I've read the state, what would you like me to do?"** That's the friction this skill removes. If the state names a next-prompt, execute it.
- **Never re-run `/casp` from inside `/next`.** Duplicates work.
- **Always honor `pwd`.** Never reach for a sibling project's casp state.
- **Never modify `casp/state.json` until the session's work is shipping.** The skill is a starting gun, not a state-bump tool.

---

## Failure modes

- **`pwd` is not in a git repo** : print "_not in a git repository ; `/next` needs a project root_" and stop.
- **No `casp/`, no `docs/plan/sessions/`, no obvious next work** : print "_no casp state, no session prompts ; tell me what to start_" and suggest `npx @justethales/casp init`.
- **`next_prompt` points at a missing file** : the `casp check` above catches this. Surface + ask whether to draft the missing prompt or fix state.json.
- **`next_prompt` points at a `shipped` prompt** : `casp check` catches this. Surface + ask whether to update state.json to the real next slice OR re-execute the shipped prompt.
- **The prompt's MUST is obviously infeasible in one session** : propose the cut to the user before starting.

---

## What `/next` is NOT

- It is **not** `/casp`. Casp reports, next acts.
- It is **not** a planner. The prompt file IS the plan.
- It is **not** interactive. It begins work ; the user interrupts if redirection is needed.
