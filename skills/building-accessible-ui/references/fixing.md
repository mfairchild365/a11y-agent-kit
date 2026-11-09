# Fixing accessibility issues: from a ticket or report to a checked fix

Use this when someone asks you to fix accessibility issues: a ticket, a pasted description, a screenshot, or an audit report. The loop is: **evidence, locate, plan (and wait for approval), fix, verify**. The plan is where the user decides; verify is where the result is checked by something other than your own say-so.

The reviewer agent stays read-only. It is the source of the evidence before and after; you make the change.

## 1. Intake and evidence

- The ticket can be text, a file, a screenshot or a URL. Use whatever tool your environment has to read it. Don't build an integration. Name the work after the ticket id if there is one.
- Get an audit report of the scope the ticket names, **before** you change anything. Ask the reviewer agent for one, or use the report you were given. This is the "before" side of the verify step. Without it you can't show what changed.
- Use the report's issue keys as they are written (`<SC>|<element>`). Don't invent your own labels for issues.

## 2. Locate, ticket first

1. Find the component the ticket names before any broad search: its visible strings, its i18n keys, its route, its test ids.
2. Decide library or consumer (`audit-calibration.md`, section E). A defect in a shared component is fixed there, once. A defect in how a page uses it is fixed in the page.
3. Then look for other instances of the same defect. List them in the plan; fix only the ones the ticket covers unless the user approves more.

## 3. Detect the test setup, then plan

Run the detector so the plan names the project's real setup instead of guessing:

```bash
node <skill folder>/scripts/detect-a11y-tests.mjs <project folder>
```

It reports the accessibility tooling it finds (jest-axe, vitest-axe, `@axe-core/playwright`, cypress-axe, pa11y, Lighthouse CI, the Storybook a11y addon, axe-core alone), the test runners, the test files that already call axe or pa11y, and a `setup` class. It reads only the repository. A project can test accessibility in ways it can't see, so treat the output as evidence, not a verdict.

**The plan comes before the edit, every time.** "Fix the issues in this report" is the request this rule is for: it is not approval to skip the plan, and neither is a small or easily reverted change. If your tool has a plan mode, use it: explore read-only, write the plan, and the user's approval of the plan is the gate (in Claude Code, `EnterPlanMode`, then `ExitPlanMode`). If it doesn't, write the plan to `a11y-fix-plan.md` and **stop until the user approves in words**. Don't edit project files before then. The only file you write before approval is the plan.

### Plan template

````markdown
# Fix plan: <ticket id or short name>

## What the ticket asks
<one or two sentences, in the user's terms>

## Targets
<the issues this change will resolve, one per line, by report key>

```a11y-plan
{
  "targets": ["4.1.2|Close button"],
  "renames": [],
  "guards": [
    { "target": "4.1.2|Close button", "kind": "automatable", "test": "src/dialog.a11y.test.tsx::close button has a name", "waiver": null }
  ]
}
```

## Files and changes
<each file, and what changes in it>

## Library or consumer
<where the defect is fixed, and why>

## What will not change
<out-of-scope issues you saw, listed for the user, not touched>

## Risks
<what could break, and who would notice. If the change swaps an element type (`div` to `button`, `div` to `header`, `span` to `a`), add an "Element change" line: the selectors that depend on the old element (`div.x`, `div > y`, `:first-of-type`, `querySelector('div.x')`, a test that finds it by tag), the browser defaults the new element brings (padding, border, margin, display), and a risk level: low (class selectors only), medium (some element selectors, manageable), high (the CSS or the script needs changing first)>

## Test coverage
- **Strategy:** <existing a11y tests | the project's test framework | a rendered-browser check>, and why this one. Prefer a component-level test with axe over an end-to-end test when both exist; say so. Don't propose a test that would be slow or flaky.
- **Where:** <file path, runner, the conventions you found>
- **One line per Guard:** <target>: <the test, or "manual: <what to check>", or "waived: <reason>">
- **If the project has no accessibility tests:** "Add a minimal accessibility test setup, with one test per automatable Guard" is its own plan item. The user approves or declines it. A decline is recorded here ("no tests for this change: <reason>"), never silent.
````

Rules for the `a11y-plan` block (the verify script reads it, so keep it valid JSON):

- `targets`: the report keys the change will resolve. A best practice item is `best practice|<element>|<description>`.
- `renames`: `old=new`, for an element the fix changes in a way that changes its key (a button whose name changes from "X" to "Y").
- `guards`: one entry per target. `kind` is `automatable` or `manual`. An automatable Guard names a `test` (`path` or `path::test name`) **or** gives a `waiver` with a real reason (the project opted out; no runner). "TODO" and "n/a" are not reasons.
- The block must be the only `a11y-plan` block in the file.
- Fix only the targets. An issue the report triaged as a ticket, or marked manual, goes under "What will not change" unless the user asks for it. A `manual` Guard never gets a test, not even a text check that stands in for it: it is checked by hand, and the summary says so.

