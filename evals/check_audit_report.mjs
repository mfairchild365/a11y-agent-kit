#!/usr/bin/env node
// Checks an accessibility-reviewer report against the seeded fixture's answer key.
//
// Two kinds of check, both deterministic (no LLM grading):
//   content   - did the audit find each seeded defect, in the right tier and severity range,
//               with the 3-instance tooltip merged into one issue, and without reporting decoys
//   structure - does the report follow skills/building-accessible-ui/references/audit-report.template.md
//
// Usage: node check_audit_report.mjs <audit-output-dir> [--digest <file>] [--skip-axe] [--json]
//   <audit-output-dir> holds report.md, report.html and the screenshots.
//   --digest <file> also checks the agent's final message (the digest the caller relays).
// Exits 1 if any check fails, 2 on a usage error. Extra issues the key doesn't list are
// printed as warnings and don't fail the run: the agent may find real defects we didn't seed.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const digestIdx = args.indexOf("--digest");
const digestPath = digestIdx >= 0 ? args[digestIdx + 1] : null;
const dir = args.find((a, i) => !a.startsWith("--") && !(digestIdx >= 0 && i === digestIdx + 1));
const skipAxe = args.includes("--skip-axe");
const asJson = args.includes("--json");
if (!dir) {
  console.error("Usage: node check_audit_report.mjs <audit-output-dir> [--digest <file>] [--skip-axe] [--json]");
  process.exit(2);
}
const reportPath = path.join(dir, "report.md");
const htmlPath = path.join(dir, "report.html");
if (!fs.existsSync(reportPath)) {
  console.error(`No report.md in ${dir}`);
  process.exit(2);
}

const key = JSON.parse(fs.readFileSync(path.join(here, "audit_fixture", "expected.json"), "utf8"));
const md = fs.readFileSync(reportPath, "utf8").replace(/\r\n/g, "\n");
const lines = md.split("\n");
const RANK = { Blocker: 4, Critical: 3, Moderate: 2, Minor: 1 };

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const warnings = [];

// ---- parse -------------------------------------------------------------------------------
const h2 = (title) => {
  const i = lines.findIndex((l) => l.trim().toLowerCase().startsWith(`## ${title}`.toLowerCase()));
  if (i < 0) return null;
  let j = lines.findIndex((l, k) => k > i && /^## /.test(l));
  if (j < 0) j = lines.length;
  return lines.slice(i + 1, j);
};
const tableRows = (section) =>
  (section || [])
    .filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l))
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
    .filter((cells) => /^\d+$/.test(cells[0]));

