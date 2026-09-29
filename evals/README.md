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
`"[upstream] ..."` expectations.

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
`npm ci` in the upstream checkout handle that. Both pin Playwright to `1.56.0` so they
share one cached Chromium build.

### Bumping the pin

Edit `UPSTREAM_SHA` at the top of `fetch-upstream.sh`, then re-run it (it detects the SHA
changed and re-fetches). Check whether any `test_cases/*/prompt.yaml` `common_requirements`
changed upstream — if so, update the matching prompts in `evals.json` to match, or the
upstream checks will fail to find elements they used to find by class name.

## Running the loop

This follows the standard skill-creator flow (see the `skill-creator` skill for the full
loop — spawning with/without-skill runs, grading, aggregating, and launching the review
viewer). In short, from the repo root:

```bash
npm i --prefix evals                     # base-layer deps (once)
./evals/fetch-upstream.sh                # upstream layer (optional, once)

# ... spawn the 18 runs into evals/workspace/iteration-1/... (see skill-creator) ...

python3 evals/grade_axe.py evals/workspace/iteration-1
python3 evals/grade_upstream.py evals/workspace/iteration-1   # optional
# ... LLM grader subagents add the evals.json expectations ...

python3 -m scripts.aggregate_benchmark evals/workspace/iteration-1 --skill-name building-accessible-ui
python3 eval-viewer/generate_review.py evals/workspace/iteration-1 --skill-name building-accessible-ui \
  --benchmark evals/workspace/iteration-1/benchmark.json --static evals/workspace/iteration-1/review.html
```

(The `scripts.aggregate_benchmark` and `eval-viewer/generate_review.py` paths are inside
the installed `skill-creator` skill, not this directory.)
