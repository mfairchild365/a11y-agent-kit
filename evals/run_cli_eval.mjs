#!/usr/bin/env node
// Run every eval headlessly through the `claude` CLI, pinned to an exact model.
//
// Why the CLI rather than subagents: it lets us pin an exact model ID (e.g. the
// one used in the a11y-llm-eval report) and start each run in a neutral working
// directory with no repo context, no CLAUDE.md and none of the user's plugins.
//
// Each run gets its own directory under <scratch>/<name>__<config>__r<N>/:
//   - with_skill:    the skill is installed at .claude/skills/building-accessible-ui/
//                    so it is discovered and invoked like a real skill
//   - without_skill: nothing installed
//
// Results are copied into <workspace>/eval-<name>/<config>/run-<N>/ in the layout
// skill-creator and the grading scripts expect.
//
// Usage (from the repo root):
//   node evals/run_cli_eval.mjs --model claude-sonnet-4-6 \
//       --workspace evals/workspace/sonnet46 --scratch "$TMPDIR/s46"
// Options: --workers 6  --timeout 900 (seconds)  --only a,b  --run-start 1  --runs 1  --budget USD (a hard cap per run)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { budgetArgs, costText, parseBudget, spawnClaude } from "./lib/claude.mjs";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_SRC = path.join(REPO, "skills", "building-accessible-ui");
const INPUT_FILE = path.join(REPO, "evals", "files", "account-settings.html");
const ALLOWED_TOOLS = "Read,Write,Edit,Glob,Grep,Bash,Skill";

export function buildPrompt(e) {
  let p = e.prompt;
  if (e.name === "existing-page-save-feature") {
    p = p.replace("(evals/files/account-settings.html)", "(the file account-settings.html in the current directory)");
    return p + "\n\nWrite the complete updated page to index.html in the current directory, as a single self-contained file. Leave account-settings.html unchanged.";
  }
  return p + "\n\nWrite the finished page to index.html in the current directory.";
}

export function parseStream(file) {
  const info = { skills_listed: null, plugins: null, skill_tool_calls: 0, tool_calls: {}, result: "", duration_ms: null, tokens: null, models: [], cost: null };
  if (!fs.existsSync(file)) return info;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || typeof ev !== "object") continue;
    if (ev.type === "system" && ev.subtype === "init") {
      info.skills_listed = ev.skills ?? null;
      info.plugins = ev.plugins ?? null;
    } else if (ev.type === "assistant") {
      for (const c of (ev.message && ev.message.content) || []) {
        if (c.type === "tool_use") {
          info.tool_calls[c.name] = (info.tool_calls[c.name] || 0) + 1;
          if (c.name === "Skill") info.skill_tool_calls++;
        }
      }
    } else if (ev.type === "result") {
      info.result = ev.result || "";
      info.duration_ms = ev.duration_ms ?? null;
      info.cost = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : null;
      info.models = Object.keys(ev.modelUsage || {});
      const u = ev.usage || {};
      info.tokens = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"].reduce((s, k) => s + (u[k] || 0), 0);
    }
  }
  return info;
}

// Runs `claude` with stdout and stderr going to one file. Resolves "ok", or "timeout" after killing it.
function runClaude(args, cwd, outFile, timeoutMs) {
  return new Promise((resolve) => {
    const out = fs.openSync(outFile, "w");
    const child = spawnClaude(args, { cwd, stdio: ["ignore", out, out] });
    let status = "ok";
    const timer = setTimeout(() => { status = "timeout"; child.kill("SIGKILL"); }, timeoutMs);
    const done = () => { clearTimeout(timer); fs.closeSync(out); resolve(status); };
    child.on("error", () => { status = "error"; done(); });
    child.on("close", done);
  });
}

