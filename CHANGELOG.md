# Changelog

## Unreleased

- Forms: character count / limit guidance (describe the limit on focus, announce only near and at the limit).
- Status messages: WCAG definition, removal as a status message, brief loaders still need announcing, a single page announcer utility, and aggregating announcements for many concurrent loaders.
- New `tooltip` component: tooltips vs. toggletips, no `title` tooltips, toggletip content placed after its trigger.

## 1.0.0

- Packaged as the `a11y-agent-kit` plugin for Claude Code, GitHub Copilot, OpenAI Codex, Cursor and Gemini CLI.
- Added the `accessibility-reviewer` agent. It is a read-only audit that runs the project's accessibility tests or axe-core, and reports findings by severity.
- Includes the `building-accessible-ui` skill.
