# Fix plan: report.md accessibility audit

## What the ticket asks
Fix the one finding in `report.md`: the close control is a `div` with a click handler, so keyboard and screen reader users can't close the help dialog.

## Targets
- `2.1.1|Close control` (Critical)

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
- `index.html:14`: replace `<div class="close" id="close">&times;</div>` with `<button type="button" class="close" id="close" aria-label="Close help"><span aria-hidden="true">&times;</span></button>`. The accessible name is "Close help", as the report expects.
- `styles.css:4-5`: change the `div.close` and `.dialog div.close:hover` selectors to `.close` / `.dialog .close:hover`. Add `border: 0; padding: 0; font: inherit` to reset button defaults. Add `:focus-visible` with a ≥3:1 outline, for example `outline: 2px solid #005fcc; outline-offset: 2px`.
- `app.js:2`: change `querySelector('div.close')` to `getElementById('close')`, so the script doesn't depend on the element type.

## Library or consumer
Page-level markup in this static page. There is no shared component.

## What will not change
- The dialog's own semantics (`role="dialog"`, labelling) and focus return after close. The report doesn't list them, and this is a non-modal inline box. I'll mention them in the summary as an observation, not edit them.
- `.dialog > div:first-child` and `:last-child` rules. Their positions stay the same after the swap, because `.close` sits in the middle.

## Risks
- **Element change (`div` to `button`): low-to-medium.**
  - Selectors that depend on `div`: `div.close` (CSS and JS) and `.dialog div.close:hover`. All three are updated above.
  - Browser defaults: button border, padding, font and background. They are reset in the CSS. `position: absolute` and the 28px size are kept.
  - `.dialog > div:first-child` / `:last-child` still match the title and body divs.
- Check the rendered result after the change. Selector reading can miss things.
- Contrast: `#eee` button background and the `×` glyph in default `ButtonText`. I'll set `color: #222` explicitly (about 13:1 on `#eee`). The focus outline `#005fcc` on white is about 6:1.

## Test coverage
- **Strategy:** the project has no automated tests (AGENTS.md), so nothing is added. The plan is a manual check plus a rendered-browser check.
- **Where:** none.
- **Close control (2.1.1):** manual. Tab to the control. It shows a visible focus ring. Press Enter and Space; the dialog closes. The control announces as "Close help, button". Reload and click it with a mouse to confirm it still works.
- No test setup is added, because the project says it has none. This is recorded as "no tests for this change: project has no test setup".

## Verification
1. Open `index.html` in a browser and run the manual guard above.
2. Check the rendered look against the old one: same circle, position and hover shade.
3. Re-run the audit (axe, keyboard walk, tree pass). Expect `button "Close help"` in the tree and 0 findings.
4. Compare before and after with `scripts/verify-fix.mjs`, if the skill scripts are available.
