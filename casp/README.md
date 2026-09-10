# CASP — project state

> **Scaffolded** : 2026-06-10 via `npx @justethales/casp init`.
> **Source** : `casp` (the Coding-Agent State Protocol) — https://github.com/ThalesGnimavo/casp
> **License** : MIT.

This directory is the **single source of short-term truth** for this project's AI-driven engineering sessions — the validated present tense your agent reads on the first line of any session. It costs ~3-5 k tokens to load, far less than re-reading the codebase.

---

## What this is

The whole protocol fits in your repo: state files + a CLI + canonical templates + an explicit session-start / session-end protocol, so any fresh agent session can answer "where am I?" in one screen, leave the state coherent on close, and have a machine-verifiable gate that catches drift before push.

### State files

- [now.md](now.md) — current focus (1 sentence), next action by time budget, don't-get-distracted list, active constraints. **Update at every session close.**
- [roadmap.md](roadmap.md) — Next 3 to ship, in-flight, blocked, queued, shipped-this-week, phase scoreboard.
- [state.json](state.json) — machine-readable single-line state. The validator (`npx @justethales/casp check`) reads it.
- [templates/](templates/) — canonical scaffolds for the three artifacts every session produces.

### CLI

| Command | What it does | When to run |
|---|---|---|
| `npx @justethales/casp status` | Read-only one-screen snapshot. | Session start. |
| `npx @justethales/casp next` | Print the next session's prompt from `state.next_prompt`. | Session start. |
| `npx @justethales/casp check` | The drift validator. Validates state against git — **exits 1 on drift**. | **Mandatory before `git push`** when the state was bumped. |
| `npx @justethales/casp new prompt --slug X` | Scaffold a session prompt from template. | Session close (draft next session's prompt). |
| `npx @justethales/casp new log --slug X` | Scaffold a session log from template. | Session close. |

### Templates

| Path | Use case |
|---|---|
| [templates/session-prompt.md](templates/session-prompt.md) | The skeleton for `docs/plan/sessions/<id>-<slug>.md`. |
| [templates/session-log.md](templates/session-log.md) | The skeleton for `session-logs/YY-MM-DD-NNN-<slug>.md`. |
| [templates/audit-brief.md](templates/audit-brief.md) | The Explore sub-agent brief for post-implementation audits. |
| [templates/schedule.json](templates/schedule.json) | Copyable example for `casp/schedule.json` — the **opt-in** schedule layer. Copy it up one level and edit it to adopt; leave it where it is to stay opted out. |

---

## Session-start protocol

```bash
npx @justethales/casp status      # the snapshot
npx @justethales/casp next        # the canonical next-session prompt
```

Then begin executing. Don't pause to confirm scope ; the prompt IS the scope.

If `npx @justethales/casp check` exits non-zero at session start, **STOP and reconcile.** A failed check means the previous session didn't close cleanly.

---

## Session-close protocol

In order. The order matters because the validator depends on prior steps :

1. **Write the session log** — `npx @justethales/casp new log --slug X` then fill in.
2. **Flip this session's prompt frontmatter** — `status: queued → shipped`, `session_id:` filled, `session_log:` pointing at step 1's file.
3. **Bump parent prompt's `progress:` block** if this was a sub-slice.
4. **Draft the next session's prompt** — `npx @justethales/casp new prompt --slug Y` then fill in.
5. **`casp/now.md`** — overwrite the three blocks. Update the "Updated" line.
6. **`casp/roadmap.md`** — move shipped item to "Shipped this week" ; promote queued ; update Phase scoreboard.
7. **`casp/state.json`** — bump `last_session_id`, `last_commit`, `current_phase`, `next_phase`, `next_prompt`, append to `phases_shipped[]`, append to `migrations_applied[]` if a migration ran.
8. **`npx @justethales/casp check`** — must exit 0 (0 FAIL).
9. **`git add` + `git commit` + `git push`**.

---

## What the validator catches

Real drift, in order of severity :

1. **`state.json.next_prompt` points at a missing file.**
2. **`state.json.next_prompt` points at a `shipped` prompt.** State was never bumped after the previous session.
3. **`state.json.last_session_id` does not map to a session-log file.**
4. **`state.json.last_commit` not found in `git log`.**
5. **`state.json.phases_shipped[]` has duplicates.**
6. **`state.json.migrations_applied[]` does not match `<migrations_dir>/*.sql`.**
7. **A session prompt has `status: shipped` but no `session_log:` pointer.**
8. **Uncommitted changes in `casp/` / `docs/plan/sessions/` / `session-logs/`.**

Each failure prints a `→ fix` hint so the next session can resolve without re-reading this README.

---

## When NOT to use the protocol

- Trivial fix (typo, dead import, one-line bug). Just do it.
- A question scoped to a file you already know.
- Executing a prompt that's explicitly in Next-3 and `casp status` shows no drift.

---

## Failure modes the protocol cannot fix

- A session that lies in `now.md` about what was built. The validator reads metadata, not intent.
- A prompt frontmatter that says `status: queued` but the body describes shipped work.

For each : prevention beats detection. Templates + protocol + validator are the prevention layer. Honest description + human review are the last line.

---

## Learn more

- Source : https://github.com/ThalesGnimavo/casp
- Docs : https://casp.sh
- Issues / feedback : https://github.com/ThalesGnimavo/casp/issues
