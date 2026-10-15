#!/usr/bin/env node
// Finds out what accessibility test setup a project already has, so a fix plan can say where a new test goes
// ("extend src/a11y.test.tsx", "add a test with the vitest runner and vitest-axe") instead of guessing. Reads
// package.json files and test files under the folder you give it; touches nothing, runs nothing, needs no
// browser. The rules are in _detect.mjs.
//
// It reports: the accessibility tooling it finds (jest-axe, vitest-axe, @axe-core/playwright, cypress-axe,
// pa11y, Lighthouse CI, the Storybook a11y addon, axe-core alone), the test runners, the test files that use axe
// or pa11y, the root test scripts, and a setup class:
//   existing-a11y-tests   a test-time tool is installed, or a test file already calls axe or pa11y
//   dev-time-only         only a development aid or the bare engine is installed
//   test-framework-only   tests exist, but no accessibility tooling
//   none                  no test setup found
// It sees only the repository. A project can test accessibility in ways it can't see (a service, a CI job
// elsewhere), so the output is evidence for a plan, not a verdict.
//
// Usage: node detect-a11y-tests.mjs <project folder> [--json] [--max-files 20000] [--max-ms 10000]
//        node detect-a11y-tests.mjs --tree <file.json>     (a virtual project: { "files": { "<path>": "<content>" } }, for tests)
//   stopReason: complete, read-cap (more than 200 test files, only the first 200 were read), file-cap or time-cap.
//   Skips node_modules, build output and other generated folders, and never follows symlinks.
// Exit: 0, or 2 on a usage error.

import fs from "node:fs";
import path from "node:path";
import { detect, isIgnored, isRelevant } from "./_detect.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const treeFile = opt("--tree");
const dir = argv.find((a, i) => !a.startsWith("--") && !["--max-files", "--max-ms", "--tree"].includes(argv[i - 1]));
const maxFiles = Number(opt("--max-files", 20000));
const maxMs = Number(opt("--max-ms", 10000));
const usage = (msg) => {
  if (msg) console.error(msg);
  console.error("Usage: node detect-a11y-tests.mjs <project folder> [--json] [--max-files 20000] [--max-ms 10000]");
  process.exit(2);
};
if (!treeFile && !dir) usage();
if (!(maxFiles > 0) || !(maxMs > 0)) usage("--max-files and --max-ms must be positive numbers");

let files = [], read, walkStop = "complete";
if (treeFile) {
  let tree;
  try { tree = JSON.parse(fs.readFileSync(treeFile, "utf8")); } catch (e) { usage(`Cannot read ${treeFile}: ${e.code || e.message}`); }
  if (!tree || typeof tree.files !== "object" || Array.isArray(tree.files)) usage(`${treeFile} needs a "files" object`);
  files = Object.keys(tree.files).filter((f) => isRelevant(f.replace(/\\/g, "/")));
  read = (p) => (typeof tree.files[p] === "string" ? tree.files[p] : typeof tree.files[p.replace(/\//g, "\\")] === "string" ? tree.files[p.replace(/\//g, "\\")] : null);
} else {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) usage(`${dir} is not a folder`);
  const started = Date.now();
  let scanned = 0;
  const walk = (rel, depth) => {
    if (walkStop !== "complete" || depth > 10) return;
    let entries;
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (walkStop !== "complete") return;
      if (e.isSymbolicLink()) continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!isIgnored(p)) walk(p, depth + 1); continue; }
      if (!e.isFile()) continue;
      if (++scanned > maxFiles) { walkStop = "file-cap"; return; }
      if (Date.now() - started > maxMs) { walkStop = "time-cap"; return; }
      if (isRelevant(p)) files.push(p);
    }
  };
  walk("", 0);
  read = (p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return null; } };
}

const result = detect({ files, read });
if (walkStop !== "complete") result.stopReason = walkStop;
if (argv.includes("--json")) console.log(JSON.stringify(result));
else {
  console.log(`setup: ${result.setup}${result.suggestion ? `   (${result.suggestion})` : ""}`);
  for (const x of result.frameworks) console.log(`  a11y tooling  ${x.name} [${x.kind}]  in ${x.evidence}`);
  for (const x of result.runners) console.log(`  runner        ${x.name}  in ${x.evidence}`);
  for (const f of result.a11yTestFiles) console.log(`  a11y test     ${f}`);
  for (const s of result.testScripts) console.log(`  script        ${s.name}: ${s.command}`);
  for (const e of result.errors) console.log(`  note          ${e}`);
  console.log(`\n${result.testFileCount} test file(s), ${result.packages.length} package.json file(s). stopReason: ${result.stopReason}.`);
}
