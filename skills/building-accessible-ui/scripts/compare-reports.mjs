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

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const combinedAt = argv.indexOf("--combined");
const files = argv.filter((a, i) => !a.startsWith("--") && !(combinedAt >= 0 && i === combinedAt + 1));

const norm = (s) => (s || "").toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " ").replace(/[^\p{L}\p{N} .]/gu, "").trim();
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

const SEVERITIES = /^(Blocker|Critical|Moderate|Minor)$/;

// Returns { issues: Map(key -> {key, element, sc, severity, tier, title}), recognised: boolean }.
function parseReport(text) {
  const issues = new Map();
  const add = (i) => { if (i.element && !issues.has(i.key)) issues.set(i.key, i); };
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let section = "";
  let element = "";
  let cellHeader = null;
  for (const line of lines) {
    const h2 = line.match(/^## (.+?)\s*$/);
    if (h2) { section = h2[1].trim(); element = ""; cellHeader = null; continue; }
    const h3 = line.match(/^### Element:\s*(.+?)\s*$/);
    if (h3 && section === "Findings") { element = h3[1]; continue; }
    const card = line.match(/^#### \d+\.\s*(Blocker|Critical|Moderate|Minor)\s*·\s*([^·]+?)\s*·[^·]*·[^·]*·\s*(.+?)\s*$/);
    if (card && section === "Findings") {
      const sc = card[2].trim();
      add({ key: `${sc}|${norm(element)}`, element, sc, severity: card[1], tier: "card", title: card[3] });
      continue;
    }
    if (/^\|/.test(line) && ["Minor issues", "Best practices", "Needs verification"].includes(section)) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (!cells.length || /^-+$/.test(cells[0].replace(/:/g, "")) || cells[0] === "#") { cellHeader = cells; continue; }
      if (!/^\d+$/.test(cells[0])) continue;
      if (section === "Best practices") add({ key: `best practice|${norm(cells[1])}|${norm(cells[2])}`, element: cells[1], sc: "best practice", severity: null, tier: "best-practice", title: cells[2] });
      else if (section === "Minor issues") add({ key: `${cells[2]}|${norm(cells[1])}`, element: cells[1], sc: cells[2], severity: "Minor", tier: "minor", title: cells[3] });
      else add({ key: `${cells[2]}|${norm(cells[1])}`, element: cells[1], sc: cells[2], severity: cells[3], tier: "needs-verification", title: "" });
    }
  }
  return { issues, recognised: /^# Accessibility audit/m.test(text) || issues.size > 0 };
}

function compare(oldText, newText) {
  const a = parseReport(oldText);
  const b = parseReport(newText);
  if (!a.recognised || !b.recognised) return { findings: [], stillOpen: [], counts: { resolved: 0, stillOpen: 0, new: 0 }, stopReason: "unparseable", details: [] };
  const findings = [], details = [], stillOpen = [];
  for (const [key, o] of a.issues) {
    const n = b.issues.get(key);
    if (!n) { findings.push({ id: `resolved@${key}` }); details.push({ status: "resolved", key, element: o.element, sc: o.sc, was: o.severity || o.tier }); continue; }
    const changes = [];
    if (o.severity !== n.severity) changes.push(`severity ${o.severity || "none"} -> ${n.severity || "none"}`);
    if (o.tier !== n.tier) changes.push(`tier ${o.tier} -> ${n.tier}`);
    stillOpen.push(key);
    details.push({ status: "still-open", key, element: n.element, sc: n.sc, changes });
  }
  for (const [key, n] of b.issues) if (!a.issues.has(key)) { findings.push({ id: `new@${key}` }); details.push({ status: "new", key, element: n.element, sc: n.sc, now: n.severity || n.tier }); }
  const count = (s) => details.filter((d) => d.status === s).length;
  return { findings: findings.sort((x, y) => x.id.localeCompare(y.id)), stillOpen: stillOpen.sort(), counts: { resolved: count("resolved"), stillOpen: count("still-open"), new: count("new") }, stopReason: "complete", details };
}

const result = compare(oldText, newText);
if (json) console.log(JSON.stringify(result));
else {
  if (result.stopReason === "unparseable") console.log("One of the reports has no issues and no '# Accessibility audit' heading, so nothing was compared.");
  else {
    for (const d of result.details) console.log(`${d.status.padEnd(10)} ${d.sc.padEnd(14)} ${d.element}${d.changes && d.changes.length ? `   (${d.changes.join("; ")})` : ""}`);
    console.log(`\nresolved ${result.counts.resolved} · still open ${result.counts.stillOpen} · new ${result.counts.new}`);
  }
}
