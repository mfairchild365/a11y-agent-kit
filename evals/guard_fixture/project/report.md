# Accessibility audit: Roster page

## Summary

- **Scope:** `index.html`, rendered at desktop width.
- **Verdict:** Two controls fail for keyboard and low-vision users; the notices rely on color.
- **Findings:** Critical 2, Moderate 1. 0 best practices. 0 need verification.
- **Checks:** axe, keyboard and contrast run; no screen reader.
- **Fix first:**
  1. Name the close button (#1)
  2. Raise the "New" badge contrast (#2)
- **Triage:** Fix now #1 #2 · Ticket #3

## Findings

### Element: Close button

One icon-only button, 1 instance.

#### 1. Critical · 4.1.2 · 1 instances · High confidence · Icon-only close button has no accessible name

- **Summary:** The button holds only a hidden icon, so a screen reader announces "button" with no name.
- **Why this severity:** An unnamed control that takes focus is Critical under the anchors.
- **Suggested fix:** Add `aria-label="Close"`.
- **Guard:** automatable: axe `button-name` on `index.html` fails now and passes once the button has a name.
- **Evidence:**
  - **WCAG SC:** 4.1.2 Name, Role, Value
  - **Status:** pre-existing
  - **Repro steps:**
    1. Open `index.html` and Tab to the button.
  - **Observed:** accessibility tree: `button ""`.
  - **Expected:** `button "Close"`.
  - **Relevant elements:** `#close`
  - **Confidence:** High. Reproduced and flagged by axe.
  - **Source:** axe `button-name` (critical)

### Element: "New" badge

One badge, 1 instance.

#### 2. Critical · 1.4.3 · 1 instances · High confidence · Badge text is 2.0:1 against its fill

- **Summary:** Light blue text on a mid blue fill is hard to read for low-vision users.
- **Why this severity:** Text contrast failures are Critical under the anchors.
- **Suggested fix:** Use white text on `#1a5fb4` (6.6:1), or a darker text on a lighter fill.
- **Guard:** automatable: axe `color-contrast` on `index.html` fails now and passes once the badge reaches 4.5:1.
- **Evidence:**
  - **WCAG SC:** 1.4.3 Contrast (Minimum)
  - **Status:** pre-existing
  - **Repro steps:**
    1. Open `index.html` and look at the "New" badge.
  - **Observed:** `#9cc4ff` on `#2b7de9` is 2.0:1.
  - **Expected:** at least 4.5:1.
  - **Relevant elements:** `#badge`
  - **Confidence:** High. Computed ratio.
  - **Source:** contrast calculation

### Element: Notices

Two notices, 2 instances.

#### 3. Moderate · 1.4.1 · 2 instances · High confidence · The notice type is shown by fill color alone

- **Summary:** The info and error notices differ only by background tint, with no icon or word stating the type.
- **Why this severity:** Users who can't tell the tints apart can't tell an error from a confirmation.
- **Suggested fix:** Start each notice with a visible type word ("Error:", "Saved:") or add an icon with a text alternative.
- **Guard:** manual: look at the page in grayscale or with forced colors; each notice must still say what type it is. A person judges whether the cue states the type, so it isn't a reliable automated test.
- **Evidence:**
  - **WCAG SC:** 1.4.1 Use of Color
  - **Status:** pre-existing
  - **Repro steps:**
    1. Open `index.html` with the page in grayscale.
  - **Observed:** the two notices look alike.
  - **Expected:** the type is stated in text or by an icon with a text alternative.
  - **Relevant elements:** `#notice-info`, `#notice-error`
  - **Confidence:** High. Seen in the browser.
  - **Source:** browser check

## Minor issues

| # | Element | WCAG SC | Title | Suggested fix | Confidence |
|---|---|---|---|---|---|

## Best practices

| # | Element | What | Suggested fix | Confidence |
|---|---|---|---|---|

## Needs verification

| # | Element | WCAG SC | Suspected severity | Why suspected | Check that would confirm it |
|---|---|---|---|---|---|

## Out of scope

Nothing.
