// Reads audit reports written with references/audit-report.template.md, and compares two of them. Pure text
// work, no browser: shared by compare-reports.mjs and verify-fix.mjs.
//
// An issue is keyed by its success criterion and its element, because the template files one issue per element
// and SC ("<SC>|<normalised element>"). A best practice has no SC, so it is keyed by element and description.

// Lower case, only letters, digits, spaces and dots (so `code` marks, punctuation and doubled spaces do not matter).
export const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} .]/gu, "").trim();

export const SEVERITY_RANK = { Minor: 1, Moderate: 2, Critical: 3, Blocker: 4 };

// The key of an issue, from the SC and the element as a person would write them.
export const issueKey = (sc, element) => `${String(sc).trim()}|${norm(element)}`;

// Returns { issues: Map(key -> {key, element, sc, severity, tier, title}), recognised: boolean }.
export function parseReport(text) {
  const issues = new Map();
  const add = (i) => { if (i.element && !issues.has(i.key)) issues.set(i.key, i); };
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let section = "";
  let element = "";
  for (const line of lines) {
    const h2 = line.match(/^## (.+?)\s*$/);
    if (h2) { section = h2[1].trim(); element = ""; continue; }
    const h3 = line.match(/^### Element:\s*(.+?)\s*$/);
    if (h3 && section === "Findings") { element = h3[1]; continue; }
    const card = line.match(/^#### \d+\.\s*(Blocker|Critical|Moderate|Minor)\s*·\s*([^·]+?)\s*·[^·]*·[^·]*·\s*(.+?)\s*$/);
    if (card && section === "Findings") {
      const sc = card[2].trim();
      add({ key: issueKey(sc, element), element, sc, severity: card[1], tier: "card", title: card[3] });
      continue;
    }
    if (/^\|/.test(line) && ["Minor issues", "Best practices", "Needs verification"].includes(section)) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (!cells.length || /^-+$/.test(cells[0].replace(/:/g, "")) || cells[0] === "#") continue;
      if (!/^\d+$/.test(cells[0])) continue;
      if (section === "Best practices") add({ key: `best practice|${norm(cells[1])}|${norm(cells[2])}`, element: cells[1], sc: "best practice", severity: null, tier: "best-practice", title: cells[2] });
      else if (section === "Minor issues") add({ key: issueKey(cells[2], cells[1]), element: cells[1], sc: cells[2], severity: "Minor", tier: "minor", title: cells[3] });
      else add({ key: issueKey(cells[2], cells[1]), element: cells[1], sc: cells[2], severity: cells[3], tier: "needs-verification", title: "" });
    }
  }
  return { issues, recognised: /^# Accessibility audit/m.test(text) || issues.size > 0 };
}

// What changed between two reports. findings are the actionable changes (resolved, new); still-open goes to
// stillOpen and details. A change of severity or tier is a detail of a still-open issue.
export function compareReports(oldText, newText) {
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
    details.push({ status: "still-open", key, element: n.element, sc: n.sc, changes, before: { severity: o.severity, tier: o.tier }, after: { severity: n.severity, tier: n.tier } });
  }
  for (const [key, n] of b.issues) if (!a.issues.has(key)) { findings.push({ id: `new@${key}` }); details.push({ status: "new", key, element: n.element, sc: n.sc, now: n.severity || n.tier }); }
  const count = (s) => details.filter((d) => d.status === s).length;
  return { findings: findings.sort((x, y) => x.id.localeCompare(y.id)), stillOpen: stillOpen.sort(), counts: { resolved: count("resolved"), stillOpen: count("still-open"), new: count("new") }, stopReason: "complete", details };
}
