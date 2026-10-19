#!/usr/bin/env node
// Tests skills/building-accessible-ui/scripts/_verify.mjs, the pure logic behind verify-fix.mjs: targets,
// renames, the verdict, snapshot comparison and the coverage of the Guards. No browser needed.
// Usage: node evals/test_verify.mjs   (exits 1 if any case behaves differently than expected)

import { accountGuards, diffSnapshots, parsePlan, parseRename, parseTarget, renderPr, verify } from "../skills/building-accessible-ui/scripts/_verify.mjs";

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

// ---- a report builder
function report({ cards = [], minor = [], bp = [], nv = [] } = {}) {
  let n = 0;
  const L = ["# Accessibility audit: Fixture", "", "## Summary", "", "- **Scope:** fixture", "", "## Findings", ""];
  const byEl = new Map();
  for (const c of cards) byEl.set(c.el, [...(byEl.get(c.el) || []), c]);
  for (const [el, list] of byEl) {
    L.push(`### Element: ${el}`, "");
    for (const c of list) L.push(`#### ${++n}. ${c.sev} · ${c.sc} · 1 instance · High confidence · ${c.title || "A problem"}`, "", "- **Summary:** s", "");
  }
  L.push("## Minor issues", "", "| # | Element | WCAG SC | Title | Suggested fix | Confidence |", "|---|---|---|---|---|---|");
  for (const [el, sc, title] of minor) L.push(`| ${++n} | ${el} | ${sc} | ${title} | fix | High |`);
  L.push("", "## Best practices", "", "| # | Element | What | Suggested fix | Confidence |", "|---|---|---|---|---|");
  for (const [el, what] of bp) L.push(`| ${++n} | ${el} | ${what} | fix | High |`);
  L.push("", "## Needs verification", "", "| # | Element | WCAG SC | Suspected severity | Why suspected | Check that would confirm it |", "|---|---|---|---|---|---|");
  for (const [el, sc, sev] of nv) L.push(`| ${++n} | ${el} | ${sc} | ${sev} | why | check |`);
  L.push("", "## Out of scope", "", "Nothing.", "");
  return L.join("\n");
}
const card = (el, sev, sc) => ({ el, sev, sc });
const A = card("Close button", "Critical", "4.1.2");
const B = card("Badge", "Critical", "1.4.3");
const C = card("Notices", "Moderate", "1.4.1");
const T_A = "4.1.2|Close button", T_B = "1.4.3|Badge", T_C = "1.4.1|Notices";
const v = (o) => verify({ targets: [T_A], ...o });
const verdict = (o) => v(o).verdict;
const has = (r, id) => r.findings.includes(id);

// ---- targets and renames
check("a target is <SC>|<element>, and the element is normalised like a report's", parseTarget("4.1.2|Close  Button").key === "4.1.2|close button" && parseTarget("4.1.2|`Close` button").key === "4.1.2|close button");
check("a best practice target has three parts", parseTarget("best practice|Icon|Missing block").key === "best practice|icon|missing block");
check("malformed targets are rejected", ["", "4.1.2", "|x", "4.1.2|", "a|b|c|d", "x|y|z"].every((t) => parseTarget(t).key === null));
check("a rename is old=new", (() => { const r = parseRename("Save button=Submit button"); return r.from === "Save button" && r.to === "Submit button"; })() && parseRename("nope").error && parseRename("=x").error && parseRename("x=").error);
check("a rename may contain an equals sign in the new name", parseRename("a=b=c").to === "b=c");

