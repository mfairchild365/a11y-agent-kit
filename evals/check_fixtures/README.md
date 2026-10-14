# Fixtures for deterministic checks

Any script this kit ships that decides something on its own (a tree pass, a keyboard walk, a probe) must
have a test suite here, or it doesn't ship. False positives are the main risk, so the negative
fixtures matter most. The runner is [`../run_check_fixtures.mjs`](../run_check_fixtures.mjs).

## Layout

```
evals/check_fixtures/<check>/
  check.json                      how to run the check
  positive/<name>.html            must be flagged
  positive/<name>.expected.json   its answer key
  negative/ edge/ termination/    same shape
```

A directory whose name starts with `_` is ignored by the runner (`_selftest/` holds a stub check used to
test the runner itself).

## check.json

```json
{ "script": "skills/building-accessible-ui/scripts/<name>.mjs", "args": ["{fixture}"], "timeoutMs": 20000 }
```

`script` is relative to the repo root. `{fixture}` becomes the absolute path of the fixture. The check
must print one JSON object to stdout: `{ "findings": [{ "id": "..." }], "stopReason": "..." }`.
`stopReason` is required of any check that can loop or cap itself.

## The four kinds, all required

| Kind | What it proves | Answer key |
|---|---|---|
| `positive` | The check flags each failure mode. One fixture per mode. | `findings` lists every id it must report, at least one |
| `negative` | The check stays quiet on markup that is correct. Use the "does not fail" boundaries in `references/audit-procedures.md`. | `findings` is `[]` |
| `edge` | It copes with shadow DOM, iframes, `display: contents`, `inert`, off-screen content, dynamic inserts, `tabindex > 0`, SVG, custom elements. | `findings` lists what it must report, possibly none |
| `termination` | It stops on pages that would loop (focus cycles, a trap, infinite scroll, a control that re-creates itself). | `findings` plus a required `stopReason` |

A kind that truly doesn't apply to a check needs a written reason in `check.json`, which the runner
checks: `"skipKinds": { "termination": "the check reads one snapshot and never loops" }`.

## How a fixture is judged

The check's reported ids must equal the answer key's ids exactly. A missed id, an extra id (a false
positive), the same id reported twice, a wrong `stopReason`, a timeout, output that isn't JSON, or a
fixture with no answer key each fail the run. `../test_check_runner.mjs` proves the runner does this.

## Rules

- **Generic only.** No company, brand, product or internal-tool names, in fixtures or anywhere else that
  ships. `node scripts/check_generic.mjs` enforces this against a hashed blocklist.
- **A check's output is evidence, not a verdict.** A suspected trap or order problem is a candidate the
  reviewer confirms in the browser; it never becomes a finding on script output alone.
- Write the fixtures before the check, and add a negative fixture for every false positive you meet later.
