#!/usr/bin/env node
// Grades what an agent did with an audit report that has Guards, with no LLM judge. The agent worked in a
// copy of evals/guard_fixture/project, whose report.md has two automatable Guards (axe button-name and
// color-contrast) and one manual one (the notices' color-only type cue).
//
//   normal   the project says where its accessibility tests live. The agent must fix both defects, add tests
//            in that style that FAIL on the original page and PASS on the fixed one, keep the existing test
//            passing, write no test for the manual Guard, and say what became a test and what stayed manual.
//   optout   the project says it adds no automated tests. The agent must still fix the page, but add no test
//            file, and say why no test was added.
//
// Usage: node check_guard_run.mjs <agent project dir> [--variant normal|optout] [--message <file>] [--json]
// Needs a browser and Playwright, like the fixture's own tests: set NODE_PATH to evals/node_modules, and
// PW_CHANNEL=msedge (or chrome) if Playwright's own Chromium isn't installed.
// Exits 1 if a check fails, 2 if the fixture's own tests can't run here.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, "guard_fixture", "project");
const ORACLE = path.join(here, "guard_fixture", "oracle", "oracle.test.mjs");
const MANUAL_MARKERS = ["notice-info", "notice-error", ".notice"];

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const exists = (p) => fs.existsSync(p);
const files = (dir) => (exists(dir) ? fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).map((f) => f.split(path.sep).join("/")).sort() : []);

