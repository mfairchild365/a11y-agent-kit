#!/usr/bin/env node
// Runs every test of the repo's own tooling, then every deterministic check against its fixtures, and
// prints one line per suite. Nothing here calls a model.
//
//   node evals/run_all_tests.mjs               everything
//   node evals/run_all_tests.mjs --no-browser  skip the suites that need a browser
//
// The browser suites need Playwright and a browser. This script sets NODE_PATH to evals/node_modules if you
// haven't, and uses PW_CHANNEL if you set it (PW_CHANNEL=msedge or chrome uses an installed browser).
// Exits 1 if any suite fails.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const noBrowser = process.argv.includes("--no-browser");
const env = { ...process.env };
if (!env.NODE_PATH && fs.existsSync(path.join(here, "node_modules"))) env.NODE_PATH = path.join(here, "node_modules");

const SUITES = [
  { name: "sync_plugin and the generic-only gate", args: [path.join(repo, "scripts", "sync_plugin.mjs"), "--check"] },
  { name: "sync_plugin tests", args: [path.join(here, "test_sync_plugin.mjs")] },
  { name: "generic-only gate tests", args: [path.join(here, "test_check_generic.mjs")] },
  { name: "fixture runner tests", args: [path.join(here, "test_check_runner.mjs")] },
  { name: "eval tooling tests (graders, summaries, launchers)", args: [path.join(here, "test_eval_tooling.mjs")] },
  { name: "compare-reports tests", args: [path.join(here, "test_compare_reports.mjs")] },
  { name: "audit report checker tests", args: [path.join(here, "test_check_audit_report.mjs")] },
  { name: "compare-reports fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "compare-reports"] },
  { name: "live-region probe tests", args: [path.join(here, "test_live_probe.mjs")], browser: true },
  { name: "tree-pass fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "tree-pass"], browser: true },
  { name: "keyboard-walk fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "keyboard-walk"], browser: true },
  { name: "guard run grader and runner tests", args: [path.join(here, "test_check_guard_run.mjs")], browser: true },
];

let failed = 0, ran = 0;
for (const suite of SUITES) {
  if (suite.browser && noBrowser) { console.log(`SKIP  ${suite.name} (--no-browser)`); continue; }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, suite.args, { cwd: repo, env, encoding: "utf8", timeout: 20 * 60 * 1000 });
  const ok = r.status === 0;
  ran++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${suite.name}  (${Math.round((Date.now() - t0) / 1000)}s)`);
  if (!ok) console.log((r.stdout || "").split("\n").filter((l) => /^FAIL|error:|Error/.test(l)).slice(0, 8).map((l) => "      " + l).join("\n") + (r.stderr ? "\n      " + r.stderr.split("\n")[0] : ""));
}
console.log(`\n${ran - failed} of ${ran} suites passed.`);
process.exit(failed ? 1 : 0);