// ---- the verdict, in order
check("every target resolved and nothing new is fixed", verdict({ beforeText: report({ cards: [A, B] }), afterText: report({ cards: [B] }) }) === "fixed");
check("some targets resolved is partial", verdict({ targets: [T_A, T_B], beforeText: report({ cards: [A, B] }), afterText: report({ cards: [B] }) }) === "partial");
check("no target resolved is unchanged", verdict({ beforeText: report({ cards: [A, B] }), afterText: report({ cards: [A, B] }) }) === "unchanged");
check("a new issue makes it regressed, even when every target is resolved", (() => { const r = v({ beforeText: report({ cards: [A] }), afterText: report({ cards: [C] }) }); return r.verdict === "regressed" && has(r, "regression@1.4.1|notices") && r.regressions[0].source === "report"; })());
check("a still-open issue that got worse makes it regressed", (() => { const r = v({ beforeText: report({ cards: [A, C] }), afterText: report({ cards: [{ ...C, sev: "Critical" }] }) }); return r.verdict === "regressed" && has(r, "worsened@1.4.1|notices") && r.worsened[0].from === "Moderate" && r.worsened[0].to === "Critical"; })());
check("an issue that got better is not a regression", verdict({ beforeText: report({ cards: [A, C] }), afterText: report({ cards: [{ ...C, sev: "Minor" }] }) }) === "fixed");
check("regressed wins over partial", verdict({ targets: [T_A, T_B], beforeText: report({ cards: [A, B] }), afterText: report({ cards: [B, C] }) }) === "regressed");
check("another issue that was resolved too is listed, not a problem", (() => { const r = v({ beforeText: report({ cards: [A, B] }), afterText: report({}) }); return r.verdict === "fixed" && r.alsoResolved.join() === "1.4.3|badge"; })());
check("open targets are findings, resolved ones are not", (() => { const r = v({ targets: [T_A, T_B], beforeText: report({ cards: [A, B] }), afterText: report({ cards: [B] }) }); return r.findings.join() === "target-open@1.4.3|badge" && r.targets.map((t) => t.status).join() === "resolved,open"; })());
check("a target that is not in the before report makes the verdict invalid-targets", (() => { const r = v({ targets: [T_A, "2.1.1|Nowhere"], beforeText: report({ cards: [A] }), afterText: report({}) }); return r.verdict === "invalid-targets" && has(r, "target-unknown@2.1.1|nowhere"); })());
check("no targets, or a malformed one, is invalid-targets with the reason", (() => { const a = verify({ targets: [], beforeText: report({ cards: [A] }), afterText: report({}) }); const b = verify({ targets: ["oops"], beforeText: report({ cards: [A] }), afterText: report({}) }); return a.verdict === "invalid-targets" && b.verdict === "invalid-targets" && /no targets/.test(a.notes.join()) && /written/.test(b.notes.join()); })());
check("a report with no issues and no heading is unparseable", verdict({ beforeText: "nothing", afterText: report({}) }) === "unparseable" && verdict({ beforeText: report({ cards: [A] }), afterText: "" }) === "unparseable");
check("a report with a heading and no issues is fine (everything resolved)", verdict({ beforeText: report({ cards: [A] }), afterText: report({}) }) === "fixed");
check("the same target named twice counts once", (() => { const r = v({ targets: [T_A, T_A], beforeText: report({ cards: [A] }), afterText: report({}) }); return r.targets.length === 1 && r.verdict === "fixed"; })());
check("a Minor row, a best practice and a Needs verification row can be targets", (() => {
  const before = report({ minor: [["Footer link", "2.4.4", "x"]], bp: [["Icon", "Missing block"]], nv: [["Status", "4.1.3", "Moderate"]] });
  return verify({ targets: ["2.4.4|Footer link", "best practice|Icon|Missing block", "4.1.3|Status"], beforeText: before, afterText: report({}) }).verdict === "fixed";
})());

