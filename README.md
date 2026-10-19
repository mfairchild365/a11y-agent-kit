# a11y-agent-kit

Accessibility tooling for coding agents. It is one plugin with two parts:

- **`building-accessible-ui` skill.** It encodes WCAG 2.2 AA requirements for building UI, reviewing UI, and writing UI specs. The agent loads it on its own whenever it works on something users see or operate. See [`skills/building-accessible-ui/SKILL.md`](skills/building-accessible-ui/SKILL.md).
- **`accessibility-reviewer` agent.** A read-only auditor. It reviews UI code, a diff, or a page against the skill's checklist. It also runs the project's accessibility tests, or axe-core if there are none. It always checks the rendered UI in a real browser when one is available. It reports a short summary with a fix-first list, then findings grouped by element and WCAG criterion using [`audit-report.template.md`](skills/building-accessible-ui/references/audit-report.template.md). Serious findings get a full card (severity and why, screenshot, fix, and folded repro, observed vs. expected, elements, confidence); minor ones are table rows, and unconfirmed ones go under "Needs verification". It returns a short digest and writes a full `report.md` and a self-contained `report.html` (rendered by [`render-report.mjs`](skills/building-accessible-ui/scripts/render-report.mjs)), which it shows or opens for you. It never edits your code. It can run six scripts from the skill, [`tree-pass.mjs`](skills/building-accessible-ui/scripts/tree-pass.mjs) (the accessibility tree) [`keyboard-walk.mjs`](skills/building-accessible-ui/scripts/keyboard-walk.mjs) (Tab through the page) and [`focus-contrast.mjs`](skills/building-accessible-ui/scripts/focus-contrast.mjs) (the contrast of each control's focus indicator), [`shift-tab-walk.mjs`](skills/building-accessible-ui/scripts/shift-tab-walk.mjs) (the walk backward), [`arrow-walk.mjs`](skills/building-accessible-ui/scripts/arrow-walk.mjs) (arrow keys in tab lists, menus, listboxes and the like) and [`escape-return.mjs`](skills/building-accessible-ui/scripts/escape-return.mjs) (Escape and focus return for dialogs and menus), and confirms what they flag before reporting it. Each full finding carries a Guard (a test that fails now and passes after the fix, or a manual check), and given a previous report it says what is resolved, still open or new. See [`agents/accessibility-reviewer.agent.md`](agents/accessibility-reviewer.agent.md).

The skill was extracted, with its full commit history, from
[microsoft/a11y-llm-eval](https://github.com/microsoft/a11y-llm-eval/tree/main/config/skills/building-accessible-ui).

## Install

### Claude Code

```
/plugin marketplace add mfairchild365/a11y-agent-kit
/plugin install a11y-agent-kit@a11y-agent-kit
```

Claude Code shows the components as `a11y-agent-kit:building-accessible-ui` and `a11y-agent-kit:accessibility-reviewer`. To run a review, ask for one, for example "review the checkout form for accessibility", or pick the agent from `/agents`.

### GitHub Copilot

In Copilot CLI:

```
copilot plugin install mfairchild365/a11y-agent-kit
```

In VS Code, add `mfairchild365/a11y-agent-kit` to the `chat.plugins.marketplaces` setting and install the plugin from there.

### OpenAI Codex

```
codex plugin marketplace add mfairchild365/a11y-agent-kit
codex plugin add a11y-agent-kit@a11y-agent-kit
```

Codex plugins install the skill. Codex custom agents use a separate TOML format, so you install the reviewer yourself: copy
[`codex/agents/accessibility-reviewer.toml`](codex/agents/accessibility-reviewer.toml) to
`~/.codex/agents/` (all projects) or `.codex/agents/` (one project).

### Cursor

The plugin manifest is [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json). Until the plugin is listed in Cursor's marketplace, install the two parts separately:

1. Install the skill with `npx skills add mfairchild365/a11y-agent-kit`.
2. Copy `agents/accessibility-reviewer.agent.md` to `.cursor/agents/accessibility-reviewer.md`.

### Gemini CLI

```
gemini extensions install https://github.com/mfairchild365/a11y-agent-kit
```

### Any other agent (skill only)

```
npx skills add mfairchild365/a11y-agent-kit
```

This installs the skill into the right directory for each agent it detects. Most agents that support [Agent Skills](https://agentskills.io) read `.agents/skills/`.

## What works where

| Tool | Skill | Review agent | Tested |
|---|---|---|---|
| Claude Code | plugin | plugin | yes: install, component loading, and a live review |
| OpenAI Codex | plugin | manual TOML copy | plugin install only |
| GitHub Copilot (CLI / VS Code) | plugin | plugin | no, follows the docs |
| Cursor | `npx skills` / plugin | manual copy / plugin | no, follows the docs |
| Gemini CLI | extension | extension | no, follows the docs |

If you install this in a tool marked "no", please open an issue saying whether it worked.

## Using it

### Ask your agent

| You want | Say something like | What happens |
|---|---|---|
| UI built accessibly | "Build a contact form for the support page" | The skill loads on its own and the agent follows its checklist and the matching component guide. |
| A review | "Review the checkout form for accessibility" (in Claude Code you can also pick `accessibility-reviewer` from `/agents`) | The agent audits the page in a real browser, then returns a short digest and writes `report.md` and `report.html`. It never edits your files. |
| A re-check | "Audit the checkout again. Last time's report is `report.md`" | A new report with a "Since the last audit" section: resolved, still open and new issues. |
| A fix from a ticket or report | "Fix the accessibility issues in `report.md`" | The agent writes a plan first and **waits for your approval** before editing. Then it writes a test for each automatable Guard, fixes, and checks the result with `verify-fix.mjs`. |
| A spec | "Write the accessibility section of the spec for the new filter panel" | The contract goes into your spec's own format. No code is written. |

### Run the checks yourself

The scripts need no model. They run in a real browser and print **candidates, not verdicts**: confirm each one before you report it. Browser scripts need [Playwright](https://playwright.dev). Run them from a folder that has it installed, or point `NODE_PATH` at its `node_modules`. Set `PW_CHANNEL=msedge` (or `chrome`) to use a browser you already have installed. The commands below are written from the root of this repo. If you installed the plugin, the same scripts are in the skill's `scripts/` folder.

```bash
S=skills/building-accessible-ui/scripts
URL=http://localhost:3000/checkout        # or a local .html file

node $S/tree-pass.mjs $URL                 # accessibility tree: unnamed controls, repeated names, landmarks, headings
node $S/keyboard-walk.mjs $URL             # Tab through the page: unnamed focus stops, unreachable controls, traps
node $S/shift-tab-walk.mjs $URL            # Tab walk against the Shift+Tab walk
node $S/arrow-walk.mjs $URL                # arrow keys in tab lists, menus, listboxes, trees, radio groups, grids
node $S/escape-return.mjs $URL             # open each dialog or menu, press Escape, check focus goes back
node $S/escape-return.mjs $URL --trigger "#filters-button"   # add a trigger it can't find on its own
node $S/focus-contrast.mjs $URL --min 3    # contrast of each control's focus indicator
node $S/live-region-probe.mjs $URL --click "#archive-1" --wait 2000   # what a status message really does
```

Add `--json` for machine-readable output. Every script ends with a `stopReason`: `complete` means it covered the whole page, anything else (`stop-cap`, `time-cap`, `load-timeout`, ...) means it stopped early and says why. Don't treat a clean run as a pass.

Work on the reports:

```bash
node $S/render-report.mjs report.md                    # report.html next to it (add --open to show it)
node $S/compare-reports.mjs last-time/report.md report.md   # resolved, still open, new
```

### Fix an issue and check the result

```bash
# 1. What accessibility tests does this project already have? (reads files only)
node $S/detect-a11y-tests.mjs .

# 2. Save what the scripts find now, then make the change, then save it again
node $S/snapshot.mjs $URL --out before.snapshot.json
#    ... edit, rebuild ...
node $S/snapshot.mjs $URL --out after.snapshot.json

# 3. Audit again (ask the reviewer), then check the fix against the approved plan
git diff --name-only > changed-files.txt
node $S/verify-fix.mjs before-report.md after-report.md --plan a11y-fix-plan.md \
  --before-snapshot before.snapshot.json --after-snapshot after.snapshot.json \
  --changed-files changed-files.txt --format pr
```

`verify-fix.mjs` prints one verdict (`regressed`, `fixed`, `partial` or `unchanged`) and says whether each Guard became a test, was waived with a reason, or was left uncovered. `--format pr` prints a summary for a pull request. A new issue is a regression *candidate*: confirm it. Details and the plan template are in [`references/fixing.md`](skills/building-accessible-ui/references/fixing.md).

## List this plugin in your marketplace

The plugin root is the repo root, and the plugin's own manifests are the source of truth. A marketplace entry only needs to point at a tagged release:

```json
{
  "name": "a11y-agent-kit",
  "source": { "source": "github", "repo": "mfairchild365/a11y-agent-kit", "ref": "v1.0.0" }
}
```

Please pin a release tag (`ref`) or a commit (`sha`) rather than tracking `main`.

## Repository layout

```
.claude-plugin/marketplace.json   Claude Code marketplace (Codex and Copilot CLI also read it)
.claude-plugin/plugin.json        plugin manifest (Claude Code; Copilot fallback)
.cursor-plugin/plugin.json        Cursor plugin manifest
gemini-extension.json             Gemini CLI extension manifest
skills/building-accessible-ui/    the skill
agents/                           the review agent (Markdown; source of truth)
codex/agents/                     generated Codex TOML version of the agent; don't edit
scripts/sync_plugin.mjs           regenerates codex/agents, checks manifests agree and names stay generic
evals/                            eval harness for the skill (not needed at runtime)
```

The repo's tooling is Node, so one runtime covers the shipped scripts, the checks and the evals. Two eval helpers, `build_review.py` and `run_trigger_eval.py`, stay Python because they run and patch skill-creator's own Python modules.

## Development

- **Editing the agent.** Edit only `agents/*.agent.md`, then run `node scripts/sync_plugin.mjs` to regenerate the Codex TOML.
- **Editing the skill.** Follow [`skills/building-accessible-ui/AUTHORING.md`](skills/building-accessible-ui/AUTHORING.md). See [`evals/README.md`](evals/README.md) for the eval loop.
- **Checking before a commit:**

  ```
  node scripts/sync_plugin.mjs --check   # generated files fresh; names/versions agree; names stay generic
  claude plugin validate --strict .      # Claude marketplace + plugin manifests
  node evals/run_all_tests.mjs           # every test and every deterministic check against its fixtures
  ```

  Published files stay generic: no company, brand, product or internal-tool names. `sync_plugin.mjs --check` runs the gate (`scripts/check_generic.mjs`) over tracked files against hashes in `scripts/brand_terms.sha256`; add a term with `node scripts/check_generic.mjs --hash "Some Name"`. Any script that decides something on its own needs fixtures under `evals/check_fixtures/` ([rules](evals/check_fixtures/README.md)).
- **Releasing:**
  1. Bump `version` in `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json` and `gemini-extension.json`. Claude Code uses `version` to detect updates.
  2. Update [`CHANGELOG.md`](CHANGELOG.md).
  3. Tag the release `vX.Y.Z`.

  The Gemini extension gallery also needs the `gemini-cli-extension` topic on the GitHub repo.

## License

MIT, see [LICENSE](LICENSE). Original copyright Microsoft Corporation.
