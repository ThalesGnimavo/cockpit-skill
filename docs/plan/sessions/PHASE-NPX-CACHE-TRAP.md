---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-09-10
next_after: PHASE-SITE-SCHEDULE-SURFACE
---

# Session — npx-cache-trap: a recorded method that measures the wrong binary

**Expected size.** 1-2 h, solo, narrow. One built-in trap, its test, its documentation.

> **Why.** The facts layer cannot prove a claim is true; it proves the claim has not
> stopped being verified. That guarantee is only worth what the recorded *method* is
> worth, and one very common method silently measures something other than what it
> names.

## CONTEXT — the measurement that produced this prompt

While re-verifying the rule-count fact for casp.sh on 2026-09-10, the method recorded in
that project's `casp/facts.json` was replayed exactly as written:

```
npx --yes @justethales/casp rules | grep -c '^  CASP-'    → 31
npx --yes @justethales/casp@0.18.0 rules | grep -c '^  CASP-'  → 35
npm view @justethales/casp version                        → 0.18.0
```

`npx` with no version specifier reuses an already-cached copy of the package rather than
resolving the registry's current `latest`. The machine's registry said 0.18.0; the
command executed 0.17.0 and returned a number that was correct for a binary nobody was
claiming anything about. Nothing in the output says which version ran. The finding was
not a stale fact — the fact was inside its TTL and every `casp fact check` assertion
passed. It was a **method that names one thing and measures another**, which is the exact
family `src/traps.ts` exists for.

The same shape bites any project whose fact is "what the published tool does": a version
number, a rule count, a flag list, a default. It is not specific to this package.

## MUST HAVE

1. **A built-in trap in `src/traps.ts`** for an `npx`/`npm exec`/`bunx`/`pnpm dlx`
   invocation of a package with **no version or tag specifier**, when the method's stated
   subject is the published artifact. Follow the shape of the existing entries: a stable
   `id`, a `test` on the method string, and a `why` that says why it is a trap and not a
   style nit. Match the real forms (`npx --yes pkg`, `npx -y @scope/pkg`, `npm exec pkg`)
   and do **not** fire when a specifier is present (`pkg@1.2.3`, `pkg@latest`,
   `pkg@$(...)`) — a false positive here teaches operators to delete the trap list, which
   is how a gate loses its meaning.
2. **Severity stays WARN**, like every other trap. A method that may be wrong is not a
   drifted state, and the facts layer never blocks a push on suspicion.
3. **Tests**: the trapped forms fire, every pinned form does not, and a method that
   merely contains the word `npx` in prose does not.
4. **`docs/rules.md`** gains the trap in the `CASP-FACT-*` prose, with the measured
   numbers above as the evidence — the entry states what was measured, not what is
   feared.
5. **`CHANGELOG.md`** entry under the next version, describing the trap in one sentence
   a reader can act on.

## DO NOT

- Do not make the trap a FAIL. Traps warn.
- Do not have casp run the method to decide — the trap is a string test on the recorded
  method, never an execution. `casp fact verify` is the only place casp runs repository
  content, and no gate calls it.
- Do not add a dependency.
- Do not widen the trap to "any command without a version". `git`, `python3` and the rest
  are not published artifacts whose identity is the claim.

## AT END OF SESSION

Ship the prompt, bump `casp/state.json`, write a technical-only session log, `casp check`
= 0, draft the successor and chain it.
