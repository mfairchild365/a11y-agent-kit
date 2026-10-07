# Accessibility audit report template

Use this for every audit or review of existing UI. Copy it and fill in every field that applies. Where it says a field is folded away, it still has to be written down. Report findings only. Don't rewrite the code.

## Severity

Severity is the impact on a user with a specific disability who is trying to complete a task. Axe's `impact` is one input, not the answer. Always give the reason, not just the label. Apply the anchors in `audit-calibration.md`: they are floors. For example, content that can't be reached by keyboard is at least Critical.

| Severity | Meaning |
|---|---|
| **Blocker** | Absolute blocker. Prevents someone with a specific disability from completing a task, and there is no workaround. |
| **Critical** | The task is possible, but with significant difficulty or a non-obvious workaround. |
| **Moderate** | Causes friction or confusion, but doesn't stop the task. |
| **Minor** | A small inconvenience that still fails a WCAG success criterion, with little user impact. |
| **Best practice** | Not a severity. A gap with no WCAG success criterion behind it. It has no rating, isn't counted in the severity totals, and never gets a card. |

## Confidence

How sure you are that the bug is real, and why. The reason must name the evidence.

| Confidence | Meaning |
|---|---|
| **High** | Reproduced in a real browser, or flagged by axe and confirmed by reading the code. Or a computed value (contrast ratio, target size) that fails a numeric threshold. |
| **Medium** | Clear from the code and the spec, but not reproduced at runtime. Or reproduced in one browser or input mode only. |
| **Low** | Inferred from the code or a known browser or AT quirk. Needs a manual or screen reader check. |

Never give High confidence from a static read alone. If a browser check was possible and you didn't run it, say so in the reason. Low-confidence findings don't go in the ranked list; they go under **Needs verification**.

## Digest: what goes in the chat

The full report is a file, not the chat message. The message the agent returns (and the caller relays) is a short digest of about 40 lines, with no evidence and no images. The Markdown and HTML reports keep every field.

```markdown
**Fix first**
1. <change that removes the most user impact (#N)>
2. <...>

Critical 3 · Moderate 3 · Minor 1 · Best practice 1 · Needs verification 1
Checks: axe, keyboard, 320px, contrast run. No screen reader.

#1 · Critical · 2.1.1 · Tooltip bubbles — can't be reached by keyboard → make them focusable buttons
#3 · Critical · 1.4.3 · "+5" button — hover state is 3.83:1 → use a darker fill
#2 · Moderate · 1.4.13 · Tooltip bubbles — can't be dismissed or hovered → keep open on hover, close on Escape
...
#7 · Minor · 1.3.1 · Lists — list-style: none drops list semantics → add role="list"
#8 · Best practice · Bubbles — no reduced-motion block → add a prefers-reduced-motion rule
#9 · Needs verification · 4.1.3 · Status message — live region may announce twice → test with NVDA and VoiceOver

Full report: <absolute path to report.html>
Open it: <what was done: shown in the app, opened in the default browser, or "not opened": the file:/// URL>
```

One line per issue, most severe first. Start each line with the issue's number in the report (`#N`), so the digest, Fix first and the report agree even though the digest is sorted by severity and the report is grouped by element. Don't repeat Fix first anywhere else.

## Report

Put what matters first, and scale the detail to the severity. Every field still exists. Lower-impact findings carry fewer of them in the visible report, and the rest is folded away.

| Finding | Where it goes | Detail |
|---|---|---|
| Blocker, Critical, Moderate, confidence High or Medium | **Findings**, ranked | Full card, with a screenshot |
| Minor, confidence High or Medium | **Minor issues** table | One row. Evidence kept in `report.md`, and folded in `report.html` |
| Best practice, confidence High or Medium | **Best practices** table | One row, with no severity |
| Any severity, confidence Low | **Needs verification** | One row, with the check that would confirm it |

