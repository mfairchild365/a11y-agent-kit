# Sample reports

Two hand-built reports for `../index.html`, used to test `check_audit_report.mjs` itself.
They are not agent output.

- `good/` follows the report template and finds every seeded defect. The checker should pass
  all checks, including the digest (`digest.md`) and axe on `report.html`, which `render-report.mjs` produced from `report.md`.
- `broken/` has deliberate mistakes. The checker should fail exactly these: no Fix first list,
  the tooltip's keyboard and hover failures merged into one issue with two SCs and the keyboard
  barrier rated Moderate (see `docs/audit-corrections.md`, C-001 and C-002), a best practice
  rated Minor (C-004), wrong severity totals, a Minor issue written as a card, a decorative-icon
  decoy reported as an issue, `list-style: none` logged as a finding (C-013), a single overflowing line reported as a Reflow failure (C-011), the snackbar icon's non-text contrast failure rated Minor in the Minor table (C-016), the snackbar's timeout and hidden status icon never reported (C-017, C-018), an Undo button inside the live region logged as a finding instead of a best practice (C-019), the named dropdown section and the "Mute alerts" text swap never reported (C-020, C-021), the transient live-region message logged as a card instead of Needs verification, missing screenshots, a "fully accessible" claim, and no
  `report.html`; plus a stray paragraph and an extra section, an issue index table and a second
  Fix first, and a `digest.md` that carries evidence and images and has no link to the report.

```bash
PW_CHANNEL=msedge node evals/check_audit_report.mjs evals/audit_fixture/sample/good --digest evals/audit_fixture/sample/good/digest.md      # passes
node evals/check_audit_report.mjs evals/audit_fixture/sample/broken --digest evals/audit_fixture/sample/broken/digest.md --skip-axe        # fails
```

`good/` also shows what a finished report looks like. Run the checker against these after any
change to `check_audit_report.mjs` or the template.
