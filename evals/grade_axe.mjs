#!/usr/bin/env node
// Base-layer programmatic grading: run axe_check.mjs against every run's
// delivered HTML file and merge a single expectation into that run's
// grading.json. Safe to run before or after the LLM grader: both merge into
// the same file, keyed by expectation text, and each recomputes the summary.
//
// Usage:
//   node evals/grade_axe.mjs <workspace-iteration-dir>
//   node evals/grade_axe.mjs evals/workspace/iteration-1
//
// Expects the skill-creator run layout:
//   <iteration-dir>/eval-<name>/<with_skill|without_skill>/run-<N>/outputs/index.html

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, runDirs, writeJson } from "./lib/runs.mjs";

export const AXE_EXPECTATION_TEXT = "No WCAG (non-best-practice) axe violations in the delivered file";
const here = path.dirname(fileURLToPath(import.meta.url));
const AXE_CHECK = path.join(here, "axe_check.mjs");

export function findOutputHtml(runDir) {
  const outputs = path.join(runDir, "outputs");
  if (!fs.existsSync(outputs) || !fs.statSync(outputs).isDirectory()) return null;
  const preferred = path.join(outputs, "index.html");
  if (fs.existsSync(preferred)) return preferred;
  const html = fs.readdirSync(outputs).filter((f) => f.endsWith(".html")).sort();
  return html.length ? path.join(outputs, html[0]) : null;
}

export function interpretAxe(code, stdout, stderr) {
  if (code !== 0 && code !== 1) return { passed: false, evidence: `axe_check.mjs errored (exit ${code}): ${stderr.trim().slice(0, 500)}` };
  let data;
  try { data = JSON.parse(stdout); }
  catch { return { passed: false, evidence: `axe_check.mjs produced non-JSON output: ${stdout.trim().slice(0, 500)} ${stderr.trim().slice(0, 500)}` }; }
  const wcag = data.wcag || [];
  if (!wcag.length) {
    let evidence = "No WCAG violations found by axe-core.";
    if (data.bp && data.bp.length) evidence += ` (${data.bp.length} best-practice-only items, not counted: ${data.bp.map((v) => v.id).join(", ")})`;
    return { passed: true, evidence };
  }
  return { passed: false, evidence: `${wcag.length} WCAG violation(s): ${wcag.map((v) => `${v.id} (${v.impact})`).join(", ")}` };
}

function runAxe(htmlPath) {
  const r = spawnSync(process.execPath, [AXE_CHECK, path.resolve(htmlPath)], { encoding: "utf8", cwd: here });
  return interpretAxe(r.status, r.stdout || "", r.stderr || "");
}

export function mergeExpectation(gradingPath, text, passed, evidence) {
  const grading = fs.existsSync(gradingPath) ? readJson(gradingPath) : { expectations: [] };
  const expectations = (grading.expectations || []).filter((e) => e.text !== text);
  expectations.push({ text, passed, evidence });
  grading.expectations = expectations;
  const ok = expectations.filter((e) => e.passed).length;
  grading.summary = { passed: ok, failed: expectations.length - ok, total: expectations.length, pass_rate: expectations.length ? Math.round((ok / expectations.length) * 10000) / 10000 : 0.0 };
  fs.mkdirSync(path.dirname(gradingPath), { recursive: true });
  writeJson(gradingPath, grading);
}

function main(argv) {
  if (argv.length !== 1) { console.error("Usage: node evals/grade_axe.mjs <workspace-iteration-dir>"); return 2; }
  const dir = argv[0];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { console.error(`Not a directory: ${dir}`); return 2; }
  const runs = runDirs(dir);
  if (!runs.length) { console.error(`No run-* directories found under ${dir}/eval-*/*/`); return 1; }
  let checked = 0;
  for (const { dir: runDir } of runs) {
    const html = findOutputHtml(runDir);
    const grading = path.join(runDir, "grading.json");
    if (!html) {
      mergeExpectation(grading, AXE_EXPECTATION_TEXT, false, "No outputs/*.html file found for this run.");
      console.log(`[skip: no html] ${runDir}`);
      continue;
    }
    const result = runAxe(html);
    mergeExpectation(grading, AXE_EXPECTATION_TEXT, result.passed, result.evidence);
    console.log(`[${result.passed ? "PASS" : "FAIL"}] ${runDir}`);
    checked++;
  }
  console.log(`\nChecked ${checked}/${runs.length} runs.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
