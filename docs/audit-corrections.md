# Audit corrections log

Maintainer history of corrections to the `accessibility-reviewer` agent's findings. This file is **not** read during an audit and isn't part of the skill. The rules that came out of it live in [`skills/building-accessible-ui/references/audit-calibration.md`](../skills/building-accessible-ui/references/audit-calibration.md), which ships with the skill and is applied on every audit.

## How to add a correction

Tell Claude, in any session: "log a correction: what was logged wrong, and what the right call is". It will:

1. add an entry below,
2. distill it into the right section of `audit-calibration.md` (severity anchors, where to log, or don't log), keeping that file short,
3. add or adjust a seed in `evals/audit_fixture/` and its answer key when the correction can be tested, and
4. commit it on a branch for review.

Entry format: `C-NNN · date · what was logged wrong · the right call · why · where it became a rule`. Newest last. Merge duplicates, and drop an entry once a rule fully covers it.

## Entries

- **C-001 · 2026-10-06 · keyboard access rated Moderate.** Tooltip content that can't be reached by keyboard was rated Moderate. Right call: Critical at minimum, Blocker if there is no other way to get the information. Why: the user can't get the content at all without a pointer. Rule: calibration A.
- **C-002 · 2026-10-06 · one issue for two failures.** The tooltip was logged only under 1.4.13, with 2.1.1 mentioned in the summary. Right call: two issues, 2.1.1 (Critical) and 1.4.13 (Moderate), cross-referenced. Why: the barriers and fixes differ. Rule: calibration B. Tested by the `tooltip-keyboard` and `tooltip-hover` seeds.
- **C-003 · 2026-10-06 · contrast rated Moderate.** A hover and open state contrast failure was rated Moderate. Right call: contrast failures are Critical, in any state. Rule: calibration A. Tested by the `more-contrast` seed.
- **C-004 · 2026-10-06 · best practices given a severity.** Best-practice gaps were rated Minor. Right call: label them "Best practice", with no severity. Rule: calibration A. Tested by the `reduced-motion` seed.
- **C-005 · 2026-10-06 · severity anchors confirmed.** Unnamed focusable control: Critical. Reflow at 320px and Label in Name: Moderate. Small WCAG failure with little impact: Minor. Rule: calibration A.
- **C-006 · 2026-10-07 · the report was noisy and the HTML was hard to open.** A full report (evidence, measurements, stray notes, a duplicate Fix first, an index table) landed in the chat, and `report.html` sat in a temp folder. Right call: the chat gets a short digest with a `Full report:` link, the HTML is rendered by `scripts/render-report.mjs` and shown or opened for the user, nothing sits outside the template's sections, and fields have length caps. Documentation and test-coverage gaps are not findings (one Maintainer notes line under Out of scope). Rule: template (Digest, rules), calibration C. Tested by the digest and noise checks.
- **C-007 · 2026-10-07 · a severity anchor was lowered.** A keyboard scroll-area issue was rated Moderate against the Critical-at-minimum anchor, with the reason that only Safari was exposed. Right call: anchors are floors that can't be lowered. When impact is uncertain, keep the severity and lower the confidence, or move it to Needs verification. Rule: calibration A (applied when the plan was approved on 2026-10-07).
- **C-008 · 2026-10-07 · process cleanup killed about 50 processes by command-line match.** Right call: stop only what you started, by handle; never by name or pattern. Rule: `references/testing.md`, Process safety.