// ---- renames: the pilot's weak point
check("without a rename, a renamed element looks like a resolved target plus a regression", (() => { const r = v({ beforeText: report({ cards: [card("Save button", "Critical", "4.1.2")] }), afterText: report({ cards: [card("Submit button", "Critical", "4.1.2")] }), targets: ["4.1.2|Save button"] }); return r.verdict === "regressed" && r.targets[0].status === "resolved"; })());
check("with the rename declared, the renamed issue is still open, not a regression", (() => { const r = v({ beforeText: report({ cards: [card("Save button", "Critical", "4.1.2")] }), afterText: report({ cards: [card("Submit button", "Critical", "4.1.2")] }), targets: ["4.1.2|Save button"], renames: ["Save button=Submit button"] }); return r.verdict === "unchanged" && r.targets[0].status === "open" && r.regressions.length === 0; })());
check("a rename does not hide an issue whose criterion changed: the new criterion is a new issue", verdict({ beforeText: report({ cards: [A] }), afterText: report({ cards: [card("Close control", "Critical", "4.1.1")] }), renames: ["Close button=Close control"] }) === "regressed");
check("a rename applies to every issue on that element", (() => { const r = verify({ targets: [T_A, "1.4.1|Close button"], beforeText: report({ cards: [A, card("Close button", "Moderate", "1.4.1")] }), afterText: report({ cards: [card("Close control", "Critical", "4.1.2"), card("Close control", "Moderate", "1.4.1")] }), renames: ["Close button=Close control"] }); return r.verdict === "unchanged" && r.regressions.length === 0; })());
check("a rename names a bad pair as invalid", verify({ targets: [T_A], beforeText: report({ cards: [A] }), afterText: report({}), renames: ["no equals"] }).verdict === "invalid-targets");
check("a rename is case and spacing insensitive on the new name", (() => { const r = v({ beforeText: report({ cards: [A] }), afterText: report({ cards: [card("CLOSE   control", "Critical", "4.1.2")] }), renames: ["Close button=close control"] }); return r.targets[0].status === "open" && r.regressions.length === 0; })());

// ---- snapshots
const snap = (scripts) => ({ version: 1, scripts });
const S = (stopReason, findings) => ({ stopReason, findings });
check("a finding gone from the after snapshot is resolved, a new one is a regression", (() => { const d = diffSnapshots(snap({ "tree-pass": S("complete", ["a@#x", "b@#y"]) }), snap({ "tree-pass": S("complete", ["b@#y", "c@#z"]) })); return d.resolved.join() === "tree-pass:a@#x" && d.new.join() === "tree-pass:c@#z" && d.compared.join() === "tree-pass"; })());
check("identical snapshots have no change", (() => { const d = diffSnapshots(snap({ a: S("complete", ["x@1"]) }), snap({ a: S("complete", ["x@1"]) })); return !d.resolved.length && !d.new.length; })());
check("a script that stopped differently is not compared", (() => { const d = diffSnapshots(snap({ a: S("complete", ["x@1"]) }), snap({ a: S("stop-cap", []) })); return d.notComparable[0].script === "a" && /complete -> stop-cap/.test(d.notComparable[0].reason) && !d.resolved.length && !d.new.length; })());
check("a script that failed, on either side, is not compared", ["error", "timeout"].every((reason) => diffSnapshots(snap({ a: S(reason, []) }), snap({ a: S("complete", ["x@1"]) })).notComparable.length === 1 && diffSnapshots(snap({ a: S("complete", []) }), snap({ a: S(reason, []) })).notComparable.length === 1));
check("a script in only one snapshot is not compared", (() => { const d = diffSnapshots(snap({ a: S("complete", []) }), snap({ b: S("complete", []) })); return d.notComparable.length === 2; })());
check("a script that stopped at a cap both times is compared, and flagged as incomplete", (() => { const d = diffSnapshots(snap({ a: S("stop-cap", ["x@1"]) }), snap({ a: S("stop-cap", []) })); return d.resolved.length === 1 && d.incomplete[0].script === "a"; })());
check("a modal's loop on both sides is complete enough", diffSnapshots(snap({ a: S("modal-cycle", []) }), snap({ a: S("modal-cycle", []) })).incomplete.length === 0);
check("a selector rename is applied to the after snapshot", (() => { const d = diffSnapshots(snap({ a: S("complete", ["x@#close"]) }), snap({ a: S("complete", ["x@#close-button"]) }), [parseRename("#close=#close-button")]); return !d.resolved.length && !d.new.length; })());
check("empty or missing snapshots do not crash", diffSnapshots(null, null).compared.length === 0 && diffSnapshots({}, { scripts: {} }).new.length === 0);
check("a new script finding makes the verdict regressed, and it is named by script", (() => { const r = v({ beforeText: report({ cards: [A] }), afterText: report({}), beforeSnapshot: snap({ "tree-pass": S("complete", []) }), afterSnapshot: snap({ "tree-pass": S("complete", ["interactive-no-name@#new"]) }) }); return r.verdict === "regressed" && has(r, "regression@tree-pass:interactive-no-name@#new") && r.regressions[0].source === "snapshot"; })());
check("a resolved script finding does not change the verdict", (() => { const r = v({ beforeText: report({ cards: [A] }), afterText: report({}), beforeSnapshot: snap({ a: S("complete", ["x@1"]) }), afterSnapshot: snap({ a: S("complete", []) }) }); return r.verdict === "fixed" && r.snapshot.resolved.length === 1; })());
check("with only one snapshot given, none is compared", v({ beforeText: report({ cards: [A] }), afterText: report({}), beforeSnapshot: snap({ a: S("complete", []) }) }).snapshot === null);

