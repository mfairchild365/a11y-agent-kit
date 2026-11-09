# Fix plan: report.md (Account settings page)

## What the ticket asks
Fix the accessibility issue in `report.md`: the close control on the help dialog is a `div` with a click handler, so keyboard and screen reader users can't close it.

## Targets
- `2.1.1|Close control` (Critical, 1 instance, `#close`)

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
- `index.html:14`: replace `<div class="close" id="close">&times;</div>` with `<button type="button" class="close" id="close" aria-label="Close help">&times;</button>`. The `aria-label` gives the name "Close help" the report expects, since the visible "×" glyph isn't a usable name. The visible text is only a symbol, so the name-label match rule is met.
- `app.js:2`: the selector `div.close` stops matching once the element is a button. Change it to `document.getElementById('close')` (the id already exists). Same handler, no behaviour change. A native button fires `click` on Enter and Space, so no key handlers are needed.
- `styles.css:4-5`: change `div.close` to `.close` and `.dialog div.close:hover` to `.dialog .close:hover`. Add `border: 0; padding: 0; font: inherit; color: inherit;` to cancel the button defaults (border, padding, font, colour). Keep `cursor: pointer` and the existing size and position. Don't add `outline: none`, so the browser focus ring stays.

## Library or consumer
Page-level markup. There's no shared component in this project, so the fix goes in place.

## What will not change
Seen while reading the code, not in the report, so left alone unless you ask:
- The help box has no `role="dialog"` / accessible name, and no focus management. Once closed, focus falls back to `<body>` because the focused button becomes hidden. Moving focus to a sensible place on close would be the natural follow-up.
- No Escape-to-close, and no "Skip to main content" link (only one block of content, so low value).
- `.dialog-title` is a `div`, not a heading.

## Risks
- **Element change: `div` to `button`.**
  - Selectors that depend on `div`: `app.js:2` (`div.close`), `styles.css:4` (`div.close`), `styles.css:5` (`.dialog div.close:hover`). All three are updated in this plan.
  - `.dialog > div:first-child` and `.dialog > div:last-child` target the title and body. They aren't affected, because the button is neither first nor last child.
  - Browser defaults the button brings: border, padding, font family and size, colour, and `display: inline-block`. The CSS above resets them. The element is `position: absolute`, so display and margins don't matter.
  - Risk level: **medium**. Few selectors, all identified, but the result needs a visual check.
- Contrast: `#eee` on white is under 3:1, but the "×" glyph (inherited near-black text on `#eee`) carries the meaning and is well above 4.5:1. The focus ring is the browser default.

## Test coverage
- **Strategy:** manual, rendered-browser check. `AGENTS.md` says there are no automated tests in this project, so I won't add a test setup. I'm recording that as a decline: "no tests for this change: the project has no automated tests".
- **Where:** none.
- **Guard:**
  - `2.1.1|Close control`: manual. Open `index.html`, press Tab. Focus reaches the control with a visible ring and it announces as "Close help, button". Press Enter or Space and the dialog closes. Also check the "×" still looks the same (round grey circle, top right).

## Verification
1. Re-run the accessibility reviewer on `index.html` for an "after" report. Compare it with `report.md` using `scripts/verify-fix.mjs --plan`, expecting `fixed` with the Guard reported as `manual`.
2. Do the manual Guard above and look at the rendered page.
