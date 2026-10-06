# Sample reports

Two hand-built reports for `../index.html`, used to test `check_audit_report.mjs` itself.
They are not agent output.

- `good/` follows the report template and finds every seeded defect. The checker should pass
  all checks, including axe on `report.html`.
- `broken/` has deliberate mistakes. The checker should fail exactly these: no Fix first list,
  the tooltip's keyboard and hover failures merged into one issue with two SCs and the keyboard
  barrier rated Moderate (see `docs/audit-corrections.md`, C-001 and C-002), a best practice
  rated Minor (C-004), wrong severity totals, a Minor issue written as a card, a decorative-icon
  decoy reported as an issue, missing screenshots, a "fully accessible" claim, and no
  `report.html`.

```bash
PW_CHANNEL=msedge node evals/check_audit_report.mjs evals/audit_fixture/sample/good     # passes
node evals/check_audit_report.mjs evals/audit_fixture/sample/broken --skip-axe          # fails
```

`good/` also shows what a finished report looks like. Run the checker against these after any
change to `check_audit_report.mjs` or the template.
