#!/usr/bin/env node
// Tests evals/grade_behavior.mjs (the behavior grading layer) and the strict-summary rules that go with it.
// The CLI cases at the end drive a real browser on toast fixtures: set NODE_PATH to evals/node_modules, and
// PW_CHANNEL=msedge (or chrome) if Playwright's own Chromium isn't installed. Pass --no-browser to skip them.
// Usage: node evals/test_grade_behavior.mjs [--no-browser]   (exits 1 if any case behaves differently than expected)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BEHAVIOR_PREFIX, CHECK_FAILED_TEXT, EVAL_TO_CHECK, mergeBehavior, runBehaviorCheck, toExpectations } from "./grade_behavior.mjs";
import { defectChecks, isProgrammatic, summarize } from "./strict_summary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grade-behavior-"));
const noBrowser = process.argv.includes("--no-browser");
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ---- turning a check's output into expectations
const out = (results) => ({ results, expectations: [{ text: "Region exists", ids: ["a", "b"] }, { text: "Undo works", ids: ["c"] }], stopReason: "complete" });
const r = (id, status, evidence = "") => ({ id, status, evidence });
let e = toExpectations(out([r("a", "pass", "ok a"), r("b", "pass", "ok b"), r("c", "pass")]));
check("every result passing gives a passing expectation, with the prefix and the evidence", e.length === 2 && e.every((x) => x.passed) && e[0].text === `${BEHAVIOR_PREFIX}Region exists` && /ok a/.test(e[0].evidence));
e = toExpectations(out([r("a", "pass"), r("b", "fail", "no region"), r("c", "pass")]));
check("one failing result fails its expectation, naming the id, and leaves the other alone", e.length === 2 && !e[0].passed && /b: no region/.test(e[0].evidence) && e[1].passed);
e = toExpectations(out([r("a", "pass"), r("b", "inconclusive", "no button"), r("c", "pass")]));
check("an inconclusive result leaves its expectation out, so the LLM grader keeps it", e.length === 1 && e[0].text.endsWith("Undo works"));
e = toExpectations(out([r("a", "pass"), r("c", "pass")]));
check("a result that never happened (the check stopped early) leaves its expectation out", e.length === 1 && e[0].text.endsWith("Undo works"));
e = toExpectations(out([r("a", "fail", "x"), r("b", "inconclusive")]));
check("a failure beats an inconclusive result in the same expectation", e.length === 1 && !e[0].passed);
check("unusable output is not turned into expectations", toExpectations(null) === null && toExpectations({}) === null && toExpectations({ results: [], expectations: "x" }) === null && toExpectations([]) === null);
check("no results at all gives no expectations", toExpectations(out([])).length === 0);

// ---- merging
const gp = path.join(tmp, "g", "grading.json");
fs.mkdirSync(path.dirname(gp));
fs.writeFileSync(gp, JSON.stringify({ expectations: [{ text: "LLM thing", passed: true, evidence: "" }, { text: `${BEHAVIOR_PREFIX}old`, passed: false, evidence: "" }] }));
mergeBehavior(gp, [{ text: `${BEHAVIOR_PREFIX}new`, passed: true, evidence: "e" }]);
let g = readJson(gp);
check("merging replaces earlier [behavior] entries, keeps the others, and recomputes the summary", g.expectations.length === 2 && g.expectations.some((x) => x.text === "LLM thing") && !g.expectations.some((x) => x.text.endsWith("old")) && g.summary.passed === 2 && g.summary.total === 2);
mergeBehavior(path.join(tmp, "fresh", "grading.json"), [{ text: CHECK_FAILED_TEXT, passed: false, evidence: "x" }]);
check("merging creates a grading.json that did not exist", readJson(path.join(tmp, "fresh", "grading.json")).summary.failed === 1);

// ---- running a check script: every failure path is a failure, not a skip
const stub = (name, body) => { const f = path.join(tmp, name); fs.writeFileSync(f, body); return f; };
const html = path.join(tmp, "page.html");
fs.writeFileSync(html, "<!doctype html><title>x</title>");
let res = runBehaviorCheck(path.join(tmp, "missing.mjs"), html);
check("a check script that does not exist is an error", !res.ok);
res = runBehaviorCheck(stub("garbage.mjs", 'console.log("not json");'), html);
check("a check that prints garbage is an error", !res.ok && /no JSON/.test(res.error));
res = runBehaviorCheck(stub("crash.mjs", 'console.error("boom"); process.exit(1);'), html);
check("a check that exits 1 is an error, with its message", !res.ok && /boom/.test(res.error));
res = runBehaviorCheck(stub("empty.mjs", 'console.log("{}");'), html);
check("a check whose JSON has no results is an error", !res.ok && /no results/.test(res.error));
res = runBehaviorCheck(stub("hang.mjs", "setInterval(() => {}, 1000);"), html, { timeoutMs: 800 });
check("a check that hangs is stopped and is an error", !res.ok && /did not finish/.test(res.error));
res = runBehaviorCheck(stub("ok.mjs", 'console.log(JSON.stringify({ results: [{ id: "a", status: "pass", evidence: "" }], expectations: [{ text: "T", ids: ["a"] }], stopReason: "complete" }));'), html);
check("a good check result is passed through", res.ok && res.data.results.length === 1);

