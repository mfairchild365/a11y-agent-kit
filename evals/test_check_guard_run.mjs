#!/usr/bin/env node
// Tests evals/check_guard_run.mjs: it must pass a correct run, and fail each way an agent can get it wrong.
// Needs a browser and Playwright (the fixture's tests run in one): set NODE_PATH to evals/node_modules, and
// PW_CHANNEL=msedge (or chrome) if Playwright's own Chromium isn't installed.
// Usage: node evals/test_check_guard_run.mjs   (exits 1 if the grader misjudges any case)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grade } from "./check_guard_run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, "guard_fixture", "project");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guard-run-test-"));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

const read = (p) => fs.readFileSync(p, "utf8");
const FIXED = (html) => html.replace('<button id="close" type="button">', '<button id="close" type="button" aria-label="Close">').replace("background: #2b7de9; color: #9cc4ff;", "background: #1a5fb4; color: #ffffff;");
const HEAD = 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { withPage, axeViolations } from "./helpers.mjs";\n';
const T_BUTTON = 'test("close button has an accessible name", async () => {\n  await withPage("index.html", async (page) => assert.deepEqual(await axeViolations(page, ["button-name"]), []));\n});\n';
const T_CONTRAST = 'test("badge text meets contrast", async () => {\n  await withPage("index.html", async (page) => assert.deepEqual(await axeViolations(page, ["color-contrast"]), []));\n});\n';
const T_VACUOUS = 'test("page has a main landmark", async () => {\n  await withPage("index.html", async (page) => assert.equal(await page.locator("main").count(), 1));\n});\n';
const T_MANUAL = 'test("notices exist", async () => {\n  await withPage("index.html", async (page) => assert.equal(await page.locator("#notice-info").count(), 1));\n});\n';
const GOOD_MESSAGE = "Fixed #1 and #2. I added tests/guards.test.mjs: both tests failed on the original page and pass now. The notice type cue (Guard #3) stays manual: check it in grayscale.";
const OPTOUT_MESSAGE = "Fixed #1 and #2. The project says it adds no automated tests, so I did not add any (opted out). The Guards are still checks to run by hand.";

let n = 0;
// Builds an agent project: the baseline, then edits. opts: { page, tests: {name: content}, extraFiles: {rel: content}, removeExisting }
function agent({ page = FIXED(read(path.join(BASELINE, "index.html"))), tests = {}, extra = {}, removeExisting = false } = {}) {
  const dir = path.join(tmp, `a${++n}`);
  fs.cpSync(BASELINE, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), page);
  if (removeExisting) fs.rmSync(path.join(dir, "tests", "existing.test.mjs"));
  for (const [name, text] of Object.entries(tests)) fs.writeFileSync(path.join(dir, "tests", name), text);
  for (const [rel, text] of Object.entries(extra)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
  return dir;
}
const run = (dir, variant, message) => grade({ agentDir: dir, variant, message });
const failedNames = (r) => (r.environmentError ? ["ENVIRONMENT: " + r.environmentError] : r.results.filter((x) => !x.ok).map((x) => x.name));
const onlyFails = (r, ...starts) => { const f = failedNames(r); return f.length === starts.length && starts.every((s) => f.some((x) => x.startsWith(s))); };
const goodTests = { "guards.test.mjs": HEAD + T_BUTTON + T_CONTRAST };

const good = run(agent({ tests: goodTests }), "normal", GOOD_MESSAGE);
check("a correct run (fixed page, two failing-then-passing tests, manual left manual) passes every check", failedNames(good).length === 0 && !good.environmentError);
if (good.environmentError) console.log(good.environmentError);