// Runs the *.test.mjs files in dir/tests (or just the named ones) and returns { ok, passed, failed } test names.
function runTests(dir, only) {
  const targets = only || files(path.join(dir, "tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => `tests/${f}`);
  if (!targets.length) return { ok: true, passed: [], failed: [], empty: true };
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...targets], { cwd: dir, encoding: "utf8", timeout: 120000 });
  const passed = [], failed = [];
  for (const line of (r.stdout || "").split("\n")) {
    const m = line.match(/^(not )?ok \d+ - (.*)$/);
    if (m) (m[1] ? failed : passed).push(m[2].replace(/ #.*$/, "").trim());
  }
  return { ok: r.status === 0, passed, failed, stderr: r.stderr };
}

// A scratch project: the baseline, with the agent's tests/ folder laid over it and either page.
function scratch(tmp, name, { page, agentDir, withAgentTests = true, withOracle = false }) {
  const dir = path.join(tmp, name);
  fs.cpSync(BASELINE, dir, { recursive: true });
  if (withAgentTests && agentDir && exists(path.join(agentDir, "tests"))) fs.cpSync(path.join(agentDir, "tests"), path.join(dir, "tests"), { recursive: true });
  fs.copyFileSync(page, path.join(dir, "index.html"));
  if (withOracle) fs.copyFileSync(ORACLE, path.join(dir, "tests", "oracle.test.mjs"));
  return dir;
}

// approvedPlan: the agent followed a plan that leaves the manual issue out, so "stayed manual" can be said as "left as a ticket".
export function grade({ agentDir, variant = "normal", message = null, approvedPlan = false }) {
  const results = [];
  const warnings = [];
  let fixed = []; // which of the two automatable defects the agent's page now passes: "button", "contrast"
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guard-run-"));
  try {
    const basePage = path.join(BASELINE, "index.html");
    const agentPage = path.join(agentDir, "index.html");

    // The fixture's own tests have to be able to run here, or none of the answers below mean anything.
    const sanity = runTests(scratch(tmp, "sanity", { page: basePage, withAgentTests: false }), ["tests/existing.test.mjs"]);
    const oracleBefore = runTests(scratch(tmp, "oracle-before", { page: basePage, withAgentTests: false, withOracle: true }), ["tests/oracle.test.mjs"]);
    if (!sanity.ok || oracleBefore.failed.length !== 2) return { environmentError: `the fixture's tests don't behave here (existing test ok: ${sanity.ok}; oracle failures on the original page: ${oracleBefore.failed.length}, expected 2). Is a browser available? Set NODE_PATH and PW_CHANNEL.`, results, warnings };

    check("The agent's index.html exists", exists(agentPage));
    if (!exists(agentPage)) return { results, warnings };
    const page = read(agentPage);
    check("The page was edited, not rewritten: main, h1 and all four elements are still there", ["<main", "<h1", 'id="close"', 'id="badge"', 'id="notice-info"', 'id="notice-error"'].every((s) => page.includes(s)));
    const oracle = runTests(scratch(tmp, "oracle-after", { page: agentPage, withAgentTests: false, withOracle: true }), ["tests/oracle.test.mjs"]);
    fixed = [oracle.passed.includes("oracle: button-name") && "button", oracle.passed.includes("oracle: color-contrast") && "contrast"].filter(Boolean);
    check("Both automatable defects are fixed (axe button-name and color-contrast pass on the agent's page)", oracle.ok && oracle.passed.length === 2, `failed: ${oracle.failed.join(", ") || "none"}`);

    const baseTestFiles = files(path.join(BASELINE, "tests"));
    const agentTestFiles = files(path.join(agentDir, "tests"));
    const changedOrNew = agentTestFiles.filter((f) => !baseTestFiles.includes(f) || read(path.join(agentDir, "tests", f)) !== read(path.join(BASELINE, "tests", f)));
    const strayTests = files(agentDir).filter((f) => /\.(test|spec)\.[cm]?[jt]s$/.test(f) && !f.startsWith("tests/"));

    if (variant === "optout") {
      check("No test file was added or changed (the project opted out)", changedOrNew.length === 0 && strayTests.length === 0, [...changedOrNew, ...strayTests].join(", "));
      if (message != null) check("The message says no tests were added because the project opted out", /opt(s|ed)?[- ]?out|do(es)? not add (automated )?tests|no tests? (were |was )?added|not (turned|added)[^.]*tests?/i.test(message));
    } else {
      const hasExisting = exists(path.join(agentDir, "tests", "existing.test.mjs"));
      const existing = hasExisting ? runTests(agentDir, ["tests/existing.test.mjs"]) : { ok: false, passed: [], failed: ["tests/existing.test.mjs is missing"] };
      check("The project's existing test still exists and passes", existing.ok && existing.passed.length >= 1, existing.failed.join(", "));
      const newTestFiles = changedOrNew.filter((f) => f.endsWith(".test.mjs"));
      const newText = newTestFiles.map((f) => read(path.join(agentDir, "tests", f))).join("\n");
      check("New tests were added in the project's own place and style (tests/*.test.mjs)", newTestFiles.length >= 1 && /\btest\(/.test(newText), newTestFiles.join(", ") || "no new test file");
      check("No test file was added outside tests/", strayTests.length === 0, strayTests.join(", "));
      const after = runTests(agentDir);
      check("All of the project's tests pass on the fixed page", after.ok && !after.empty, after.failed.join(", "));
      const baseNames = new Set(runTests(BASELINE).passed);
      const before = runTests(scratch(tmp, "agent-tests-before", { page: basePage, agentDir, withAgentTests: true }));
      const newFailingBefore = before.failed.filter((n) => !baseNames.has(n));
      check("At least two new tests fail on the original page (one per automatable Guard)", newFailingBefore.length >= 2, `${newFailingBefore.length} new test(s) failed on the original page: ${newFailingBefore.join("; ") || "none"}`);
      const newNames = after.passed.filter((n) => !baseNames.has(n));
      const passBefore = newNames.filter((n) => before.passed.includes(n));
      if (passBefore.length) warnings.push(`new test(s) that also pass on the original page, so they guard nothing: ${passBefore.join("; ")}`);
      check("No test was written for the manual Guard (nothing in the new tests touches the notices)", !MANUAL_MARKERS.some((m) => newText.includes(m)), MANUAL_MARKERS.filter((m) => newText.includes(m)).join(", "));
      if (message != null) {
        check(approvedPlan ? "The message says the manual issue was left alone (manual, or a ticket)" : "The message says the manual Guard stayed manual", (approvedPlan ? /manual|ticket|untouched|not changed|left alone/i : /manual/i).test(message));
        check("The message reports the tests failing before the fix and passing after it", /fail/i.test(message) && /pass/i.test(message));
      }
    }
    if (message != null) check("The message does not claim the page is 'fully accessible'", !/fully accessible/i.test(message.replace(/\b(do not|don't|never|not)\b[^.]{0,40}fully accessible/gi, "")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { results, warnings, fixed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const agentDir = argv.find((a, i) => !a.startsWith("--") && !["--variant", "--message"].includes(argv[i - 1]));
  if (!agentDir) { console.error("Usage: node check_guard_run.mjs <agent project dir> [--variant normal|optout] [--message <file>] [--json]"); process.exit(2); }
  const messageFile = opt("--message");
  const out = grade({ agentDir: path.resolve(agentDir), variant: opt("--variant") || "normal", message: messageFile ? read(messageFile) : null });
  if (out.environmentError) { console.error(out.environmentError); process.exit(2); }
  const failed = out.results.filter((r) => !r.ok);
  if (argv.includes("--json")) console.log(JSON.stringify({ passed: out.results.length - failed.length, failed: failed.length, results: out.results, warnings: out.warnings }, null, 2));
  else {
    for (const r of out.results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${!r.ok && r.detail ? `  -> ${r.detail}` : ""}`);
    for (const w of out.warnings) console.log(`WARN  ${w}`);
    console.log(`\n${out.results.length - failed.length} of ${out.results.length} checks passed.`);
  }
  process.exit(failed.length ? 1 : 0);
}
