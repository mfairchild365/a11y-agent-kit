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

if (mode === "hang") stall();
else if (mode === "skill") { out({ type: "system", subtype: "init", skills: ["building-accessible-ui"], plugins: [] }); tool("Skill", { skill: "building-accessible-ui" }); stall(); }
else if (mode === "write") { tool("Write", { file_path: "x.html" }); stall(); }
else {
  fs.writeFileSync("index.html", "<!doctype html><title>t</title><p>made by the fake</p>");
  out({ type: "system", subtype: "init", skills: ["building-accessible-ui"], plugins: [] });
  tool("Skill", { skill: "building-accessible-ui" });
  tool("Write", { file_path: "index.html" });
  out({ type: "result", result: "Done. Prompt had: " + process.argv[process.argv.length - 1].slice(0, 40), duration_ms: 1234, modelUsage: { "fake-model": {} }, usage: { input_tokens: 10, output_tokens: 5 } });
}
