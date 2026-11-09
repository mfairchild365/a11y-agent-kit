# Accessibility audit: Account settings page

## Summary

- **Scope:** `index.html`, rendered at desktop width.
- **Verdict:** The close control can't be used with a keyboard or a screen reader.
- **Findings:** Critical 1. 0 best practices. 0 need verification.
- **Checks:** axe, keyboard and tree pass run; no screen reader.
- **Fix first:**
  1. Make the close control a real button (#1)
- **Triage:** Fix now #1

## Findings

### Element: Close control

One close control, 1 instance.

#### 1. Critical · 2.1.1 · 1 instances · High confidence · The close control is a div with a click handler

- **Summary:** The close control is a `div` with a click handler. It isn't in the Tab order, has no role and no name, so a keyboard or screen reader user can't close the dialog.
- **Why this severity:** A control that can't be operated by keyboard is Critical under the anchors.
- **Suggested fix:** Use a `button` with an accessible name such as "Close help".
- **Guard:** manual: Tab to the close control and press Enter; the dialog closes and the control announces as "Close help, button".
- **Evidence:**
  - **WCAG SC:** 2.1.1 Keyboard
  - **Status:** pre-existing
  - **Repro steps:**
    1. Open `index.html` and press Tab.
  - **Observed:** focus never reaches the control; accessibility tree: `generic ""`.
  - **Expected:** `button "Close help"`.
  - **Relevant elements:** `#close`
  - **Confidence:** High. Reproduced.
  - **Source:** keyboard walk

## Minor issues

## Needs verification

## Out of scope

Nothing.
