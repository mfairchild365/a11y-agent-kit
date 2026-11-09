# Swap fixture

A tiny static page for the plan eval (`evals/run_plan_eval.mjs --fixture swap`). The close control of a dialog is a `<div>` with a
click handler, so the correct fix is to make it a `<button>`. Three things depend on it being a `div`:

- `styles.css` line 4, `div.close { ... }`
- `styles.css` line 5, `.dialog div.close:hover { ... }`
- `app.js` line 2, `document.querySelector('div.close')`

Two other rules, `.dialog > div:first-child` and `.dialog > div:last-child`, look at risk but are not affected, because the close control sits
between the title and the body.

`report.md` is a one-issue audit report with a manual Guard. `AGENTS.md` says the project has no automated tests, so a good plan adds none.
The grader, `check_swap_plan.mjs`, checks that the plan lists these dependencies, the button's browser defaults and a risk level, and
tells the reader to look at the rendered result. Keep the line numbers above in step with the files.
