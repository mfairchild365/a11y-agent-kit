#!/usr/bin/env node
// Tests evals/check_plan_run.mjs: it must pass a correct plan and fail each way a plan can be wrong. No browser,
// no model.
// Usage: node evals/test_check_plan_run.mjs   (exits 1 if the grader misjudges any case)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changedFiles, gradePlan, planOf, sectionOf, toolUsesOf, PLAN_FILE } from "./check_plan_run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, "guard_fixture", "project");
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

const FENCE = "```";
const block = (o) => `${FENCE}a11y-plan\n${JSON.stringify(o, null, 2)}\n${FENCE}`;
const G_BUTTON = { target: "4.1.2|Close button", kind: "automatable", test: "tests/guards.test.mjs::close button has a name", waiver: null };
const G_BADGE = { target: '1.4.3|"New" badge', kind: "automatable", test: "tests/guards.test.mjs::badge text meets contrast", waiver: null };
const G_MANUAL = { target: "1.4.1|Notices", kind: "manual", test: null, waiver: null };
const W = (g) => ({ ...g, test: null, waiver: "the project adds no automated tests" });
const plan = ({ json = { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [G_BUTTON, G_BADGE] }, coverage = "- **Strategy:** the project's own tests.\n- **Where:** `tests/guards.test.mjs`, using `tests/helpers.mjs`.", extra = "", without = [] } = {}) => {
  const sections = {
    ask: "## What the ticket asks\nFix the two automatable issues in the report.\n",
    targets: `## Targets\n${block(json)}\n`,
    files: "## Files and changes\n`index.html`: name the button, raise the badge contrast.\n",
    lib: "## Library or consumer\nThe page itself.\n",
    not: "## What will not change\nThe notices (1.4.1) stay a ticket.\n",
    risks: "## Risks\nThe badge colour changes.\n",
    cov: `## Test coverage\n${coverage}\n`,
  };
  return `# Fix plan: roster\n\n${Object.entries(sections).filter(([k]) => !without.includes(k)).map(([, v]) => v).join("\n")}${extra}`;
};
const normal = (over = {}) => gradePlan({ planText: plan(over.plan), variant: "normal", mode: "planmode", changed: [], toolUses: [{ name: "Read", input: {} }, { name: "ExitPlanMode", input: {} }], ...over.grade });
const failedNames = (r) => r.results.filter((x) => !x.ok).map((x) => x.name);
const onlyFails = (r, ...starts) => { const f = failedNames(r); return f.length === starts.length && starts.every((s) => f.some((x) => x.startsWith(s))); };