```markdown
# Accessibility audit: <component or page>

## Summary

- **Scope:** <paths, diff, URL, or component audited; what was out of scope>
- **Verdict:** <two sentences at most: overall state, and the most important problem. Never "fully accessible".>
- **Findings:** Blocker <n>, Critical <n>, Moderate <n>, Minor <n>. <n> best practices. <n> more need verification.
- **Checks:** <one line, e.g. "axe, keyboard, 320px, forced colors and contrast run; no screen reader.">
- **Fix first:** <at most 3 items, one line each, each naming its issue number>
  1. <the change that removes the most user impact (#N)>

<Only when a check did not run, add a table: method, the exact command or tool tried, its error, and what would unblock it. Cap the confidence of anything that depended on it at Medium.>

Keep the whole summary to about 10 lines. Don't repeat in it what the findings say.

## Findings

Group by **offending element** first, then by **WCAG success criterion** within each element. Each issue maps to exactly one SC. Number issues continuously across the report, including the Minor, Best practice and Needs verification rows, so the numbers match the digest, the screenshot file names, and the alt text.

Order: element groups by the highest severity of any issue they hold, most severe first. Within a group, issues most severe first. Break ties by the number of instances, then by the SC number.

### Element: <offending element, e.g. "Tooltip on the student bubble", `+N` button, `<ul>` lists>

One line: what this element is and how many instances the audit found.

#### 1. <Severity> · <WCAG SC number> · <n> instances · <Confidence> confidence · <Title>

- **Summary:** <one or two sentences: what is wrong and who it affects>
- **Why this severity:** <which users, which task, and whether a workaround exists>
- **Screenshot:** <embedded right here, never collected elsewhere: `![Finding N: what it shows, element outlined](absolute/path/finding-NN-slug.png)`, with the offending element outlined, even when the problem isn't visible (a wrong accessible name, missing semantics, a keyboard-order fault): the outline shows the reader which element it is. Show the failing state, plus a second image of the expected or fixed state when you can. For a non-visual issue, also give the text evidence beside the image: the accessibility-tree line, the axe node, or the focus sequence. Write "No screenshot" only when the element can't be rendered (code-only finding, or the browser check couldn't run), and say why.>
- **Suggested fix:** <concrete and minimal. A snippet when it helps.>
- **Evidence:**
  - **WCAG SC:** <number and name of the one criterion this issue fails, e.g. 1.4.13 Content on Hover or Focus. "Best practice" if none; such a finding goes in the Best practices table, not a card.>
  - **Status:** <new | pre-existing. Show it in the headline too when the audit is of a diff.>
  - **Repro steps:**
    1. <Concrete steps from a fresh state: browser, input mode, viewport, AT if relevant>
    2. <...>
  - **Observed:** <what actually happens. Include measured values, axe output, accessibility tree, or the console output.>
  - **Expected:** <what should happen, and the requirement it comes from>
  - **Relevant elements:** <every instance, grouped here and not split into separate issues: `file:line` for code, and a selector or accessible name for rendered elements>
  - **Confidence:** <High | Medium>. <Why: the evidence, and what would raise it.>
  - **Source:** <static review | axe rule id and `impact` | browser check | contrast calculation>

#### 2. <next issue on the same element, a different SC>

...

### Element: <next offending element>

#### 3. ...

## Minor issues

One row per Minor issue, grouped under the Findings numbering. Evidence stays in `report.md` under the table, and `report.html` folds it under each row.

| # | Element | WCAG SC | Title | Suggested fix | Confidence |
|---|---|---|---|---|---|
| 7 | <element> | <SC> | <title> | <fix> | <High/Medium> |

## Best practices

Gaps with no WCAG success criterion behind them. They have no severity. Evidence stays in `report.md` under the table, and `report.html` folds it under each row.

| # | Element | What | Suggested fix | Confidence |
|---|---|---|---|---|
| 8 | <element> | <what is missing or could be better> | <fix> | <High/Medium> |

## Needs verification

Findings the agent suspects but couldn't confirm (confidence Low). They are not counted in the ranked list.

| # | Element | WCAG SC | Suspected severity | Why suspected | Check that would confirm it |
|---|---|---|---|---|---|
| 10 | <element> | <SC> | <severity> | <evidence so far> | <the specific check, e.g. "NVDA on the +N button"> |

## Passed / not an issue

<About 5 lines at most. Only things a reader might otherwise re-raise: checked and fine, or looks suspicious and isn't. One line each, with the evidence.>

## Needs manual testing

<Only checks that could change a finding or its severity: screen reader announcements, voice control, real focus order, touch.>

## Out of scope

<Anything you didn't review.>

<Optional, one line: "Maintainer notes: <documentation or test-coverage gap>". These are not findings and never appear in the digest.>
```

## Rules for filling it in

- **One issue per element and SC.** Many instances of the same element with the same failure are one issue: list every instance under **Relevant elements** and give the count in the headline. Don't file one issue per instance.
- **One SC per issue.** If one defect fails two criteria and the barriers differ (different users, impact or fix), file it as two issues, rate each on its own barrier, and cross-reference them ("see also #N"). Keep it as one issue only when it is the same barrier with the same fix. See `audit-calibration.md` section B.
- If instances differ in impact, set the severity from the worst instance and say which instance and why.
- The same defect in two different elements is two issues, one per element group, unless the elements are instances of one component.
- **No free text outside the template's sections.** Every observation goes in a card's Evidence or a table cell. No stray paragraphs, no "Evidence #N" blocks, no working notes between sections.
- **Length caps.** Summary: about 10 lines. Why this severity: at most 2 sentences, and name the anchor rather than restating it. Observed: at most 3 lines, the decisive measurement and not every reading. Relevant elements: at most 4 references inline. Suggested fix: at most 3 lines. Best practice and Minor rows: one sentence each. Passed: at most 5 lines, with no list of measurements.
- **Before labelling a gap Best practice,** check whether a criterion applies. A panel with no visible edge in forced colors is 1.4.11. A control name with an unrelated button's text spliced in is 2.5.3 or 4.1.2. If one applies, rate it.
- **Documentation and test-coverage gaps are not findings.** At most one "Maintainer notes" line under Out of scope.
- **Headline first.** The one-line headline carries severity, SC, instance count and confidence, so a reader can scan the report without opening any evidence.
- **Repro steps** must be runnable by someone who hasn't seen the code. If the issue is code-only and can't be reproduced in a browser, say so and give the code path to trace instead.
- **Observed** and **Expected** are different things. Don't restate the fix as "expected".
- **Suggested fix** is minimal. Don't suggest a redesign when an attribute fixes it.
- **Screenshots** are evidence, not decoration. Required for Blocker, Critical and Moderate cards; optional for Minor and Best practice rows. Capture them in the browser while reproducing, outline the offending element (every instance in one image if they fit; otherwise the worst instance, and say how many others there are), and use the viewport or state that triggers the bug (hover, focus, 320px, forced colors). Give each image alt text that says what it shows and which element is outlined. Name files `finding-NN-<slug>.png` after the finding number, and start the alt text with "Finding N". Use absolute paths. Never put images in a gallery or list apart from their finding: a reader must see each image beside the issue it shows.
- Confirm a Low-confidence finding in the browser when you can. If it is confirmed, it moves into the ranked list. Don't pad the report with findings you can't support.
