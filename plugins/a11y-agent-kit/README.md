# a11y-agent-kit

Accessibility (WCAG 2.2 AA) tooling for coding agents. It has two parts:

- **`building-accessible-ui` skill.** Rules for building UI, reviewing UI, and writing UI specs. Claude loads it on its own whenever it works on something users see or operate.
- **`accessibility-reviewer` agent.** A read-only auditor. It reviews UI code, a diff, or a page, runs your accessibility tests or axe-core, and reports findings by severity with the WCAG criterion, affected users, and a suggested fix. It never edits your code.

## Install

```
/plugin marketplace add mfairchild365/a11y-agent-kit
/plugin install a11y-agent-kit@a11y-agent-kit
```

Then ask for a review, for example "review the checkout form for accessibility", or pick the agent from `/agents`. No setup or credentials are needed. Some checks use Playwright if your project has it.

See the [repository README](https://github.com/mfairchild365/a11y-agent-kit#readme) for other tools and details.
