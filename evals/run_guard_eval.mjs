#!/usr/bin/env node
// Runs an agent headlessly on a project that has an audit report with Guards, then grades what it did with
// check_guard_run.mjs: did it fix the page, turn each automatable Guard into a test that fails before the fix
// and passes after, leave the manual Guard manual, and respect a project that opted out of tests.
//
// Each run starts in a scratch copy of evals/guard_fixture/project with this repo loaded as the plugin
// (--plugin-dir), pinned to an exact model. No repo context, no CLAUDE.md, none of your plugins.
//
//   --variant normal   the project's AGENTS.md says where its accessibility tests live (default)
//   --variant optout   the project's AGENTS.md says it adds no automated tests
//
// Usage (from the repo root):
//   node evals/run_guard_eval.mjs --model claude-sonnet-5-5 [--variant normal|optout] [--runs 3]
//        [--scratch DIR] [--out DIR] [--timeout SECONDS] [--budget USD] [--approved-plan]
//   --approved-plan  puts an approved fix plan (evals/guard_fixture/plans/) in the project as a11y-fix-plan.md and asks the
//                    agent to follow it. Besides the Guard checks, it then grades what verify-fix.mjs would say about the
//                    fix (check_fix_verify.mjs): the verdict, and whether each Guard became the planned test or was waived.
//   --budget USD caps what each run may spend (claude's --max-budget-usd); the cost of each run is printed.
//
// Runs are billed to your account: start with --runs 1. Run outside the Claude Code sandbox (a browser is
// needed). Set PW_CHANNEL=msedge (or chrome) if Playwright's own Chromium isn't installed. CLAUDE_BIN
// overrides the `claude` executable.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grade } from "./check_guard_run.mjs";
import { approvedPlanPath, gradeVerify } from "./check_fix_verify.mjs";
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
if (!model || !["normal", "optout"].includes(variant)) {
  console.error("Usage: node evals/run_guard_eval.mjs --model <model-id> [--variant normal|optout] [--runs N] [--scratch DIR] [--out DIR] [--timeout SECONDS] [--budget USD] [--approved-plan]");
  process.exit(2);
}
const runs = +opt("runs", "1");
const approved = argv.includes("--approved-plan");
let budget = null;
try { if (opt("budget")) budget = parseBudget(opt("budget")); } catch (e) { console.error(e.message); process.exit(2); }
const scratch = path.resolve(opt("scratch", path.join(os.tmpdir(), "guard-eval")));
const out = path.resolve(opt("out", path.join(here, "workspace", "guard")));
const timeoutMs = +opt("timeout", "900") * 1000;
const nodeModules = path.join(here, "node_modules");
const project = path.join(here, "guard_fixture", "project");

const prompt = [
  approved ? "Fix the accessibility issues in report.md by following a11y-fix-plan.md, which the user has approved." : "Fix the accessibility issues in report.md.",
  "NODE_PATH points at an install of playwright and axe-core. If Playwright's own Chromium isn't installed, set PW_CHANNEL=msedge or chrome when you run the project's tests. Don't run npm install or playwright install.",
].join("\n\n");

fs.mkdirSync(out, { recursive: true });
const perCheck = new Map();
let completed = 0;
for (let n = 1; n <= runs; n++) {
  const cwd = path.join(scratch, `${variant}-run-${n}`);
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.cpSync(project, cwd, { recursive: true });
  if (variant === "optout") fs.copyFileSync(path.join(cwd, "AGENTS.optout.md"), path.join(cwd, "AGENTS.md"));
  fs.rmSync(path.join(cwd, "AGENTS.optout.md"));
  if (approved) fs.copyFileSync(approvedPlanPath(variant), path.join(cwd, "a11y-fix-plan.md"));
  const runOut = path.join(out, `${variant}-run-${n}`);
  fs.rmSync(runOut, { recursive: true, force: true });
  fs.mkdirSync(runOut, { recursive: true });

  const args = ["-p", "--model", model, "--no-session-persistence", "--setting-sources", "project", "--strict-mcp-config",
    "--plugin-dir", repo, "--permission-mode", "acceptEdits", "--allowedTools", "Read,Write,Edit,Glob,Grep,Bash,Skill",
    ...budgetArgs(budget), "--output-format", "stream-json", "--verbose", prompt];
  const { cmd, args: full } = claudeCommand(args);
  console.log(`run ${n}/${runs}: ${variant}, model ${model} ...`);
  const t0 = Date.now();
  const env = { ...process.env };
  if (fs.existsSync(nodeModules)) env.NODE_PATH = nodeModules;
  const r = spawnSync(cmd, full, { cwd, env, encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  fs.writeFileSync(path.join(runOut, "stream.jsonl"), r.stdout || "");
  let finalText = ""
  let apiError = null;;
  let cost = null;
  for (const l of (r.stdout || "").split("\n")) {
    try { const ev = JSON.parse(l); if (ev.type === "result") { finalText = ev.result || ""; cost = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : null; if (ev.is_error) apiError = ev.result || ev.terminal_reason || "the CLI reported an error"; } } catch { /* skip */ }
  }
  fs.writeFileSync(path.join(runOut, "final-message.md"), finalText || "(no final message)");
  const secs = Math.round((Date.now() - t0) / 1000);
  if (apiError) { console.log(`  the run failed before the agent worked: ${apiError} (cost ${costText(cost)}). Nothing was graded.`); continue; }
  if (r.error) { console.log(`  the agent did not finish after ${secs}s, cost ${costText(cost)} (${r.error.code || r.error.message})`); continue; }

  const result = grade({ agentDir: cwd, variant, message: finalText });
  if (result.environmentError) { console.error(result.environmentError); process.exit(2); }
  if (approved) result.results.push(...gradeVerify({ agentDir: cwd, variant, fixed: result.fixed || [] }).results);
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
