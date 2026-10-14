# Audit calibration

Rules that decide how a finding is rated and logged. Apply them to every audit and every review of existing UI, on top of `audit-report.template.md`. They exist because the same defect was rated and logged differently from one review to the next.

## A. Severity anchors

Severity comes from what the user can't do, not from which success criterion failed. Anchors are floors. Go higher with a stated reason. Never go lower: when the impact is uncertain (for example "only Safari, untested"), keep the severity and lower the confidence, or move the finding to Needs verification. When an anchor sets the severity, say so in **Why this severity**, in a few words.

| Failure | Severity |
|---|---|
| Content or a function can't be reached or operated by keyboard (2.1.1), or traps focus (2.1.2) | **Critical at minimum.** Blocker if the page has no other way to get the information or finish the task. |
| Information or a function is available only on hover or by pointer | Same as above. It is the same barrier. |
| Text contrast failure (1.4.3), in any state, including hover and focus | **Critical** |
| Non-text contrast failure (1.4.11) on something required to identify a control or its state: its only visual cue (an empty text input's border, a checkbox square, a tick or radio dot), a meaningful icon with no text, a selected-state indicator, or a focus indicator the author styled. Below 3:1, unrounded. | **Critical** |
| An interactive control with no accessible name that receives focus, or is the only way to a function | **Critical** |
| Any other failure of 1.4.11 (a required cue below 3:1 that doesn't fit the row above) | **Moderate at minimum.** Never Minor. |
| Information conveyed by color alone (1.4.1): a message type, state or status shown only by fill, border or text color, with no icon, text or pattern that states it | By impact. Never a Needs verification entry: it is a failure when the component as built, in any configuration it allows, shows it by color alone. |
| An icon that conveys information the text doesn't (a status icon: error, warning, success) is hidden from assistive technology or has no text alternative (1.1.1) | By impact. Never Minor: the user misses the type of message. |
| A message that disappears on a timer (2.2.1) | By impact. A pause-on-hover or pause-on-focus fix existing doesn't lower the rating. |
| Reflow failure at 320 CSS px (1.4.10): reading text needs sideways scrolling back-and-forth, or content is lost. | **Moderate**. **Minor** only when what is lost is small and the text stays readable (one cut-off character). |

A single line that runs past the **right** edge, where the user can scroll to the rest, is a Best practice. Content cut off where no scrolling reaches it (past the **left** edge, or clipped by `overflow: hidden`) is lost, so it is a failure, even on one line and even when "it is only a single line".
| Label in Name mismatch (2.5.3) | **Moderate** |
| A small inconvenience that still fails a WCAG success criterion, with little user impact | **Minor** |

**Best practice is a label, not a severity.** A best practice is a gap with no WCAG success criterion behind it. Label it "Best practice". Never rate it Minor, Moderate, Critical or Blocker, never count it in the severity totals, and never give it a card. If the gap does fail a success criterion, it is not a best practice: rate it with the table above.

**Status messages (snackbars, toasts).** Three rules, each from a user correction:

- A status icon (red x, orange triangle, green check) is **not decorative** when the message text doesn't also state the type ("Error", "Warning", "Success"). Text that only hints at it doesn't count. Hiding such an icon with `aria-hidden` fails 1.1.1: give it a text alternative, or make the text state the type. An icon beside text that does state the type is decorative: don't log it.
- An auto-dismissing message fails 2.2.1 unless the user can turn off, adjust or extend the limit, or there is an alternative that doesn't depend on the timer. Pause on hover or focus is a good fix but not enough alone, because users may not reach the message in time. The expected fix: **actionable or important messages don't auto-dismiss**, and **dismissed messages can be re-opened** (for example a notification inbox or history).
- A message in a live region (`role="status"`, `role="alert"`) is correct for 4.1.3. Don't log it.
- A toast or snackbar that has a title must mark it up as a heading. A title in bold text, a `<div>` or a `<span>` is a 1.3.1 failure (rated as a fake heading; see `audit-procedures.md` 1.3.1).
- An interactive control other than Dismiss inside a live-region toast (an Undo button, for example) is a **Best practice**, not a finding: the live region doesn't announce the control's role, and users may not reach it in time. No success criterion fails on that alone. If the message also times out, log the timeout under 2.2.1.

**Focus indicators are always measured.** Every audit measures the contrast (3:1, unrounded) of every author-styled focus indicator against what it sits on, for every focusable control, on every distinct background it appears on: each variant, fill, state and theme. A ring that passes on one fill and fails on another is a finding (list the failing variants as instances). Never skip this because axe doesn't report it or because the ring "looks visible". The check is in `audit-procedures.md` 2.4.7 and 1.4.11.

**What a criterion requires comes from its W3C Understanding document, not from memory.** The boundaries are in `audit-procedures.md` ("Does not fail"); read the Understanding page (`https://www.w3.org/WAI/WCAG22/Understanding/<slug>.html`) for any criterion whose boundary is in doubt.

**Not a 1.4.11 failure: Best practice at most, and often not worth logging.** A border or edge around a control that has visible text or a sufficiently contrasting icon, and the edge of a panel, popup, card or dropdown. Hover styling that leaves the text and icon at their required contrast. The browser's default focus style, if the author hasn't changed it. A disabled control (exempt). The Understanding page itself calls delineating every control a best practice for people with cognitive disabilities, so these may appear in the Best practices table with no severity.

## B. Where to log

- **One success criterion per issue.** Always.
- **One defect that fails two criteria is two issues when the barriers differ** (different users, different impact, or a different fix). File each under its own criterion, rate each on its own barrier, and cross-reference them ("see also #N") in each Summary.
- Keep it as **one issue** only when it is the same barrier with the same fix. File it under the criterion that describes the barrier most directly.
- Example: a hover-only tooltip on elements that can't take focus is two issues. 2.1.1 (not reachable by keyboard, Critical) and 1.4.13 (not dismissible, hoverable or persistent, Moderate).

## C. Don't log

Things that are not issues, or that are reported elsewhere. Add an entry here when told not to log something, with the reason.

- **Documentation and test-coverage gaps** (a README table out of date, missing unit tests). They are not user-facing accessibility findings. At most one "Maintainer notes" line under Out of scope, never in the digest. Exception: documentation that makes a false accessibility claim users would rely on is a real finding.
- **A generic link name ("Learn more") whose describing message is in the same container.** When the message sits in a block right beside the link and inside the same component (a banner, card or list item), the link has its context. A `<p>` and a `<div>` are the same here: don't fail 2.4.4 because the message and link are siblings and not in one paragraph. The best practice is `aria-describedby` to the message, or a link name that carries the purpose. It is a failure only when nothing near the link in the same component says what it is for.
- **Repeated names that their surroundings explain** (proposed, not yet confirmed by the maintainer). Several links or buttons with one name where each sits in its own list item, cell, card or under its own heading, or has `aria-describedby`. The tree-pass `repeated-link-name` and `repeated-control-name` candidates are dropped when you see this. Same-name links with the same destination are not an issue either.
- **`list-style: none` on a list without `role="list"`.** Not a WCAG failure: the markup is still a list, and Safari with VoiceOver drops list semantics from unstyled lists by design (an Apple decision). Don't log it. If you mention it at all, it is a Best practice, never a finding.

## D. Best practices to look for

Gaps with no success criterion behind them. Each gets one row in the Best practices table, labelled "Best practice", with no severity. Look for them on every audit.

- **A named section that already has a heading.** A `<section>` or `role="region"` with `aria-label` or `aria-labelledby` and a visible heading becomes a landmark, so screen reader users hear the name next to the heading. Avoid the name whenever possible. A name that tells apart two landmarks of the same kind (two `<nav>`) is needed, so don't log that.
- **A focused button whose inner text changes to show a new state** ("Mute" to "Unmute", "Archive" to "Undo archive"). Some screen readers don't announce inner text changes. Better: `aria-pressed` or another state attribute, a separate status message, or a focus move to a control whose name says the result. If the text change is the only way the user learns the outcome of an action (no live region, no focus move), also list it under Needs verification for 4.1.3, with the screen reader check. A toggle that only shows its own state stays a Best practice.
- **An interactive control other than Dismiss inside a live-region toast** (section A, status messages).
- **A generic link name whose message is in the same container** (section C): add `aria-describedby` or a fuller name.
- **A single line that overflows the right edge at 320 px** but can be scrolled to: let it wrap.
- **A skipped heading level** (`audit-procedures.md` 1.3.1), or a page with no level 1 heading.
- **Repeated control names with no distinguishing context** (`audit-procedures.md` 4.1.2): ten "Remove" buttons that nothing ties to their rows. Not a failure of 4.1.2. Raise it to a finding only when the user can't tell which item a control acts on.
- **A positive `tabindex`** on a tabbable element (`keyboard-walk.mjs` `tabindex-positive`): it moves the element ahead of the page's natural order. Not a failure by itself, since 2.4.3 only fails when the resulting order loses meaning.

## E. Script output and component libraries

Both rules are auditor guidance, proposed and not yet confirmed by the maintainer.

- **Script output is evidence, not a finding.** `scripts/tree-pass.mjs`, `scripts/keyboard-walk.mjs` and `scripts/compare-reports.mjs` print candidates and comparisons. Never log a candidate on the script's word alone: reproduce it in the browser (the real keyboard for the walk, the accessibility tree for the pass), set the confidence from that, and name the script in the issue's **Source**. A candidate you can't confirm goes under Needs verification. A script that stopped early (`stopReason` other than `complete`) did not see the whole page: say so under Checks.
- **Component libraries: consumer code or the library?** When the project uses a component library or design system, decide where the defect is before you say how to fix it. If the consumer used it wrongly (a missing prop, a missing label), the fix is in the consumer's code. If the library component itself renders inaccessible HTML, say so in the issue's **Suggested fix**: the primary fix belongs in the library, and any consumer-side workaround is labelled temporary. Check whether the library already offers an accessible alternative component. Never recommend adding an attribute the library already sets: that duplicates ARIA. A project's own notes on which wrapper components are accessible (its `AGENTS.md` or similar) come first; see `testing.md` "Project conventions".
