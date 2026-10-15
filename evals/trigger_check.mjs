#!/usr/bin/env node
// Trigger-only check that mirrors real skill discovery.
//
// skill-creator's run_eval.py registers the description as a slash command and
// gives up if the first tool call isn't the skill, which under-reports triggering
// (it scored the current description at ~3% although the same skill fired in
// 108/108 real runs). This script instead:
//
//   - installs the real skill under <neutral dir>/.claude/skills/ with the
//     description under test substituted into SKILL.md,
//   - runs `claude -p` pinned to a model, in a neutral directory, with only
//     project settings loaded,
//   - watches the stream and stops as soon as the model either invokes the
//     Skill tool (triggered) or starts implementing / exhausts a few tool calls
//     (not triggered), so no pages are generated and runs stay short.
//
// Usage (repo root):
//   node evals/trigger_check.mjs --model claude-sonnet-4-6 \
//       --desc current=<file> --desc B=<file> --runs 3 --out <dir>
// Use --desc NAME=- to keep the skill's current description.
// Options: --workers 8  --timeout 150 (seconds)  --scratch DIR  --only N (repeatable)  --budget USD (a hard cap per run)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { budgetArgs, parseBudget, spawnClaude } from "./lib/claude.mjs";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_SRC = path.join(REPO, "skills", "building-accessible-ui");
const FIXTURE = path.join(REPO, "evals", "trigger_fixture");
const ALLOWED = "Skill,Read,Write,Edit,Glob,Grep,Bash";
const STOP_TOOLS = new Set(["Write", "Edit"]); // file creation = implementing; Bash/Read/Glob are exploration
const MAX_TOOL_CALLS = 10;
const PLAN_SPEC = new Set([5, 6, 7]); // should-trigger queries that ask for a spec/plan rather than code

export function installSkill(cwd, description) {
  const dest = path.join(cwd, ".claude", "skills", "building-accessible-ui");
  fs.cpSync(SKILL_SRC, dest, { recursive: true });
  if (description != null) {
    const p = path.join(dest, "SKILL.md");
    const text = fs.readFileSync(p, "utf8");
    if (!/^description:.*$/m.test(text)) throw new Error("description line not found");
    fs.writeFileSync(p, text.replace(/^description:.*$/m, () => "description: " + description));
  }
}

// Folds one stream event into the run's state: { triggered, calls, firstTools, ended }.
// Returns true when the run should stop.
export function processEvent(state, ev) {
  if (!ev || typeof ev !== "object") return false;
  if (ev.type === "assistant") {
    let stop = false;
    for (const c of (ev.message && ev.message.content) || []) {
      if (c.type !== "tool_use") continue;
      state.calls++;
      state.firstTools.push(c.name);
      if (c.name === "Skill" && JSON.stringify(c.input || {}).includes("building-accessible-ui")) { state.triggered = true; stop = true; state.ended = "skill"; }
      else if (STOP_TOOLS.has(c.name)) { stop = true; state.ended = "wrote"; }
      else if (state.calls >= MAX_TOOL_CALLS) { stop = true; state.ended = "explore_cap"; }
    }
    return stop;
  }
  if (ev.type === "result") { state.ended = "text"; return true; }
  return false;
}

function runOne(job) {
  const { label, description, qi, query, n, model, scratch, timeout, budget } = job;
  const cwd = path.join(scratch, `${label}__q${qi}__r${n}`);
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.cpSync(FIXTURE, cwd, { recursive: true });
  installSkill(cwd, description);
  const args = ["-p", "--model", model, "--no-session-persistence", "--setting-sources", "project", "--strict-mcp-config",
    "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED, ...budgetArgs(budget), "--output-format", "stream-json", "--verbose", query];
  return new Promise((resolve) => {
    const state = { triggered: false, calls: 0, firstTools: [], ended: "no_result" }; // no_result: stream closed without a result event
    const child = spawnClaude(args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
    let timedOut = false;
    let finished = false;
    const exited = new Promise((r) => { child.on("close", r); child.on("error", r); });
    // Kill from a timer: a check inside the read loop never fires if the process stalls without printing.
    const watchdog = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeout * 1000);
    const finish = async () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      if (timedOut && state.ended === "no_result") state.ended = "timeout";
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      // On Windows a directory can't be removed while the child still has it as its working directory.
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      try { fs.rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* best effort, like the Python original */ }
      resolve({ label, qi, triggered: state.triggered, tools: state.firstTools, ended: state.ended });
    };
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (finished) return;
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (processEvent(state, ev)) { rl.close(); finish(); }
    });
    child.on("error", finish);
    child.on("close", finish);
  });
}

