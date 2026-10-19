#!/usr/bin/env node
// Behavior layer of the page-building grading: for the evals that have a behavior check (evals/behavior/*.mjs), drive each
// run's delivered page in a real browser and merge the results into the run's grading.json as "[behavior] ..."
// expectations, using the same texts as evals.json. The axe layer (grade_axe.mjs) and the upstream layer
// (grade_upstream.mjs) are separate and can be run in any order.
//
// A check decides only what it can read from behavior. For each expectation it can decide:
//   any failing result     the expectation fails, with the failed ids as evidence
//   every result passes    it passes
//   anything else          it is left out (an inconclusive result, or a check that stopped early), so the LLM grader keeps it
// A run with no HTML, or a check that crashes, times out or prints garbage, merges a FAILING expectation. It is never
// skipped, so strict scoring cannot count a run it could not check as clean.
//
// Usage: node evals/grade_behavior.mjs <workspace-iteration-dir>
//   Needs Playwright and a browser (NODE_PATH=evals/node_modules, PW_CHANNEL=msedge if Chromium isn't installed).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOutputHtml } from "./grade_axe.mjs";
import { readJson, runDirs, writeJson } from "./lib/runs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const BEHAVIOR_PREFIX = "[behavior] ";
export const CHECK_FAILED_TEXT = `${BEHAVIOR_PREFIX}Behavior checks ran against the delivered file`;

// eval name (as in evals.json and the eval-<name> dirs) -> check script in evals/behavior
export const EVAL_TO_CHECK = {
  "toast-archive-undo": "toast.mjs",
  "tooltip-toggletip": "tooltip.mjs",
  "loading-status": "loading.mjs",
  "character-count": "charcount.mjs",
};

// Turns one check's output into expectations. Returns null if the output is not a usable result.
export function toExpectations(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.results) || !Array.isArray(data.expectations)) return null;
  const out = [];
  for (const e of data.expectations) {
    const mine = data.results.filter((r) => e.ids.includes(r.id));
    const failed = mine.filter((r) => r.status === "fail");
    if (failed.length) { out.push({ text: BEHAVIOR_PREFIX + e.text, passed: false, evidence: failed.map((r) => `${r.id}: ${r.evidence}`).join("; ") }); continue; }
    const decided = e.ids.every((id) => mine.some((r) => r.id === id && r.status === "pass"));
    if (decided) out.push({ text: BEHAVIOR_PREFIX + e.text, passed: true, evidence: mine.map((r) => r.evidence).filter(Boolean).join("; ").slice(0, 400) });
  }
  return out;
}

export function mergeBehavior(gradingPath, added) {
  const grading = fs.existsSync(gradingPath) ? readJson(gradingPath) : { expectations: [] };
  const expectations = (grading.expectations || []).filter((e) => !(e.text || "").startsWith(BEHAVIOR_PREFIX));
  expectations.push(...added);
  grading.expectations = expectations;
  const ok = expectations.filter((e) => e.passed).length;
  grading.summary = { passed: ok, failed: expectations.length - ok, total: expectations.length, pass_rate: expectations.length ? Math.round((ok / expectations.length) * 10000) / 10000 : 0.0 };
  fs.mkdirSync(path.dirname(gradingPath), { recursive: true });
  writeJson(gradingPath, grading);
}

// Runs one check on one page. { ok, data } or { ok: false, error }.
export function runBehaviorCheck(script, html, { timeoutMs = 90000, extraArgs = [] } = {}) {
  const r = spawnSync(process.execPath, [script, path.resolve(html), "--json", ...extraArgs], { encoding: "utf8", cwd: here, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  if (r.error) return { ok: false, error: `the check did not finish (${r.error.code || r.error.message})` };
  let data;
  try { data = JSON.parse(r.stdout); } catch { return { ok: false, error: `the check printed no JSON (exit ${r.status}): ${(r.stderr || "").trim().split("\n")[0].slice(0, 200)}` }; }
  if (r.status !== 0 && r.status !== null) return { ok: false, error: `the check failed (exit ${r.status}): ${(r.stderr || "").trim().split("\n")[0].slice(0, 200)}` };
  if (!toExpectations(data)) return { ok: false, error: "the check's output has no results" };
  return { ok: true, data };
}

function main(argv) {
  if (argv.length !== 1) { console.error("Usage: node evals/grade_behavior.mjs <workspace-iteration-dir>"); return 2; }
  const dir = argv[0];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { console.error(`Not a directory: ${dir}`); return 2; }
  let checked = 0, skipped = 0;
  for (const { dir: runDir, evalName } of runDirs(dir)) {
    const file = EVAL_TO_CHECK[evalName];
    if (!file) { skipped++; continue; }
    const grading = path.join(runDir, "grading.json");
    const html = findOutputHtml(runDir);
    if (!html) { mergeBehavior(grading, [{ text: CHECK_FAILED_TEXT, passed: false, evidence: "No outputs/*.html file found for this run." }]); console.log(`[FAIL: no html] ${runDir}`); continue; }
    const res = runBehaviorCheck(path.join(here, "behavior", file), html);
    if (!res.ok) { mergeBehavior(grading, [{ text: CHECK_FAILED_TEXT, passed: false, evidence: res.error }]); console.log(`[FAIL: ${res.error}] ${runDir}`); continue; }
    const added = toExpectations(res.data);
    mergeBehavior(grading, added);
    const ok = added.filter((e) => e.passed).length;
    console.log(`[${ok}/${added.length}${res.data.stopReason !== "complete" ? `, ${res.data.stopReason}` : ""}] ${runDir}`);
    checked++;
  }
  console.log(`\nChecked ${checked} runs (${skipped} runs have no behavior check and were skipped).`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
