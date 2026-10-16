#!/usr/bin/env node
// A stand-in for the `claude` CLI, used only by test_eval_tooling.mjs (via CLAUDE_BIN).
// FAKE_CLAUDE picks the behavior:
//   skill   print an init event, a Skill tool call for the skill under test, then stall (the runner must stop it)
//   write   print a Write tool call, then stall
//   done    write index.html in the working directory, print a Skill call and a result event, then exit
//   hang    print nothing and stall (the runner's timeout must stop it)
//   plan, plan-optout, plan-bad, plan-edit, planfile   stand in for an agent asked to fix evals/guard_fixture/project's report
//           (run_plan_eval.mjs): a good plan through ExitPlanMode, the same for an opted-out project, a plan with no a11y-plan
//           block, a plan after editing the page, and a plan written to a11y-fix-plan.md
// FAKE_CLAUDE_ARGS_FILE=<path> writes the arguments it was called with, as JSON, to that file.
// Result events report total_cost_usd 0.0123.
import fs from "node:fs";

const mode = process.env.FAKE_CLAUDE || "done";
if (process.env.FAKE_CLAUDE_ARGS_FILE) fs.writeFileSync(process.env.FAKE_CLAUDE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
const out = (ev) => process.stdout.write(JSON.stringify(ev) + "\n");
const tool = (name, input = {}) => out({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });
const stall = () => setInterval(() => {}, 1000);

// The guard-* modes stand in for an agent working on evals/guard_fixture/project (used by run_guard_eval.mjs).
function guardRun({ tests, message }) {
  const page = fs.readFileSync("index.html", "utf8")
    .replace('<button id="close" type="button">', '<button id="close" type="button" aria-label="Close">')
    .replace("background: #2b7de9; color: #9cc4ff;", "background: #1a5fb4; color: #ffffff;");
  fs.writeFileSync("index.html", page);
  if (tests) {
    const head = 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { withPage, axeViolations } from "./helpers.mjs";\n';
    const one = (name, rule) => `test("${name}", async () => {\n  await withPage("index.html", async (page) => assert.deepEqual(await axeViolations(page, ["${rule}"]), []));\n});\n`;
    fs.writeFileSync("tests/guards.test.mjs", head + one("close button has an accessible name", "button-name") + one("badge text meets contrast", "color-contrast"));
  }
  out({ type: "system", subtype: "init", skills: [], plugins: [] });
  tool("Edit", { file_path: "index.html" });
  out({ type: "result", result: message, duration_ms: 10, total_cost_usd: 0.0123, modelUsage: { "fake-model": {} }, usage: { input_tokens: 1, output_tokens: 1 } });
}

// The plan* modes stand in for an agent that is asked to fix the report's issues and plans first (run_plan_eval.mjs).
function planText({ optout = false, block = true } = {}) {
  const F = "```";
  const g = (target, test) => (optout ? { target, kind: "automatable", test: null, waiver: "the project adds no automated tests" } : { target, kind: "automatable", test, waiver: null });
  const json = { targets: ["4.1.2|Close button", '1.4.3|"New" badge'], guards: [g("4.1.2|Close button", "tests/guards.test.mjs::close button has a name"), g('1.4.3|"New" badge', "tests/guards.test.mjs::badge text meets contrast")] };
  const coverage = optout ? "The project has opted out of automated tests. No tests are added." : "Add tests to `tests/guards.test.mjs`, using `tests/helpers.mjs`.";
  const NL = "\n";
  return ["# Fix plan: roster", "## Targets", block ? F + "a11y-plan" + NL + JSON.stringify(json, null, 2) + NL + F : "Fix the close button and the badge.", "## Files and changes", "index.html", "## What will not change", "The notices stay a ticket.", "## Risks", "The badge colour changes.", "## Test coverage", coverage].join(NL + NL);
}
function planRun({ optout, block, edit, file }) {
  out({ type: "system", subtype: "init", skills: [], plugins: [] });
  tool("Read", { file_path: "report.md" });
  if (edit) { fs.writeFileSync("index.html", fs.readFileSync("index.html", "utf8") + "\n"); tool("Edit", { file_path: "index.html" }); }
  const text = planText({ optout, block });
  if (file) { fs.writeFileSync("a11y-fix-plan.md", text); tool("Write", { file_path: "a11y-fix-plan.md" }); }
  else tool("ExitPlanMode", { plan: text });
  out({ type: "result", result: file ? "I wrote the plan to a11y-fix-plan.md. Please approve it and I will go ahead." : "Plan submitted.", duration_ms: 10, total_cost_usd: 0.0123, modelUsage: { "fake-model": {} }, usage: { input_tokens: 1, output_tokens: 1 } });
}

if (mode === "autherror") out({ type: "result", subtype: "success", is_error: true, result: "Failed to authenticate: OAuth session expired", total_cost_usd: 0, terminal_reason: "api_error" });
else if (mode === "plan") planRun({});
else if (mode === "plan-optout") planRun({ optout: true });
else if (mode === "plan-bad") planRun({ block: false });
else if (mode === "plan-edit") planRun({ edit: true });
else if (mode === "planfile") planRun({ file: true });
else if (mode === "guard") guardRun({ tests: true, message: "Fixed #1 and #2. I added tests/guards.test.mjs: both tests failed on the original page and pass now. The notice type cue (Guard #3) stays manual: check it in grayscale." });
else if (mode === "guard-optout") guardRun({ tests: false, message: "Fixed #1 and #2. The project says it adds no automated tests, so I did not add any (opted out). The Guards are still checks to run by hand." });
else if (mode === "guard-lazy") guardRun({ tests: false, message: "Fixed #1 and #2." });
else if (mode === "hang") stall();
else if (mode === "skill") { out({ type: "system", subtype: "init", skills: ["building-accessible-ui"], plugins: [] }); tool("Skill", { skill: "building-accessible-ui" }); stall(); }
else if (mode === "write") { tool("Write", { file_path: "x.html" }); stall(); }
else {
  fs.writeFileSync("index.html", "<!doctype html><title>t</title><p>made by the fake</p>");
  out({ type: "system", subtype: "init", skills: ["building-accessible-ui"], plugins: [] });
  tool("Skill", { skill: "building-accessible-ui" });
  tool("Write", { file_path: "index.html" });
  out({ type: "result", result: "Done. Prompt had: " + process.argv[process.argv.length - 1].slice(0, 40), duration_ms: 1234, total_cost_usd: 0.0123, modelUsage: { "fake-model": {} }, usage: { input_tokens: 10, output_tokens: 5 } });
}
