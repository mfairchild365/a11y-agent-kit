#!/usr/bin/env node
// Compares two audit reports written with references/audit-report.template.md and says which issues are
// resolved, still open or new. It reads text only: no browser, no network.
//
// An issue is matched by its element and its WCAG success criterion, because the template files one issue
// per element and SC. A best practice has no SC, so it is matched by element and its description.
//   resolved    in the previous report, not in this one          (a finding)
//   new         in this report only                               (a finding)
//   still-open  in both; a change of severity or tier is in the details (not a finding)
// It does not decide that an issue is fixed: it only says the new audit no longer found it. When an element
// was renamed or moved, the same issue shows up as resolved and new; the reviewer merges those by hand and
// says so. A resolved issue that could not be re-checked (the page moved, a state was not reachable) is not
// resolved either, which the reviewer has to say in the report.
//
// Usage: node compare-reports.mjs <previous report.md> <this report.md> [--json]
//        node compare-reports.mjs --combined <file> [--json]
//   --combined: one file holding the previous report, a line "<!-- NEW REPORT -->", then this report.
//   stopReason: complete, or unparseable when a file has no issues and no "# Accessibility audit" heading.

import fs from "node:fs";
import { compareReports } from "./_report.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const combinedAt = argv.indexOf("--combined");
const files = argv.filter((a, i) => !a.startsWith("--") && !(combinedAt >= 0 && i === combinedAt + 1));

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

let oldText, newText;
try {
  if (combinedAt >= 0) {
    const [a, b = ""] = read(argv[combinedAt + 1]).split(/^<!--\s*NEW REPORT\s*-->\s*$/m);
    [oldText, newText] = [a, b];
  } else if (files.length === 2) {
    [oldText, newText] = files.map(read);
  } else throw new Error("usage");
} catch {
  console.error("Usage: node compare-reports.mjs <previous report.md> <this report.md> [--json]\n       node compare-reports.mjs --combined <file> [--json]");
  process.exit(2);
}

const result = compareReports(oldText, newText);
if (json) console.log(JSON.stringify(result));
else {
  if (result.stopReason === "unparseable") console.log("One of the reports has no issues and no '# Accessibility audit' heading, so nothing was compared.");
  else {
    for (const d of result.details) console.log(`${d.status.padEnd(10)} ${d.sc.padEnd(14)} ${d.element}${d.changes && d.changes.length ? `   (${d.changes.join("; ")})` : ""}`);
    console.log(`\nresolved ${result.counts.resolved} · still open ${result.counts.stillOpen} · new ${result.counts.new}`);
  }
}
