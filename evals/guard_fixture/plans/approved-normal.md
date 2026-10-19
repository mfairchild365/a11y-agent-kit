# Fix plan: roster (approved)

## What the ticket asks
Fix the two automatable issues in report.md. The notices (1.4.1) stay a ticket.

## Targets
```a11y-plan
{
  "targets": ["4.1.2|Close button", "1.4.3|\"New\" badge"],
  "renames": [],
  "guards": [
    { "target": "4.1.2|Close button", "kind": "automatable", "test": "tests/guards.test.mjs::close button has an accessible name", "waiver": null },
    { "target": "1.4.3|\"New\" badge", "kind": "automatable", "test": "tests/guards.test.mjs::badge text meets contrast", "waiver": null }
  ]
}
```

## Files and changes
- `index.html`: add `aria-label="Close"` to the close button; use white text on `#1a5fb4` for the badge.
- `tests/guards.test.mjs`: one axe test per Guard, using the helpers in `tests/helpers.mjs`.

## What will not change
The notices (1.4.1). The page's other markup.

## Risks
The badge colour changes.

## Test coverage
- **Strategy:** the project's own accessibility tests in `tests/`.
- **Where:** `tests/guards.test.mjs`, using `tests/helpers.mjs`.
- **Guards:** close button: the `button-name` test. Badge: the `color-contrast` test.
