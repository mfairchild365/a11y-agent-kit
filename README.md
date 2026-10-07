# a11y-agent-kit

Accessibility tooling for coding agents. It is one plugin with two parts:

- **`building-accessible-ui` skill.** It encodes WCAG 2.2 AA requirements for building UI, reviewing UI, and writing UI specs. The agent loads it on its own whenever it works on something users see or operate. See [`skills/building-accessible-ui/SKILL.md`](skills/building-accessible-ui/SKILL.md).
- **`accessibility-reviewer` agent.** A read-only auditor. It reviews UI code, a diff, or a page against the skill's checklist. It also runs the project's accessibility tests, or axe-core if there are none. It always checks the rendered UI in a real browser when one is available. It reports a short summary with a fix-first list, then findings grouped by element and WCAG criterion using [`audit-report.template.md`](skills/building-accessible-ui/references/audit-report.template.md). Serious findings get a full card (severity and why, screenshot, fix, and folded repro, observed vs. expected, elements, confidence); minor ones are table rows, and unconfirmed ones go under "Needs verification". It returns a short digest and writes a full `report.md` and a self-contained `report.html` (rendered by [`render-report.mjs`](skills/building-accessible-ui/scripts/render-report.mjs)), which it shows or opens for you. It never edits your code. See [`agents/accessibility-reviewer.agent.md`](agents/accessibility-reviewer.agent.md).

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
scripts/sync_plugin.py            regenerates codex/agents and checks manifests agree
evals/                            eval harness for the skill (not needed at runtime)
```

## Development

- **Editing the agent.** Edit only `agents/*.agent.md`, then run `python3 scripts/sync_plugin.py` to regenerate the Codex TOML.
- **Editing the skill.** Follow [`skills/building-accessible-ui/AUTHORING.md`](skills/building-accessible-ui/AUTHORING.md). See [`evals/README.md`](evals/README.md) for the eval loop.
- **Checking before a commit:**

  ```
  python3 scripts/sync_plugin.py --check   # generated files fresh; names/versions agree
  claude plugin validate --strict .        # Claude marketplace + plugin manifests
  ```
- **Releasing:**
  1. Bump `version` in `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json` and `gemini-extension.json`. Claude Code uses `version` to detect updates.
  2. Update [`CHANGELOG.md`](CHANGELOG.md).
  3. Tag the release `vX.Y.Z`.

  The Gemini extension gallery also needs the `gemini-cli-extension` topic on the GitHub repo.

## License

MIT, see [LICENSE](LICENSE). Original copyright Microsoft Corporation.
