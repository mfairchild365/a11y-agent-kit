#!/usr/bin/env node
// Runs an agent headlessly on evals/guard_fixture/project, asks it to fix the issues in report.md, and grades the
// PLAN it writes first (check_plan_run.mjs): is nothing but the plan written, does the plan have a machine-readable
// block whose targets come from the report, one Guard per target, a Test coverage section that names where the
// tests go, and (in the opt-out project) a recorded reason for no tests. The agent is not asked to make the fix:
// the fix is graded by run_guard_eval.mjs --approved-plan.
//
// Each run starts in a scratch copy of the project with this repo loaded as the plugin (--plugin-dir), pinned to
// an exact model. No repo context, no CLAUDE.md, none of your plugins.
//
//   --mode planmode   the agent runs in the CLI's plan mode (default). The plan is what it passes to ExitPlanMode.
//   --mode planfile   the agent is told its environment has no plan mode. It must write a11y-fix-plan.md and stop.
//   --variant normal|optout   as in run_guard_eval.mjs
//
// Usage (from the repo root):
//   node evals/run_plan_eval.mjs --model claude-sonnet-5-5 [--mode planmode|planfile] [--variant normal|optout]
//        [--runs 1] [--scratch DIR] [--out DIR] [--timeout SECONDS] [--budget USD]
//   --budget USD caps what each run may spend (claude's --max-budget-usd); the cost of each run is printed.
//
// Runs are billed to your account: start with --runs 1. No browser is needed. CLAUDE_BIN overrides the `claude`
// executable.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changedFiles, gradePlan, planOf, toolUsesOf } from "./check_plan_run.mjs";
import { budgetArgs, claudeCommand, costText, parseBudget } from "./lib/claude.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const model = opt("model");
const variant = opt("variant", "normal");
const mode = opt("mode", "planmode");
if (!model || !["normal", "optout"].includes(variant) || !["planmode", "planfile"].includes(mode)) {
  console.error("Usage: node evals/run_plan_eval.mjs --model <model-id> [--mode planmode|planfile] [--variant normal|optout] [--runs N] [--scratch DIR] [--out DIR] [--timeout SECONDS] [--budget USD]");
  process.exit(2);
}
const runs = +opt("runs", "1");
let budget = null;
try { if (opt("budget")) budget = parseBudget(opt("budget")); } catch (e) { console.error(e.message); process.exit(2); }
const scratch = path.resolve(opt("scratch", path.join(os.tmpdir(), "plan-eval")));
const out = path.resolve(opt("out", path.join(here, "workspace", "plan")));
const timeoutMs = +opt("timeout", "600") * 1000;
const project = path.join(here, "guard_fixture", "project");

const prompt = [
  "Fix the accessibility issues in report.md.",
  mode === "planfile" ? "This environment has no plan mode." : null,
].filter(Boolean).join("\n\n");

fs.mkdirSync(out, { recursive: true });
const perCheck = new Map();
let completed = 0;
for (let n = 1; n <= runs; n++) {
  const name = `${mode}-${variant}-run-${n}`;
  const cwd = path.join(scratch, name);
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.cpSync(project, cwd, { recursive: true });
  if (variant === "optout") fs.copyFileSync(path.join(cwd, "AGENTS.optout.md"), path.join(cwd, "AGENTS.md"));
  fs.rmSync(path.join(cwd, "AGENTS.optout.md"));
  const runOut = path.join(out, name);
  fs.rmSync(runOut, { recursive: true, force: true });
  fs.mkdirSync(runOut, { recursive: true });
  // What the project looks like before the agent starts, so "what changed" excludes the opt-out swap above.
  const baseline = path.join(scratch, `${name}-baseline`);
  fs.rmSync(baseline, { recursive: true, force: true });
  fs.cpSync(cwd, baseline, { recursive: true });

  const tools = mode === "planmode" ? "Read,Glob,Grep,Skill,ExitPlanMode" : "Read,Write,Edit,Glob,Grep,Bash,Skill";
  const args = ["-p", "--model", model, "--no-session-persistence", "--setting-sources", "project", "--strict-mcp-config",
    "--plugin-dir", repo, "--permission-mode", mode === "planmode" ? "plan" : "acceptEdits", "--allowedTools", tools,
    ...budgetArgs(budget), "--output-format", "stream-json", "--verbose", prompt];
  const { cmd, args: full } = claudeCommand(args);
  console.log(`run ${n}/${runs}: ${mode}, ${variant}, model ${model} ...`);
  const t0 = Date.now();
  const r = spawnSync(cmd, full, { cwd, env: { ...process.env }, encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  fs.writeFileSync(path.join(runOut, "stream.jsonl"), r.stdout || "");
  let finalText = "", cost = null;
  for (const l of (r.stdout || "").split("\n")) {
    try { const ev = JSON.parse(l); if (ev.type === "result") { finalText = ev.result || ""; cost = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : null; } } catch { /* skip */ }
  }
  fs.writeFileSync(path.join(runOut, "final-message.md"), finalText || "(no final message)");
  const secs = Math.round((Date.now() - t0) / 1000);
  if (r.error) { console.log(`  the agent did not finish after ${secs}s, cost ${costText(cost)} (${r.error.code || r.error.message})`); continue; }

  const toolUses = toolUsesOf(r.stdout);
  const planText = planOf({ toolUses, agentDir: cwd, finalText });
  fs.writeFileSync(path.join(runOut, "plan.md"), planText || "(no plan)");
  const result = gradePlan({ planText, variant, mode, changed: changedFiles(cwd, baseline), toolUses, message: finalText });
  completed += 1;
  fs.writeFileSync(path.join(runOut, "check.json"), JSON.stringify(result, null, 2));
  for (const c of result.results) {
    const e = perCheck.get(c.name) || { pass: 0, total: 0 };
    e.total += 1;
    if (c.ok) e.pass += 1;
    perCheck.set(c.name, e);
  }
  const failed = result.results.filter((c) => !c.ok);
  console.log(`  ${secs}s, cost ${costText(cost)}. ${result.results.length - failed.length}/${result.results.length} checks passed.`);
  for (const f of failed) console.log(`    FAIL ${f.name}${f.detail ? ` -> ${f.detail}` : ""}`);
  for (const w of result.warnings) console.log(`    WARN ${w}`);
}

console.log(`\n${completed}/${runs} runs finished.`);
const flaky = [...perCheck].filter(([, v]) => v.pass < v.total);
if (flaky.length) {
  console.log("Checks that didn't pass in every run:");
  for (const [name, v] of flaky) console.log(`  ${v.pass}/${v.total}  ${name}`);
}
process.exit(completed === runs && !flaky.length ? 0 : 1);
