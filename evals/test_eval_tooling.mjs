#!/usr/bin/env node
// Tests the eval scripts that grade and summarize runs (strict_summary, grade_axe, grade_upstream) and the
// two that launch the `claude` CLI (run_cli_eval, trigger_check, against evals/fake_claude.mjs). No browser,
// no network, no real model.
// Usage: node evals/test_eval_tooling.mjs   (exits 1 if any case behaves differently than expected)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOutputHtml, interpretAxe, mergeExpectation } from "./grade_axe.mjs";
import { mergeUpstreamExpectations, toExpectations } from "./grade_upstream.mjs";
import { budgetArgs, costText, parseBudget } from "./lib/claude.mjs";
import { buildPrompt, parseStream } from "./run_cli_eval.mjs";
import { isProcess, summarize } from "./strict_summary.mjs";
import { installSkill, processEvent } from "./trigger_check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eval-tooling-"));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const put = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const read = (rel) => JSON.parse(fs.readFileSync(path.join(tmp, rel), "utf8"));
const AXE = "No WCAG (non-best-practice) axe violations in the delivered file";
const exp = (text, passed) => ({ text, passed, evidence: "e" });

// ---- strict_summary
put("ws/eval-a/with_skill/run-1/grading.json", JSON.stringify({ expectations: [exp(AXE, true), exp("[upstream] focus returns", true), exp("Groups radios", true), exp("The response reports having run an automated accessibility check", false)] }));
put("ws/eval-a/without_skill/run-1/grading.json", JSON.stringify({ expectations: [exp(AXE, false), exp("Groups radios", false)] }));
put("ws/eval-b/with_skill/run-1/grading.json", JSON.stringify({ expectations: [exp(AXE, true)] }));
put("ws/eval-c/with_skill/run-1/outputs/x", "a run with no grading.json is skipped");
{
  const { summary, rows } = summarize(path.join(tmp, "ws"));
  check("strict_summary: process assertions are excluded from defects", isProcess("The response reports having run an automated accessibility check now") && !isProcess("Groups radios"));
  check("strict_summary: a failed process assertion does not fail a run", rows.find((r) => r.eval === "a" && r.config === "with_skill").strict_all === true);
  check("strict_summary: counts per config, and skips runs without grading", summary.with_skill.runs === 2 && summary.with_skill.strict_all === 2 && summary.without_skill.strict_all === 0);
  check("strict_summary: llm_graded is true only when every run has a non-programmatic check", summary.with_skill.llm_graded === false && summary.without_skill.llm_graded === true);
  check("strict_summary: failing checks are listed, cut to 110 characters", rows.find((r) => r.config === "without_skill").defects_failed.length === 2);
}
{
  put("ws/benchmark.json", JSON.stringify({ notes: ["keep", "Strict zero-defect stale"] }));
  const r = spawnSync(process.execPath, [path.join(here, "strict_summary.mjs"), path.join(tmp, "ws"), "--write"], { encoding: "utf8" });
  const notes = read("ws/benchmark.json").notes;
  check("strict_summary --write: replaces its own old notes, keeps others, writes both files", r.status === 0 && notes[0] === "keep" && notes.length === 3 && notes.filter((n) => n.startsWith("Strict zero-defect")).length === 2 && fs.existsSync(path.join(tmp, "ws/strict_summary.md")) && fs.existsSync(path.join(tmp, "ws/strict_summary.json")));
  check("strict_summary: no argument is a usage error", spawnSync(process.execPath, [path.join(here, "strict_summary.mjs")], { encoding: "utf8" }).status === 2);
}

// ---- grade_axe
check("grade_axe: no violations passes, and best-practice items are noted but not counted", (() => { const r = interpretAxe(0, JSON.stringify({ wcag: [], bp: [{ id: "region" }] }), ""); return r.passed && r.evidence.includes("region"); })());
check("grade_axe: violations fail with ids and impact", (() => { const r = interpretAxe(1, JSON.stringify({ wcag: [{ id: "label", impact: "critical" }] }), ""); return !r.passed && r.evidence.includes("label (critical)"); })());
check("grade_axe: a crashed check fails, it is never read as clean", !interpretAxe(2, "", "boom").passed && !interpretAxe(0, "not json", "").passed);
put("run1/outputs/b.html", "<p>b</p>"); put("run1/outputs/a.html", "<p>a</p>");
put("run2/outputs/index.html", "<p>i</p>"); put("run2/outputs/a.html", "<p>a</p>");
check("grade_axe: finds index.html first, else the first html file, else null", findOutputHtml(path.join(tmp, "run2")).endsWith("index.html") && findOutputHtml(path.join(tmp, "run1")).endsWith("a.html") && findOutputHtml(path.join(tmp, "nothing")) === null);
{
  const g = path.join(tmp, "run3", "grading.json");
  mergeExpectation(g, AXE, false, "first");
  mergeExpectation(g, "other", true, "o");
  mergeExpectation(g, AXE, true, "second");
  const data = JSON.parse(fs.readFileSync(g, "utf8"));
  check("grade_axe: merging replaces the same text, keeps others, and recomputes the summary", data.expectations.length === 2 && data.expectations.find((e) => e.text === AXE).evidence === "second" && data.summary.passed === 2 && data.summary.pass_rate === 1);
}