// ---- coverage of the Guards
const targets = [parseTarget(T_A), parseTarget(T_B), parseTarget(T_C)];
const files = new Set(["tests/a11y.test.mjs", "tests/old.test.mjs"]);
const exists = (p) => files.has(p);
const acct = (guards, changed = ["tests/a11y.test.mjs"]) => accountGuards({ guards, targets, changedFiles: changed, exists });
const g = (target, o) => ({ target, kind: "automatable", test: null, waiver: null, ...o });
check("an automatable Guard whose test file exists and is in the change is covered", acct([g(T_A, { test: "tests/a11y.test.mjs::close has a name" })]).entries[0].status === "covered");
check("a test path may be written with backslashes or a leading ./", acct([g(T_A, { test: ".\\tests\\a11y.test.mjs" })], ["tests\\a11y.test.mjs"]).entries[0].status === "covered");
check("a test file that is not part of the change is uncovered", (() => { const r = acct([g(T_A, { test: "tests/old.test.mjs" })]); return r.entries[0].status === "uncovered" && r.entries[0].note === "test-not-in-this-change" && r.problems.includes(`guard-uncovered@${targets[0].key}`); })());
check("a test file that does not exist is uncovered", (() => { const r = acct([g(T_A, { test: "tests/missing.test.mjs" })], ["tests/missing.test.mjs"]); return r.entries[0].note === "test-file-missing"; })());
check("an automatable Guard with no test and a reason is waived", (() => { const r = acct([g(T_A, { waiver: "the project opted out of tests" })]); return r.entries[0].status === "waived" && !r.problems.some((p) => p.startsWith("guard-uncovered")); })());
check("an automatable Guard with no test and no reason is uncovered", (() => { const r = acct([g(T_A)]); return r.entries[0].status === "uncovered" && r.entries[0].note === "no-test-and-no-reason"; })());
check("a vague reason does not count as a waiver", ["", "n/a", "N/A", "todo", "TBD", "none", "-", "ok"].every((w) => acct([g(T_A, { waiver: w })]).entries[0].status === "uncovered"));
check("a manual Guard needs no test", acct([{ target: T_C, kind: "manual", test: null, waiver: null }]).entries[0].status === "manual");
check("a Guard of an unknown kind is invalid", (() => { const r = acct([{ target: T_A, kind: "maybe" }]); return r.entries[0].status === "invalid" && r.problems.includes(`invalid-guard@${targets[0].key}`); })());
check("a target with no Guard at all is a problem", acct([g(T_A, { test: "tests/a11y.test.mjs" })]).problems.sort().join() === [`no-guard@${targets[1].key}`, `no-guard@${targets[2].key}`].sort().join());
check("a Guard for something that is not a target is a warning, not a problem", (() => { const r = acct([g("2.4.4|Elsewhere", { test: "tests/a11y.test.mjs" })]); return r.warnings.length === 1 && !r.problems.some((p) => p.startsWith("guard-uncovered")); })());
check("the counts add up", (() => { const r = acct([g(T_A, { test: "tests/a11y.test.mjs" }), g(T_B, { waiver: "no runner in this project" }), g(T_C)]); return JSON.stringify(r.counts) === JSON.stringify({ covered: 1, waived: 1, uncovered: 1, manual: 0 }); })());
check("coverage is reported beside the verdict and never changes it", (() => { const r = v({ beforeText: report({ cards: [A] }), afterText: report({}), guards: [g(T_A)], changedFiles: [], exists }); return r.verdict === "fixed" && r.coverage.counts.uncovered === 1 && has(r, `guard-uncovered@${targets[0].key}`); })());
check("with no guards given there is no coverage section", v({ beforeText: report({ cards: [A] }), afterText: report({}) }).coverage === null);

