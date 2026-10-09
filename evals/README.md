# Evals for `building-accessible-ui`

This directory holds a [skill-creator](https://github.com/anthropics/claude-plugins-official)
eval loop for the skill in `../skills/building-accessible-ui/`. It's eval tooling for the
skill, not part of the skill itself — nothing here ships when the skill is used or packaged.

## What's here

- `evals.json` — 9 test prompts (7 adapted from upstream `microsoft/a11y-llm-eval` scenarios,
  2 new ones) with human-readable expectations.
- `files/account-settings.html` — seeded input page for eval 8 (deliberately contains a few
  out-of-scope accessibility issues, to check that the skill reports them rather than
  silently rewriting unrelated code).
- `axe_check.mjs` + `grade_axe.py` — base grading layer: runs axe-core against each run's
  delivered HTML and merges one pass/fail expectation into its `grading.json`.
- `fetch-upstream.sh` + `grade_upstream.py` — optional second grading layer (see below).
- `run_cli_eval.py` — runs every eval headlessly through `claude -p`, pinned to an exact
  model, with and without the skill installed (see [Running the loop](#running-the-loop)).
- `strict_summary.py` — zero-defect scoring (a run passes only if every defect check passes),
  matching the a11y-llm-eval report metric.
- `build_review.py` — builds skill-creator's review viewer, escaping `</script>` in the
  embedded HTML outputs so the viewer doesn't break.
- `audit_fixture/` + `check_audit_report.mjs` + `run_audit_eval.mjs` — a seeded sample page with an
  answer key, and a checker and runner for the `accessibility-reviewer` agent's reports (see
  [Audit agent check](#audit-agent-check)).
- `trigger_eval.json` + `trigger_check.py` + `trigger_fixture/` — checks whether the skill's
  description makes it fire on the right requests (see [Trigger checks](#trigger-checks)).
- `run_trigger_eval.py` — runs skill-creator's own trigger eval inside the Claude Code sandbox.

## Grading has two layers

**Base layer** (`grade_axe.py`, always available): one generic axe-core check per run, plus
whatever the skill-creator grader subagent judges from `evals.json`'s scenario- and
process-level expectations (fieldset/legend grouping, `aria-describedby` links, focus
management, and so on — read from the markup and the run's transcript).

**Upstream layer** (`fetch-upstream.sh` + `grade_upstream.py`, optional): the 7 scenarios
adapted from upstream also have much more thorough, purpose-built Playwright behavioral
checks in `microsoft/a11y-llm-eval` — real keyboard interaction (Escape closes a dialog,
arrow keys move between radios, Space toggles a checkbox), focus trapping, and so on. Rather
than re-implement or copy those, `fetch-upstream.sh` downloads a **pinned commit's** tarball
of just `node_runner/` and `test_cases/` into `evals/.upstream/` (gitignored, not vendored),
and `grade_upstream.py` runs them against each run's output, merging their results in as
`"[upstream] ..."` expectations. A run with no HTML, or one where the runner crashes, gets a
failing `[upstream]` expectation instead of being skipped, so it can't count as clean.

This layer is optional by design — nothing else in this eval loop depends on it — because
those checks are coupled to that repo's class-name conventions (`form-field`, `trigger`,
`example`, `details`) and its own `node_runner` helpers. The 7 adapted prompts in
`evals.json` keep those class-name requirements so the upstream checks can find the right
elements; evals 8 and 9 are new scenarios with no upstream equivalent and are graded by the
base layer only.

### Running the upstream layer

```bash
./evals/fetch-upstream.sh          # idempotent; no-ops if already at the pinned commit
python3 evals/grade_upstream.py evals/workspace/iteration-1
```

Both `evals/` and `evals/.upstream/a11y-llm-eval/node_runner` need their own
`node_modules` (Playwright + axe-core). `npm i` in `evals/` and `fetch-upstream.sh`'s
`npm ci` in the upstream checkout handle that. Both use Playwright `1.56.0` (exact pin in
`evals/package.json`; upstream's lockfile) so they share one cached Chromium build. If you
bump the upstream pin, check its lockfile and match `evals/package.json` to it.

### Bumping the pin

Edit `UPSTREAM_SHA` at the top of `fetch-upstream.sh`, then re-run it (it detects the SHA
changed and re-fetches). Check whether any `test_cases/*/prompt.yaml` `common_requirements`
changed upstream — if so, update the matching prompts in `evals.json` to match, or the
upstream checks will fail to find elements they used to find by class name.

## Running the loop

This follows the skill-creator loop (runs with and without the skill, grading, aggregating,
review viewer), but uses `run_cli_eval.py` to produce the runs instead of subagents. The CLI
pins an exact model ID and starts each run in an empty directory with no repo context,
CLAUDE.md, or user plugins. From the repo root:

```bash
npm i --prefix evals                     # base-layer deps (once)
./evals/fetch-upstream.sh                # upstream layer (optional, once)

# 9 evals × 2 configs × 4 runs = 72 runs
python3 evals/run_cli_eval.py --model claude-sonnet-4-6 \
  --workspace evals/workspace/sonnet46 --scratch "$TMPDIR/s46" --runs 4

python3 evals/grade_axe.py evals/workspace/sonnet46
python3 evals/grade_upstream.py evals/workspace/sonnet46      # optional
python3 evals/strict_summary.py evals/workspace/sonnet46 --write
```

Each run's `meta.json` records the model that answered, whether the Skill tool was invoked,
and which skills were visible at start, so you can confirm the with/without split held.
Use `--only name1,name2` to re-run specific evals and `--run-start N` to add more runs to
an existing workspace.

For the full skill-creator view, add LLM-graded expectations (skill-creator's grader
subagents, reading `evals.json`), then aggregate and build the viewer:

```bash
python3 -m scripts.aggregate_benchmark evals/workspace/sonnet46 --skill-name building-accessible-ui  # from skill-creator's dir
python3 evals/build_review.py evals/workspace/sonnet46          # writes review.html
```

Without LLM grading, `strict_summary.py` reports only the programmatic view (axe +
upstream) and says so in its table.

## Trigger checks

`trigger_eval.json` has 24 requests: 12 that should fire the skill (build, change, or review
UI, or write a UI spec or plan) and 12 that shouldn't (backend, tooling, refactors). Each one
runs in a copy of `trigger_fixture/`, a small fake app, so requests that name files refer
to files that exist.

```bash
python3 evals/trigger_check.py --model claude-sonnet-4-6 --desc current=- --runs 3 \
  --out evals/workspace/trigger
python3 evals/trigger_check.py --model claude-sonnet-4-6 \
  --desc current=- --desc candidate=path/to/description.txt --runs 3 --out evals/workspace/trigger
```

`trigger_check.py` installs the real skill (optionally with a different description) and
stops each run as soon as the model invokes the skill, starts writing files, makes 10 tool
calls, or hits `--timeout`. It prints fire rates per group and lists every should-trigger
miss. Use it rather than skill-creator's `run_eval.py`, which only counts the skill if it's
the first tool call and badly under-reports triggering for this skill. `run_trigger_eval.py`
is kept for comparison with skill-creator's numbers.

## Audit agent check

`audit_fixture/index.html` is a small class roster with 12 seeded defects and 8 decoys that look
suspicious but are correct. `audit_fixture/expected.json` is the answer key: for each seed, its
WCAG SC, the allowed severity range, the report tier it belongs in (card, Minor row, or Needs
verification) and the expected instance count. The seeds are chosen to exercise the report
template: the hover-only tooltip appears on 3 bubbles and must come back as **one** issue with
3 instances, the contrast failure only shows in the hover and open state, the reflow failure
only shows at 320px, and the live-region seed can't be confirmed without a screen reader, so
it belongs under Needs verification. Don't fix the seeds. `index.html` has no comments, so an audit of it is blind: it is what the runner copies into the scratch directory. `index.annotated.html` is the same page with SEED and DECOY comments for maintainers; keep it, `index.html` and the key in sync, and never point the agent at the annotated copy or the key.

`check_audit_report.mjs` scores a report folder (`report.md`, `report.html`, screenshots)
deterministically, with no LLM grading:

- **Content:** each seed found, in the right tier and severity range, merged into one issue;
  decoys not reported. Extra issues not in the key print as warnings, not failures, since the
  agent may find real defects that weren't seeded.
- **Digest:** with `--digest <final-message>`, the chat message is a short digest (60 lines or fewer, one Fix first, one line per issue, a `Full report:` path and an `Open it:` line, no evidence or images).
- **Noise:** only the template's sections, no stray paragraphs inside the table sections, no issue index table, length caps on Why this severity and Observed.
- **Structure:** Fix first list of 3 or fewer, headline format, one SC per card, screenshots
  embedded and present, no Minor or Low-confidence cards, severity ordering, no "fully
  accessible" claim, and a `report.html` with `<details>`, inlined images and no axe violations.

```bash
npm i --prefix evals                                  # once
node evals/check_audit_report.mjs path/to/audit-out   # score a saved report
node evals/check_audit_report.mjs path/to/audit-out --skip-axe --json
```

Corrections the maintainer gives (`docs/audit-corrections.md`) are tested here when they can be: the
seeds tagged `correction` in `expected.json` check that the agent applies them. To add one, add or
adjust a seed and its key entry, then update the sample reports by hand.

`skills/building-accessible-ui/scripts/render-report.mjs` turns a report into the HTML page; `sample/good/report.html` is its output, axe-checked by the checker.

`sample/good` and `sample/broken` are hand-built reports that test the checker itself (see
`audit_fixture/sample/README.md`).

`run_audit_eval.mjs` runs the agent headlessly against the fixture and scores it. It loads this
repo as the plugin (`--plugin-dir`), pins the model, and starts each run in an empty directory:

```bash
node evals/run_audit_eval.mjs --model claude-sonnet-5-5 --runs 3 --via direct
node evals/run_audit_eval.mjs --model claude-sonnet-5-5 --runs 1 --via subagent
```

`--via direct` runs the session as the agent (`claude --agent`) and tests the audit and report
format. `--via subagent` has a main agent delegate to it, so the final message is the caller's and the
digest check also tests that the digest survived the hand-off. Output goes to
`evals/workspace/audit/run-N/`. Agent output varies, so use `--runs 3` or more, and read the
list of checks that didn't pass in every run.

If Playwright's own Chromium isn't installed, set `PW_CHANNEL=msedge` (or `chrome`) for
`axe_check.mjs` and the checker. The runner passes the same hint to the agent.

## Live-region probe

`skills/building-accessible-ui/scripts/live-region-probe.mjs` records status messages (4.1.3) in a real browser, including text added to a shared announcer and removed milliseconds later. `live_fixture/patterns.html` has ten patterns (a transient announcer, a region inserted with its text, a `display:none` region, a clear-and-refill, a plain paragraph, a persistent announcer, `role=alert`, a replaced message, and status regions inside an open and a closed shadow root). `test_live_probe.mjs` checks that the probe classes each one correctly:

```bash
PW_CHANNEL=msedge NODE_PATH=evals/node_modules node evals/test_live_probe.mjs
```

The probe shows what the browser exposes. It can't show what a screen reader speaks, so the audit fixture's announcer seed (the "Add student" button) can only land under Needs verification.

## Environment notes

- `run_trigger_eval.py` and `build_review.py` look for skill-creator in the Claude Code
  plugin cache (`~/.claude/plugins/cache/claude-plugins-official/skill-creator/`). Set
  `SKILL_CREATOR_DIR` to the skill-creator skill's directory to use another copy.
- Scratch directories default to the system temp dir; pass `--scratch` to change them.
- Inside the Claude Code sandbox, Chromium can't launch, so `grade_axe.py` and
  `grade_upstream.py` fail every run. Run them outside the sandbox.
- `claude -p` runs are billed to your account. A full 72-run pass takes a while; start
  with `--only` and `--runs 1`.
