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

## Running them

```bash
node evals/run_check_fixtures.mjs                      # every check
node evals/run_check_fixtures.mjs --check tree-pass    # one check
```

`tree-pass`, `keyboard-walk`, `focus-contrast`, `shift-tab-walk`, `arrow-walk` and `escape-return` drive a real browser: run them from a folder where Playwright is found (set `NODE_PATH` to `evals/node_modules`), and set `PW_CHANNEL=msedge` (or `chrome`) if Playwright's own Chromium isn't installed. `compare-reports` reads text only. `node evals/run_all_tests.mjs` runs all of them with the repo's other tests.

Registered checks: `tree-pass` (the accessibility tree), `keyboard-walk` (Tab through the page, with caps and a stop reason), `focus-contrast` (the contrast of each control's focus indicator), `shift-tab-walk` (the Tab walk against the Shift+Tab walk), `arrow-walk` (arrow keys in composite widgets), `escape-return` (Escape and focus return for dialogs, menus and popups) and `compare-reports` (resolved, still open and new issues between two reports; its fixture is one file holding both reports, split by a `<!-- NEW REPORT -->` line).

## Rules

- **Generic only.** No company, brand, product or internal-tool names, in fixtures or anywhere else that
  ships. `node scripts/check_generic.mjs` enforces this against a hashed blocklist.
- **A check's output is evidence, not a verdict.** A suspected trap or order problem is a candidate the
  reviewer confirms in the browser; it never becomes a finding on script output alone.
- Write the fixtures before the check, and add a negative fixture for every false positive you meet later.
- Prove the fixtures can fail: break the check one decision at a time (drop an exclusion, ignore a case) and confirm a fixture goes red each time. A suite that never fails proves nothing.