check("no tests added: fails the new-test checks, and the page is still fixed", (() => { const f = failedNames(run(agent(), "normal", GOOD_MESSAGE)); return f.some((x) => x.startsWith("New tests were added")) && f.some((x) => x.startsWith("At least two new tests fail")) && !f.some((x) => x.startsWith("Both automatable defects")); })());
check("tests that pass on the original page too fail the 'fail before the fix' check", onlyFails(run(agent({ tests: { "guards.test.mjs": HEAD + T_VACUOUS + T_VACUOUS.replace("main landmark", "second main landmark") } }), "normal", GOOD_MESSAGE), "At least two new tests fail"));
check("only one of the two Guards turned into a test fails the 'two tests' check", onlyFails(run(agent({ tests: { "guards.test.mjs": HEAD + T_BUTTON } }), "normal", GOOD_MESSAGE), "At least two new tests fail"));
check("a test written for the manual Guard fails that check only", onlyFails(run(agent({ tests: { "guards.test.mjs": HEAD + T_BUTTON + T_CONTRAST + T_MANUAL } }), "normal", GOOD_MESSAGE), "No test was written for the manual Guard"));
check("tests added but the page left unfixed fails the fix checks", (() => { const f = failedNames(run(agent({ page: read(path.join(BASELINE, "index.html")), tests: goodTests }), "normal", GOOD_MESSAGE)); return f.some((x) => x.startsWith("Both automatable defects")) && f.some((x) => x.startsWith("All of the project's tests pass")); })());
check("a test file outside tests/ fails the placement check", (() => { const f = failedNames(run(agent({ tests: goodTests, extra: { "guards.test.mjs": HEAD + T_BUTTON } }), "normal", GOOD_MESSAGE)); return f.some((x) => x.startsWith("No test file was added outside tests/")); })());
check("deleting the project's existing test fails that check", failedNames(run(agent({ tests: goodTests, removeExisting: true }), "normal", GOOD_MESSAGE)).some((x) => x.startsWith("The project's existing test")));
check("rewriting the page (dropping an element) fails the 'edited, not rewritten' check", failedNames(run(agent({ page: FIXED(read(path.join(BASELINE, "index.html"))).replace(/<div class="notice info"[^]*?<\/div>\n/, ""), tests: goodTests }), "normal", GOOD_MESSAGE)).some((x) => x.startsWith("The page was edited, not rewritten")));
check("a message that never says the manual Guard stayed manual fails that check only", onlyFails(run(agent({ tests: goodTests }), "normal", GOOD_MESSAGE.replace(/ The notice type cue[^]*$/, "")), "The message says the manual Guard stayed manual"));
check("a message with no before and after result fails that check only", onlyFails(run(agent({ tests: goodTests }), "normal", "Fixed #1 and #2 and added tests/guards.test.mjs. The notice cue stays manual."), "The message reports the tests failing before"));
check("a 'fully accessible' claim fails that check only", onlyFails(run(agent({ tests: goodTests }), "normal", GOOD_MESSAGE + " The page is now fully accessible."), "The message does not claim"));

check("opt-out: a fixed page with no tests and the reason given passes every check", failedNames(run(agent(), "optout", OPTOUT_MESSAGE)).length === 0);
check("opt-out: adding a test file fails the opt-out check", onlyFails(run(agent({ tests: goodTests }), "optout", OPTOUT_MESSAGE), "No test file was added or changed"));
check("opt-out: a message that gives no reason fails that check only", onlyFails(run(agent(), "optout", "Fixed #1 and #2."), "The message says no tests were added"));
check("opt-out: a test file outside tests/ also fails", failedNames(run(agent({ extra: { "a11y.spec.js": HEAD } }), "optout", OPTOUT_MESSAGE)).some((x) => x.startsWith("No test file was added or changed")));

// ---- the runner, end to end against the fake CLI (no model): a good agent passes, a lazy one is caught
{
  const runner = path.join(here, "run_guard_eval.mjs");
  const go = (variant, mode) => spawnSync(process.execPath, [runner, "--model", "fake", "--variant", variant, "--runs", "1", "--scratch", path.join(tmp, `s-${variant}-${mode}`), "--out", path.join(tmp, `o-${variant}-${mode}`)], { encoding: "utf8", env: { ...process.env, CLAUDE_BIN: path.join(here, "fake_claude.mjs"), FAKE_CLAUDE: mode }, timeout: 300000 });
  const a = go("normal", "guard");
  check("run_guard_eval end to end: an agent that fixes the page and adds failing-then-passing tests exits 0", a.status === 0 && /1\/1 runs finished/.test(a.stdout));
  check("run_guard_eval end to end: it saves the agent's message and the grader's results", fs.existsSync(path.join(tmp, "o-normal-guard", "normal-run-1", "final-message.md")) && fs.existsSync(path.join(tmp, "o-normal-guard", "normal-run-1", "check.json")));
  const b = go("normal", "guard-lazy");
  check("run_guard_eval end to end: an agent that fixes the page but adds no tests exits 1 and names the failed check", b.status === 1 && /FAIL New tests were added/.test(b.stdout));
  const c = go("optout", "guard-optout");
  check("run_guard_eval end to end: an agent that respects the opt-out exits 0", c.status === 0);
  const d = go("optout", "guard");
  check("run_guard_eval end to end: an agent that adds tests to an opted-out project exits 1", d.status === 1 && /FAIL No test file was added or changed/.test(d.stdout));
  check("run_guard_eval: the opt-out file is not left in the scratch project, and AGENTS.md is the opt-out one", !fs.existsSync(path.join(tmp, "s-optout-guard-optout", "optout-run-1", "AGENTS.optout.md")) && /do not add automated tests/i.test(read(path.join(tmp, "s-optout-guard-optout", "optout-run-1", "AGENTS.md"))));
  check("run_guard_eval: missing --model is a usage error", spawnSync(process.execPath, [runner], { encoding: "utf8" }).status === 2);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "The grader judged every case correctly."}`);
process.exit(failed ? 1 : 0);
