# Changelog

## Unreleased

- Status messages (4.1.3): new `scripts/live-region-probe.mjs` records live-region changes that are added and removed within milliseconds, with the region, whether it existed and is exposed to assistive technology, the dwell, and whether focus moved, including inside shadow roots. The procedure classes results and sends anything the browser can't settle (a transient message, a region inserted with its text) to Needs verification, since it can't show what a screen reader speaks.
- Audit procedures: new `references/audit-procedures.md` with test steps, failure conditions and "does not fail" boundaries for 13 error-prone criteria (1.3.1, 1.4.3, 1.4.10, 1.4.11, 1.4.12, 1.4.13, 2.1.1, 2.4.7, 2.4.11, 2.5.3, 2.5.8, 4.1.2, 4.1.3), each drafted from its W3C Understanding page and checked line by line against the page text. They are not the audit's scope: the reviewer still audits every applicable A and AA criterion.
- Reflow (1.4.10): the 256px height test applies only to content that scrolls horizontally (vertical text), and a single overflowing line is a Best practice, not a failure.
- Calibration: `list-style: none` without `role="list"` is not a WCAG failure and is not logged.
- Calibration: 1.4.11 is Critical only when the failing element is required to identify the control or its state. A border around a control with visible text, and a panel edge, are not failures (Best practice at most). Text contrast (1.4.3) stays Critical.
- Audit delivery: the reviewer returns a short digest (Fix first, counts, one line per issue, a link) and writes the full report to `report.md`. A new dependency-free `scripts/render-report.mjs` renders `report.html` (images inlined, Evidence folded, table of contents, light and dark) and can open it; the agent shows or opens it for the user and never publishes it to a hosted service unasked. Report noise is cut: no text outside the template's sections, length caps, no index table, and documentation or test gaps are not findings.
- Anchors are floors that can't be lowered. Process safety: the reviewer stops only processes it started.
- Audit calibration: new `references/audit-calibration.md` with severity anchors (keyboard-inoperable and contrast failures are Critical, and so on), a rule to split a defect that fails two criteria into two issues when the barriers differ, and a don't-log list. Best practices are now labelled "Best practice" in their own table instead of being rated Minor.
- Audit report: less noise. It opens with a two-sentence verdict and a **Fix first** list, and each issue has a one-line headline with severity, SC, instances and confidence, with the evidence folded below. Minor issues become table rows, Low-confidence findings move to **Needs verification**, and `report.html` is the primary view with collapsible evidence.
- Audit report: findings are grouped by offending element, then by WCAG success criterion, most severe first. Each issue maps to one SC, instances of the same element and failure are merged into one issue, and the summary has an issue index table.
- `accessibility-reviewer` agent: always runs a real-browser check and axe-core when one is reachable (keyboard, hover/focus content, 320px reflow, zoom, reduced motion), and reports with the new `references/audit-report.template.md`. Each finding has a title, summary, severity and why, repro steps, observed, expected, fix, elements, and confidence; the report opens with an audit summary. Severity definitions are tightened. The agent saves the full report to a temp file and tells the calling agent to relay it verbatim, so a delegating agent no longer condenses it. Every finding with a rendered element carries a screenshot with that element outlined, including non-visual issues, with text evidence beside it. Screenshots are embedded in their finding and numbered by finding, and the agent also writes a self-contained `report.html` with the images inlined.
- Forms: character count / limit guidance (describe the current count and limit on focus, announce only near and at the limit).
- Status messages: WCAG definition, removal as a status message, brief loaders still need announcing, a single page announcer utility, and aggregating announcements for many concurrent loaders.
- New `tooltip` component: tooltips vs. toggletips, no `title` tooltips, toggletip content placed after its trigger.

## 1.0.0

- Packaged as the `a11y-agent-kit` plugin for Claude Code, GitHub Copilot, OpenAI Codex, Cursor and Gemini CLI.
- Added the `accessibility-reviewer` agent. It is a read-only audit that runs the project's accessibility tests or axe-core, and reports findings by severity.
- Includes the `building-accessible-ui` skill.