// ---- the strict summary
const exps = [
  { text: "No WCAG (non-best-practice) axe violations in the delivered file", passed: true },
  { text: "The Undo is a native button", passed: true },          // LLM-graded
  { text: `${BEHAVIOR_PREFIX}The Undo is a native button`, passed: false, evidence: "x" },
  { text: "Focus lands somewhere logical", passed: false },       // LLM-graded, no behavior result
  { text: "The response reports having run an automated accessibility check", passed: false },
];
const dc = defectChecks(exps).map((x) => x.text);
check("an LLM expectation that a behavior check decided is not counted twice", !dc.includes("The Undo is a native button") && dc.includes(`${BEHAVIOR_PREFIX}The Undo is a native button`));
check("an LLM expectation no behavior check decided still counts", dc.includes("Focus lands somewhere logical"));
check("process assertions are still left out", !dc.some((t) => t.startsWith("The response reports")));
check("the [behavior] prefix counts as programmatic", isProgrammatic(`${BEHAVIOR_PREFIX}x`) && !isProgrammatic("x"));
const ws = path.join(tmp, "ws");
const mk = (cfg, expectations) => { const d = path.join(ws, "eval-toast-archive-undo", cfg, "run-1"); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "grading.json"), JSON.stringify({ expectations })); };
mk("with_skill", [{ text: "T", passed: true }, { text: `${BEHAVIOR_PREFIX}T`, passed: true }, { text: "No WCAG (non-best-practice) axe violations in the delivered file", passed: true }]);
mk("without_skill", [{ text: "T", passed: true }, { text: `${BEHAVIOR_PREFIX}T`, passed: false }, { text: "No WCAG (non-best-practice) axe violations in the delivered file", passed: true }]);
const sm = summarize(ws).summary;
check("a failing behavior result fails the run even when the LLM said it passed, in both strict views", sm.with_skill.strict_programmatic === 1 && sm.without_skill.strict_programmatic === 0 && sm.without_skill.strict_all === 0);

// ---- the mapping
const evalsJson = readJson(path.join(here, "evals.json")).evals;
for (const [evalName, file] of Object.entries(EVAL_TO_CHECK)) {
  const script = path.join(here, "behavior", file);
  if (!fs.existsSync(script)) continue;
  const spec = evalsJson.find((x) => x.name === evalName);
  const mod = await import(new URL(`file:///${script.replace(/\\/g, "/")}`).href);
  check(`${evalName}: the eval exists in evals.json`, !!spec);
  check(`${evalName}: every expectation text the check decides is an expectation in evals.json, word for word`, !!spec && mod.EXPECTATIONS.every((x) => spec.expectations.includes(x.text)));
  check(`${evalName}: no result id is in two expectations`, new Set(mod.EXPECTATIONS.flatMap((x) => x.ids)).size === mod.EXPECTATIONS.flatMap((x) => x.ids).length);
}

// ---- the command, on real pages (needs a browser)
if (!noBrowser) {
  const fx = path.join(here, "check_fixtures", "behavior-toast");
  const put = (cfg, src) => { const d = path.join(tmp, "ws2", "eval-toast-archive-undo", cfg, "run-1"); fs.mkdirSync(path.join(d, "outputs"), { recursive: true }); if (src) fs.copyFileSync(src, path.join(d, "outputs", "index.html")); return d; };
  const good = put("with_skill", path.join(fx, "negative", "status-region-inline-undo-focus-restored.html"));
  const bad = put("without_skill", path.join(fx, "positive", "undo-is-a-link.html"));
  const nohtml = put("nohtml", null);
  const other = path.join(tmp, "ws2", "eval-contact-form", "with_skill", "run-1");
  fs.mkdirSync(other, { recursive: true });
  const cli = spawnSync(process.execPath, [path.join(here, "grade_behavior.mjs"), path.join(tmp, "ws2")], { encoding: "utf8", env: process.env, timeout: 300000 });
  check("the command exits 0 and says how many runs it checked", cli.status === 0 && /Checked 2 runs/.test(cli.stdout));
  const gg = readJson(path.join(good, "grading.json")), gb = readJson(path.join(bad, "grading.json"));
  check("a correct page: every decided expectation passes, all prefixed", gg.expectations.length === 4 && gg.expectations.every((x) => x.passed && x.text.startsWith(BEHAVIOR_PREFIX)));
  check("a page whose Undo is a link: only the Undo expectation fails, and it names the id", gb.expectations.filter((x) => !x.passed).length === 1 && /undo-not-native-button/.test(gb.expectations.find((x) => !x.passed).evidence));
  check("a run with no html gets a failing expectation, not a skip", readJson(path.join(nohtml, "grading.json")).expectations[0].text === CHECK_FAILED_TEXT && !readJson(path.join(nohtml, "grading.json")).expectations[0].passed);
  check("an eval with no behavior check is left alone", !fs.existsSync(path.join(other, "grading.json")));
  const again = spawnSync(process.execPath, [path.join(here, "grade_behavior.mjs"), path.join(tmp, "ws2")], { encoding: "utf8", env: process.env, timeout: 300000 });
  check("running it twice gives the same grading (no duplicate entries)", again.status === 0 && readJson(path.join(good, "grading.json")).expectations.length === 4);
  const broken = runBehaviorCheck(path.join(here, "behavior", "toast.mjs"), path.join(fx, "termination", "page-breaks-querySelectorAll-so-the-check-itself-errors.html"));
  check("a check that errors on a page (exit 1) is an error result, never a pass", !broken.ok && /failed \(exit 1\)/.test(broken.error));
  const blocked = runBehaviorCheck(path.join(here, "behavior", "toast.mjs"), path.join(fx, "termination", "script-blocks-the-page-at-load.html"));
  check("a page that never finishes loading gives a result with stopReason load-timeout and nothing decided", blocked.ok && blocked.data.stopReason === "load-timeout" && toExpectations(blocked.data).length === 0);
  check("no directory is a usage error", spawnSync(process.execPath, [path.join(here, "grade_behavior.mjs")], { encoding: "utf8" }).status === 2 && spawnSync(process.execPath, [path.join(here, "grade_behavior.mjs"), path.join(tmp, "nope")], { encoding: "utf8" }).status === 2);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