// ---- grade_upstream
check("grade_upstream: only requirement-type, applicable assertions count", (() => { const e = toExpectations([{ type: "R", name: "a", status: "pass" }, { type: "R", name: "b", status: "na" }, { type: "BP", name: "c", status: "fail" }, { type: "R", name: "d", status: "fail", message: "m" }]); return e.length === 2 && e[0].text === "[upstream] a" && e[0].passed && !e[1].passed && e[1].evidence === "m"; })());
{
  const g = path.join(tmp, "run4", "grading.json");
  mergeExpectation(g, AXE, true, "x");
  mergeUpstreamExpectations(g, [exp("[upstream] old", true)]);
  mergeUpstreamExpectations(g, [exp("[upstream] new", false)]);
  const t = JSON.parse(fs.readFileSync(g, "utf8")).expectations.map((e) => e.text);
  check("grade_upstream: re-running drops stale [upstream] entries and keeps the rest", t.length === 2 && t.includes(AXE) && t.includes("[upstream] new"));
}

// ---- run_cli_eval and trigger_check helpers
check("run_cli_eval: the prompt asks for index.html, and the existing-page eval points at its input file", buildPrompt({ name: "x", prompt: "Build X." }).endsWith("Write the finished page to index.html in the current directory.") && buildPrompt({ name: "existing-page-save-feature", prompt: "Edit (evals/files/account-settings.html)." }).includes("(the file account-settings.html in the current directory)"));
{
  const f = put("stream.jsonl", [
    JSON.stringify({ type: "system", subtype: "init", skills: ["s"], plugins: ["p"] }), "not json", "",
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill" }, { type: "tool_use", name: "Write" }, { type: "text", text: "hi" }] } }),
    JSON.stringify({ type: "result", result: "ok", duration_ms: 5, modelUsage: { m1: {} }, usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 4 } }),
  ].join("\n"));
  const i = parseStream(f);
  check("run_cli_eval: parseStream reads tool calls, result, models and tokens, and ignores bad lines", i.skill_tool_calls === 1 && i.tool_calls.Write === 1 && i.result === "ok" && i.models[0] === "m1" && i.tokens === 7 && i.skills_listed[0] === "s");
  check("run_cli_eval: parseStream of a missing file is empty, not an error", parseStream(path.join(tmp, "nope")).tokens === null);
}
{
  const ev = (...names) => ({ type: "assistant", message: { content: names.map((n) => ({ type: "tool_use", name: n, input: n === "Skill" ? { skill: "building-accessible-ui" } : {} })) } });
  const s = () => ({ triggered: false, calls: 0, firstTools: [], ended: "no_result" });
  let st = s(); check("trigger_check: the Skill tool for this skill triggers and stops", processEvent(st, ev("Skill")) && st.triggered && st.ended === "skill");
  st = s(); check("trigger_check: a Write stops the run as not triggered", processEvent(st, ev("Write")) && !st.triggered && st.ended === "wrote");
  st = s(); check("trigger_check: exploration continues until the cap", (() => { for (let i = 0; i < 9; i++) if (processEvent(st, ev("Read"))) return false; return processEvent(st, ev("Read")) && st.ended === "explore_cap"; })());
  st = s(); check("trigger_check: a result event ends the run as text", processEvent(st, { type: "result" }) && st.ended === "text");
  st = s(); check("trigger_check: a Skill call for some other skill does not trigger", (() => { const e = ev("Skill"); e.message.content[0].input = { skill: "other" }; return processEvent(st, e) === false && !st.triggered; })());
  const dir = path.join(tmp, "installed");
  installSkill(dir, "A new description: with a colon");
  const text = fs.readFileSync(path.join(dir, ".claude/skills/building-accessible-ui/SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  check("trigger_check: installSkill swaps only the description line", text.includes("\ndescription: A new description: with a colon\n") && text.includes("# building-accessible-ui") && text.match(/^description:/gm).length === 1);
}

// ---- the two launchers, end to end against the fake CLI
const env = (mode) => ({ ...process.env, CLAUDE_BIN: path.join(here, "fake_claude.mjs"), FAKE_CLAUDE: mode });
const evalNames = JSON.parse(fs.readFileSync(path.join(here, "evals.json"), "utf8")).evals.map((e) => e.name);
{
  const only = evalNames[0];
  const run = (mode, extra = []) => spawnSync(process.execPath, [path.join(here, "run_cli_eval.mjs"), "--model", "fake", "--workspace", path.join(tmp, `cli-${mode}`), "--scratch", path.join(tmp, `cli-scratch-${mode}`), "--only", only, ...extra], { encoding: "utf8", env: env(mode), timeout: 60000 });
  const r = run("done");
  const base = path.join(tmp, "cli-done", `eval-${only}`);
  const meta = JSON.parse(fs.readFileSync(path.join(base, "with_skill", "run-1", "meta.json"), "utf8"));
  check("run_cli_eval end to end: both configs run and copy index.html into the workspace layout", r.status === 0 && fs.existsSync(path.join(base, "with_skill/run-1/outputs/index.html")) && fs.existsSync(path.join(base, "without_skill/run-1/outputs/index.html")) && fs.existsSync(path.join(base, "eval_metadata.json")));
  check("run_cli_eval end to end: meta records status, skill calls and models", meta.status === "ok" && meta.produced_index === true && meta.skill_tool_calls === 1 && meta.models[0] === "fake-model");
  check("run_cli_eval end to end: the skill is installed for with_skill only", fs.existsSync(path.join(tmp, "cli-scratch-done", `${only}__with_skill__r1`, ".claude/skills/building-accessible-ui/SKILL.md")) && !fs.existsSync(path.join(tmp, "cli-scratch-done", `${only}__without_skill__r1`, ".claude")));
  check("run_cli_eval end to end: the prompt reaches the CLI as one argument", fs.readFileSync(path.join(base, "with_skill/run-1/outputs/response.md"), "utf8").startsWith("Done. Prompt had: "));
  const h = run("hang", ["--timeout", "2"]);
  const hm = JSON.parse(fs.readFileSync(path.join(tmp, "cli-hang", `eval-${only}`, "with_skill", "run-1", "meta.json"), "utf8"));
  check("run_cli_eval end to end: a stalled CLI is killed and recorded as a timeout", h.status === 0 && hm.status === "timeout" && hm.produced_index === false);
  check("run_cli_eval: missing required options is a usage error", spawnSync(process.execPath, [path.join(here, "run_cli_eval.mjs")], { encoding: "utf8" }).status === 2);
}
{
  const run = (mode, extra = []) => { const out = path.join(tmp, `trig-${mode}`); const r = spawnSync(process.execPath, [path.join(here, "trigger_check.mjs"), "--model", "fake", "--desc", "current=-", "--runs", "1", "--only", "0", "--scratch", path.join(tmp, `trig-scratch-${mode}`), "--out", out, ...extra], { encoding: "utf8", env: env(mode), timeout: 60000 }); return { r, summary: fs.existsSync(path.join(out, "trigger_fake.json")) ? JSON.parse(fs.readFileSync(path.join(out, "trigger_fake.json"), "utf8")).current : null }; };
  const a = run("skill");
  check("trigger_check end to end: a Skill call is recorded as fired and the stalled CLI is stopped", a.r.status === 0 && a.summary.per_query[0].fired === 1 && a.summary.per_query[0].ended[0] === "skill");
  const b = run("write");
  check("trigger_check end to end: a Write is recorded as not fired", b.r.status === 0 && b.summary.per_query[0].fired === 0 && b.summary.per_query[0].ended[0] === "wrote");
  const c = run("hang", ["--timeout", "2"]);
  check("trigger_check end to end: a silent stall is stopped by the timeout", c.r.status === 0 && c.summary.per_query[0].ended[0] === "timeout");
  check("trigger_check end to end: scratch directories are cleaned up", !fs.existsSync(path.join(tmp, "trig-scratch-skill", "current__q0__r1")));
}

// ---- cost controls: --budget reaches the CLI as --max-budget-usd, and each run's cost is printed
check("budget: --budget becomes --max-budget-usd, and no budget adds nothing", budgetArgs(1.5).join(" ") === "--max-budget-usd 1.5" && budgetArgs(null).length === 0 && budgetArgs(undefined).length === 0);
check("budget: a positive number of dollars is accepted", parseBudget("0.25") === 0.25 && parseBudget("3") === 3);
check("budget: zero, a negative number, text and nothing are rejected", ["0", "-1", "abc", "", "NaN", "Infinity"].every((t) => { try { parseBudget(t); return false; } catch (e) { return /positive number of dollars/.test(e.message); } }));
check("budget: costText shows four decimals, or n/a when the run never reported", costText(0.0123) === "$0.0123" && costText(0) === "$0.0000" && costText(null) === "n/a" && costText(undefined) === "n/a");
check("budget: parseStream reads total_cost_usd from the result event, and null when there is none", (() => {
  const a = put("cost1.jsonl", JSON.stringify({ type: "result", result: "ok", total_cost_usd: 0.5, usage: {} }));
  const b = put("cost2.jsonl", JSON.stringify({ type: "result", result: "ok", usage: {} }));
  return parseStream(a).cost === 0.5 && parseStream(b).cost === null;
})());
{
  const argsFile = path.join(tmp, "args.json");
  const withFake = (mode) => ({ ...process.env, CLAUDE_BIN: path.join(here, "fake_claude.mjs"), FAKE_CLAUDE: mode, FAKE_CLAUDE_ARGS_FILE: argsFile });
  const only = evalNames[0];
  const cli = (extra) => spawnSync(process.execPath, [path.join(here, "run_cli_eval.mjs"), "--model", "fake", "--workspace", path.join(tmp, "b-ws"), "--scratch", path.join(tmp, "b-scratch"), "--only", only, ...extra], { encoding: "utf8", env: withFake("done"), timeout: 60000 });
  let r = cli(["--budget", "0.5"]);
  let args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  check("budget: run_cli_eval passes --max-budget-usd to the CLI, before the prompt", r.status === 0 && args[args.indexOf("--max-budget-usd") + 1] === "0.5" && args.indexOf("--max-budget-usd") < args.length - 1 && /Write the finished page/.test(args[args.length - 1]));
  check("budget: run_cli_eval prints each run's cost and records it in timing.json", /cost=\$0\.0123/.test(r.stdout) && JSON.parse(fs.readFileSync(path.join(tmp, "b-ws", `eval-${only}`, "with_skill", "run-1", "timing.json"), "utf8")).total_cost_usd === 0.0123);
  r = cli([]);
  args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  check("budget: with no --budget, run_cli_eval adds no budget flag", r.status === 0 && !args.includes("--max-budget-usd"));
  check("budget: run_cli_eval rejects a bad --budget as a usage error", cli(["--budget", "0"]).status === 2 && cli(["--budget", "abc"]).status === 2);
  const trig = spawnSync(process.execPath, [path.join(here, "trigger_check.mjs"), "--model", "fake", "--desc", "current=-", "--runs", "1", "--only", "0", "--scratch", path.join(tmp, "b-trig"), "--out", path.join(tmp, "b-trig-out"), "--budget", "2"], { encoding: "utf8", env: withFake("skill"), timeout: 60000 });
  args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  check("budget: trigger_check passes --max-budget-usd to the CLI, before the prompt", trig.status === 0 && args[args.indexOf("--max-budget-usd") + 1] === "2" && args.indexOf("--max-budget-usd") < args.length - 1);
  check("budget: trigger_check rejects a bad --budget", spawnSync(process.execPath, [path.join(here, "trigger_check.mjs"), "--model", "x", "--desc", "a=-", "--out", path.join(tmp, "o"), "--budget", "-3"], { encoding: "utf8" }).status === 2);
  const audit = spawnSync(process.execPath, [path.join(here, "run_audit_eval.mjs"), "--model", "fake", "--runs", "1", "--scratch", path.join(tmp, "b-audit"), "--out", path.join(tmp, "b-audit-out"), "--budget", "1.25"], { encoding: "utf8", env: withFake("done"), timeout: 60000 });
  args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  check("budget: run_audit_eval passes --max-budget-usd to the CLI and prints the run's cost", args[args.indexOf("--max-budget-usd") + 1] === "1.25" && /cost \$0\.0123/.test(audit.stdout));
  check("budget: run_audit_eval rejects a bad --budget", spawnSync(process.execPath, [path.join(here, "run_audit_eval.mjs"), "--model", "x", "--budget", "free"], { encoding: "utf8" }).status === 2);
  check("budget: run_guard_eval rejects a bad --budget", spawnSync(process.execPath, [path.join(here, "run_guard_eval.mjs"), "--model", "x", "--budget", "-1"], { encoding: "utf8" }).status === 2);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
