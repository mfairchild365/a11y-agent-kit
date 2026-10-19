#!/usr/bin/env node
// Tests the parts of skills/building-accessible-ui/scripts/compare-reports.mjs that the fixture runner can't
// see: the still-open list, the counts, the details, the two-file form and the usage error. The findings
// themselves are covered by evals/check_fixtures/compare-reports. No browser needed.
// Usage: node evals/test_compare_reports.mjs   (exits 1 if any case behaves differently than expected)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "skills", "building-accessible-ui", "scripts", "compare-reports.mjs");
const sample = path.join(here, "audit_fixture", "sample", "good", "report.md");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "compare-reports-"));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

const real = fs.readFileSync(sample, "utf8");
const same = run(sample, sample, "--json");
const r = JSON.parse(same.stdout);
check("a real report compared with itself: 20 issues, all still open, nothing resolved or new", r.counts.stillOpen === 20 && r.counts.resolved === 0 && r.counts.new === 0 && r.findings.length === 0 && r.stillOpen.length === 20);

// Drop one card and change another's severity, to see resolved, details and the severity note.
const dropped = real.replace(/### Element: Close button[^]*?(?=### Element:|## Minor issues)/, "").replace(/(#### \d+\. )Critical( · 1\.4\.3)/, "$1Moderate$2");
fs.writeFileSync(path.join(tmp, "next.md"), dropped);
const d = JSON.parse(run(sample, path.join(tmp, "next.md"), "--json").stdout);
check("a removed card is resolved", d.counts.resolved === 1 && d.findings.length === 1 && d.findings[0].id.startsWith("resolved@4.1.2|"));
check("a severity change is a still-open detail, not a finding", d.details.some((x) => x.status === "still-open" && x.sc === "1.4.3" && x.changes.some((c) => /severity Critical -> Moderate/.test(c))) && d.counts.stillOpen === 19);
check("the plain output names the counts", /resolved 1 · still open 19 · new 0/.test(run(sample, path.join(tmp, "next.md")).stdout));
check("swapping the two reports turns resolved into new", JSON.parse(run(path.join(tmp, "next.md"), sample, "--json").stdout).findings.some((f) => f.id.startsWith("new@4.1.2|")));
check("a report with no issues and no heading is unparseable, not an error", (() => { fs.writeFileSync(path.join(tmp, "junk.md"), "nothing here"); const o = JSON.parse(run(sample, path.join(tmp, "junk.md"), "--json").stdout); return o.stopReason === "unparseable" && o.findings.length === 0; })());
check("the wrong number of arguments is a usage error (exit 2)", run(sample).status === 2 && run().status === 2);
check("a missing file is a usage error (exit 2)", run(sample, path.join(tmp, "nope.md")).status === 2);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
