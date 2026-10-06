# Accessibility audit report template

Use this for every audit or review of existing UI. Copy it, fill every field, and delete nothing that applies. Report findings only. Don't rewrite the code.

## Severity

Severity is the impact on a user with a specific disability who is trying to complete a task. Axe's `impact` is one input, not the answer. Always give the reason, not just the label.

| Severity | Meaning |
|---|---|
| **Blocker** | Absolute blocker. Prevents someone with a specific disability from completing a task, and there is no workaround. |
| **Critical** | The task is possible, but with significant difficulty or a non-obvious workaround. |
| **Moderate** | Causes friction or confusion, but doesn't stop the task. |
| **Minor** | Best-practice gap or small inconvenience with little user impact. |

## Confidence

How sure you are that the bug is real, and why. The reason must name the evidence.

| Confidence | Meaning |
|---|---|
| **High** | Reproduced in a real browser, or flagged by axe and confirmed by reading the code. Or a computed value (contrast ratio, target size) that fails a numeric threshold. |
| **Medium** | Clear from the code and the spec, but not reproduced at runtime. Or reproduced in one browser or input mode only. |
| **Low** | Inferred from the code or a known browser or AT quirk. Needs a manual or screen reader check. |

Never give High confidence from a static read alone. If a browser check was possible and you didn't run it, say so in the reason.

## Report

```markdown
# Accessibility audit: <component or page>

## Summary

- **Scope:** <paths, diff, URL, or component audited; what was out of scope>
- **Verdict:** <one or two sentences: overall state and the most important issues. Never "fully accessible".>
- **Findings:** <N total> — Blocker <n>, Critical <n>, Moderate <n>, Minor <n>
- **Methods run:**

  | Method | Run? | Result |
  |---|---|---|
  | Static code review | yes / no | <one line> |
  | axe-core in a real browser | yes / no | <violation count, rule ids> |
  | Browser checks (keyboard, focus, hover and focus content, 320px reflow, 200% zoom, reduced motion, forced colors) | yes / no | <what was checked, what failed> |
  | Contrast calculations | yes / no | <pairs checked> |
  | Project's existing a11y tests | yes / no / none exist | <pass/fail, count> |
  | Screen reader | no | <always listed under "Needs manual testing"> |

  For every "no", give the exact command or tool tried, its error, and what would unblock it.
- **Top fixes:** <the 3 or fewer changes that remove the most user impact>

## Findings

Most severe first. Number them continuously.

### 1. <Title: short, names the problem and the component>

- **Summary:** <one or two sentences: what is wrong and who it affects>
- **Severity:** <Blocker | Critical | Moderate | Minor>. <Why: which users, which task, and whether a workaround exists.>
- **Status:** <new | pre-existing>
- **WCAG:** <success criterion number and name, e.g. 1.4.13 Content on Hover or Focus. "Best practice" if none.>
- **Repro steps:**
  1. <Concrete steps from a fresh state: browser, input mode, viewport, AT if relevant>
  2. <...>
- **Observed:** <what actually happens. Include measured values, axe output, accessibility tree, or the console output.>
- **Expected:** <what should happen, and the requirement it comes from>
- **Suggested fix:** <concrete and minimal. A snippet when it helps.>
- **Relevant elements:** <`file:line` for code, and a selector or accessible name for rendered elements>
- **Confidence:** <High | Medium | Low>. <Why: the evidence, and what would raise it.>
- **Source:** <static review | axe rule id and `impact` | browser check | contrast calculation>

### 2. ...

## Passed / not an issue

<Things you checked and found fine, or looked suspicious and aren't. One line each, with the evidence. This stops the next reviewer repeating the work.>

## Needs manual testing

<What automated checks and code reading can't confirm: screen reader announcements, real focus order, voice control, zoom and reflow on devices, touch.>

## Out of scope

<Anything you didn't review.>
```

## Rules for filling it in

- One finding per root cause. If the same defect affects several elements, list them all under **Relevant elements** instead of splitting it.
- **Repro steps** must be runnable by someone who hasn't seen the code. If the issue is code-only and can't be reproduced in a browser, say so and give the code path to trace instead.
- **Observed** and **Expected** are different things. Don't restate the fix as "expected".
- **Suggested fix** is minimal. Don't suggest a redesign when an attribute fixes it.
- Don't pad the report with findings you can't support. Low-confidence findings are allowed, but label them.
