# Fix plan: report.md (Account settings page)

## What the ticket asks
Fix the accessibility issues in `report.md`. It has one Critical finding: the close control is a `div` with a click handler, so keyboard and screen reader users can't close the help dialog.

## Targets
- 2.1.1|Close control

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
- `index.html`: replace `<div class="close" id="close">&times;</div>` with `<button type="button" class="close" id="close" aria-label="Close help"><span aria-hidden="true">&times;</span></button>`.
- `app.js`: change the selector `div.close` to `#close`. A `button` is no longer a `div`, so the old selector would throw. The click handler stays. Native buttons fire `click` on Enter and Space.
- `styles.css`:
  - Change `div.close` to `.close`, and `.dialog div.close:hover` to `.dialog .close:hover`.
  - Reset the button defaults: `border: 0; padding: 0; font: inherit; color: inherit;`. Keep the existing size, position, background and hover.
  - Don't remove the focus outline. Add `.close:focus-visible { outline: 2px solid #005fcc; outline-offset: 2px; }`, which is at least 3:1 against both #fff and #eee.

## Library or consumer
Consumer. The defect is in this page's markup. There is no shared component.

## What will not change
Seen, not touched. I'll ask before changing any of these.
- The dialog has no `role="dialog"`, accessible name or `aria-labelledby`. Its title is a plain `div`. It is an inline box, not a modal.
- Focus isn't moved to the dialog or restored after it closes. Once the dialog is hidden, focus is lost from the button.
- The title and body use `div` instead of a heading and paragraph.

## Risks
Element change: `div` to `button`, risk **medium**.
- Selectors that depend on the old element:
  - `app.js`: `div.close`, which I'll change to `#close`.
  - `styles.css`: `div.close` and `.dialog div.close:hover`, which I'll change to `.close`.
  - `.dialog > div:first-child` and `.dialog > div:last-child` only match the title and body divs. The button sits between them and is not a `div`, so they still match the same two elements.
- Browser defaults the button brings: border, padding, font and color. The reset above covers them.
- After the edit I'll render the page and check that the button looks the same: a 28px circle at the top right.

## Test coverage
- **Strategy:** The project has no test setup, and `AGENTS.md` says "There are no automated tests in this project." I'll run `detect-a11y-tests.mjs` to confirm. I won't add a test framework, and I'll record "no tests for this change: project has no automated tests". Tell me if you'd rather have a minimal axe test added.
- **Where:** n/a
- **2.1.1|Close control:** manual. Press Tab and check that the close control gets a visible focus ring. Press Enter, and then Space on a second load. The dialog should close, and a screen reader should announce "Close help, button".

## Verification
1. Run `node <skill>/scripts/detect-a11y-tests.mjs <project>` to confirm the test setup.
2. Take `snapshot.mjs` on `index.html` before the edit and again after it.
3. Have the `a11y-agent-kit:accessibility-reviewer` agent produce an "after" report.
4. Run `verify-fix.mjs before-report.md after-report.md --plan <this file>` and report the verdict. The manual Guard stays manual.
5. Report these checks to you: the keyboard walk, and the contrast of the focus ring and of × on #eee, which I'll compute. There is no screen reader pass, so I'll say so.
