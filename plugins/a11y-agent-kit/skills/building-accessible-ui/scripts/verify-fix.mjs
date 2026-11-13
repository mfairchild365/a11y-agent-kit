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
//   --record <folder> --id <name>   also keep a text record of this run (plan, both reports, verify.json, the PR summary) in
//                           <folder>/<name>/run-NNN. Opt-in: the project, or you, say where records go. Never overwrites a run.
//                           A run that verified nothing (invalid-targets, unparseable) is not recorded. Report HTML and screenshots are not kept.
//   --signed-in             the audits were of a signed-in page (snapshots made with --storage-state say so themselves): the record gets a
//                           .gitignore so account data is not committed by accident
//   --strict                exit 1 unless the verdict is fixed
//   --input <file.json>     everything in one JSON file (used by the tests)
// Exit: 0 (or 1 with --strict and a verdict other than fixed), 2 on a usage error or when a requested record can't be written.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parsePlan, renderPr, verify } from "./_verify.mjs";
import { buildRecord, validId, writeRecord } from "./_record.mjs";

const argv = process.argv.slice(2);
const flagsWithValue = ["--plan", "--target", "--rename", "--guards", "--changed-files", "--root", "--before-snapshot", "--after-snapshot", "--format", "--input", "--record", "--id"];
const all = (name) => argv.flatMap((a, i) => (a === name ? [argv[i + 1]] : []));
const one = (name) => all(name)[0];
const positional = argv.filter((a, i) => !a.startsWith("--") && !flagsWithValue.includes(argv[i - 1]));
const usage = (msg) => {
  if (msg) console.error(msg);
  console.error('Usage: node verify-fix.mjs <before report.md> <after report.md> --plan <plan.md> | --target "<SC>|<element>"... [--rename old=new] [--guards f.json --changed-files f.txt] [--before-snapshot f --after-snapshot f] [--format text|json|pr] [--strict] [--record <folder> --id <name> [--signed-in]]');
  process.exit(2);
};
const read = (p) => { try { return fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"); } catch (e) { return usage(`Cannot read ${p}: ${e.code || e.message}`); } };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch (e) { return usage(`${p} is not valid JSON: ${e.message}`); } };
const format = one("--format") || "text";
if (!["text", "json", "pr"].includes(format)) usage(`--format must be text, json or pr, not "${format}"`);

// --record <folder> --id <name>: keep a text record of this run (see _record.mjs). Both are checked before anything is verified.
const recordFolder = argv.includes("--record") ? one("--record") : null;
const recordId = argv.includes("--id") ? one("--id") : null;
if (argv.includes("--record") && (!recordFolder || recordFolder.startsWith("--"))) usage("--record needs the folder the records are kept in");
if (argv.includes("--id") && (!recordId || recordId.startsWith("--"))) usage("--id needs a name for this fix (a ticket id or a short name)");
if (recordFolder && !recordId) usage("--record needs --id <ticket id or a short name for this fix>");
if (recordId && !recordFolder) usage("--id needs --record <folder>");
if (recordFolder && !validId(recordId)) usage(`--id "${recordId}" can't be used as a folder name (letters, digits, dot, dash and underscore; start with a letter or digit; at most 64 characters)`);
let planText = null;

let input;
if (one("--input")) {
  const f = readJson(one("--input"));
  const present = new Set(f.existing || []);
  input = { beforeText: f.before, afterText: f.after, targets: f.targets, renames: f.renames || [], beforeSnapshot: f.beforeSnapshot || null, afterSnapshot: f.afterSnapshot || null, guards: f.guards || null, changedFiles: f.changedFiles || [], exists: (p) => present.has(p) };
} else {
  if (positional.length !== 2) usage();
  let targets = all("--target"), renames = all("--rename"), guards = one("--guards") ? readJson(one("--guards")) : null;
  if (one("--plan")) {
    planText = read(one("--plan"));
    const plan = parsePlan(planText);
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
// The record, after the verdict is printed. A run that verified nothing (bad targets, unreadable reports) is not recorded.
if (recordFolder) {
  if (result.verdict === "invalid-targets" || result.verdict === "unparseable") {
    console.error(`Not recorded: nothing was verified (${result.verdict}).`);
  } else {
    // Signed in if told so, or if either snapshot says its scripts ran with a storage state (a boolean: the file itself is never read here).
    const signedIn = argv.includes("--signed-in") || [input.beforeSnapshot, input.afterSnapshot].some((s) => s && s.signedIn === true);
    const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: path.resolve(one("--root") || "."), encoding: "utf8" });
    const gitCommit = git.status === 0 ? git.stdout.trim() || null : null;
    const generatedAt = new Date().toISOString();
    try {
      // the run number is only known once its folder exists, so the files are built for the number the writer picks
      const written = writeRecord(recordFolder, recordId, (run) => buildRecord({ id: recordId, run, result, beforeText: input.beforeText, afterText: input.afterText, planText, summary: renderPr(result), signedIn, generatedAt, gitCommit }));
      console.error(`Record written to ${written.dir}`);
      if (signedIn) console.error("This record is from a signed-in page and may show account data. Its folder has a .gitignore so it is not committed by accident: review the reports before you remove it.");
    } catch (e) {
      console.error(`Could not write the record: ${e.message}`);
      process.exit(2);
    }
  }
}
process.exit(argv.includes("--strict") && result.verdict !== "fixed" ? 1 : 0);
