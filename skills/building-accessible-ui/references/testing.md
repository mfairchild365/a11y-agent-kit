# Testing

Run automated accessibility tests as part of the deliverable. Writing or configuring a test is not enough — execute it, fix every non-best-practice violation, re-run, and report the result.

## 1. Opt-out gate

Skip testing only when the project explicitly opts out via `CONTRIBUTING`, `AGENTS.md`, `README`, a skill-local instruction, or the user saying to skip. Absence of existing tests is **not** an opt-out.

## 2. Strategy — pick the first that fits

1. **Existing a11y tests** (axe, Playwright + axe, jest-axe, pa11y, Lighthouse CI, Espresso `AccessibilityChecks`, `XCUIAccessibilityAudit`, etc.): extend that suite.
2. **Existing test framework, no a11y tests**: add accessibility tests to the runner in use, matching its conventions.
3. **No framework**: run the UI in a rendered browser and call `axe.run()`. See §3.

## 3. Rendered-browser check (Strategy 3)

Load the UI in a real browser, inject axe-core, run `axe.run()`, and fail on any non-best-practice violation. Use whatever runtime is available. Probe runtimes once each in order — stop at the first that works. Don't reason about availability; run the probe.

**Assume Playwright and Node are already installed.** Probe with one short command; if it works, go straight to the script. **Do not run `pip install playwright`, `pip install axe-playwright-python`, `npm install playwright`, or `playwright install <browser>` unless the probe fails.** Those commands download hundreds of MB or emit multi-line pip warnings that will blow the context on the next turn. Don't pip-install wrapper libraries like `axe-playwright-python` — use the documented `page.add_script_tag(path="/tmp/axe.min.js")` pattern below.

| # | Runtime | Probe | Only if the probe fails |
|---|---|---|---|
| 1 | Python + Playwright | `python -c "import playwright"` | `pip install --quiet --no-input 'playwright~=1.55.0' >/dev/null 2>&1` (then re-probe; do **not** run `playwright install`) |
| 2 | Node + Playwright/Puppeteer + `axe-core` | `node -v` | `npm i --silent --no-progress -D axe-core playwright >/dev/null 2>&1` |
| 3 | Browser MCP tool (e.g. `playwright` MCP) | tool listed? | — |
| 4 | JSDOM + `axe.run(document)` | last resort; misses layout/focus/forced-colors | — |

If `import playwright` succeeds but `chromium.launch()` fails with "Executable doesn't exist", the browser binary is missing. Use `playwright install chromium >/dev/null 2>&1` — redirect the output, or the progress bar will occupy ~1–2k tokens per turn for the rest of the task.

### Python + Playwright example

Fetch axe-core to disk first (once), then have Playwright load it by path. Never read the axe source into Python or print it.

```bash
# once, silently
[ -f /tmp/axe.min.js ] || curl -sSfLo /tmp/axe.min.js https://cdn.jsdelivr.net/npm/axe-core/axe.min.js
```

```python
from playwright.sync_api import sync_playwright
import json, sys

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.set_content(open("out.html").read(), wait_until="load")
    page.add_script_tag(path="/tmp/axe.min.js")   # path=, NOT content=
    r = page.evaluate("async () => await window.axe.run()")
    b.close()

wcag = [v for v in r["violations"] if "best-practice" not in v.get("tags", [])]
bp   = [v for v in r["violations"] if "best-practice" in v.get("tags", [])]
print(json.dumps({"wcag": [{"id": v["id"], "impact": v["impact"], "targets": [n["target"] for n in v["nodes"]]} for v in wcag],
                  "bp":   [{"id": v["id"], "targets": [n["target"] for n in v["nodes"]]} for v in bp]}))
sys.exit(1 if wcag else 0)
```

Axe source in fallback runtimes: `require("axe-core").source` (Node), a vendored/`node_modules` copy if present, or the `curl` line above.

Keep tool output minimal: `pip install --quiet`, `npm --silent`, `curl -sSfL`, pipe chatty commands through `2>&1 | tail -5`. Every line a tool prints is re-sent to the model on the next turn.

If every runtime fails, report the first command you ran, its exact stderr, and what would unblock it. "Environment seems limited" is not a report.

## 4. Fix, re-run, report

- Fix every non-best-practice violation. Re-run until clean. Best-practice items are warnings, not failures.
- **Re-run after every post-test edit.** A passing run only certifies the bytes that were tested. If you change the artifact afterwards — even "just styling" or "just a rename" — the previous result is stale. Re-run the same probe against the final artifact before submitting. The submitted artifact and the last tested artifact must be byte-identical.
- In your summary include: pass/fail, violations list (`id`, `impact`, targets), which strategy + runtime you used, and any violation intentionally not fixed (with reason — e.g. pre-existing markup per `SKILL.md` rule 5).

## Status messages

To test a status message (4.1.3), run `scripts/live-region-probe.mjs` in the skill folder on a freshly loaded page. It records live-region changes that are added and removed within milliseconds, which a look at the DOM misses. It shows what the browser exposes, not what a screen reader speaks. Usage is in `references/audit-procedures.md`, entry 4.1.3.

## Tree pass and keyboard walk

