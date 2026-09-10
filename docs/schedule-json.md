# `casp schedule --json` — machine-readable schedule report

`casp schedule` measures how fast a project has actually been shipping phases,
states the derived length of its queue, and lists the dated claims recorded in
`casp/schedule.json` with the contradictions `casp check` would emit for them.

**It reports; it never gates.** On any readable cockpit it exits `0`, drift
included. It exits `1` only when there is no `casp/state.json`, when it is not
valid JSON, or when it exists and cannot be **read** — "cannot produce a report"
errors, not drift. Same contract as [`status --json`](./status-json.md).

The schedule layer is **opt-in**: with no `casp/schedule.json`, `adopted` is
`false`, `claims` and `findings` are empty, and the verb still reports the pace.

## Shape

`schemas/schedule-result.schema.json` is the published contract. Top level:

| Field | Meaning |
|---|---|
| `schema_version` | Bumps only on a breaking shape change; additive fields do not bump it. |
| `today` | The day every `state` and `days` field was computed against. |
| `adopted` / `malformed` / `malformed_detail` | Whether `casp/schedule.json` exists, whether it validates, and every structural problem found — one sentence per problem, joined. Never a stack. |
| `phases` | `{ shipped, queued, backlog }` counts, from `casp/state.json`. |
| `pace` | The measurement. See below. |
| `derived` | `phases_queued ÷ pace`, in weeks and as a date. `null` whenever the pace is not measurable or the queue is empty. |
| `claims` | Every anchor and due, marked `ahead` / `due` / `passed` against `today`. |
| `findings` | Exactly the `CASP-SCHEDULE-*` findings `casp check` would emit. |

## `pace` — measured, never stored

The rate is walked from `git log -- casp/state.json`, reading
`phases_shipped.length` out of each commit's blob, and it is **recorded
nowhere**. A pace written into a file drifts from the real one by construction
the moment the project speeds up or stalls, and the tool would then be asserting
a number nothing verifies — the exact defect the facts layer exists to catch. So
it is measured live, every run.

```jsonc
"pace": {
  "measurable": true,
  "window_weeks": 8,          // --since overrides; ALWAYS reported next to the rate
  "walk_cap": 400,
  "commits_in_window": 12,
  "first_commit": "8c42684", "first_date": "2026-07-18",
  "last_commit":  "555d590", "last_date":  "2026-09-10",
  "span_days": 54,
  "phases_shipped_delta": 20,   // a difference of LIST SIZES, not a ship count
  "phases_per_week": 2.59,
  "reason": null              // the sentence, when measurable is false
}
```

Two properties worth relying on:

- **The window is recent by default and always reported.** Averaging the whole
  history is wrong for any project whose pace changed, and every project's pace
  changes. A rate whose window is invisible is a number the reader cannot
  discount.
- **The window is anchored on `today`, not on the newest commit.** A cockpit
  whose last state commit is six months old has not been shipping at its old
  pace, and pinning the window to that commit would report as if it had.

`phases_shipped_delta` is `last.length - first.length`, so a **rename** inside
the window (one entry removed, one added) reads as zero and a window containing
only renames reports "did not grow" rather than a rate. That is deliberate — the
alternative is a rate computed from a set difference CASP cannot attribute — but
it means the number is a floor on shipping events, not a count of them.
`commits_in_window` likewise counts only commits whose `casp/state.json` blob
parsed; an unparseable historical state is skipped silently.

`--since` is **clamped**, never rejected: a value below 1 or above 5200 weeks
falls back or clamps rather than exiting non-zero, because this verb reports.

When fewer than two state commits fall in the window, when they all land on the
same day, or when the count did not grow between them, `measurable` is `false`,
`phases_per_week` is `null`, `derived` is `null`, and `reason` says which. **casp
never invents a rate.**

## `derived` — arithmetic, not a forecast

```jsonc
"derived": { "queued": 8, "weeks": 3.1, "date": "2026-10-01",
             "method": "phases_queued ÷ measured pace — arithmetic, not a forecast" }
```

Phases are not uniform, so the quotient is not a delivery date and a consumer
that treats it as a commitment is misreading it. The date is printed anyway
because refusing to print it while printing the quotient is theatre — the reader
adds it to today either way. What is refused is a number whose method is
invisible.

## `claims`

```jsonc
{ "kind": "due", "id": "deploy-diagnostics", "date": "2026-10-18",
  "list": "queued", "before": null, "state": "ahead", "days": 38 }
```

`kind` is `anchor` or `due`; `id` is the anchor id or the phase name; `list` is
which phase list holds the phase (`null` → `CASP-SCHEDULE-002`); `days` is signed
and goes negative once the date has passed.

The human rendering draws these on a timeline. **`--json` carries the list only**:
a picture is not a machine contract.

## `findings`

`code` (`CASP-SCHEDULE-00N`), `severity` (`warn` | `fail`), `label`, `detail`,
`fix` — the same objects `casp check` reports. A `fail` here blocks a push there;
a `warn` never does, **and a warn caused by the clock never becomes a fail**. See
[rules.md](./rules.md#severity-doctrine--the-clock-can-add-a-warn-and-can-never-add-a-fail).
