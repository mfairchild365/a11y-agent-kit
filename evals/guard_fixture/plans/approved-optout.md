# Fix plan: roster (approved)

## What the ticket asks
Fix the two automatable issues in report.md. The notices (1.4.1) stay a ticket.

## Targets
```a11y-plan
{
  "targets": ["4.1.2|Close button", "1.4.3|\"New\" badge"],
  "renames": [],
  "guards": [
    { "target": "4.1.2|Close button", "kind": "automatable", "test": null, "waiver": "the project adds no automated tests" },
    { "target": "1.4.3|\"New\" badge", "kind": "automatable", "test": null, "waiver": "the project adds no automated tests" }
  ]
}
```

## Files and changes
- `index.html`: add `aria-label="Close"` to the close button; use white text on `#1a5fb4` for the badge.

## What will not change
The notices (1.4.1). The page's other markup. No test files.

## Risks
The badge colour changes.

## Test coverage
The project has opted out of automated tests (AGENTS.md). No tests are added; the two Guards are checked by hand in review.
