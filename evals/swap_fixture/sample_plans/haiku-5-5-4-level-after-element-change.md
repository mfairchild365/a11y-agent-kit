# Fix plan: report.md (Account settings page, close control)

## What the ticket asks
Fix the accessibility issues in `report.md`. The report has one finding: the help dialog's close control is a `div` with a click handler, so keyboard and screen reader users cannot close the dialog (WCAG 2.1.1, Critical).

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
- `index.html` line 14: replace `<div class="close" id="close">&times;</div>` with `<button type="button" class="close" id="close" aria-label="Close help">&times;</button>`.
- `app.js` line 2: change `document.querySelector('div.close')` to `document.getElementById('close')`, so the handler no longer depends on the element type.
- `styles.css` line 4: change `div.close` to `.close`. Add `border: 0; padding: 0; margin: 0; font: inherit; color: inherit;` so the button keeps the current 28px circle, background and centred glyph. Keep the default focus outline.
- `styles.css` line 5: change `.dialog div.close:hover` to `.dialog .close:hover`.

## Library or consumer
Consumer. The defect is in this page's markup. There is no shared component.

## What will not change
- Focus after the dialog closes. The handler sets `hidden` on the dialog while the button has focus, so focus drops to the page body. The report does not cover this, so it is not fixed here. Ask before adding focus restoration.
- The dialog itself: no `role="dialog"`, no labelled title, no Escape key handling. None of these is in the report.

## Risks
- **Element change: medium.** `div.close` is used in `app.js` and in two rules in `styles.css`. The plan changes all three. If one is missed, the handler throws on page load (the close button stops working) or the button loses its styling. The rendered result must be checked by eye.
- **Button defaults:** border, padding, font and colour. The reset in the Files section covers them. Check the rendered size and position against the current page.
- **Name and visible label:** the visible label is a glyph (`×`), so the accessible name "Close help" does not contain the visible text. This is an icon-only control, so the name-label rule cannot be met literally. Keeping the glyph as the name would announce "multiplication sign", so "Close help" is proposed. Confirm this choice.

## Test coverage
- **Strategy:** manual check, because the project has no test setup (`detect-a11y-tests.mjs` reports `setup: none`, and `AGENTS.md` says there are no automated tests). No test is added.
- **Where:** `index.html`, `app.js`, `styles.css`, checked in a browser.
- **Guard for 2.1.1|Close control:** manual: Tab from the page to the close control, confirm it has a focus ring, press Enter and then Space, confirm the dialog hides each time. Confirm a screen reader announces "Close help, button" (the report had no screen reader pass).
- **No tests for this change:** the project has no automated tests (`AGENTS.md`). Adding a test setup is a separate item, and it is recommended to decline it for this one-control change. Confirm.

## Open questions for the user
1. Accept "Close help" as the accessible name for the icon-only close button?
2. Decline a test setup, so the manual Guard stands?
3. Leave focus restoration after close out of scope (see "What will not change")?
