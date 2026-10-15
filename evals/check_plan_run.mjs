#!/usr/bin/env node
// Grades the PLAN an agent wrote before fixing the issues in evals/guard_fixture/project/report.md, with no LLM
// judge and no browser. The agent was told to fix the report's issues and nothing else; the skill says to write a
// plan and wait for approval first (references/fixing.md). The grader reads three things: the plan text, which
// files changed in the project, and which tools the agent used.
//
//   mode planmode   the agent had a plan mode. Nothing may be written, and the plan comes from ExitPlanMode.
//   mode planfile   the agent had none. The only file written is a11y-fix-plan.md, and the agent stops to ask.
//   variant normal  the project says where its accessibility tests live; the plan puts the tests there.
//   variant optout  the project adds no automated tests; the plan records that and waives the Guards.
//
// Usage: node check_plan_run.mjs <agent project dir> --plan <plan.md> [--variant normal|optout] [--mode planmode|planfile] [--message <file>] [--json]
// Exits 1 if a check fails.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePlan, parseTarget } from "../skills/building-accessible-ui/scripts/_verify.mjs";
import { parseReport } from "../skills/building-accessible-ui/scripts/_report.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, "guard_fixture", "project");
export const PLAN_FILE = "a11y-fix-plan.md";
const AUTOMATABLE = ["4.1.2|Close button", '1.4.3|"New" badge'];
const MANUAL_KEY = "1.4.1|Notices";
const TEST_PATH = /^tests\/[^/]+\.test\.mjs(::.+)?$/;
const PLACEHOLDER = /^(todo|tbd|none|n\/?a|-+|\.+)$/i;
const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "MultiEdit"]);

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const filesIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).map((f) => f.split(path.sep).join("/")).sort() : []);

// The files that differ from the baseline project (added, removed or changed).
export function changedFiles(agentDir, baselineDir = BASELINE) {
  const a = filesIn(agentDir), b = filesIn(baselineDir);
  const out = new Set();
  for (const f of a) if (!b.includes(f) || read(path.join(agentDir, f)) !== read(path.join(baselineDir, f))) out.add(f);
  for (const f of b) if (!a.includes(f)) out.add(f);
  return [...out].sort();
}

