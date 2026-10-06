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
- **Issue index:** one row per issue, in report order, so the reader can scan the whole audit.

  | # | Offending element | WCAG SC | Severity | Instances | Confidence |
  |---|---|---|---|---|---|
  | 1 | <element> | <SC number and name> | <severity> | <count> | <High/Medium/Low> |
- **Top fixes:** <the 3 or fewer changes that remove the most user impact>

## Findings

Group by **offending element** first, then by **WCAG success criterion** within each element. Each issue maps to exactly one SC. Number issues continuously across the whole report, so the numbers match the index, the screenshot file names, and the alt text.

Order: element groups by the highest severity of any issue they hold, most severe first. Within a group, issues most severe first. Break ties by the number of instances, then by the SC number.

## Element: <offending element, e.g. "Tooltip on the student bubble", `+N` button, `<ul>` lists>

One line: what this element is and how many instances the audit found.

### 1. <Title: short, names the problem and the component>

- **Summary:** <one or two sentences: what is wrong and who it affects>
- **Severity:** <Blocker | Critical | Moderate | Minor>. <Why: which users, which task, and whether a workaround exists.>
- **Status:** <new | pre-existing>
- **WCAG SC:** <the one success criterion this issue fails: number and name, e.g. 1.4.13 Content on Hover or Focus. "Best practice" if none.>
- **Instances:** <how many instances of the element have this issue, and which states or variants>
- **Repro steps:**
  1. <Concrete steps from a fresh state: browser, input mode, viewport, AT if relevant>
  2. <...>
- **Observed:** <what actually happens. Include measured values, axe output, accessibility tree, or the console output.>
- **Expected:** <what should happen, and the requirement it comes from>
- **Screenshot:** <embedded right here in the finding, never collected elsewhere: `![Finding N: what it shows, element outlined](absolute/path/finding-NN-slug.png)`, with the offending element outlined, even when the problem isn't visible (a wrong accessible name, missing semantics, a keyboard-order fault): the outline shows the reader which element it is. Show the failing state, plus a second image of the expected or fixed state when you can. For a non-visual issue, also give the text evidence beside the image: the accessibility-tree line, the axe node, or the focus sequence. Write "No screenshot" only when the element can't be rendered (code-only finding, or the browser check couldn't run), and say why.>
- **Suggested fix:** <concrete and minimal. A snippet when it helps.>
- **Relevant elements:** <every instance, grouped here and not split into separate issues: `file:line` for code, and a selector or accessible name for rendered elements>
- **Confidence:** <High | Medium | Low>. <Why: the evidence, and what would raise it.>
- **Source:** <static review | axe rule id and `impact` | browser check | contrast calculation>

### 2. <next issue on the same element, a different SC>

...

## Element: <next offending element>

### 3. ...

## Passed / not an issue

<Things you checked and found fine, or looked suspicious and aren't. One line each, with the evidence. This stops the next reviewer repeating the work.>

## Needs manual testing

<What automated checks and code reading can't confirm: screen reader announcements, real focus order, voice control, zoom and reflow on devices, touch.>

## Out of scope

<Anything you didn't review.>
```

## Rules for filling it in

- **One issue per element and SC.** Many instances of the same element with the same failure are one issue: list every instance under **Relevant elements** and give the count in **Instances**. Don't file one issue per instance.
- **One SC per issue.** If one defect fails two criteria, file it under the primary SC and name the other in the Summary. If the element has two separate defects that fail different SCs, they are two issues under the same element.
- If instances differ in impact, set the severity from the worst instance and say which instance and why.
- The same defect in two different elements is two issues, one per element group, unless the elements are instances of one component.
- **Repro steps** must be runnable by someone who hasn't seen the code. If the issue is code-only and can't be reproduced in a browser, say so and give the code path to trace instead.
- **Observed** and **Expected** are different things. Don't restate the fix as "expected".
- **Suggested fix** is minimal. Don't suggest a redesign when an attribute fixes it.
- **Screenshots** are evidence, not decoration. Capture them in the browser while reproducing, outline the offending element (every instance in one image if they fit; otherwise the worst instance, and say how many others there are), and use the viewport or state that triggers the bug (hover, focus, 320px, forced colors). Give each image alt text that says what it shows and which element is outlined. Name files `finding-NN-<slug>.png` after the finding number, and start the alt text with "Finding N". Use absolute paths. Never put images in a gallery or list apart from their finding: a reader must see each image beside the issue it shows.
- Don't pad the report with findings you can't support. Low-confidence findings are allowed, but label them.