async function runOne(job) {
  const { e, cfg, model, scratch, workspace, timeout, n, budget } = job;
  const name = e.name;
  const cwd = path.join(scratch, `${name}__${cfg}__r${n}`);
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.mkdirSync(cwd, { recursive: true });
  if (cfg === "with_skill") fs.cpSync(SKILL_SRC, path.join(cwd, ".claude", "skills", "building-accessible-ui"), { recursive: true });
  if (name === "existing-page-save-feature") fs.copyFileSync(INPUT_FILE, path.join(cwd, "account-settings.html"));
  const args = ["-p", "--model", model, "--no-session-persistence", "--setting-sources", "project", "--strict-mcp-config",
    "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED_TOOLS, ...budgetArgs(budget), "--output-format", "stream-json", "--verbose", buildPrompt(e)];
  const t0 = Date.now();
  const status = await runClaude(args, cwd, path.join(cwd, "stream.jsonl"), timeout * 1000);
  const wall = Date.now() - t0;

  const run = path.join(workspace, `eval-${name}`, cfg, `run-${n}`);
  fs.mkdirSync(path.join(run, "outputs"), { recursive: true });
  const info = parseStream(path.join(cwd, "stream.jsonl"));
  const produced = fs.existsSync(path.join(cwd, "index.html"));
  if (produced) fs.copyFileSync(path.join(cwd, "index.html"), path.join(run, "outputs", "index.html"));
  fs.writeFileSync(path.join(run, "outputs", "response.md"), info.result || "(no final message)");
  fs.writeFileSync(path.join(run, "transcript.md"),
    `Model(s): ${JSON.stringify(info.models)}\nStatus: ${status}; index.html produced: ${produced}\n` +
    `Tool calls: ${JSON.stringify(info.tool_calls)}\nSkill tool invoked: ${info.skill_tool_calls} time(s)\n` +
    `Skills visible at start: ${JSON.stringify(info.skills_listed)}\nPlugins loaded: ${JSON.stringify(info.plugins)}\n`);
  const durMs = info.duration_ms || wall;
  fs.writeFileSync(path.join(run, "timing.json"), JSON.stringify({ total_tokens: info.tokens, total_cost_usd: info.cost, duration_ms: Math.trunc(durMs), total_duration_seconds: Math.round(durMs / 100) / 10 }));
  fs.writeFileSync(path.join(run, "meta.json"), JSON.stringify({ status, produced_index: produced, models: info.models, skill_tool_calls: info.skill_tool_calls, tool_calls: info.tool_calls, skills_listed: info.skills_listed, plugins: info.plugins }, null, 2));
  fs.mkdirSync(path.join(workspace, `eval-${name}`), { recursive: true });
  fs.writeFileSync(path.join(workspace, `eval-${name}`, "eval_metadata.json"), JSON.stringify({ eval_id: e.id, eval_name: e.name, prompt: e.prompt, assertions: e.expectations }, null, 2));
  return `${name.padEnd(30)} ${cfg.padEnd(14)} run-${n} ${status.padEnd(8)} index=${produced} skillcalls=${info.skill_tool_calls} models=${JSON.stringify(info.models)} cost=${costText(info.cost)}`;
}

function parseArgs(argv) {
  const a = { workers: 6, timeout: 900, runStart: 1, runs: 1 };
  const need = (i) => { if (i + 1 >= argv.length) throw new Error(`${argv[i]} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i += 2) {
    switch (argv[i]) {
      case "--model": a.model = need(i); break;
      case "--workspace": a.workspace = need(i); break;
      case "--scratch": a.scratch = need(i); break;
      case "--workers": a.workers = Number(need(i)); break;
      case "--timeout": a.timeout = Number(need(i)); break;
      case "--only": a.only = new Set(need(i).split(",")); break;
      case "--run-start": a.runStart = Number(need(i)); break;
      case "--runs": a.runs = Number(need(i)); break;
      case "--budget": a.budget = parseBudget(need(i)); break;
      default: throw new Error(`unknown option ${argv[i]}`);
    }
  }
  for (const k of ["model", "workspace", "scratch"]) if (!a[k]) throw new Error(`--${k} is required`);
  return a;
}

async function main(argv) {
  let a;
  try { a = parseArgs(argv); } catch (err) { console.error(err.message); return 2; }
  const evals = JSON.parse(fs.readFileSync(path.join(REPO, "evals", "evals.json"), "utf8")).evals;
  const workspace = path.resolve(a.workspace);
  const scratch = path.resolve(a.scratch);
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(scratch, { recursive: true });
  const jobs = [];
  for (let n = a.runStart; n < a.runStart + a.runs; n++)
    for (const e of evals) {
      if (a.only && !a.only.has(e.name)) continue;
      for (const cfg of ["with_skill", "without_skill"]) jobs.push({ e, cfg, model: a.model, scratch, workspace, timeout: a.timeout, n, budget: a.budget });
    }
  console.log(`${jobs.length} runs, model=${a.model}, workers=${a.workers}`);
  // A small pool; results print in job order, like the Python version's executor.map.
  const results = jobs.map(() => { let resolve; const p = new Promise((r) => { resolve = r; }); return { p, resolve }; });
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i].resolve(await runOne(jobs[i]).catch((err) => `${jobs[i].e.name} ${jobs[i].cfg} run-${jobs[i].n} FAILED: ${err.message}`));
    }
  };
  const pool = Promise.all(Array.from({ length: Math.min(a.workers, jobs.length) }, worker));
  for (const r of results) console.log(await r.p);
  await pool;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