function parseArgs(argv) {
  const a = { runs: 3, workers: 8, timeout: 150, scratch: path.join(os.tmpdir(), "bau-trigger"), desc: [], only: null, budget: null };
  const need = (i) => { if (i + 1 >= argv.length) throw new Error(`${argv[i]} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i += 2) {
    switch (argv[i]) {
      case "--model": a.model = need(i); break;
      case "--desc": a.desc.push(need(i)); break;
      case "--runs": a.runs = Number(need(i)); break;
      case "--budget": a.budget = parseBudget(need(i)); break;
      case "--workers": a.workers = Number(need(i)); break;
      case "--timeout": a.timeout = Number(need(i)); break;
      case "--scratch": a.scratch = need(i); break;
      case "--only": (a.only ||= []).push(Number(need(i))); break;
      case "--out": a.out = need(i); break;
      default: throw new Error(`unknown option ${argv[i]}`);
    }
  }
  if (!a.model) throw new Error("--model is required");
  if (!a.desc.length) throw new Error("--desc is required");
  if (!a.out) throw new Error("--out is required");
  return a;
}

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const fired = (flags) => flags.filter(Boolean).length;

async function main(argv) {
  let a;
  try { a = parseArgs(argv); } catch (err) { console.error(err.message); return 2; }
  const QUERIES = JSON.parse(fs.readFileSync(path.join(REPO, "evals", "trigger_eval.json"), "utf8"));
  const scratch = path.resolve(a.scratch);
  const out = path.resolve(a.out);
  fs.mkdirSync(scratch, { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  const descs = new Map();
  for (const d of a.desc) {
    const i = d.indexOf("=");
    const name = d.slice(0, i);
    const file = d.slice(i + 1);
    descs.set(name, file === "-" ? null : fs.readFileSync(file, "utf8").trim());
  }
  const qis = QUERIES.map((_, qi) => qi).filter((qi) => !a.only || a.only.includes(qi));
  const jobs = [];
  for (const [label, description] of descs)
    for (const qi of qis)
      for (let n = 1; n <= a.runs; n++) jobs.push({ label, description, qi, query: QUERIES[qi].query, n, model: a.model, scratch, timeout: a.timeout, budget: a.budget });
  console.log(`${jobs.length} runs, model=${a.model}`);

  const results = {}, firsts = {}, ends = {};
  for (const name of descs.keys()) { results[name] = {}; firsts[name] = {}; ends[name] = {}; for (const qi of qis) { results[name][qi] = []; firsts[name][qi] = []; ends[name][qi] = []; } }
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const r = await runOne(jobs[next++]);
      results[r.label][r.qi].push(r.triggered);
      firsts[r.label][r.qi].push(r.tools);
      ends[r.label][r.qi].push(r.ended);
    }
  };
  await Promise.all(Array.from({ length: Math.min(a.workers, jobs.length) }, worker));

  const summary = {};
  for (const name of descs.keys()) {
    const st = qis.filter((qi) => QUERIES[qi].should_trigger);
    const sn = qis.filter((qi) => !QUERIES[qi].should_trigger);
    summary[name] = {
      should_trigger_fired: sum(st.map((qi) => fired(results[name][qi]))), should_trigger_runs: sum(st.map((qi) => results[name][qi].length)),
      should_not_fired: sum(sn.map((qi) => fired(results[name][qi]))), should_not_runs: sum(sn.map((qi) => results[name][qi].length)),
      per_query: qis.map((qi) => ({ query: QUERIES[qi].query, should_trigger: QUERIES[qi].should_trigger, fired: fired(results[name][qi]), runs: results[name][qi].length, tools: firsts[name][qi], ended: ends[name][qi] })),
    };
  }
  fs.writeFileSync(path.join(out, `trigger_${a.model}.json`), JSON.stringify(summary, null, 2));
  for (const [name, s] of Object.entries(summary)) {
    console.log(`${name.padEnd(10)} should-trigger fired ${s.should_trigger_fired}/${s.should_trigger_runs}   should-NOT fired ${s.should_not_fired}/${s.should_not_runs}`);
    const groups = {
      "build/change/review": qis.filter((qi) => QUERIES[qi].should_trigger && !PLAN_SPEC.has(qi)),
      "plan/spec": qis.filter((qi) => PLAN_SPEC.has(qi)),
      "should-not": qis.filter((qi) => !QUERIES[qi].should_trigger),
    };
    for (const [gname, gq] of Object.entries(groups)) {
      const reasons = {};
      for (const qi of gq) for (const e of ends[name][qi]) reasons[e] = (reasons[e] || 0) + 1;
      console.log(`  ${gname.padEnd(20)} fired ${sum(gq.map((qi) => fired(results[name][qi])))}/${sum(gq.map((qi) => results[name][qi].length))}   ended: ${JSON.stringify(reasons)}`);
    }
    for (const qi of qis) {
      if (QUERIES[qi].should_trigger && !results[name][qi].every(Boolean)) console.log(`  MISS q${qi} ended=${JSON.stringify(ends[name][qi])} tools=${JSON.stringify(firsts[name][qi])}`);
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
