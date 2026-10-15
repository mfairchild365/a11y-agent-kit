#!/usr/bin/env node
// Tests evals/check_fix_verify.mjs: the after-report it builds, and the verdict and coverage it grades. No browser,
// no model: which defects the page now passes is given to it.
// Usage: node evals/test_check_fix_verify.mjs   (exits 1 if the grader misjudges any case)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterReport, gradeVerify } from "./check_fix_verify.mjs";
import { PLAN_FILE } from "./check_plan_run.mjs";
import { parseReport } from "../skills/building-accessible-ui/scripts/_report.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, "guard_fixture", "project");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fix-verify-test-"));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const report = fs.readFileSync(path.join(BASELINE, "report.md"), "utf8");
const keysOf = (text) => [...parseReport(text).issues.keys()].sort();

// ---- the after report
check("fixing neither defect leaves all three issues", keysOf(afterReport(report, [])).length === 3);
check("fixing the button removes only its card", JSON.stringify(keysOf(afterReport(report, ["button"]))) === JSON.stringify(["1.4.1|notices", "1.4.3|new badge"]));
check("fixing the contrast removes only its card", JSON.stringify(keysOf(afterReport(report, ["contrast"]))) === JSON.stringify(["1.4.1|notices", "4.1.2|close button"]));
check("fixing both leaves the manual issue, and the report is still recognised", (() => { const a = afterReport(report, ["button", "contrast"]); return JSON.stringify(keysOf(a)) === JSON.stringify(["1.4.1|notices"]) && parseReport(a).recognised; })());
check("an unknown name removes nothing", keysOf(afterReport(report, ["nope"])).length === 3);
check("a removed card does not take the next heading with it", /### Element: Notices/.test(afterReport(report, ["contrast"])));
check("the report with CRLF line endings is read the same way", keysOf(afterReport(report.replace(/\n/g, "\r\n"), ["button"])).length === 2);

// ---- grading, with agent projects built from the baseline
let n = 0;
const agent = ({ tests = {}, extra = {} } = {}) => {
  const dir = path.join(tmp, `a${++n}`);
  fs.cpSync(BASELINE, dir, { recursive: true });
  fs.rmSync(path.join(dir, "AGENTS.optout.md"));
  fs.copyFileSync(path.join(here, "guard_fixture", "plans", "approved-normal.md"), path.join(dir, PLAN_FILE));
  for (const [rel, text] of Object.entries({ ...Object.fromEntries(Object.entries(tests).map(([k, v]) => [`tests/${k}`, v])), ...extra })) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
  return dir;
};
const failedNames = (r) => r.results.filter((x) => !x.ok).map((x) => x.name);
const onlyFails = (r, ...starts) => { const f = failedNames(r); return f.length === starts.length && starts.every((s) => f.some((x) => x.startsWith(s))); };
const TEST = 'import test from "node:test";\ntest("x", () => {});\n';

check("a correct run (both fixed, the planned test file written) passes every check", failedNames(gradeVerify({ agentDir: agent({ tests: { "guards.test.mjs": TEST } }), variant: "normal", fixed: ["button", "contrast"] })).length === 0);
check("the plan file the agent was given is not counted as a change", (() => { const r = gradeVerify({ agentDir: agent({ tests: { "guards.test.mjs": TEST } }), variant: "normal", fixed: ["button", "contrast"] }); return r.verify.coverage.counts.covered === 2; })());
check("only one defect fixed: the verdict is not fixed", failedNames(gradeVerify({ agentDir: agent({ tests: { "guards.test.mjs": TEST } }), variant: "normal", fixed: ["button"] })).some((x) => x.startsWith("verify-fix says")));
check("nothing fixed: the verdict is not fixed", failedNames(gradeVerify({ agentDir: agent({ tests: { "guards.test.mjs": TEST } }), variant: "normal", fixed: [] })).some((x) => x.startsWith("verify-fix says")));
check("fixed, but the planned test file was never written: coverage fails, the verdict does not", onlyFails(gradeVerify({ agentDir: agent(), variant: "normal", fixed: ["button", "contrast"] }), "Both Guards are covered"));
check("fixed, with the tests in another file than the plan named: coverage fails", onlyFails(gradeVerify({ agentDir: agent({ tests: { "other.test.mjs": TEST } }), variant: "normal", fixed: ["button", "contrast"] }), "Both Guards are covered"));
check("a new issue in the after report fails the regression check and the verdict", (() => {
  const extra = ["", "### Element: Menu", "", "#### 4. Moderate · 2.4.7 · 1 instances · High confidence · Focus ring is missing", "", "- **Summary:** x", ""].join("\n");
  const f = failedNames(gradeVerify({ agentDir: agent({ tests: { "guards.test.mjs": TEST } }), variant: "normal", fixed: ["button", "contrast"], afterExtra: extra }));
  return f.some((x) => x.startsWith("verify-fix found no regression")) && f.some((x) => x.startsWith("verify-fix says"));
})());

const normalPlan = fs.readFileSync(path.join(here, "guard_fixture", "plans", "approved-normal.md"), "utf8");
const fixedBoth = { variant: "normal", fixed: ["button", "contrast"] };
check("a planned test file that was deleted does not count as covered", (() => { const dir = agent(); fs.rmSync(path.join(dir, "tests", "existing.test.mjs")); const plan = normalPlan.split("tests/guards.test.mjs").join("tests/existing.test.mjs"); return failedNames(gradeVerify({ agentDir: dir, ...fixedBoth, planText: plan })).some((x) => x.startsWith("Both Guards are covered")); })());
check("only one of the two planned test files written: coverage fails", (() => { const plan = normalPlan.replace("tests/guards.test.mjs::badge", "tests/second.test.mjs::badge"); return onlyFails(gradeVerify({ agentDir: agent({ tests: { "guards.test.mjs": TEST } }), ...fixedBoth, planText: plan }), "Both Guards are covered"); })());
check("opt-out: a plan whose Guards name tests, with the tests written, fails the waiver check", failedNames(gradeVerify({ agentDir: agent({ tests: { "guards.test.mjs": TEST } }), variant: "optout", fixed: ["button", "contrast"], planText: normalPlan })).some((x) => x.startsWith("Both Guards are waived")));
check("a rename declared in the plan is applied: the renamed issue is still the open target", (() => { const plan = normalPlan.replace('"renames": []', '"renames": ["Close button=Dismiss"]'); const extra = ["", "### Element: Dismiss", "", "#### 4. Critical · 4.1.2 · 1 instances · High confidence · Icon-only button has no accessible name", "", "- **Summary:** x", ""].join("\n"); return gradeVerify({ agentDir: agent({ tests: { "guards.test.mjs": TEST } }), ...fixedBoth, planText: plan, afterExtra: extra }).verify.verdict === "partial"; })());

const optoutAgent = ({ tests = {} } = {}) => { const dir = agent({ tests }); fs.copyFileSync(path.join(here, "guard_fixture", "plans", "approved-optout.md"), path.join(dir, PLAN_FILE)); return dir; };
check("a correct opt-out run (both fixed, no test) passes every check", failedNames(gradeVerify({ agentDir: optoutAgent(), variant: "optout", fixed: ["button", "contrast"] })).length === 0);
check("opt-out: a test file added fails the no-test check only", onlyFails(gradeVerify({ agentDir: optoutAgent({ tests: { "guards.test.mjs": TEST } }), variant: "optout", fixed: ["button", "contrast"] }), "No test file was added"));
check("opt-out: the page left unfixed fails the verdict", failedNames(gradeVerify({ agentDir: optoutAgent(), variant: "optout", fixed: [] })).some((x) => x.startsWith("verify-fix says")));
check("a plan that targets an issue the report does not have fails the verdict", failedNames(gradeVerify({ agentDir: agent({ tests: { "guards.test.mjs": TEST } }), variant: "normal", fixed: ["button", "contrast"], planText: fs.readFileSync(path.join(here, "guard_fixture", "plans", "approved-normal.md"), "utf8").replace('"4.1.2|Close button", "1.4.3', '"2.4.7|Search box", "1.4.3') })).some((x) => x.startsWith("verify-fix says")));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