### Encouraging tests, without forcing them

- Writing a test is the default. Skipping one is allowed, but it is visible and has a reason. Nothing here blocks a change.
- Don't add tests in a project that opted out (`testing.md`, section 1). Say so in the plan.
- After the fix, you may suggest **at most two** broader tests, each tied to a finding in this change (for example: "run axe `button-name` on every route in the existing a11y spec", because the same unnamed-button pattern showed up on three pages). No generic "add more tests" advice.

## 4. Implement after approval

- Guards first (`testing.md`, "Turning a reported issue into a fix with a test"): write each automatable Guard as a test, watch it fail for the reason the report gives, fix, watch it pass.
- Stay inside the approved plan. If you find you need another file or another issue, stop and amend the plan with the user.
- Respect existing code (`SKILL.md`, "Respect existing code"). Never remove an existing affordance without an equal or better replacement.
- **Before you change an element's type**, read the styles that apply to it and the scripts and tests that find it, and list what depends on the old element. A fix that makes the markup correct can still lose its styling, or break a script, without any error. If the risk is high, sort the CSS or script out first, as its own step in the plan. After the change, look at the rendered result: reading selectors catches the common cases, not all of them (a global stylesheet, an ancestor rule, a utility class, CSS-in-JS or a library's own styles can reach the element from elsewhere), and a low risk level means you found nothing, not that nothing will break.

## 5. Verify

Get an audit report of the same scope **after** the change, then:

```bash
node <skill folder>/scripts/verify-fix.mjs before-report.md after-report.md --plan a11y-fix-plan.md \
  --changed-files changed.txt --format pr
```

`changed.txt` is `git diff --name-only`. The script prints one verdict:

| Verdict | Meaning |
|---|---|
| `regressed` | A new issue appeared, or an issue that is still open got worse. This is a **candidate**: a better scan or a moved selector can also produce one, so confirm it. |
| `fixed` | Every target is resolved and nothing new appeared. |
| `partial` | Some targets are resolved. |
| `unchanged` | No target is resolved. |
| `invalid-targets`, `unparseable` | The input was wrong; the message says how. Nothing was verified. |

It also accounts for each Guard (`covered`, `waived`, `uncovered`, `manual`) beside the verdict, never inside it. A fix can be `fixed` with an `uncovered` Guard; the summary says so loudly.

To compare what the scripts find, not just what the reports say, take a snapshot before and after:

```bash
node <skill folder>/scripts/snapshot.mjs <url or html file> --out before.snapshot.json
# ... make the change, rebuild or reload ...
node <skill folder>/scripts/snapshot.mjs <url or html file> --out after.snapshot.json
node <skill folder>/scripts/verify-fix.mjs before-report.md after-report.md --plan a11y-fix-plan.md \
  --before-snapshot before.snapshot.json --after-snapshot after.snapshot.json
```

A script that stopped early, crashed or timed out on either side is **not comparable** and is reported that way. It is never read as "all resolved".

Put the `--format pr` output in the pull request description. Report what the verdict does not say: which Guards stayed manual and what to check by hand, which tests were added (paths), which waivers were given and why.

## 6. Keep a record (optional)

A record lets the next audit find this one, and lets a reviewer see the plan, the verdict and what was waived without reading the chat. **Only keep one when the user, or the project's own notes, say where records go.** Never create the folder on your own: a record nobody asked for is clutter that goes stale.

```bash
node <skill folder>/scripts/verify-fix.mjs before-report.md after-report.md --plan a11y-fix-plan.md \
  --record <records folder> --id <ticket id or a short name>
```

It writes `<records folder>/<id>/run-001/` (then `run-002`, and so on; a run is never overwritten) with `plan.md`, `before.report.md`, `after.report.md`, `verify.json` (versioned, with the date and the commit) and `summary.md` (the pull request summary). It does not keep the report's HTML or screenshots: they are large, change on every run, and are where account data is likeliest to end up. A run that verified nothing (invalid targets, reports it can't read) is not recorded.

- **Commit it.** The files are text and small, and the point is that reviewers and the next audit can see them. The exception is below.
- **A signed-in page** (the scripts were run with `--storage-state`, or you pass `--signed-in`): the reports can show account data. The run gets a `.gitignore` that ignores everything in it, a note at the top of its summary, and a warning when it is written. Review the reports before you remove the `.gitignore`.
- **A re-check.** When a record exists for the scope, the previous report is the latest run's `after.report.md` (the highest `run-NNN`). Say which record you used. A record is a snapshot: if the page has changed since its date and commit, say so rather than treating it as current.
- **Don't** put credentials, a storage state file, tokens or screenshots in it, and don't edit a run by hand.

## What this loop does not do

It does not block a merge, add CI jobs, or keep a record across tickets. It does not prove the page is accessible: it shows that the issues the plan named are gone and that the scan found nothing new. A clean verdict is not a pass.
