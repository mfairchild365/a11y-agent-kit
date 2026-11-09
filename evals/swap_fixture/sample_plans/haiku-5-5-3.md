# Fix plan: report.md (Account settings page)

## Context

`report.md` audits `index.html` and has one finding, rated Critical under WCAG 2.1.1 (Keyboard). The help dialog's close control is a `<div class="close">` with a click handler. It is not in the Tab order, has no role and no name, so keyboard and screen reader users cannot close the dialog. The user asked to fix the issues in the report, using the building-accessible-ui skill.

## What the ticket asks

Fix the accessibility issues listed in `report.md`. In practice, that is one issue: make the close control a real, keyboard-operable button with an accessible name.

## Targets

- `2.1.1|Close control`

```a11y-plan
{
  "targets": ["2.1.1|Close control"],
  "renames": [],
  "guards": [
    { "target": "2.1.1|Close control", "kind": "manual", "test": null, "waiver": null }
  ]
}
```

## Files and changes

- **`index.html` (line 14):** replace `<div class="close" id="close">&times;</div>` with `<button type="button" class="close" id="close" aria-label="Close help">&times;</button>`.
  - `type="button"` so it never submits a form.
  - `aria-label="Close help"` gives the name the report expects. The visible label is "×", which has no text, so the name-label match rule does not conflict here.
- **`app.js` (line 2):** the selector `document.querySelector('div.close')` no longer matches. Change it to `document.getElementById('close')`, which matches the element's `id`.
- **`styles.css` (lines 4–5):** the rules target `div.close` and `.dialog div.close:hover`. Change both to `button.close` (or `.close`). Add a reset for the button's default chrome: `font: inherit; padding: 0; border: 0; color: inherit;`. Keep the existing `width`, `height`, `line-height`, `background` and `border-radius`.
  - Do not remove or override the focus outline. The browser's default focus ring must stay visible.

## Library or consumer

Consumer. This is a one-off dialog in a static page, not a shared component. The fix belongs in `index.html`, with the matching script and style selectors updated in the same change.

## Element change

- **Selectors that depend on the old element:**
  - `app.js:2`: `div.close`. Being changed (see above).
  - `styles.css:4`: `div.close`. Being changed.
  - `styles.css:5`: `.dialog div.close:hover`. Being changed.
  - `styles.css:3` and `:6` (`.dialog > div:first-child` and `.dialog > div:last-child`) are unaffected. The close control is between the title and body, so the first and last `div` children do not change.
- **Browser defaults the `button` brings:** padding, border, font, text color and a default background. The reset in `styles.css` covers these.
- **Risk level: medium.** Two element selectors, both in files that are being edited anyway. Manageable.

## Risks

- **Focus after close (not in the report, needs your decision).** Once the button is focusable, pressing it hides `#help` while focus is on the button. Focus then drops to `<body>`, and a keyboard user loses their place. The skill's focus-management rule says focus should move to a sensible place (for example the "Account settings" `<h1>`, or the control that opened the dialog). I have not added this to the plan because the report did not ask for it. **Question for you:** include it in this change, or record it as a follow-up?
- **Visual change.** The close control will look the same only if the reset is correct. Check it in the browser after the change.

## What will not change

Out of scope, reported for you, not touched:

- **Dialog title is a `<div>`, not a heading.** `<div class="dialog-title">Need help?</div>` should be a heading (for example `<h2>`). This is a structure issue (headings checklist), not in the report.
- **Inline `<script>` and `div` selectors in `app.js` and `styles.css`** are otherwise untouched.

## Test coverage

- **Strategy:** the project has no automated tests (`AGENTS.md`: "There are no automated tests in this project"). The skill therefore asks for the manual guard above. I am not adding a test setup unless you approve it (see below).
- **Where:** none. The guard is checked by hand.
- **One line per Guard:**
  - `2.1.1|Close control`: manual. Open `index.html` in a browser. Press Tab until the close control (×) is focused and the focus ring is visible. Press Enter. The dialog closes. Confirm the control announces as "Close help, button" with a screen reader or in the browser's accessibility tree (expected `button "Close help"`).
- **Optional: minimal test setup.** Adding a small accessibility test (for example, axe in a headless browser, one test for "close button has a name") is its own item. **Question for you:** approve it, or decline it (recorded here as "no tests for this change: static page, no test setup")?

## Verification

1. Apply the three edits above.
2. Manual guard: Tab to the × and press Enter. The dialog closes. Check the focus ring and the accessible name.
3. Re-audit the page after the change and check that 2.1.1 is resolved. Compare with `report.md` using the skill's `verify-fix.mjs` (it needs the `--plan` file and a changed-files list).

## Open questions for you

1. Should the focus-after-close fix (move focus to the heading or the opener) be included in this change?
2. Should I add a minimal automated accessibility test setup, or leave the check manual for this static page?
3. Should the dialog title `<div>` be fixed as a heading in this change, or left as a follow-up?
