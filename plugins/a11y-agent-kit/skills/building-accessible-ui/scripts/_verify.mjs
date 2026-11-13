// Pure logic for verify-fix.mjs: did a fix do what its plan said, and did it break anything? No browser, no
// page, no file access except through what the caller passes in. Every decision is made here so it can be
// tested on its own.
//
// The plan is the contract. It names the issues the fix is meant to resolve (the targets, as report keys
// "<SC>|<element>"), any element that will be renamed on the way, and the Guards (the tests that guard each
// target). Verify checks that contract against a second audit:
//
//   verdict, in this order
//     regressed        a new issue appeared, or a still-open issue got worse (a script finding counts too)
//     fixed            every target is resolved and nothing regressed
//     partial          some targets are resolved
//     unchanged        no target is resolved
//     invalid-targets  a target is malformed, or not in the before report, so no verdict can be given
//     unparseable      one of the reports has no issues and no audit heading
//   A new issue is a regression CANDIDATE: a better scan, or a markup change the plan didn't declare as a
//   rename, produces one too. The reviewer confirms each one.
//
// Coverage is reported beside the verdict, never inside it: a fix can be right and untested. Each target's
// Guard is covered (an automatable Guard whose test file exists and is part of this change), waived (no test,
// with a stated reason), uncovered (automatable, no test, no reason), or manual.

import { SEVERITY_RANK, compareReports, issueKey, norm, parseReport } from "./_report.mjs";

// ---- targets and renames
// "2.1.1|Tooltip on the bubbles" or "best practice|Icon|Missing reduced motion block" -> a report key.
export function parseTarget(raw) {
  const parts = String(raw).split("|").map((p) => p.trim());
  if (parts.length === 2 && parts[0] && parts[1]) return { key: issueKey(parts[0], parts[1]), raw };
  if (parts.length === 3 && /^best practice$/i.test(parts[0]) && parts[1] && parts[2]) return { key: `best practice|${norm(parts[1])}|${norm(parts[2])}`, raw };
  return { key: null, raw, error: "a target is written <SC>|<element>, or best practice|<element>|<description>" };
}

// "old element=new element" -> { from, to }. Applies to a report's element names and to a snapshot's selectors.
export function parseRename(raw) {
  const i = String(raw).indexOf("=");
  const from = i < 0 ? "" : raw.slice(0, i).trim();
  const to = i < 0 ? "" : raw.slice(i + 1).trim();
  return from && to ? { from, to } : { from: null, to: null, raw, error: "a rename is written old=new" };
}

// The after report's issues, with every renamed element put back under its old name, so they match the before report.
function applyRenames(issues, renames) {
  if (!renames.length) return issues;
  const out = new Map();
  for (const issue of issues.values()) {
    const hit = renames.find((r) => norm(r.to) === norm(issue.element));
    if (!hit) { out.set(issue.key, issue); continue; }
    const key = issue.tier === "best-practice" ? `best practice|${norm(hit.from)}|${norm(issue.title)}` : issueKey(issue.sc, hit.from);
    if (!out.has(key)) out.set(key, { ...issue, key, element: hit.from });
  }
  return out;
}

// ---- snapshots
// A snapshot is { scripts: { "<name>": { stopReason, findings: ["<check>@<selector>", ...] } } }.
const renameId = (id, renames) => {
  const at = id.indexOf("@");
  if (at < 0) return id;
  const hit = renames.find((r) => r.to === id.slice(at + 1));
  return hit ? `${id.slice(0, at)}@${hit.from}` : id;
};

export function diffSnapshots(before, after, renames = []) {
  const out = { resolved: [], new: [], notComparable: [], compared: [], incomplete: [] };
  const names = [...new Set([...Object.keys((before && before.scripts) || {}), ...Object.keys((after && after.scripts) || {})])].sort();
  for (const name of names) {
    const b = before && before.scripts && before.scripts[name];
    const a = after && after.scripts && after.scripts[name];
    if (!b || !a) { out.notComparable.push({ script: name, reason: `only in the ${b ? "before" : "after"} snapshot` }); continue; }
    if (b.stopReason === "error" || a.stopReason === "error" || b.stopReason === "timeout" || a.stopReason === "timeout") { out.notComparable.push({ script: name, reason: `the script failed (${[b.stopReason, a.stopReason].join(" -> ")})` }); continue; }
    if (b.stopReason !== a.stopReason) { out.notComparable.push({ script: name, reason: `it stopped differently (${b.stopReason} -> ${a.stopReason})` }); continue; }
    out.compared.push(name);
    if (b.stopReason !== "complete" && b.stopReason !== "modal-cycle") out.incomplete.push({ script: name, stopReason: b.stopReason });
    const was = new Set(b.findings || []);
    const now = new Set((a.findings || []).map((id) => renameId(id, renames)));
    for (const id of was) if (!now.has(id)) out.resolved.push(`${name}:${id}`);
    for (const id of now) if (!was.has(id)) out.new.push(`${name}:${id}`);
  }
  out.resolved.sort();
  out.new.sort();
  return out;
}