Two scripts in the skill's `scripts/` folder give a review repeatable evidence from a real browser. Run them on the rendered UI, beside axe, when you review existing UI. They are not a substitute for axe, and not a place to add tests to a project.

| Script | What it reads | What it reports |
|---|---|---|
| `tree-pass.mjs` | The browser's accessibility tree, which every screen reader reads | `interactive-no-name`, `label-not-in-name`, `repeated-link-name`, `repeated-control-name`, `aria-hidden-focusable`, `duplicate-landmark-name`, `multiple-main`, `no-main`, `heading-level-skip`, `no-h1` |
| `keyboard-walk.mjs` | Where focus lands as it presses Tab | `focus-no-name`, `unreachable-by-tab`, `focus-cycle-candidate`, `focus-stuck-candidate`, `tabindex-positive` |

```bash
node <skill folder>/scripts/tree-pass.mjs <url or html file> --json
node <skill folder>/scripts/keyboard-walk.mjs <url or html file> --json
```

Run them from a folder that has Playwright installed, or set `NODE_PATH` to its `node_modules` folder. `PW_CHANNEL=msedge` (or `chrome`) uses an installed browser. Drop `--json` for a readable list.

How to read the output:

- **Candidates, not verdicts.** Each finding is a lead. Reproduce it before it goes in a report (the real keyboard for the walk, the tree for the pass), then set the confidence from that. See `audit-calibration.md` section E.
- **`stopReason`.** `complete` means the whole page was covered. Anything else (`node-cap`, `load-timeout`, `stop-cap`, `time-cap`, `cycle`, `stuck`, `modal-cycle`) means it stopped early and says why. Name it under Checks, and don't conclude that something is missing from a page the script didn't finish.
- **What they don't check:** visible focus, contrast, reading order, target size, hover and focus content, status messages (use `live-region-probe.mjs`), or what a screen reader says. Cross-origin frames are skipped or counted as one stop.
- **Don't treat a clean run as a pass.** It means these narrow checks found nothing.

## Reaching signed-in and deep states

A review of a page behind a sign-in, a setup step or a particular state needs that state first. In order:

1. **Use the project's own way in.** Its test fixtures, saved sign-in state, seed or mock server, Storybook story, or the Playwright setup its tests already use. Don't build a second one.
2. **Drive the page to the state** (open the dialog, trigger the error, expand the menu) with the real keyboard and clicks, then run the scripts and axe there. A script that loads a URL sees only what loads by itself, so for a state you reach by interaction, check it by hand or script the interaction first.
3. **If there is no way in, ask the user** how to reach it. Never guess a password, never write credentials, tokens or a saved sign-in file into a report, a scratch file you leave behind, or the project.
4. **Frames.** The scripts cover same-origin frames and open shadow roots. Content in a cross-origin frame is opened at its own URL as a separate pass, and the report says so.

## Project conventions

Before you audit or fix, read the notes the project keeps for contributors and agents (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING`, an accessibility doc, or the README). Follow what they say about:

- the component library: which wrapper components already handle accessibility, and where a library defect is fixed (see `audit-calibration.md` section E)
- the copy and translation workflow, including files you must not edit
- the styling approach and the import conventions
- how to run the project's accessibility tests, and how to sign in for them

They win over the generic advice here. This file doesn't define a format for them, and you don't create one. Checks that belong to one company or one product (its components, its routes, its sign-in) live in that project's own test suite and notes, not in this skill.

## Turning a reported issue into a fix with a test

When you fix an issue from an audit report, each full card has a **Guard**: the smallest check that fails now and passes after the fix.

- **Automatable Guard, and the project hasn't opted out (§1).** Write the test first, in the project's own strategy (§2). Run it and confirm it fails for the reason the report gives. Then fix, run it, and confirm it passes. §4 still applies: re-run on the final artifact.
- **Manual Guard.** Don't invent a test. Do the check by hand after the fix, and list it in your summary as a check that is still manual.
- **Opted out.** Don't add tests. Say that the Guards were not turned into tests, and why.
- Report which Guards became tests, which stayed manual, and the before and after result of each test.

## Process safety

- Stop only what you started, using the handle you got when you started it: `browser.close()` for a browser you launched, the PID you recorded for a server you spawned.
- Never stop processes by name or command-line match (`taskkill /IM`, `pkill -f`, `Stop-Process` with a filter, `killall`). Those also hit the user's own browsers, dev servers and editors.
- If a dev server or Storybook is already running, reuse it and leave it running.

## Common failure modes

- Declaring the environment unusable after one `pip list | grep` or `which node` — probe by importing/invoking.
- Running `pip install playwright` or `playwright install chromium` without probing first. Probe → run script. Only install on failure, and always redirect the output.
- Passing `--quiet` to a command that doesn't support it (e.g. `playwright install --quiet` is not valid). Use `>/dev/null 2>&1` or `2>&1 | tail -5` instead.
- Writing tests but not running them. Configuring ≠ testing.
- Editing the artifact after the last passing run and submitting without re-testing. The clean result no longer applies.
- Flipping best-practice / WCAG severity.
- Letting verbose install output (pip downloads, curl progress, `playwright install` chatter) fill the context. Use quiet flags *and* redirect.
- Reading the axe source into your script (`open(axe).read()`, `urlopen(...).read()`, `require("axe-core").source` printed to stdout).
