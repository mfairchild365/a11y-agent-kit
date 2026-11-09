# Fix plan: account settings close control

## What the ticket asks
Fix the critical finding in `report.md`: the help dialog's close control cannot be reached or activated by keyboard or screen reader users.

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
1. `styles.css`, lines 4 and 5: change `div.close` to `.close` (and `.dialog div.close:hover` to `.dialog .close:hover`). This step works on the current `div`, so it can ship first.
2. `app.js`, line 2: change `querySelector('div.close')` to `querySelector('#close')`. Same reason: it works on the current `div`.
3. `index.html`, line 14: change `<div class="close" id="close">&times;</div>` to `<button type="button" class="close" id="close" aria-label="Close help">&times;</button>`.
4. `styles.css`, the `.close` rule: reset the button defaults that would change its look: `border: 0; padding: 0; margin: 0; font: inherit;`. Keep the existing position, size, background, radius, and `cursor: pointer`. Do not remove the focus outline; the browser default stays.

## Library or consumer
Consumer fix. The defect is in this page's markup, `index.html`, and its script and styles. No shared component is involved.

## What will not change
- The dialog's structure, copy, and `hidden` behavior.
- Heading structure. The report found no other issues, and none were triaged.
- Nothing outside these three files.

## Risks
- Breaking the close behavior: `app.js` finds the control by selector. Step 2 moves the selector to `#close` before the element changes, so the handler is never left pointing at nothing.
- Visual change: a button brings its own border, padding, and font. Step 4 resets these. Check that the circle and position look as before.
- Element change: `div` to `button`.
  - Selectors that depend on the old element: `div.close` in `styles.css` (lines 4 and 5) and `querySelector('div.close')` in `app.js` (line 2). Steps 1 and 2 remove both dependencies before the element changes.
  - Browser defaults the button brings: border, padding, margin, font, and background. Step 4 resets them.
  - Risk level before steps 1–2: **high**. After steps 1–2: **low**. The rendered result still needs a look, because the reset list may be incomplete.
- Accessible name: `aria-label="Close help"` is the name the report asks for. The visible text is only the "×" glyph, so the name does not contain visible label text. This is the one place the name-label rule is bent, so please confirm the name is what you want.

## Test coverage
- **Strategy:** manual. `AGENTS.md` says the project has no automated tests, so this plan adds none and does not propose a test setup.
- **Where:** a browser, opening `index.html`.
- **One line per Guard:**
  - 2.1.1|Close control: manual: Tab to the close control, confirm it has a visible focus ring, press Enter. The dialog must hide, and the control must announce as "Close help, button" in a screen reader if one is available. A screen reader check was not run in the earlier audit.
- After the change: re-run the axe check and the keyboard walk on `index.html`, produce an "after" report, then run `verify-fix.mjs` with `--plan`.

## Open question for you
Do you want a minimal automated accessibility test setup added for this project? The plan does not add one, because `AGENTS.md` says there are no automated tests. If you say yes, it becomes its own plan item and this Guard would gain an automated test.
