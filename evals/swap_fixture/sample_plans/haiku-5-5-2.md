# Fix plan: report.md (Account settings page)

## What the ticket asks
Fix the accessibility issues in `report.md`. The report has one finding: the help dialog's close control is a `div` with a click handler, so keyboard and screen reader users cannot close the dialog (WCAG 2.1.1, Critical, high confidence, reproduced).

## Targets

```a11y-plan
{
  "targets": ["2.1.1|Close control"],
  "renames": [],
  "guards": [
    { "target": "2.1.1|Close control", "kind": "manual", "test": null, "waiver": "project has no automated accessibility tests (AGENTS.md); manual check per the report" }
  ]
}
```

Note: the report's key is `2.1.1|Close control`, from its finding title. The report lists the element as "Close control" and the SC as 2.1.1. Check the key format against the report before the verify step.

## Files and changes

**`index.html`, line 14.** Replace the close control:
- From: `<div class="close" id="close">&times;</div>`
- To: `<button type="button" class="close" id="close" aria-label="Close help"><span aria-hidden="true">&times;</span></button>`
- Keep `id` and `class`, so the existing hooks still find the element. The `×` is a decorative glyph, so it is hidden from assistive technology and the name comes from `aria-label`.

**`styles.css`, lines 4–5.** The rules use the element selector `div.close`, which stops matching a `button`. Change them to match the class only:
- Line 4: `div.close {` becomes `.close {`.
- Line 5: `.dialog div.close:hover` becomes `.dialog .close:hover`.
- Add a button reset to the `.close` rule so the browser defaults don't change the look: `border: 0; padding: 0; margin: 0; font: inherit; color: inherit;` (`display` and `width`/`height` already apply to inline-block; `line-height` already set).
- Keep the existing `background`, `border-radius`, `cursor: pointer`, and the hover background.
- Add a visible focus style, `.close:focus-visible { outline: 2px solid #444; outline-offset: 2px; }`, so the control is not left with no focus indicator. Check the outline's contrast against the `#eee` background and the `#fff` page background: `#444` on `#eee` is above 3:1 (verify by formula before submitting).

**`app.js`, line 2.** `document.querySelector('div.close')` becomes `document.querySelector('.close')`, or `document.getElementById('close')`. Prefer the `getElementById` form, since the `id` already exists and is unique.

## Library or consumer
Page-level defect in `index.html`, its style, and its script. No shared component is involved. Fixed in place.

## Focus after close (decision needed)
When the dialog is hidden (`hidden = true`) while focus is on the button, focus is lost to `<body>`. This is not in the report. Options:
- **A (recommended):** After hiding, move focus to the `<h1>` (`Account settings`) or the `<main>`, with `tabindex="-1"` on the target. Small and local.
- **B:** Leave focus loss as is and list it under "What will not change".

## What will not change (out of scope, noted for the user)
- The dialog `div.dialog` has no role and no label. It is not a `dialog` and is not announced as one. Issue, affected users: screen reader users do not hear the help dialog as a dialog. Fix: a `role="dialog"` or `<dialog>` with an accessible name. Ask before changing.
- `div.dialog-title` is styled as a heading but is not a heading. Affects screen reader users navigating by heading. Ask before changing.
- Report "Minor issues" and "Needs verification" are empty. No screen reader check was run. The manual Guard below covers the close control only.

## Risks
- **Element change (div → button):** low-to-medium risk, manageable. Dependent selectors are the three listed above (`styles.css` lines 4–5, `app.js` line 2). They are updated in this change. Browser defaults the button brings are border, padding, margin, font, and color, all reset above. No `:first-of-type` or `div > y` selector touches the close control. `.dialog > div:first-child` and `.dialog > div:last-child` still match the title and body, not the close control, because the close control sits in the middle. After the change, check the rendered result in a browser to confirm the position, size, and round shape are unchanged.
- The `×` glyph's visual size may shift slightly because the button uses `font: inherit`. Compare before and after.
- If the focus option A is chosen, the hidden dialog's focus move could be missed by a user who expects the page to scroll. Low risk.

## Test coverage
- **Strategy:** manual. The project has no automated accessibility tests, and `scripts/detect-a11y-tests.mjs` returned `setup: none`. AGENTS.md says "There are no automated tests in this project."
- **Where:** none. No runner, no package.json.
- **One line per Guard:**
  - `2.1.1|Close control`: manual: open `index.html` in a browser. Press Tab until the close control receives focus; confirm the focus outline is visible. Press Enter; confirm the dialog closes. Press Space on the control in a second run; confirm it also closes. A screen reader (NVDA or VoiceOver) should announce "Close help, button".
- **Adding a test setup:** not proposed. This would be a separate decision, requiring a package.json and a runner for a static page. Ask the user if they want this. If declined, record "no tests for this change: project has no test setup".

## Verification (after approval and the edit)
1. Re-run the manual Guard above in a browser.
2. Re-run the keyboard walk: Tab order reaches the close button before the page ends; no keyboard trap.
3. Visual check: compare the close control's position and look before and after.
4. Get an audit report of the same scope after the change, then run `verify-fix.mjs` with `report.md` as the before report and the new report as the after report, with `--plan` pointing at this plan and `--changed-files` from the file list above. Note: this project is not a git repo, so write `changed.txt` by hand: `index.html`, `styles.css`, `app.js`.

## Open questions for the user
1. Focus after close: option A (move focus to the heading) or B (leave it, list as out of scope)?
2. Should the two out-of-scope issues (dialog role/label, title that is not a heading) be included in this change, or left for a separate ticket?
3. Test setup: is manual-only acceptable for this change, or do you want a minimal accessibility test setup added (a separate plan item)?
