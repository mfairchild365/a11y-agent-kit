#!/usr/bin/env node
// A stand-in for the `claude` CLI, used only by test_eval_tooling.mjs (via CLAUDE_BIN).
// FAKE_CLAUDE picks the behavior:
//   skill   print an init event, a Skill tool call for the skill under test, then stall (the runner must stop it)
//   write   print a Write tool call, then stall
//   done    write index.html in the working directory, print a Skill call and a result event, then exit
//   hang    print nothing and stall (the runner's timeout must stop it)
import fs from "node:fs";

const mode = process.env.FAKE_CLAUDE || "done";
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
  out({ type: "result", result: message, duration_ms: 10, modelUsage: { "fake-model": {} }, usage: { input_tokens: 1, output_tokens: 1 } });
}

if (mode === "guard") guardRun({ tests: true, message: "Fixed #1 and #2. I added tests/guards.test.mjs: both tests failed on the original page and pass now. The notice type cue (Guard #3) stays manual: check it in grayscale." });
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
  out({ type: "result", result: "Done. Prompt had: " + process.argv[process.argv.length - 1].slice(0, 40), duration_ms: 1234, modelUsage: { "fake-model": {} }, usage: { input_tokens: 10, output_tokens: 5 } });
}
