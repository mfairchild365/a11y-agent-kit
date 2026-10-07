#!/usr/bin/env node
// Runs the accessibility-reviewer agent headlessly against evals/audit_fixture/index.html,
// then scores each report with check_audit_report.mjs against the answer key.
//
// Each run starts in an empty scratch directory (no repo context, no CLAUDE.md, none of your
// plugins) with this repo loaded as the plugin via --plugin-dir, pinned to an exact model.
//
//   --via direct     (default) the session *is* the agent (`claude --agent`): tests the audit
//                    and the report format
//   --via subagent   the main agent delegates to the agent: the final message is then the
//                    caller's, so the digest check also tests that the digest survived the hand-off
//
// Usage (from the repo root):
//   node evals/run_audit_eval.mjs --model claude-sonnet-5-5 [--runs 3] [--via direct|subagent]
//        [--scratch DIR] [--out DIR] [--timeout SECONDS] [--skip-axe]
//
// Runs are billed to your account and take several minutes each: start with --runs 1.
// Run outside the Claude Code sandbox: Chromium can't launch inside it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const model = opt("model");
if (!model) {
  console.error("Usage: node evals/run_audit_eval.mjs --model <model-id> [--runs N] [--via direct|subagent] [--scratch DIR] [--out DIR] [--timeout SECONDS] [--skip-axe]");
  process.exit(2);
}
const runs = +opt("runs", "1");
const via = opt("via", "direct");
const scratch = path.resolve(opt("scratch", path.join(os.tmpdir(), "audit-eval")));
const out = path.resolve(opt("out", path.join(here, "workspace", "audit")));
const timeoutMs = +opt("timeout", "1800") * 1000;
const skipAxe = argv.includes("--skip-axe");
if (!["direct", "subagent"].includes(via)) { console.error("--via must be direct or subagent"); process.exit(2); }

// --plugin-dir registers the agent under its file name (accessibility-reviewer.agent.md).
const AGENT = "a11y-agent-kit:accessibility-reviewer.agent";
const nodeModules = path.join(here, "node_modules");

function prompt() {
  const lines = [
    via === "direct"
      ? "Audit index.html in the current directory for accessibility."
      : `Use the accessibility-reviewer agent (${AGENT}) to audit index.html in the current directory for accessibility. Show me the agent's report.`,
    "Write your report files (report.md, report.html and the screenshots folder) to ./audit-out instead of the system temp directory.",
  ];
  if (fs.existsSync(nodeModules)) {
    lines.push(
      "Environment note: NODE_PATH points at an install of playwright and axe-core, so `require('playwright')` and `require('axe-core')` work from any directory. " +
      "If Playwright's own Chromium isn't installed, launch with `{ channel: 'msedge' }` or `{ channel: 'chrome' }`. Don't run npm install or playwright install.");
  }
  return lines.join("\n\n");
}

function tally(results, perCheck) {
  for (const r of results) {
    const e = perCheck.get(r.name) || { pass: 0, total: 0 };
    e.total += 1;
    if (r.ok) e.pass += 1;
    perCheck.set(r.name, e);
  }
}

fs.mkdirSync(out, { recursive: true });
const perCheck = new Map();
const recalls = [];
let completed = 0;

for (let n = 1; n <= runs; n++) {
  const cwd = path.join(scratch, `run-${n}`);
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.copyFileSync(path.join(here, "audit_fixture", "index.html"), path.join(cwd, "index.html"));
  const runOut = path.join(out, `run-${n}`);
  fs.rmSync(runOut, { recursive: true, force: true });
  fs.mkdirSync(runOut, { recursive: true });

  const cmd = ["-p", "--model", model, "--no-session-persistence", "--setting-sources", "project", "--strict-mcp-config",
    "--plugin-dir", repo, "--permission-mode", "acceptEdits", "--allowedTools", "Read,Glob,Grep,Bash,Skill,Agent",
    "--output-format", "stream-json", "--verbose"];
  if (via === "direct") cmd.push("--agent", AGENT);
  cmd.push(prompt());

  console.log(`run ${n}/${runs}: ${via}, model ${model} ...`);
  const t0 = Date.now();
  const env = { ...process.env };
  if (fs.existsSync(nodeModules)) env.NODE_PATH = nodeModules;
  const r = spawnSync("claude", cmd, { cwd, env, encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  fs.writeFileSync(path.join(runOut, "stream.jsonl"), r.stdout || "");
  fs.writeFileSync(path.join(runOut, "stderr.txt"), r.stderr || "");
  let finalText = "";
  for (const l of (r.stdout || "").split("\n")) {
    try { const ev = JSON.parse(l); if (ev.type === "result") finalText = ev.result || ""; } catch { /* skip */ }
  }
  fs.writeFileSync(path.join(runOut, "final-message.md"), finalText || "(no final message)");

  const produced = path.join(cwd, "audit-out");
  if (fs.existsSync(produced)) fs.cpSync(produced, runOut, { recursive: true });
  const secs = Math.round((Date.now() - t0) / 1000);
  if (r.error || !fs.existsSync(path.join(runOut, "report.md"))) {
    const why = (r.stderr || finalText || "").trim().split("\n")[0];
    console.log(`  no report.md produced after ${secs}s${r.error ? ` (${r.error.code || r.error.message})` : ""}${why ? `: ${why}` : ""}`);
    console.log(`  see ${runOut}`);
    continue;
  }
  completed += 1;
  const chk = spawnSync(process.execPath, [path.join(here, "check_audit_report.mjs"), runOut, "--digest", path.join(runOut, "final-message.md"), "--json", ...(skipAxe ? ["--skip-axe"] : [])], { encoding: "utf8" });
  let res;
  try { res = JSON.parse(chk.stdout); } catch { console.log(`  checker crashed: ${chk.stderr.trim().split("\n")[0]}`); continue; }
  fs.writeFileSync(path.join(runOut, "check.json"), JSON.stringify(res, null, 2));
  tally(res.results, perCheck);
  recalls.push(res.recall);
  console.log(`  ${secs}s. Recall ${res.recall}. ${res.passed}/${res.passed + res.failed} checks passed.`);
  for (const f of res.results.filter((x) => !x.ok)) console.log(`    FAIL ${f.name}${f.detail ? ` -> ${f.detail}` : ""}`);
  for (const w of res.warnings) console.log(`    WARN ${w}`);
}

console.log(`\n${completed}/${runs} runs produced a report. Recall per run: ${recalls.join(", ") || "n/a"}`);
const flaky = [...perCheck].filter(([, v]) => v.pass < v.total);
if (flaky.length) {
  console.log("Checks that didn't pass in every run:");
  for (const [name, v] of flaky) console.log(`  ${v.pass}/${v.total}  ${name}`);
}
process.exit(completed === runs && !flaky.length ? 0 : 1);