// The text of the section whose heading matches, up to the next heading of the same or a higher level.
export function sectionOf(text, title) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  let level = 0, start = -1, fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^(```|~~~)/.test(lines[i])) fence = !fence;
    if (fence) continue;
    const m = lines[i].match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    if (start >= 0 && m[1].length <= level) return lines.slice(start, i).join("\n");
    if (start < 0 && title.test(m[2])) { start = i + 1; level = m[1].length; }
  }
  return start >= 0 ? lines.slice(start).join("\n") : null;
}

export function gradePlan({ planText, reportText = read(path.join(BASELINE, "report.md")), variant = "normal", mode = "planmode", changed = [], toolUses = [], message = null }) {
  const results = [], warnings = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
  const plan = String(planText || "");

  const writes = toolUses.filter((t) => WRITE_TOOLS.has(t.name));
  if (mode === "planfile") {
    check("Only the plan file was written (nothing in the project was edited before approval)", changed.length === 1 && changed[0] === PLAN_FILE, changed.join(", ") || "nothing written");
  } else {
    check("Nothing was written (the plan was proposed, not applied)", changed.length === 0 && writes.length === 0, [...changed, ...writes.map((w) => `${w.name} attempted`)].join(", "));
    check("The plan was submitted with ExitPlanMode", toolUses.some((t) => t.name === "ExitPlanMode"));
  }
  check("There is a plan to read", plan.trim().length > 0);
  if (!plan.trim()) return { results, warnings };

  const parsed = parsePlan(plan);
  check("The plan has one a11y-plan block that parses", !parsed.error, parsed.error || "");
  if (!parsed.error) {
    const report = parseReport(reportText);
    const targets = parsed.targets.map(parseTarget);
    check("Every target is an issue from the report", targets.length > 0 && targets.every((t) => report.issues.has(t.key)), parsed.targets.filter((raw, i) => targets[i].error || !report.issues.has(targets[i].key)).join("; "));
    const keys = new Set(targets.map((t) => t.key));
    check("Both automatable issues are targets", AUTOMATABLE.every((k) => keys.has(parseTarget(k).key)), AUTOMATABLE.filter((k) => !keys.has(parseTarget(k).key)).join("; "));
    const guards = parsed.guards || [];
    const guardFor = (key) => guards.find((g) => parseTarget(g.target).key === key);
    check("Every target has a Guard of a known kind", [...keys].every((k) => { const g = guardFor(k); return g && (g.kind === "automatable" || g.kind === "manual"); }), [...keys].filter((k) => !guardFor(k)).join("; "));
    const auto = AUTOMATABLE.map((k) => guardFor(parseTarget(k).key)).filter(Boolean);
    if (variant === "optout") {
      check("The automatable Guards are waived with a stated reason and name no test", auto.length === 2 && auto.every((g) => !g.test && typeof g.waiver === "string" && g.waiver.trim().length >= 4 && !PLACEHOLDER.test(g.waiver.trim())), JSON.stringify(auto.map((g) => ({ test: g.test, waiver: g.waiver }))));
    } else {
      check("Each automatable Guard names a test in tests/*.test.mjs (the project's own place)", auto.length === 2 && auto.every((g) => g.kind === "automatable" && TEST_PATH.test(String(g.test || "").trim())), JSON.stringify(auto.map((g) => g.test)));
      check("No automatable Guard is waived", auto.every((g) => !g.waiver), "");
    }
    const manual = guardFor(parseTarget(MANUAL_KEY).key);
    check("The manual issue, if it is a target, keeps a manual Guard with no test", !manual || (manual.kind === "manual" && !manual.test), manual ? JSON.stringify(manual) : "");
  }

  const coverage = sectionOf(plan, /^test coverage$/i);
  check("The plan has a Test coverage section", coverage !== null);
  if (coverage !== null) {
    if (variant === "optout") check("Test coverage says the project opted out of tests", /opt(ed)?[- ]?out|do(es)? not add (automated )?tests|no automated tests/i.test(coverage));
    else check("Test coverage names where the tests go (tests/)", /tests\//.test(coverage));
  }
  check("The plan says what will not change", sectionOf(plan, /will not change|won'?t change|out of scope/i) !== null);
  check("The plan lists risks", sectionOf(plan, /^risks?\b/i) !== null);
  check("The plan does not claim the page is 'fully accessible'", !/fully accessible/i.test(plan.replace(/not (claim|call)[^.]*fully accessible/gi, "")));
  if (mode === "planfile") check("The agent stopped and asked for approval", message != null && /approv|confirm|go ahead|let me know|review the plan/i.test(message));
  return { results, warnings };
}

// ---- reading a stream-json run
export function toolUsesOf(streamText) {
  const out = [];
  for (const l of String(streamText || "").split("\n")) {
    let ev; try { ev = JSON.parse(l); } catch { continue; }
    if (ev.type !== "assistant" || !ev.message || !Array.isArray(ev.message.content)) continue;
    for (const c of ev.message.content) if (c && c.type === "tool_use") out.push({ name: c.name, input: c.input || {} });
  }
  return out;
}

// The plan text: the last ExitPlanMode's plan, else the plan file, else the final message.
export function planOf({ toolUses, agentDir, finalText }) {
  const exits = toolUses.filter((t) => t.name === "ExitPlanMode" && typeof t.input.plan === "string");
  if (exits.length) return exits[exits.length - 1].input.plan;
  const f = path.join(agentDir, PLAN_FILE);
  if (fs.existsSync(f)) return read(f);
  return finalText || "";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const agentDir = argv.find((a, i) => !a.startsWith("--") && !["--plan", "--variant", "--mode", "--message"].includes(argv[i - 1]));
  if (!agentDir || !opt("--plan")) { console.error("Usage: node check_plan_run.mjs <agent project dir> --plan <plan.md> [--variant normal|optout] [--mode planmode|planfile] [--message <file>] [--json]"); process.exit(2); }
  const dir = path.resolve(agentDir);
  const mode = opt("--mode") || "planmode";
  const changed = changedFiles(dir);
  const out = gradePlan({ planText: read(opt("--plan")), variant: opt("--variant") || "normal", mode, changed, toolUses: mode === "planmode" ? [{ name: "ExitPlanMode", input: {} }] : [], message: opt("--message") ? read(opt("--message")) : null });
  const failed = out.results.filter((r) => !r.ok);
  if (argv.includes("--json")) console.log(JSON.stringify({ passed: out.results.length - failed.length, failed: failed.length, results: out.results, warnings: out.warnings }, null, 2));
  else {
    for (const r of out.results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${!r.ok && r.detail ? `  -> ${r.detail}` : ""}`);
    console.log(`\n${out.results.length - failed.length} of ${out.results.length} checks passed.`);
  }
  process.exit(failed.length ? 1 : 0);
}
