#!/usr/bin/env node
// Tests the command line of skills/building-accessible-ui/scripts/verify-fix.mjs with real files: --plan, --target,
// --rename, --guards, --changed-files, --root, snapshots, --format and --strict, and the usage errors. The
// verdict logic is tested in test_verify.mjs and the fixtures. No browser needed.
// Usage: node evals/test_verify_cli.mjs   (exits 1 if the command line behaves differently than expected)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "skills", "building-accessible-ui", "scripts", "verify-fix.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-cli-"));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const put = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", cwd: tmp });

function report(cards) {
  const L = ["# Accessibility audit: Fixture", "", "## Findings", ""];
  let n = 0;
  for (const [el, sev, sc] of cards) L.push(`### Element: ${el}`, "", `#### ${++n}. ${sev} · ${sc} · 1 instance · High confidence · A problem`, "");
  L.push("## Minor issues", "", "## Best practices", "", "## Needs verification", "", "## Out of scope", "");
  return L.join("\n");
}
const before = put("before.md", report([["Close button", "Critical", "4.1.2"], ["Badge", "Critical", "1.4.3"]]));
const afterFixed = put("after-fixed.md", report([["Badge", "Critical", "1.4.3"]]));
const afterRegressed = put("after-regressed.md", report([["Badge", "Critical", "1.4.3"], ["Notices", "Moderate", "1.4.1"]]));
const afterUnchanged = put("after-unchanged.md", report([["Close button", "Critical", "4.1.2"], ["Badge", "Critical", "1.4.3"]]));
const plan = put("plan.md", ["# Plan", "", "```a11y-plan", JSON.stringify({ targets: ["4.1.2|Close button"], guards: [{ target: "4.1.2|Close button", kind: "automatable", test: "tests/a.test.mjs::close has a name", waiver: null }] }), "```", ""].join("\n"));
put("tests/a.test.mjs", "// test");
const changed = put("changed.txt", "src/App.tsx\ntests/a.test.mjs\n\n");

const j = (r) => JSON.parse(r.stdout);
let r = run(before, afterFixed, "--target", "4.1.2|Close button");
check("--target: a resolved target is fixed, printed as text, exit 0", r.status === 0 && /^verdict: fixed/.test(r.stdout) && /target resolved\s+4\.1\.2\|close button/.test(r.stdout));
r = run(before, afterFixed, "--plan", plan, "--format", "json");
check("--plan: the targets come from the plan's block", r.status === 0 && j(r).verdict === "fixed" && j(r).targets[0].key === "4.1.2|close button");
check("--plan: the plan's guards are used, and a test file that exists and is in the change is covered", (() => { const out = run(before, afterFixed, "--plan", plan, "--changed-files", changed, "--root", tmp, "--format", "json"); return j(out).coverage.entries[0].status === "covered"; })());
check("--plan: without --changed-files the test is not in the change, so it is uncovered", (() => { const out = run(before, afterFixed, "--plan", plan, "--root", tmp, "--format", "json"); return j(out).coverage.entries[0].status === "uncovered" && j(out).coverage.entries[0].note === "test-not-in-this-change"; })());
check("--root: test paths are looked up under it, so a wrong root means the file is missing", (() => { const out = run(before, afterFixed, "--plan", plan, "--changed-files", changed, "--root", path.join(tmp, "elsewhere"), "--format", "json"); return j(out).coverage.entries[0].note === "test-file-missing"; })());
check("--guards overrides the plan's guards", (() => { const g = put("guards.json", JSON.stringify([{ target: "4.1.2|Close button", kind: "manual" }])); return j(run(before, afterFixed, "--plan", plan, "--guards", g, "--format", "json")).coverage.entries[0].status === "manual"; })());
check("targets from --plan and --target are combined", j(run(before, afterFixed, "--plan", plan, "--target", "1.4.3|Badge", "--format", "json")).targets.length === 2);
check("--rename is applied", (() => { const a = put("after-renamed.md", report([["Close control", "Critical", "4.1.2"], ["Badge", "Critical", "1.4.3"]])); const out = j(run(before, a, "--target", "4.1.2|Close button", "--rename", "Close button=Close control", "--format", "json")); return out.verdict === "unchanged" && out.regressions.length === 0; })());
check("a new issue is regressed, and --strict turns anything but fixed into exit 1", run(before, afterRegressed, "--target", "4.1.2|Close button").stdout.startsWith("verdict: regressed") && run(before, afterRegressed, "--target", "4.1.2|Close button", "--strict").status === 1 && run(before, afterFixed, "--target", "4.1.2|Close button", "--strict").status === 0 && run(before, afterUnchanged, "--target", "4.1.2|Close button", "--strict").status === 1);
check("without --strict the exit code is 0 whatever the verdict", run(before, afterRegressed, "--target", "4.1.2|Close button").status === 0);
check("--format pr prints the pull request summary", /^## Accessibility fix: verification/.test(run(before, afterFixed, "--plan", plan, "--format", "pr").stdout));
check("--format json prints one JSON object with findings and a stop reason", (() => { const o = j(run(before, afterRegressed, "--target", "4.1.2|Close button", "--format", "json")); return Array.isArray(o.findings) && o.stopReason === "complete" && o.findings.includes("regression@1.4.1|notices"); })());
check("snapshots are compared when both are given", (() => {
  const b = put("snap-b.json", JSON.stringify({ scripts: { "tree-pass": { stopReason: "complete", findings: [] } } }));
  const a = put("snap-a.json", JSON.stringify({ scripts: { "tree-pass": { stopReason: "complete", findings: ["x@#new"] } } }));
  const o = j(run(before, afterFixed, "--target", "4.1.2|Close button", "--before-snapshot", b, "--after-snapshot", a, "--format", "json"));
  return o.verdict === "regressed" && o.regressions[0].id === "tree-pass:x@#new";
})());
check("--input reads everything from one JSON file", (() => { const f = put("input.json", JSON.stringify({ before: report([["Close button", "Critical", "4.1.2"]]), after: report([]), targets: ["4.1.2|Close button"] })); return j(run("--input", f, "--format", "json")).verdict === "fixed"; })());

// ---- usage errors exit 2, with a message
const bad = (args, pattern) => { const out = run(...args); return out.status === 2 && pattern.test(out.stderr); };
check("no arguments is a usage error", bad([], /Usage:/));
check("one report is a usage error", bad([before], /Usage:/));
check("no targets and no plan is a usage error that says what to give", bad([before, afterFixed], /issues the fix must resolve/));
check("a report that can't be read is a usage error that names it", bad([path.join(tmp, "missing.md"), afterFixed, "--target", "x|y"], /Cannot read .*missing\.md/));
check("a plan with no block is a usage error that says so", bad([before, afterFixed, "--plan", put("empty-plan.md", "# Plan\n")], /no a11y-plan block/));
check("a guards file that is not JSON is a usage error", bad([before, afterFixed, "--target", "4.1.2|Close button", "--guards", put("bad.json", "{")], /not valid JSON/));
check("a snapshot that is not JSON is a usage error", bad([before, afterFixed, "--target", "4.1.2|Close button", "--before-snapshot", put("bad-snap.json", "nope"), "--after-snapshot", put("bad-snap2.json", "nope")], /not valid JSON/));
check("an unknown --format is a usage error", bad([before, afterFixed, "--target", "4.1.2|Close button", "--format", "xml"], /--format must be/));
check("a malformed --target gives a verdict of invalid-targets, not a crash", (() => { const out = run(before, afterFixed, "--target", "just words", "--format", "json"); return out.status === 0 && j(out).verdict === "invalid-targets"; })());

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