// ---- the plan's a11y-plan block
const plan = (body, info = "a11y-plan") => ["# Plan", "", "Some text.", "", "\x60\x60\x60" + info, body, "\x60\x60\x60", "", "More text."].join("\n");
check("a plan's a11y-plan block gives targets, renames and guards", (() => { const p = parsePlan(plan(JSON.stringify({ targets: [T_A], renames: ["a=b"], guards: [{ target: T_A, kind: "manual" }] }))); return !p.error && p.targets[0] === T_A && p.renames[0] === "a=b" && p.guards.length === 1; })());
check("renames and guards are optional in the block", (() => { const p = parsePlan(plan(JSON.stringify({ targets: [T_A] }))); return !p.error && p.renames.length === 0 && p.guards === null; })());
check("a plan with no block is an error that says so", /no a11y-plan block/.test(parsePlan("# Plan\n\ntext").error) && /no a11y-plan block/.test(parsePlan("").error) && /no a11y-plan block/.test(parsePlan(undefined).error));
check("a block with another info string is not the block", /no a11y-plan block/.test(parsePlan(plan("{}", "json")).error));
check("two blocks are an error", /more than one/.test(parsePlan(plan(JSON.stringify({ targets: [T_A] })) + "\n" + plan(JSON.stringify({ targets: [T_B] }))).error));
check("a block that is not JSON is an error that says so", /not valid JSON/.test(parsePlan(plan("{ targets: [")).error));
check("a block that is not an object is an error", /must be a JSON object/.test(parsePlan(plan("[1]")).error) && /must be a JSON object/.test(parsePlan(plan("null")).error) && /must be a JSON object/.test(parsePlan(plan('"x"')).error));
check("targets must be a list of strings", /targets must be a list of strings/.test(parsePlan(plan(JSON.stringify({ targets: "x" }))).error) && /targets must be a list of strings/.test(parsePlan(plan(JSON.stringify({ targets: [1] }))).error) && /targets must be a list of strings/.test(parsePlan(plan("{}")).error));
check("renames must be a list of strings, and guards a list of objects", /renames must be/.test(parsePlan(plan(JSON.stringify({ targets: [T_A], renames: "x" }))).error) && /guards must be/.test(parsePlan(plan(JSON.stringify({ targets: [T_A], guards: ["x"] }))).error));
check("CRLF line endings and trailing spaces after the fence are accepted", !parsePlan(plan(JSON.stringify({ targets: [T_A] })).replace(/\n/g, "\r\n").replace("a11y-plan", "a11y-plan  ")).error);
check("a block fenced with the right info string but inside other text is found", !parsePlan("intro\n\n- a list\n\n" + plan(JSON.stringify({ targets: [T_A] }))).error);

// ---- the pull request summary
check("the summary names the verdict, the targets, the regression candidates and the tests", (() => {
  const r = verify({ targets: [T_A, T_B], beforeText: report({ cards: [A, B] }), afterText: report({ cards: [B, C] }), guards: [g(T_A, { test: "tests/a11y.test.mjs" }), g(T_B)], changedFiles: ["tests/a11y.test.mjs"], exists });
  const text = renderPr(r);
  return /\*\*Verdict:\*\* regressed/.test(text) && /resolved: 4\.1\.2\|close button/.test(text) && /open: 1\.4\.3\|badge/.test(text) && /new \(report\): 1\.4\.1\|notices/.test(text) && /covered: 4\.1\.2\|close button \(tests\/a11y\.test\.mjs\)/.test(text) && /UNCOVERED: 1\.4\.3\|badge \(no-test-and-no-reason\)/.test(text);
})());
check("the summary shows waivers with their reason and manual checks", (() => { const text = renderPr(verify({ targets: [T_A, T_C], beforeText: report({ cards: [A, C] }), afterText: report({}), guards: [g(T_A, { waiver: "project opted out" }), { target: T_C, kind: "manual" }], exists })); return /waived: .*\(project opted out\)/.test(text) && /manual check: 1\.4\.1\|notices/.test(text); })());
check("the summary of a clean fix has no regression section", !/Regression candidates/.test(renderPr(v({ beforeText: report({ cards: [A] }), afterText: report({}) }))));

console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