check("a correct plan-mode plan passes every check", failedNames(normal()).length === 0);
check("a correct plan that also targets the manual issue, with a manual Guard, passes", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge', "1.4.1|Notices"], guards: [G_BUTTON, G_BADGE, G_MANUAL] } } })).length === 0);
check("keys are matched however they are cased and spaced", failedNames(normal({ plan: { json: { targets: ["4.1.2|close  button", '1.4.3|"new" BADGE'], guards: [{ ...G_BUTTON, target: "4.1.2|close  button" }, { ...G_BADGE, target: '1.4.3|"new" BADGE' }] } } })).length === 0);

// the gate
check("a file written in plan mode fails the 'nothing written' check", onlyFails(normal({ grade: { changed: ["index.html"] } }), "Nothing was written"));
check("a Write attempt in plan mode fails the 'nothing written' check", onlyFails(normal({ grade: { toolUses: [{ name: "Write", input: {} }, { name: "ExitPlanMode", input: {} }] } }), "Nothing was written"));
check("a plan never submitted with ExitPlanMode fails that check only", onlyFails(normal({ grade: { toolUses: [{ name: "Read", input: {} }] } }), "The plan was submitted"));
check("no plan text at all fails", gradePlan({ planText: "", mode: "planmode" }).results.some((r) => !r.ok && r.name === "There is a plan to read"));

const file = (over = {}) => gradePlan({ planText: plan(over.plan), variant: "normal", mode: "planfile", changed: [PLAN_FILE], message: "I wrote the plan to a11y-fix-plan.md. Please approve it and I will go ahead.", ...over.grade });
check("a correct plan-file run passes every check", failedNames(file()).length === 0);
check("plan-file mode: editing the page too fails the single-file check", onlyFails(file({ grade: { changed: [PLAN_FILE, "index.html"] } }), "Only the plan file"));
check("plan-file mode: writing nothing fails the single-file check", onlyFails(file({ grade: { changed: [] } }), "Only the plan file"));
check("plan-file mode: not stopping for approval fails that check only", onlyFails(file({ grade: { message: "Done." } }), "The agent stopped"));

// the block
check("no a11y-plan block fails the block check", failedNames(normal({ plan: { without: ["targets"] } })).some((x) => x.startsWith("The plan has one a11y-plan block")));
check("a block that is not JSON fails the block check", failedNames(gradePlan({ planText: plan().replace(/\{[\s\S]*\}/, "{ nope"), mode: "planmode", toolUses: [{ name: "ExitPlanMode", input: {} }] })).some((x) => x.startsWith("The plan has one a11y-plan block")));
check("a target that is not in the report fails the target check", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge', "2.4.7|Search box"], guards: [G_BUTTON, G_BADGE] } } })).some((x) => x.startsWith("Every target is an issue")));
check("a target missing the element fails the target check", failedNames(normal({ plan: { json: { targets: ["4.1.2", '1.4.3|"New" badge'], guards: [G_BUTTON, G_BADGE] } } })).some((x) => x.startsWith("Every target is an issue")));
check("leaving out an automatable issue fails the 'both' check", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button"], guards: [G_BUTTON] } } })).some((x) => x.startsWith("Both automatable issues")));
check("a target with no Guard fails the Guard check", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [G_BUTTON] } } })).some((x) => x.startsWith("Every target has a Guard")));
check("a Guard of an unknown kind fails the Guard check", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [G_BUTTON, { ...G_BADGE, kind: "maybe" }] } } })).some((x) => x.startsWith("Every target has a Guard")));
check("a test outside tests/ fails the test-place check", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [G_BUTTON, { ...G_BADGE, test: "src/badge.test.js" }] } } })).some((x) => x.startsWith("Each automatable Guard names a test")));
check("a Guard with no test fails the test-place check", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [G_BUTTON, { ...G_BADGE, test: null }] } } })).some((x) => x.startsWith("Each automatable Guard names a test")));
check("waiving an automatable Guard in a project that has tests fails", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [G_BUTTON, { ...G_BADGE, waiver: "too slow" }] } } })).some((x) => x.startsWith("No automatable Guard is waived")));
check("a manual issue given a test fails the manual check", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge', "1.4.1|Notices"], guards: [G_BUTTON, G_BADGE, { ...G_MANUAL, test: "tests/notices.test.mjs" }] } } })).some((x) => x.startsWith("The manual issue")));
check("a manual issue marked automatable fails the manual check", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge', "1.4.1|Notices"], guards: [G_BUTTON, G_BADGE, { ...G_MANUAL, kind: "automatable", test: "tests/n.test.mjs" }] } } })).some((x) => x.startsWith("The manual issue")));

check("a manual issue marked automatable, with no test, fails the manual check", failedNames(normal({ plan: { json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge', "1.4.1|Notices"], guards: [G_BUTTON, G_BADGE, { ...G_MANUAL, kind: "automatable" }] } } })).some((x) => x.startsWith("The manual issue")));

// the sections
check("a missing Test coverage section fails that check", failedNames(normal({ plan: { without: ["cov"] } })).some((x) => x.startsWith("The plan has a Test coverage section")));
check("Test coverage that never names tests/ fails that check only", onlyFails(normal({ plan: { coverage: "- **Strategy:** we will test it." } }), "Test coverage names where"));
check("a missing 'what will not change' fails that check only", onlyFails(normal({ plan: { without: ["not"] } }), "The plan says what will not change"));
check("a missing Risks section fails that check only", onlyFails(normal({ plan: { without: ["risks"] } }), "The plan lists risks"));
check("a 'fully accessible' claim fails that check only", onlyFails(normal({ plan: { extra: "\nThe page will then be fully accessible.\n" } }), "The plan does not claim"));
check("a heading inside a code fence is not a section", sectionOf("```\n## Risks\nx\n```\n", /^risks?$/i) === null);
check("a section ends at the next heading of the same level", sectionOf("## A\none\n## B\ntwo\n", /^a$/i) === "one");
check("a sub-heading stays inside its section", sectionOf("## A\none\n### sub\nmore\n## B\n", /^a$/i).includes("more"));

// opt-out
const optout = (over = {}) => gradePlan({ planText: plan({ json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [W(G_BUTTON), W(G_BADGE)] }, coverage: "- The project has opted out of automated tests (AGENTS.md). No tests are added.", ...over }), variant: "optout", mode: "planmode", changed: [], toolUses: [{ name: "ExitPlanMode", input: {} }] });
check("a correct opt-out plan passes every check", failedNames(optout()).length === 0);
check("opt-out: a plan that still names tests fails the waiver check", failedNames(optout({ json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [G_BUTTON, G_BADGE] } })).some((x) => x.startsWith("The automatable Guards are waived")));
check("opt-out: a waiver that also names a test fails the waiver check", failedNames(optout({ json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [{ ...W(G_BUTTON), test: "tests/guards.test.mjs" }, W(G_BADGE)] } })).some((x) => x.startsWith("The automatable Guards are waived")));
check("opt-out: a vague waiver fails the waiver check", failedNames(optout({ json: { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [{ ...W(G_BUTTON), waiver: "TODO" }, W(G_BADGE)] } })).some((x) => x.startsWith("The automatable Guards are waived")));
check("opt-out: Test coverage that does not say the project opted out fails that check only", onlyFails(optout({ coverage: "- Nothing to add." }), "Test coverage says the project opted out"));

// reading a stream and the files
const ev = (c) => JSON.stringify({ type: "assistant", message: { content: c } });
const stream = [ev([{ type: "text", text: "hi" }, { type: "tool_use", name: "Read", input: { file_path: "report.md" } }]), "not json", ev([{ type: "tool_use", name: "ExitPlanMode", input: { plan: "the plan" } }]), JSON.stringify({ type: "result", result: "done" })].join("\n");
check("tool uses are read from the stream, skipping lines that are not events", JSON.stringify(toolUsesOf(stream).map((t) => t.name)) === '["Read","ExitPlanMode"]');
check("when ExitPlanMode was called twice the later plan counts", planOf({ toolUses: [{ name: "ExitPlanMode", input: { plan: "first" } }, { name: "ExitPlanMode", input: { plan: "second" } }], agentDir: "x", finalText: "" }) === "second");
check("the plan is the one passed to ExitPlanMode", planOf({ toolUses: toolUsesOf(stream), agentDir: "x", finalText: "final" }) === "the plan");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plan-run-test-"));
fs.cpSync(BASELINE, tmp, { recursive: true });
check("an untouched copy of the project has no changed files", changedFiles(tmp).length === 0);
fs.writeFileSync(path.join(tmp, PLAN_FILE), "# plan");
fs.writeFileSync(path.join(tmp, "index.html"), "x");
fs.rmSync(path.join(tmp, "AGENTS.md"));
check("added, edited and deleted files are all reported", JSON.stringify(changedFiles(tmp)) === JSON.stringify(["AGENTS.md", PLAN_FILE, "index.html"].sort()));
check("with no ExitPlanMode the plan comes from the plan file, then the final message", planOf({ toolUses: [], agentDir: tmp, finalText: "final" }) === "# plan" && planOf({ toolUses: [], agentDir: path.join(tmp, "nope"), finalText: "final" }) === "final");
fs.rmSync(tmp, { recursive: true, force: true });

// ---- run_plan_eval.mjs end to end, with a stand-in for the claude CLI
const launcher = path.join(here, "run_plan_eval.mjs");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "plan-eval-test-"));
const argsFile = path.join(work, "args.json");
const go = (fake, extra = []) => spawnSync(process.execPath, [launcher, "--model", "fake", "--scratch", path.join(work, "s-" + fake + extra.join("")), "--out", path.join(work, "o-" + fake + extra.join("")), ...extra], { encoding: "utf8", env: { ...process.env, CLAUDE_BIN: path.join(here, "fake_claude.mjs"), FAKE_CLAUDE: fake, FAKE_CLAUDE_ARGS_FILE: argsFile } });
const argsSeen = () => JSON.parse(fs.readFileSync(argsFile, "utf8"));
let r = go("plan");
check("run_plan_eval end to end: a good plan through ExitPlanMode exits 0 and prints the cost", r.status === 0 && /cost \$0\.0123/.test(r.stdout) && /checks passed/.test(r.stdout));
check("run_plan_eval: plan mode runs the CLI with --permission-mode plan and no write tools", (() => { const a = argsSeen(); return a[a.indexOf("--permission-mode") + 1] === "plan" && !/Write|Edit|Bash/.test(a[a.indexOf("--allowedTools") + 1]); })());
check("run_plan_eval: the prompt is the bare ask and comes last", (() => { const a = argsSeen(); return a[a.length - 1] === "Fix the accessibility issues in report.md."; })());
r = go("plan-edit");
check("run_plan_eval end to end: a plan after editing the page exits 1 and names the gate check", r.status === 1 && /FAIL Nothing was written/.test(r.stdout));
r = go("plan-bad");
check("run_plan_eval end to end: a plan with no a11y-plan block exits 1", r.status === 1 && /FAIL The plan has one a11y-plan block/.test(r.stdout));
r = go("plan-optout", ["--variant", "optout"]);
check("run_plan_eval end to end: an opt-out plan in the opt-out project exits 0", r.status === 0);
r = go("plan", ["--variant", "optout"]);
check("run_plan_eval end to end: a plan that adds tests to an opted-out project exits 1", r.status === 1 && /FAIL The automatable Guards are waived/.test(r.stdout));
r = go("planfile", ["--mode", "planfile"]);
check("run_plan_eval end to end: plan-file mode, the plan file and a request for approval, exits 0", r.status === 0);
check("run_plan_eval: plan-file mode tells the agent there is no plan mode and lets it write", (() => { const a = argsSeen(); return /no plan mode/.test(a[a.length - 1]) && a[a.indexOf("--permission-mode") + 1] === "acceptEdits"; })());
r = go("plan", ["--mode", "planfile"]);
check("run_plan_eval end to end: plan-file mode with no plan file exits 1", r.status === 1);
r = go("plan", ["--budget", "0.5"]);
check("run_plan_eval: --budget reaches the CLI as --max-budget-usd", argsSeen()[argsSeen().indexOf("--max-budget-usd") + 1] === "0.5");
go("plan");
check("run_plan_eval: with no --budget the CLI gets no budget flag", !argsSeen().includes("--max-budget-usd"));
check("run_plan_eval: a bad --budget, a missing --model and a bad --mode are usage errors", spawnSync(process.execPath, [launcher, "--model", "x", "--budget", "-1"], { encoding: "utf8" }).status === 2 && spawnSync(process.execPath, [launcher], { encoding: "utf8" }).status === 2 && spawnSync(process.execPath, [launcher, "--model", "x", "--mode", "maybe"], { encoding: "utf8" }).status === 2);
const optoutDir = path.join(work, "s-plan-optout--variantoptout", "planmode-optout-run-1");
check("run_plan_eval: the opt-out file is not left in the scratch project, and AGENTS.md is the opt-out one", fs.existsSync(optoutDir) && !fs.existsSync(path.join(optoutDir, "AGENTS.optout.md")) && /do not add automated tests/i.test(fs.readFileSync(path.join(optoutDir, "AGENTS.md"), "utf8")));
fs.rmSync(work, { recursive: true, force: true });

console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