// ---- coverage of the Guards
const PLACEHOLDER = /^(todo|tbd|none|n\/?a|-+|\.+)$/i;
const cleanPath = (p) => String(p || "").replace(/\\/g, "/").replace(/^\.\//, "").trim();

// guards: [{ target, kind: "automatable" | "manual", test: "path" | "path::name" | null, waiver: string | null }]
// targets: the parsed target keys. changedFiles: repo-relative paths in this change. exists(path): does the file exist.
export function accountGuards({ guards, targets, changedFiles, exists }) {
  const changed = new Set((changedFiles || []).map(cleanPath));
  const entries = [], problems = [], warnings = [];
  const targetKeys = new Set(targets.map((t) => t.key));
  const seen = new Set();
  for (const g of guards || []) {
    const parsed = parseTarget(g.target);
    const key = parsed.key;
    if (!key || !targetKeys.has(key)) { warnings.push(`a Guard names "${g.target}", which is not one of the plan's targets`); continue; }
    seen.add(key);
    if (g.kind !== "automatable" && g.kind !== "manual") { problems.push(`invalid-guard@${key}`); entries.push({ target: key, kind: g.kind, status: "invalid", note: "kind must be automatable or manual" }); continue; }
    if (g.kind === "manual") { entries.push({ target: key, kind: "manual", status: "manual", note: g.waiver || null }); continue; }
    const test = g.test ? cleanPath(String(g.test).split("::")[0]) : null;
    const waiver = typeof g.waiver === "string" ? g.waiver.trim() : "";
    if (test) {
      if (!exists(test)) { problems.push(`guard-uncovered@${key}`); entries.push({ target: key, kind: "automatable", status: "uncovered", test, note: "test-file-missing" }); continue; }
      if (!changed.has(test)) { problems.push(`guard-uncovered@${key}`); entries.push({ target: key, kind: "automatable", status: "uncovered", test, note: "test-not-in-this-change" }); continue; }
      entries.push({ target: key, kind: "automatable", status: "covered", test });
      continue;
    }
    if (waiver.length >= 4 && !PLACEHOLDER.test(waiver)) { entries.push({ target: key, kind: "automatable", status: "waived", waiver }); continue; }
    problems.push(`guard-uncovered@${key}`);
    entries.push({ target: key, kind: "automatable", status: "uncovered", note: waiver ? "waiver-too-vague" : "no-test-and-no-reason" });
  }
  for (const t of targets) if (t.key && !seen.has(t.key) && !problems.includes(`invalid-guard@${t.key}`)) problems.push(`no-guard@${t.key}`);
  const count = (s) => entries.filter((e) => e.status === s).length;
  return { entries, counts: { covered: count("covered"), waived: count("waived"), uncovered: count("uncovered"), manual: count("manual") }, problems: [...new Set(problems)].sort(), warnings };
}

// ---- the plan's machine-readable block
// A fix plan carries one fenced block, with the info string a11y-plan, holding JSON:
//   { "targets": ["4.1.2|Close button"], "renames": ["Close button=Close control"],
//     "guards": [{ "target": "4.1.2|Close button", "kind": "automatable", "test": "tests/a11y.test.mjs::close has a name", "waiver": null }] }
// renames and guards are optional. Returns { targets, renames, guards, error }.
export function parsePlan(text) {
  const blocks = [...String(text || "").replace(/\r\n/g, "\n").matchAll(/^```a11y-plan[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)];
  if (blocks.length === 0) return { targets: [], renames: [], guards: null, error: "the plan has no a11y-plan block" };
  if (blocks.length > 1) return { targets: [], renames: [], guards: null, error: "the plan has more than one a11y-plan block" };
  let data;
  try { data = JSON.parse(blocks[0][1]); } catch (e) { return { targets: [], renames: [], guards: null, error: `the a11y-plan block is not valid JSON: ${e.message}` }; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { targets: [], renames: [], guards: null, error: "the a11y-plan block must be a JSON object" };
  const strings = (x) => Array.isArray(x) && x.every((i) => typeof i === "string");
  if (!strings(data.targets)) return { targets: [], renames: [], guards: null, error: "targets must be a list of strings" };
  if (data.renames !== undefined && !strings(data.renames)) return { targets: [], renames: [], guards: null, error: "renames must be a list of strings" };
  if (data.guards !== undefined && !(Array.isArray(data.guards) && data.guards.every((g) => g && typeof g === "object" && !Array.isArray(g)))) return { targets: [], renames: [], guards: null, error: "guards must be a list of objects" };
  return { targets: data.targets, renames: data.renames || [], guards: data.guards === undefined ? null : data.guards, error: null };
}

// ---- the verdict
export function verify({ beforeText, afterText, targets: rawTargets, renames: rawRenames = [], beforeSnapshot = null, afterSnapshot = null, guards = null, changedFiles = [], exists = () => false }) {
  const result = { verdict: null, stopReason: "complete", targets: [], regressions: [], worsened: [], alsoResolved: [], snapshot: null, coverage: null, findings: [], notes: [] };
  const targets = (rawTargets || []).map(parseTarget);
  const renames = (rawRenames || []).map(parseRename);
  const bad = [...targets.filter((t) => t.error).map((t) => `"${t.raw}": ${t.error}`), ...renames.filter((r) => r.error).map((r) => `"${r.raw}": ${r.error}`)];
  if (!targets.length) bad.push("no targets: name the issues the fix is meant to resolve");
  if (bad.length) return { ...result, verdict: "invalid-targets", stopReason: "invalid-input", notes: bad, findings: ["invalid-targets@input"] };

  const before = parseReport(beforeText || ""), afterRaw = parseReport(afterText || "");
  if (!before.recognised || !afterRaw.recognised) return { ...result, verdict: "unparseable", stopReason: "unparseable", findings: ["unparseable@report"] };
  const after = { issues: applyRenames(afterRaw.issues, renames) };

  const findings = new Set();
  const keys = [...new Set(targets.map((t) => t.key))];
  for (const key of keys) {
    const was = before.issues.get(key);
    if (!was) { result.targets.push({ key, status: "unknown" }); findings.add(`target-unknown@${key}`); continue; }
    const now = after.issues.get(key);
    result.targets.push({ key, status: now ? "open" : "resolved" });
    if (now) findings.add(`target-open@${key}`);
  }
  const targetSet = new Set(keys);
  for (const [key, was] of before.issues) {
    const now = after.issues.get(key);
    if (!now) { if (!targetSet.has(key)) result.alsoResolved.push(key); continue; }
    const r0 = SEVERITY_RANK[was.severity] || 0, r1 = SEVERITY_RANK[now.severity] || 0;
    if (r0 && r1 && r1 > r0) { result.worsened.push({ key, from: was.severity, to: now.severity }); findings.add(`worsened@${key}`); }
  }
  for (const key of after.issues.keys()) if (!before.issues.has(key)) { result.regressions.push({ source: "report", id: key }); findings.add(`regression@${key}`); }

  if (beforeSnapshot && afterSnapshot) {
    result.snapshot = diffSnapshots(beforeSnapshot, afterSnapshot, renames);
    for (const id of result.snapshot.new) { result.regressions.push({ source: "snapshot", id }); findings.add(`regression@${id}`); }
  }

  const unknown = result.targets.filter((t) => t.status === "unknown").length;
  const resolved = result.targets.filter((t) => t.status === "resolved").length;
  if (unknown) result.verdict = "invalid-targets";
  else if (result.regressions.length || result.worsened.length) result.verdict = "regressed";
  else if (resolved === result.targets.length) result.verdict = "fixed";
  else if (resolved > 0) result.verdict = "partial";
  else result.verdict = "unchanged";
  result.alsoResolved.sort();

  if (guards) {
    result.coverage = accountGuards({ guards, targets: targets.filter((t) => t.key), changedFiles, exists });
    for (const p of result.coverage.problems) findings.add(p);
    result.notes.push(...result.coverage.warnings);
  }
  result.findings = [...findings].sort();
  return result;
}

// ---- the summary a reviewer reads in the pull request
export function renderPr(r) {
  const L = [];
  L.push("## Accessibility fix: verification", "");
  L.push(`**Verdict:** ${r.verdict}${r.verdict === "regressed" ? " (new or worse issues are candidates: confirm each)" : ""}`, "");
  if (r.targets.length) {
    L.push("**Targets**");
    for (const t of r.targets) L.push(`- ${t.status}: ${t.key}`);
    L.push("");
  }
  if (r.regressions.length || r.worsened.length) {
    L.push("**Regression candidates**");
    for (const x of r.regressions) L.push(`- new (${x.source}): ${x.id}`);
    for (const x of r.worsened) L.push(`- worse: ${x.key} (${x.from} to ${x.to})`);
    L.push("");
  }
  if (r.alsoResolved.length) L.push(`**Also resolved:** ${r.alsoResolved.length}`, "");
  if (r.snapshot) {
    L.push(`**Script snapshot:** ${r.snapshot.compared.length} script(s) compared, ${r.snapshot.resolved.length} finding(s) resolved, ${r.snapshot.new.length} new` + (r.snapshot.notComparable.length ? `; not comparable: ${r.snapshot.notComparable.map((n) => `${n.script} (${n.reason})`).join(", ")}` : ""), "");
  }
  if (r.coverage) {
    const c = r.coverage.counts;
    L.push(`**Tests:** ${c.covered} covered, ${c.waived} waived, ${c.uncovered} uncovered, ${c.manual} manual`);
    for (const e of r.coverage.entries) {
      if (e.status === "covered") L.push(`- covered: ${e.target} (${e.test})`);
      else if (e.status === "waived") L.push(`- waived: ${e.target} (${e.waiver})`);
      else if (e.status === "uncovered") L.push(`- UNCOVERED: ${e.target} (${e.note})`);
      else if (e.status === "manual") L.push(`- manual check: ${e.target}`);
    }
    for (const p of r.coverage.problems.filter((x) => x.startsWith("no-guard@"))) L.push(`- NO GUARD: ${p.slice("no-guard@".length)}`);
    L.push("");
  }
  for (const n of r.notes) L.push(`- note: ${n}`);
  return L.join("\n").replace(/\n+$/, "\n");
}

export { compareReports };
