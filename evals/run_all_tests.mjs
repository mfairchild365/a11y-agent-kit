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
  { name: "contrast logic tests", args: [path.join(here, "test_contrast.mjs")] },
  { name: "shift-tab comparison tests", args: [path.join(here, "test_shift_tab.mjs")] },
  { name: "arrow-key logic tests", args: [path.join(here, "test_arrow.mjs")] },
  { name: "overlay logic tests", args: [path.join(here, "test_overlay.mjs")] },
  { name: "audit report checker tests", args: [path.join(here, "test_check_audit_report.mjs")] },
  { name: "compare-reports fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "compare-reports"] },
  { name: "verify logic tests", args: [path.join(here, "test_verify.mjs")] },
  { name: "verify-fix command tests", args: [path.join(here, "test_verify_cli.mjs")] },
  { name: "test-setup detector tests", args: [path.join(here, "test_detect.mjs")] },
  { name: "plan grader and plan-eval runner tests", args: [path.join(here, "test_check_plan_run.mjs")] },
  { name: "fix-and-verify grader tests", args: [path.join(here, "test_check_fix_verify.mjs")] },
  { name: "behavior grading layer tests (no browser)", args: [path.join(here, "test_grade_behavior.mjs"), "--no-browser"] },
  { name: "snapshot tests (stand-in scripts)", args: [path.join(here, "test_snapshot.mjs"), "--no-browser"] },
  { name: "verify-fix fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "verify-fix"] },
  { name: "detect-a11y-tests fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "detect-a11y-tests"] },
  { name: "snapshot tests (real scripts, before and after page)", args: [path.join(here, "test_snapshot.mjs"), "--browser-only"], browser: true },
  { name: "behavior grading layer tests (real pages)", args: [path.join(here, "test_grade_behavior.mjs")], browser: true },
  { name: "behavior-toast fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "behavior-toast"], browser: true },
  { name: "behavior-toast time-cap fixture", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "behavior-toast-timecap"], browser: true },
  { name: "behavior-tooltip fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "behavior-tooltip"], browser: true },
  { name: "behavior-loading fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "behavior-loading"], browser: true },
  { name: "behavior-charcount fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "behavior-charcount"], browser: true },
  { name: "live-region probe tests", args: [path.join(here, "test_live_probe.mjs")], browser: true },
  { name: "tree-pass fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "tree-pass"], browser: true },
  { name: "keyboard-walk fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "keyboard-walk"], browser: true },
  { name: "focus-contrast fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "focus-contrast"], browser: true },
  { name: "shift-tab-walk fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "shift-tab-walk"], browser: true },
  { name: "arrow-walk fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "arrow-walk"], browser: true },
  { name: "escape-return fixtures", args: [path.join(here, "run_check_fixtures.mjs"), "--check", "escape-return"], browser: true },
  { name: "focus-contrast on the seeded audit page", args: [path.join(here, "test_focus_contrast_on_audit_fixture.mjs")], browser: true },
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