const items = [];
const findings = h2("Findings") || [];
let element = "";
let cur = null;
const HEAD = /^####\s+(\d+)\.\s+(Blocker|Critical|Moderate|Minor)\s+·\s+(.+?)\s+·\s+(\d+)\s+instances?\s+·\s+(High|Medium|Low)\s+confidence\s+·\s+(.+)$/;
const malformed = [];
for (const l of findings) {
  const e = l.match(/^###\s+Element:\s*(.+)$/);
  if (e) { element = e[1]; cur = null; continue; }
  if (/^####\s+\d+\./.test(l)) {
    const m = l.match(HEAD);
    if (!m) { malformed.push(l); cur = null; continue; }
    cur = { kind: "card", id: +m[1], severity: m[2], sc: m[3], instances: +m[4], confidence: m[5], title: m[6], element, body: [] };
    items.push(cur);
    continue;
  }
  if (cur) cur.body.push(l);
}
for (const it of items) it.text = it.body.join("\n");
for (const cells of tableRows(h2("Minor issues"))) {
  items.push({ kind: "minor", id: +cells[0], element: cells[1], sc: cells[2], title: cells[3], severity: "Minor", text: cells.join(" ") });
}
for (const cells of tableRows(h2("Best practices"))) {
  items.push({ kind: "best-practice", id: +cells[0], element: cells[1], sc: "Best practice", title: cells[2], severity: null, text: cells.join(" ") });
}
for (const cells of tableRows(h2("Needs verification"))) {
  items.push({ kind: "verify", id: +cells[0], element: cells[1], sc: cells[2], severity: cells[3], title: cells[5] || cells[4] || "", text: cells.join(" ") });
}

// ---- structure ---------------------------------------------------------------------------
const summary = h2("Summary");
check("Summary section exists", summary);
const summaryText = (summary || []).join("\n");
const summaryLines = (summary || []).filter((l) => l.trim() && !/^\|/.test(l));
check("Summary is about 10 lines or fewer (limit 14, tables excluded)", summaryLines.length <= 14, `${summaryLines.length} lines`);
const fi = (summary || []).findIndex((l) => /fix first/i.test(l));
let fixItems = 0;
if (fi >= 0) {
  const first = summary[fi].replace(/.*fix first:?\**:?/i, "").trim();
  if (first) fixItems += 1;
  for (let k = fi + 1; k < summary.length && /^\s*(\d+\.|[-*])\s+\S/.test(summary[k]); k++) fixItems += 1;
}
check("Summary has a Fix first list of 1 to 3 items", fi >= 0 && fixItems >= 1 && fixItems <= 3, fi < 0 ? "missing" : `${fixItems} items`);
check("Fix first appears once in the report, with no issue index table in the summary",
  (md.match(/fix first/gi) || []).length === 1 && !/\|\s*#\s*\|\s*Offending element/i.test(summaryText), `fix-first mentions: ${(md.match(/fix first/gi) || []).length}; index table in summary: ${/|s*#s*|s*Offending element/i.test(summaryText)}`);
const ALLOWED = ["summary", "findings", "minor issues", "best practices", "needs verification", "passed / not an issue", "needs manual testing", "out of scope"];
const h2s = lines.filter((l) => /^## /.test(l)).map((l) => l.slice(3).trim());
const extra = h2s.filter((h) => !ALLOWED.includes(h.toLowerCase()));
check("Only the template's sections appear", extra.length === 0, extra.join("; "));
const stray = [];
for (const name of ["Minor issues", "Best practices", "Needs verification"]) {
  const free = (h2(name) || []).filter((l) => l.trim() && !/^\|/.test(l));
  if (free.length > 1 || free.some((l) => l.length > 200)) stray.push(`${name}: ${free.length} free line(s)`);
}
check("No stray paragraphs inside the Minor, Best practices and Needs verification sections", stray.length === 0, stray.join("; "));
check("Every finding headline matches the template", malformed.length === 0, malformed[0] || "");
check("Report has at least one card", items.some((i) => i.kind === "card"));

const cards = items.filter((i) => i.kind === "card");
const lenOf = (c, label) => ((c.body.find((l) => l.includes(`**${label}:**`)) || "").length);
const tooLong = cards.flatMap((c) => [["Why this severity", 420], ["Observed", 480]].filter(([f, max]) => lenOf(c, f) > max).map(([f, max]) => `#${c.id} ${f} > ${max} chars`));
check("Why this severity and Observed stay within the length caps", tooLong.length === 0, tooLong.join("; "));
const oneSc = (sc) => /^(\d\.\d\.\d+\b[^,/&]*|best practice[^,/&]*)$/i.test(sc) && !/\b(and|&)\b.*\d\.\d\.\d/i.test(sc);
const multi = cards.filter((c) => !oneSc(c.sc));
check("Each card maps to exactly one WCAG SC", multi.length === 0, multi.map((c) => `#${c.id}: ${c.sc}`).join("; "));
check("No Minor issue is written as a card", !cards.some((c) => c.severity === "Minor"), cards.filter((c) => c.severity === "Minor").map((c) => `#${c.id}`).join(", "));
check("No Low-confidence finding is in the ranked list", !cards.some((c) => c.confidence === "Low"), cards.filter((c) => c.confidence === "Low").map((c) => `#${c.id}`).join(", "));

const isBp = (sc) => /best practice/i.test(sc);
const bpAsIssue = items.filter((i) => (i.kind === "card" || i.kind === "minor") && isBp(i.sc));
check("Best practices are labelled 'Best practice', never given a severity or a card", bpAsIssue.length === 0, bpAsIssue.map((i) => `#${i.id} (${i.severity})`).join(", "));
const countsLine = (summary || []).find((l) => /Blocker\s+\d+/i.test(l)) || "";
const said = {};
for (const m of countsLine.matchAll(/(Blocker|Critical|Moderate|Minor)\s+(\d+)/gi)) said[m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()] = +m[2];
const actual = {};
for (const it of items.filter((i) => (i.kind === "card" || i.kind === "minor") && !isBp(i.sc))) actual[it.severity] = (actual[it.severity] || 0) + 1;
const mismatch = ["Blocker", "Critical", "Moderate", "Minor"].filter((k) => (said[k] || 0) !== (actual[k] || 0));
check("Severity totals in the summary match the issues (best practices not counted)", countsLine && mismatch.length === 0, countsLine ? mismatch.map((k) => `${k}: says ${said[k] || 0}, found ${actual[k] || 0}`).join("; ") : "no counts line");

const ids = items.map((i) => i.id);
check("Issue numbers are unique", new Set(ids).size === ids.length, ids.join(","));

// ordering: elements by max severity, issues within an element by severity
const groups = [];
for (const c of cards) {
  let g = groups.find((x) => x.element === c.element);
  if (!g) groups.push((g = { element: c.element, sev: [] }));
  g.sev.push(RANK[c.severity]);
}
const maxes = groups.map((g) => Math.max(...g.sev));
const nonInc = (a) => a.every((v, i) => i === 0 || a[i - 1] >= v);
check("Element groups are ordered by highest severity first", nonInc(maxes), maxes.join(" "));
check("Issues within each element are ordered by severity", groups.every((g) => nonInc(g.sev)));

// screenshots
const missingShot = [];
for (const c of cards.filter((x) => RANK[x.severity] >= RANK.Moderate)) {
  const m = c.text.match(new RegExp(`!\\[Finding ${c.id}\\b[^\\]]*\\]\\(([^)]+)\\)`));
  if (m) {
    const p = path.isAbsolute(m[1]) ? m[1] : path.join(dir, m[1]);
    if (!fs.existsSync(p)) missingShot.push(`#${c.id} (file not found: ${m[1]})`);
  } else if (!/no screenshot/i.test(c.text)) missingShot.push(`#${c.id}`);
}
check("Blocker, Critical and Moderate cards embed a screenshot whose alt text starts 'Finding N'", missingShot.length === 0, missingShot.join("; "));
check("Report never calls the UI fully accessible", !/(?<!not )(?<!n't )(?<!never call the ui )fully accessible/i.test(md));

// ---- report.html -------------------------------------------------------------------------
if (!fs.existsSync(htmlPath)) {
  check("report.html exists", false);
} else {
  const html = fs.readFileSync(htmlPath, "utf8");
  check("report.html exists", true);
  check("report.html has collapsible <details> evidence", /<details[\s>]/i.test(html));
  const extImg = [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].filter((m) => !/^data:/i.test(m[1]));
  check("report.html images are all inlined as data: URIs", extImg.length === 0, extImg.map((m) => m[1]).slice(0, 2).join(", "));
  check("report.html has a <main> and a table of contents", /<main[\s>]/i.test(html) && /href\s*=\s*["']#/.test(html));
  if (!skipAxe) {
    const r = spawnSync(process.execPath, [path.join(here, "axe_check.mjs"), htmlPath], { encoding: "utf8" });
    let wcag = null;
    try { wcag = JSON.parse(r.stdout).wcag; } catch { /* not JSON */ }
    check("report.html has no axe WCAG violations", r.status === 0 && wcag && wcag.length === 0,
      wcag ? JSON.stringify(wcag.map((v) => v.id)) : `axe_check.mjs could not run (exit ${r.status}): ${(r.stderr || "").trim().split("\n")[0]}`);
  }
}

// ---- content -----------------------------------------------------------------------------
const hay = (it) => `${it.title} ${it.element}`.toLowerCase();
const matches = (it, words) => words.some((w) => hay(it).includes(w.toLowerCase()));
const claimed = new Set();
const seedHit = {};
let found = 0;
for (const s of key.seeds) {
  const hits = items.filter((it) => matches(it, s.match) && (s.sc === "best practice" || it.sc.includes(s.sc)));
  hits.forEach((h) => claimed.add(h));
  const ok = hits.length > 0;
  check(`Found: ${s.id} (${s.sc})`, ok, ok ? "" : "not reported");
  if (!ok) continue;
  found += 1;
  check(`  ${s.id}: reported once, with its instances merged`, hits.length === 1, `${hits.length} issues: ${hits.map((h) => "#" + h.id).join(", ")}`);
  const hit = hits[0];
  check(`  ${s.id}: in the ${s.tier} tier`, hit.kind === s.tier, `found in ${hit.kind}`);
  if (s.severity) check(`  ${s.id}: severity ${s.severity.join(" or ")}`, s.severity.includes(hit.severity), hit.severity);
  else check(`  ${s.id}: has no severity (best practice)`, hit.severity === null, String(hit.severity));
  seedHit[s.id] = hit;
  if (hit.kind === "card" && s.instances > 1) check(`  ${s.id}: lists ${s.instances} instances`, hit.instances === s.instances, `${hit.instances}`);
}
const kb = seedHit["tooltip-keyboard"], hv = seedHit["tooltip-hover"];
if (kb && hv) {
  check("Tooltip is two issues: 2.1.1 (keyboard) and 1.4.13 (hover), not one", kb !== hv && kb.id !== hv.id, `both are #${kb.id}`);
  const xref = (a, b) => new RegExp(`#${b.id}\\b`).test(a.text || "");
  check("The 2.1.1 and 1.4.13 issues cross-reference each other", xref(kb, hv) && xref(hv, kb), "add 'see also #N' to each Summary");
}
for (const d of key.decoys) {
  const bad = items.filter((it) => matches(it, d.match));
  check(`Decoy not reported as an issue: ${d.id}`, bad.length === 0, bad.map((b) => `#${b.id} ${b.title}`).join("; "));
}
for (const it of items) if (!claimed.has(it)) warnings.push(`#${it.id} [${it.kind}] ${it.title} (${it.sc}) is not in the answer key; review by hand`);

// ---- digest ------------------------------------------------------------------------------
if (digestPath) {
  const dg = fs.readFileSync(digestPath, "utf8").replace(/\r\n/g, "\n");
  const dl = dg.split("\n");
  check("Digest is short (60 lines or fewer)", dl.length <= 60, `${dl.length} lines`);
  check("Digest has one Fix first list of 3 or fewer", (dg.match(/fix first/gi) || []).length === 1 && (() => {
    const i = dl.findIndex((l) => /fix first/i.test(l)); let n = 0;
    for (let k = i + 1; k < dl.length && /^\s*\d+\.\s+\S/.test(dl[k]) && !/^\s*\d+\.\s+(Blocker|Critical|Moderate|Minor|Best practice|Needs verification)\b/.test(dl[k]); k++) n++;
    return n >= 1 && n <= 3;
  })());
  const issueLine = /^\s*#(\d+)\s+·\s+(Blocker|Critical|Moderate|Minor|Best practice|Needs verification)\b/;
  const listed = new Set(dl.map((l) => (l.match(issueLine) || [])[1]).filter(Boolean).map(Number));
  const missingIds = items.filter((i) => !listed.has(i.id)).map((i) => "#" + i.id);
  check("Digest has one line for every issue, starting with its report number (#N · Severity · ...)", missingIds.length === 0, "missing " + missingIds.join(", "));
  check("Digest links to the full report", /report\.html/i.test(dg) && /full report:/i.test(dg), "needs a 'Full report:' line with the path to report.html");
  check("Digest says whether the report was opened", /open it:/i.test(dg), "needs an 'Open it:' line");
  check("Digest has no evidence and no images", !/\*\*(evidence|repro steps|observed|expected):?\*\*/i.test(dg) && !/!\[/.test(dg));
}

// ---- output ------------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
if (asJson) {
  console.log(JSON.stringify({ recall: `${found}/${key.seeds.length}`, passed: results.length - failed.length, failed: failed.length, results, warnings }, null, 2));
} else {
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${!r.ok && r.detail ? `  -> ${r.detail}` : ""}`);
  for (const w of warnings) console.log(`WARN  ${w}`);
  console.log(`\nRecall ${found}/${key.seeds.length}. ${results.length - failed.length} of ${results.length} checks passed.`);
}
process.exit(failed.length ? 1 : 0);
