#!/usr/bin/env node
// Checks a fix against its plan. Give it the audit report from before the fix, the audit report from after it,
// and the plan (which names the issues the fix is meant to resolve). It says whether the fix is fixed, partial,
// unchanged or regressed, which new or worse issues are regression candidates, and whether each Guard became a
// test. Text only: no browser, no network. See _verify.mjs for the rules.
//
//   fixed        every target is resolved and nothing new appeared
//   partial      some targets are resolved
//   unchanged    no target is resolved
//   regressed    a new issue appeared, or a still-open one got worse (a candidate: confirm it)
//
// Usage: node verify-fix.mjs <before report.md> <after report.md> --plan <plan.md>  [options]
//   or:  node verify-fix.mjs <before report.md> <after report.md> --target "<SC>|<element>" [--target ...]  [options]
//   --plan <plan.md>        the plan's a11y-plan block supplies targets, renames and Guards
//   --target "<SC>|<element>"   an issue the fix must resolve (repeatable; a best practice is
//                           "best practice|<element>|<description>")
//   --rename "old=new"      an element or selector the fix renames (repeatable)
//   --guards <guards.json>  the Guards, when not in the plan: [{ target, kind, test, waiver }]
//   --changed-files <file>  the files in this change, one per line (git diff --name-only); needed for coverage
//   --root <dir>            where test paths are resolved (default: the current folder)
//   --before-snapshot <f> --after-snapshot <f>   two snapshot.mjs files, to compare the scripts' findings too
//   --format text|json|pr   how to print the result (default text; pr is a pull request summary)
//   --strict                exit 1 unless the verdict is fixed
//   --input <file.json>     everything in one JSON file (used by the tests)
// Exit: 0 (or 1 with --strict and a verdict other than fixed), 2 on a usage error.

import fs from "node:fs";
import path from "node:path";
import { parsePlan, renderPr, verify } from "./_verify.mjs";

const argv = process.argv.slice(2);
const flagsWithValue = ["--plan", "--target", "--rename", "--guards", "--changed-files", "--root", "--before-snapshot", "--after-snapshot", "--format", "--input"];
const all = (name) => argv.flatMap((a, i) => (a === name ? [argv[i + 1]] : []));
const one = (name) => all(name)[0];
const positional = argv.filter((a, i) => !a.startsWith("--") && !flagsWithValue.includes(argv[i - 1]));
const usage = (msg) => {
  if (msg) console.error(msg);
  console.error('Usage: node verify-fix.mjs <before report.md> <after report.md> --plan <plan.md> | --target "<SC>|<element>"... [--rename old=new] [--guards f.json --changed-files f.txt] [--before-snapshot f --after-snapshot f] [--format text|json|pr] [--strict]');
  process.exit(2);
};
const read = (p) => { try { return fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"); } catch (e) { return usage(`Cannot read ${p}: ${e.code || e.message}`); } };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch (e) { return usage(`${p} is not valid JSON: ${e.message}`); } };
const format = one("--format") || "text";
if (!["text", "json", "pr"].includes(format)) usage(`--format must be text, json or pr, not "${format}"`);

let input;
if (one("--input")) {
  const f = readJson(one("--input"));
  const present = new Set(f.existing || []);
  input = { beforeText: f.before, afterText: f.after, targets: f.targets, renames: f.renames || [], beforeSnapshot: f.beforeSnapshot || null, afterSnapshot: f.afterSnapshot || null, guards: f.guards || null, changedFiles: f.changedFiles || [], exists: (p) => present.has(p) };
} else {
  if (positional.length !== 2) usage();
  let targets = all("--target"), renames = all("--rename"), guards = one("--guards") ? readJson(one("--guards")) : null;
  if (one("--plan")) {
    const plan = parsePlan(read(one("--plan")));
    if (plan.error) usage(plan.error);
    targets = [...plan.targets, ...targets];
    renames = [...plan.renames, ...renames];
    if (plan.guards && !guards) guards = plan.guards;
  }
  if (!targets.length) usage("Give the issues the fix must resolve: --plan <plan.md> or --target \"<SC>|<element>\".");
  const root = path.resolve(one("--root") || ".");
  input = {
    beforeText: read(positional[0]),
    afterText: read(positional[1]),
    targets,
    renames,
    beforeSnapshot: one("--before-snapshot") ? readJson(one("--before-snapshot")) : null,
    afterSnapshot: one("--after-snapshot") ? readJson(one("--after-snapshot")) : null,
    guards,
    changedFiles: one("--changed-files") ? read(one("--changed-files")).split("\n").map((l) => l.trim()).filter(Boolean) : [],
    exists: (p) => fs.existsSync(path.resolve(root, p)),
  };
}

const result = verify(input);
if (format === "json") console.log(JSON.stringify(result));
else if (format === "pr") console.log(renderPr(result));
else {
  console.log(`verdict: ${result.verdict}`);
  for (const t of result.targets) console.log(`  target ${t.status.padEnd(8)} ${t.key}`);
  for (const r of result.regressions) console.log(`  regression candidate (${r.source}) ${r.id}`);
  for (const w of result.worsened) console.log(`  worse ${w.key}: ${w.from} -> ${w.to}`);
  if (result.alsoResolved.length) console.log(`  also resolved: ${result.alsoResolved.length}`);
  if (result.snapshot) console.log(`  snapshot: ${result.snapshot.compared.length} compared, ${result.snapshot.resolved.length} resolved, ${result.snapshot.new.length} new, ${result.snapshot.notComparable.length} not comparable`);
  if (result.coverage) {
    const c = result.coverage.counts;
    console.log(`  tests: ${c.covered} covered, ${c.waived} waived, ${c.uncovered} uncovered, ${c.manual} manual`);
    for (const e of result.coverage.entries.filter((x) => x.status === "uncovered")) console.log(`    UNCOVERED ${e.target} (${e.note})`);
    for (const p of result.coverage.problems.filter((x) => x.startsWith("no-guard@"))) console.log(`    NO GUARD ${p.slice(9)}`);
  }
  for (const n of result.notes) console.log(`  note: ${n}`);
}
process.exit(argv.includes("--strict") && result.verdict !== "fixed" ? 1 : 0);
