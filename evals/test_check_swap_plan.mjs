#!/usr/bin/env node
// Tests evals/check_swap_plan.mjs and `run_plan_eval.mjs --fixture swap`. No browser, no model: the grader gets plan text, and the
// runner gets a stand-in for the claude CLI.
// Usage: node evals/test_check_swap_plan.mjs   (exits 1 if the grader misjudges any case)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeSwapPlan } from "./check_swap_plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const FENCE = "```";
const GUARD = { target: "2.1.1|Close control", kind: "manual", test: null, waiver: "the project has no automated tests" };
const block = (o) => `${FENCE}a11y-plan\n${JSON.stringify(o, null, 2)}\n${FENCE}`;

// A good plan, with a knob for each thing the grader looks for.
const plan = ({ json = { targets: ["2.1.1|Close control"], renames: [], guards: [GUARD] }, button = "button", analysis = true, script = "app.js", hover = "hover", verb = "updated", defaults = "padding, border, font and background", risk = "risk level medium", rendered = "look at the rendered result in a browser", extra = "" } = {}) => [
  "# Fix plan: close control",
  `## Targets\n${block(json)}`,
  `## Files and changes\n\`index.html\`: make the close control a \`${button}\` with an accessible name.`,
  "## What will not change\nNothing else.",
  `## Risks\n${analysis ? [
    `Element change: div to ${button}, ${risk}.`,
    `- Selectors that depend on the old element: \`div.close\` and \`.dialog div.close:${hover}\` in \`styles.css\` (lines 4 and 5), and \`document.querySelector('div.close')\` in \`${script}\` (line 2). All three are ${verb} in this change to use \`.close\`.`,
    "- `.dialog > div:first-child` and `.dialog > div:last-child` are unaffected: the close control sits between the title and the body.",
    `- Browser defaults the ${button} brings: ${defaults}. The styles reset them.`,
    `- After the change, ${rendered}: the shape and position should be unchanged.`,
  ].join("\n") : "The close control changes. Be careful."}`,
  "## Test coverage\nThe project has no automated tests, so none are added.",
  extra,
].filter(Boolean).join("\n\n");
const grade = (over = {}, grading = {}) => gradeSwapPlan({ planText: plan(over), changed: [], toolUses: [{ name: "Read", input: {} }, { name: "ExitPlanMode", input: {} }], ...grading });
const failedNames = (r) => r.results.filter((x) => !x.ok).map((x) => x.name);
const onlyFails = (r, ...starts) => { const f = failedNames(r); return f.length === starts.length && starts.every((s) => f.some((x) => x.startsWith(s))); };

check("a correct plan passes every check", failedNames(grade()).length === 0);
check("the real plans from earlier runs (Haiku and Sonnet) all pass", (() => { const d = path.join(here, "swap_fixture", "sample_plans"); const fs_ = fs.readdirSync(d); return fs_.length >= 5 && fs_.every((f) => failedNames(gradeSwapPlan({ planText: fs.readFileSync(path.join(d, f), "utf8"), toolUses: [{ name: "ExitPlanMode", input: {} }] })).length === 0); })());

// the gate and the block
check("a file written before approval fails the 'nothing written' check only", onlyFails(grade({}, { changed: ["index.html"] }), "Nothing was written"));
check("a Write attempt fails the 'nothing written' check only", onlyFails(grade({}, { toolUses: [{ name: "Write", input: { file_path: "C:\\p\\index.html" } }, { name: "ExitPlanMode", input: {} }] }), "Nothing was written"));
check("a plan written to the CLI's plans folder counts as submitted and is not a project write", failedNames(grade({}, { toolUses: [{ name: "Write", input: { file_path: "C:\\Users\\x\\.claude\\plans\\p.md", content: "x" } }] })).length === 0);
check("a plan never submitted fails that check only", onlyFails(grade({}, { toolUses: [{ name: "Read", input: {} }] }), "The plan was submitted"));
check("an empty plan fails", gradeSwapPlan({ planText: "", toolUses: [] }).results.some((r) => !r.ok && r.name === "There is a plan to read"));
check("no a11y-plan block fails the block check", failedNames(gradeSwapPlan({ planText: plan().replace(/```a11y-plan[\s\S]*?```/, "none"), toolUses: [{ name: "ExitPlanMode", input: {} }] })).some((x) => x.startsWith("The plan has one a11y-plan block")));
check("a target that is not the close control fails the block check", failedNames(grade({ json: { targets: ["4.1.2|Menu"], guards: [{ ...GUARD, target: "4.1.2|Menu" }] } })).some((x) => x.startsWith("The plan has one a11y-plan block")));
check("an automatable Guard with a test, in a project that has no tests, fails the block check", failedNames(grade({ json: { targets: ["2.1.1|Close control"], guards: [{ target: "2.1.1|Close control", kind: "automatable", test: "tests/a.test.mjs", waiver: null }] } })).some((x) => x.startsWith("The plan has one a11y-plan block")));

// the element-change analysis, one thing at a time
check("a plan that never says 'element change' fails that check (and says no risk level, so it fails that too)", failedNames(grade({ analysis: false })).some((x) => x.startsWith("The plan has an element-change analysis")));
check("never naming the script that finds the old element fails that check only", onlyFails(grade({ script: "the script" }), "It names the script that finds the old element"));
check("never naming the hover rule fails that check only", onlyFails(grade({ hover: "focus" }), "It names the style rules that target the old element"));
check("listing the dependencies without planning to change them fails that check only", onlyFails(grade({ verb: "listed" }), "It plans to update those dependencies"));
check("an update on the line after the dependency counts", failedNames(gradeSwapPlan({ planText: plan().replace("All three are updated in this change to use `.close`.", "\nThey are all updated to use `.close`."), toolUses: [{ name: "ExitPlanMode", input: {} }] })).length === 0);
check("naming only one browser default fails that check only", onlyFails(grade({ defaults: "padding" }), "It says which browser defaults"));
check("a plan with no risk level fails that check only", onlyFails(grade({ risk: "needs care" }), "It gives a risk level"));
check("any of low, medium and high is accepted as the risk level", ["low", "medium", "high"].every((l) => failedNames(grade({ risk: `risk level ${l}` })).length === 0) && failedNames(grade({ risk: "medium risk" })).length === 0);
check("a level right after the label ('Element change: medium') is a risk level", failedNames(grade({ risk: "needs care" }, {})).length === 1 && failedNames(gradeSwapPlan({ planText: plan({ risk: "needs care" }).replace("Element change: div to button, needs care.", "**Element change: medium.** Everything is listed below."), toolUses: [{ name: "ExitPlanMode", input: {} }] })).length === 0);
check("a level after a parenthetical on the label line ('Element change (`div` to `button`): low-to-medium') is a risk level", failedNames(gradeSwapPlan({ planText: plan({ risk: "needs care" }).replace("Element change: div to button, needs care.", "**Element change (`div` to `button`): low-to-medium.**"), toolUses: [{ name: "ExitPlanMode", input: {} }] })).length === 0);
check("a level on a later line, not the label's, is not taken for the element change's risk", failedNames(gradeSwapPlan({ planText: plan({ risk: "needs care" }).replace("Element change: div to button, needs care.", "Element change: div to button.\nThe button is large, medium sized, and round."), toolUses: [{ name: "ExitPlanMode", input: {} }] })).some((x) => x.startsWith("It gives a risk level")));
check("'a medium risk' on a later line is a risk level too", failedNames(gradeSwapPlan({ planText: plan({ risk: "needs care" }).replace("Element change: div to button, needs care.", "Element change: div to button.\nOverall this is a medium risk."), toolUses: [{ name: "ExitPlanMode", input: {} }] })).length === 0);
check("a label with no level after it is not a risk level", failedNames(gradeSwapPlan({ planText: plan({ risk: "needs care" }).replace("Element change: div to button, needs care.", "**Element change:** div to button. Needs care."), toolUses: [{ name: "ExitPlanMode", input: {} }] })).some((x) => x.startsWith("It gives a risk level")));
check("never saying to look at the rendered result fails that check only", onlyFails(grade({ rendered: "trust the selectors" }), "It tells the reader to look at the rendered result"));
check("making it a link instead of a button fails that check (the button word is the swap)", failedNames(grade({ button: "link" })).some((x) => x.startsWith("The plan makes the close control a button")));

// what the block says, and where the names sit
check("a Guard for the close control that is not listed as a target fails the block check", failedNames(grade({ json: { targets: ["4.1.2|Menu"], guards: [GUARD] } })).some((x) => x.startsWith("The plan has one a11y-plan block")));
check("an automatable Guard with a waiver and no test is not the manual Guard the report gave: fails the block check", failedNames(grade({ json: { targets: ["2.1.1|Close control"], guards: [{ ...GUARD, kind: "automatable" }] } })).some((x) => x.startsWith("The plan has one a11y-plan block")));
check("a manual Guard that names a test file fails the block check (the project has no tests)", failedNames(grade({ json: { targets: ["2.1.1|Close control"], guards: [{ ...GUARD, test: "tests/a.test.mjs" }] } })).some((x) => x.startsWith("The plan has one a11y-plan block")));
check("the close control listed as a target with no Guard at all fails the block check", failedNames(grade({ json: { targets: ["2.1.1|Close control"], guards: [] } })).some((x) => x.startsWith("The plan has one a11y-plan block")));
check("exactly two browser defaults is enough", failedNames(grade({ defaults: "padding and border" })).length === 0);
check("naming app.js on one line and the selector on another does not count as naming the script's dependency", onlyFails(grade({ script: "the script", extra: "Note: app.js is not involved in the markup." }), "It names the script that finds the old element"));
check("naming styles.css on one line and div.close on another does not count as naming the style rules", failedNames(gradeSwapPlan({ planText: plan({ extra: "`styles.css` is the stylesheet." }).replace("in `styles.css` (lines 4 and 5)", "in the stylesheet (lines 4 and 5)"), toolUses: [{ name: "ExitPlanMode", input: {} }] })).some((x) => x.startsWith("It names the style rules")));

// the false alarm
check("saying the structural rules will break fails that check only", onlyFails(grade({ extra: "Note: `.dialog > div:first-child` will break after the change." }), "It does not say the :first-child"));
check("saying they do not break is fine", failedNames(grade({ extra: "`.dialog > div:first-child` does not break, because the title stays first." })).length === 0);
check("saying they still match is fine", failedNames(grade({ extra: "`.dialog > div:last-child` still matches the body." })).length === 0);
check("a claim of 'fully accessible' fails that check only", onlyFails(grade({ extra: "Afterwards the page is fully accessible." }), "The plan does not claim"));
check("'do not say it is fully accessible' is not a claim", failedNames(grade({ extra: "Do not say the page is fully accessible." })).length === 0);

// the runner, end to end against the fake CLI
const work = fs.mkdtempSync(path.join(os.tmpdir(), "swap-eval-test-"));
const runner = path.join(here, "run_plan_eval.mjs");
const argsFile = path.join(work, "args.json");
const go = (fake, extra = []) => spawnSync(process.execPath, [runner, "--model", "fake", "--fixture", "swap", "--scratch", path.join(work, "s-" + fake), "--out", path.join(work, "o-" + fake), ...extra], { encoding: "utf8", env: { ...process.env, CLAUDE_BIN: path.join(here, "fake_claude.mjs"), FAKE_CLAUDE: fake, FAKE_CLAUDE_ARGS_FILE: argsFile } });
let r = go("plan-swap");
check("run_plan_eval --fixture swap: a good plan exits 0 and prints the cost", r.status === 0 && /checks passed/.test(r.stdout) && /cost \$0\.0123/.test(r.stdout));
check("run_plan_eval --fixture swap: the agent works in a copy of the swap project, in plan mode", fs.existsSync(path.join(work, "s-plan-swap", "swap-planmode-normal-run-1", "styles.css")) && !fs.existsSync(path.join(work, "s-plan-swap", "swap-planmode-normal-run-1", "tests")) && JSON.parse(fs.readFileSync(argsFile, "utf8")).includes("plan"));
r = go("plan-swap-thin");
check("run_plan_eval --fixture swap: a plan with no element-change analysis exits 1 and names the check", r.status === 1 && /FAIL The plan has an element-change analysis/.test(r.stdout));
r = go("plan-swap-edit");
check("run_plan_eval --fixture swap: editing the page before approval exits 1", r.status === 1 && /FAIL Nothing was written/.test(r.stdout));
check("run_plan_eval --fixture swap: the opt-out variant and plan-file mode are usage errors", go("plan-swap", ["--variant", "optout"]).status === 2 && go("plan-swap", ["--mode", "planfile"]).status === 2);
check("run_plan_eval: an unknown fixture is a usage error", spawnSync(process.execPath, [runner, "--model", "x", "--fixture", "nope"], { encoding: "utf8" }).status === 2);
fs.rmSync(work, { recursive: true, force: true });

console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
