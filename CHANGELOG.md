# Changelog

## Unreleased

- `accessibility-reviewer` agent: always runs a real-browser check and axe-core when one is reachable (keyboard, hover/focus content, 320px reflow, zoom, reduced motion), and reports with the new `references/audit-report.template.md`. Each finding has a title, summary, severity and why, repro steps, observed, expected, fix, elements, and confidence; the report opens with an audit summary. Severity definitions are tightened. The agent saves the full report to a temp file and tells the calling agent to relay it verbatim, so a delegating agent no longer condenses it. Every finding with a rendered element carries a screenshot with that element outlined, including non-visual issues, with text evidence beside it. Screenshots are embedded in their finding and numbered by finding, and the agent also writes a self-contained `report.html` with the images inlined.
- Forms: character count / limit guidance (describe the current count and limit on focus, announce only near and at the limit).
- Status messages: WCAG definition, removal as a status message, brief loaders still need announcing, a single page announcer utility, and aggregating announcements for many concurrent loaders.
- New `tooltip` component: tooltips vs. toggletips, no `title` tooltips, toggletip content placed after its trigger.

## 1.0.0

- Packaged as the `a11y-agent-kit` plugin for Claude Code, GitHub Copilot, OpenAI Codex, Cursor and Gemini CLI.
- Added the `accessibility-reviewer` agent. It is a read-only audit that runs the project's accessibility tests or axe-core, and reports findings by severity.
- Includes the `building-accessible-ui` skill.
