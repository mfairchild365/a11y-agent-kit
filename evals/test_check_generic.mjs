#!/usr/bin/env node
// Tests scripts/check_generic.mjs against throwaway directories. No browser needed.
// Usage: node evals/test_check_generic.mjs   (exits 1 if any case behaves differently than expected)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashTerm, loadTerms, normalize, scan } from "../scripts/check_generic.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-generic-"));
const termsFile = path.join(tmp, "terms.sha256");
// Made-up names only. The real list is hashes, so these tests never need a real brand.
fs.writeFileSync(termsFile, ["# test list", hashTerm("Examplecorp"), hashTerm("Widget Pro Suite") + "  # trailing comment", ""].join("\n"));
const terms = loadTerms(termsFile);

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

function run(files) {
  const root = fs.mkdtempSync(path.join(tmp, "case-"));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return scan(root, terms);
}

check("normalize ignores case, spaces and punctuation", normalize("Widget-Pro Suite!") === "widgetprosuite");
check("a term in prose is found, with its line", (() => { const h = run({ "a.md": "fine\nWe use ExampleCorp here\n" }); return h.length === 1 && h[0].file === "a.md" && h[0].line === 2; })());
check("case and a possessive do not hide it", run({ "a.md": "EXAMPLECORP's tool" }).length === 1);
check("a hyphenated or spaced multi-word term is found", run({ "a.md": "the Widget-Pro Suite and the widget pro suite" }).length === 2);
check("a term inside a URL or identifier is found", run({ "a.html": '<a href="https://examplecorp.test/x">x</a>' }).length === 1);
check("a term in a nested path is found", run({ "evals/fixtures/p.html": "<p>examplecorp</p>" }).length === 1);
check("a clean tree has no hits", run({ "a.md": "Plain text about widgets and suites.", "b.js": "const x = 1;" }).length === 0);
check("a longer word that only contains the term is not a hit", run({ "a.md": "examplecorporation" }).length === 0);
check("the term split across a line break is not a hit", run({ "a.md": "widget pro\nsuite" }).length === 0);
check("binary file extensions are skipped", run({ "shot.png": "examplecorp" }).length === 0);
check("the blocklist file itself is skipped", run({ "scripts/brand_terms.sha256": "examplecorp" }).length === 0);
check("a malformed blocklist line is rejected", (() => { const f = path.join(tmp, "bad.sha256"); fs.writeFileSync(f, "examplecorp\n"); try { loadTerms(f); return false; } catch { return true; } })());

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
