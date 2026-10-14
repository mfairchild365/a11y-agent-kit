#!/usr/bin/env node
// Optional second grading layer: runs the pinned upstream Playwright checks
// (microsoft/a11y-llm-eval) against the runs for the 7 evals that have an
// upstream equivalent, and merges their assertions into each run's
// grading.json as "[upstream] ..." expectations.
//
// Requires evals/.upstream/a11y-llm-eval to exist: run evals/fetch-upstream.sh
// first. This script never fetches on its own, so a missing checkout is always
// a deliberate, visible step rather than a surprise network call.
//
// Usage:
//   node evals/grade_upstream.mjs <workspace-iteration-dir>

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOutputHtml } from "./grade_axe.mjs";
import { readJson, writeJson } from "./lib/runs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const UPSTREAM_ROOT = path.join(here, ".upstream", "a11y-llm-eval");
const RUNNER = path.join(UPSTREAM_ROOT, "node_runner", "runner.js");
const RUNNER_FAILED_TEXT = "[upstream] Upstream checks ran against the delivered file";

// eval name (as used in evals.json / eval-<name> dirs) -> upstream test_cases scenario
export const EVAL_TO_UPSTREAM_SCENARIO = {
  "contact-form": "simple-contact-form",
  "consent-checkbox": "single-checkbox",
  "quiz-checkbox-groups": "checkbox-group",
  "notification-radio-group": "radio-button-group",
  "faq-disclosure": "disclosure-widget",
  "delete-confirm-dialog": "modal-dialog",
  "shop-home-page": "shopping-home-page",
};

function runUpstreamChecks(htmlPath, testJs, outJson) {
  // Remove any previous run's output so a crash can't be read as fresh results.
  fs.rmSync(outJson, { force: true });
  const r = spawnSync(process.execPath, [RUNNER, htmlPath, testJs, outJson], { encoding: "utf8" });
  if (!fs.existsSync(outJson)) {
    console.error(`  runner produced no output (${r.status}): ${(r.stderr || "").trim().slice(0, 300)}`);
    return null;
  }
  return readJson(outJson);
}

// requirement-type only; best-practice and not-applicable items aren't counted
export const toExpectations = (assertions) =>
  assertions
    .filter((a) => a.type === "R" && a.status !== "na")
    .map((a) => ({ text: `[upstream] ${a.name}`, passed: a.status === "pass", evidence: a.message || "(no message)" }));

export function mergeUpstreamExpectations(gradingPath, added) {
  const grading = fs.existsSync(gradingPath) ? readJson(gradingPath) : { expectations: [] };
  // Drop any prior [upstream] entries (re-runnable), keep everything else.
  const expectations = (grading.expectations || []).filter((e) => !(e.text || "").startsWith("[upstream] "));
  expectations.push(...added);
  grading.expectations = expectations;
  const ok = expectations.filter((e) => e.passed).length;
  grading.summary = { passed: ok, failed: expectations.length - ok, total: expectations.length, pass_rate: expectations.length ? Math.round((ok / expectations.length) * 10000) / 10000 : 0.0 };
  fs.mkdirSync(path.dirname(gradingPath), { recursive: true });
  writeJson(gradingPath, grading);
}

function main(argv) {
  if (argv.length !== 1) { console.error("Usage: node evals/grade_upstream.mjs <workspace-iteration-dir>"); return 2; }
  if (!fs.existsSync(RUNNER)) {
    console.error(`Upstream runner not found at ${RUNNER}.\nRun evals/fetch-upstream.sh first: this script never fetches on its own.`);
    return 1;
  }
  const iterationDir = argv[0];
  if (!fs.existsSync(iterationDir) || !fs.statSync(iterationDir).isDirectory()) { console.error(`Not a directory: ${iterationDir}`); return 2; }

  let checked = 0;
  let skippedNoMapping = 0;
  const subdirs = (dir, test) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && test(e.name)).map((e) => e.name).sort();
  for (const evalName of subdirs(iterationDir, (n) => n.startsWith("eval-"))) {
    const evalDir = path.join(iterationDir, evalName);
    const scenario = EVAL_TO_UPSTREAM_SCENARIO[evalName.slice("eval-".length)];
    if (!scenario) { skippedNoMapping++; continue; }
    const testJs = path.join(UPSTREAM_ROOT, "test_cases", scenario, "test.js");
    if (!fs.existsSync(testJs)) { console.error(`  no test.js for scenario ${scenario}, skipping ${evalDir}`); continue; }

    for (const config of subdirs(evalDir, () => true)) {
      for (const run of subdirs(path.join(evalDir, config), (n) => n.startsWith("run-"))) {
        const runDir = path.join(evalDir, config, run);
        const html = findOutputHtml(runDir);
        const gradingPath = path.join(runDir, "grading.json");
        // A run that can't be checked fails (and drops stale [upstream] entries)
        // rather than being skipped, so strict scoring can't count it as clean.
        if (!html) {
          mergeUpstreamExpectations(gradingPath, [{ text: RUNNER_FAILED_TEXT, passed: false, evidence: "No outputs/*.html file found for this run." }]);
          console.log(`[FAIL: no html] ${runDir}`);
          continue;
        }
        const result = runUpstreamChecks(html, testJs, path.join(runDir, "upstream-checks.json"));
        if (!result) {
          mergeUpstreamExpectations(gradingPath, [{ text: RUNNER_FAILED_TEXT, passed: false, evidence: "Upstream runner produced no output." }]);
          console.log(`[FAIL: runner error] ${runDir}`);
          continue;
        }
        const assertions = (result.testFunctionResult || {}).assertions || [];
        mergeUpstreamExpectations(gradingPath, toExpectations(assertions));
        const required = assertions.filter((a) => a.type === "R");
        console.log(`[${required.filter((a) => a.status === "pass").length}/${required.length}] ${runDir} (${scenario})`);
        checked++;
      }
    }
  }
  console.log(`\nChecked ${checked} runs across ${Object.keys(EVAL_TO_UPSTREAM_SCENARIO).length} mapped scenarios (${skippedNoMapping} eval dirs have no upstream mapping and were skipped).`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
