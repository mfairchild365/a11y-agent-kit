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
| An icon that conveys information the text doesn't (a status icon: error, warning, success) is hidden from assistive technology or has no text alternative (1.1.1) | By impact. Never Minor: the user misses the type of message. |
| A message that disappears on a timer (2.2.1) | By impact. A pause-on-hover or pause-on-focus fix existing doesn't lower the rating. |
| Reflow failure at 320 CSS px (1.4.10): reading text needs sideways scrolling back-and-forth, or content is lost. One overflowing line is a Best practice, not a failure. | **Moderate** |
| Label in Name mismatch (2.5.3) | **Moderate** |
| A small inconvenience that still fails a WCAG success criterion, with little user impact | **Minor** |

**Best practice is a label, not a severity.** A best practice is a gap with no WCAG success criterion behind it. Label it "Best practice". Never rate it Minor, Moderate, Critical or Blocker, never count it in the severity totals, and never give it a card. If the gap does fail a success criterion, it is not a best practice: rate it with the table above.

**Status messages (snackbars, toasts).** Three rules, each from a user correction:

- A status icon (red x, orange triangle, green check) is **not decorative** when the message text doesn't also state the type ("Error", "Warning", "Success"). Text that only hints at it doesn't count. Hiding such an icon with `aria-hidden` fails 1.1.1: give it a text alternative, or make the text state the type. An icon beside text that does state the type is decorative: don't log it.
- An auto-dismissing message fails 2.2.1 unless the user can turn off, adjust or extend the limit, or there is an alternative that doesn't depend on the timer. Pause on hover or focus is a good fix but not enough alone, because users may not reach the message in time. The expected fix: **actionable or important messages don't auto-dismiss**, and **dismissed messages can be re-opened** (for example a notification inbox or history).
- A message in a live region (`role="status"`, `role="alert"`) is correct for 4.1.3. Don't log it.
- An interactive control other than Dismiss inside a live-region toast (an Undo button, for example) is a **Best practice**, not a finding: the live region doesn't announce the control's role, and users may not reach it in time. No success criterion fails on that alone. If the message also times out, log the timeout under 2.2.1.

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
- **`list-style: none` on a list without `role="list"`.** Not a WCAG failure: the markup is still a list, and Safari with VoiceOver drops list semantics from unstyled lists by design (an Apple decision). Don't log it. If you mention it at all, it is a Best practice, never a finding.
