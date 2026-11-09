#!/usr/bin/env node
// Grades the PLAN an agent writes for evals/swap_fixture/project, with no LLM judge and no browser. The page's close control is a
// <div> with a click handler, so the right fix swaps it for a <button>. Two scripts and style rules depend on it being a div
// (see evals/swap_fixture/README.md). The skill's fix plan has to say so before anything is edited: the selectors that depend on
// the old element, the browser defaults the new one brings, a risk level, and a look at the rendered result.
//
// What it checks, and what it does not: it reads the plan text for those items, and that the plan is valid and nothing was written.
// It does not judge whether the plan's fix is good, or whether the risk level is the "right" one (the level is a judgment; models
// give different ones for the same page). It only requires that a level is given.
//
// Usage: node check_swap_plan.mjs <agent project dir> --plan <plan.md> [--json]
// Exits 1 if a check fails.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePlan, parseTarget } from "../skills/building-accessible-ui/scripts/_verify.mjs";
import { changedFiles, isPlanFileWrite } from "./check_plan_run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SWAP_BASELINE = path.join(here, "swap_fixture", "project");
const TARGET = "2.1.1|Close control";
const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "MultiEdit"]);
const DEFAULTS = ["padding", "border", "font", "margin", "background", "color", "display"];

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
// The sentences of a text, so a check can look at one claim at a time.
const sentences = (text) => String(text).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

export function gradeSwapPlan({ planText, changed = [], toolUses = [] }) {
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
  const plan = String(planText || "");

  const writes = toolUses.filter((t) => WRITE_TOOLS.has(t.name) && !isPlanFileWrite(t));
  check("Nothing was written (the plan was proposed, not applied)", changed.length === 0 && writes.length === 0, [...changed, ...writes.map((w) => `${w.name} attempted`)].join(", "));
  check("The plan was submitted (ExitPlanMode, or written to the CLI's plans folder)", toolUses.some((t) => t.name === "ExitPlanMode" || isPlanFileWrite(t)));
  check("There is a plan to read", plan.trim().length > 0);
  if (!plan.trim()) return { results, warnings: [] };

  const parsed = parsePlan(plan);
  const key = parseTarget(TARGET).key;
  const guard = parsed.error ? null : (parsed.guards || []).find((g) => parseTarget(g.target).key === key);
  check("The plan has one a11y-plan block that parses, targets the close control, and gives it a manual Guard with no test (the project has no tests)",
    parsed.targets.some((t) => parseTarget(t).key === key) && !!guard && guard.kind === "manual" && !guard.test, parsed.error || JSON.stringify(guard || null));

  check("The plan makes the close control a button", /\bbutton\b/i.test(plan));
  check("The plan has an element-change analysis", /element change/i.test(plan));
  // the file and what is in it, named together (on one line of the plan), so a name here and a selector there do not add up
  const lines = plan.split("\n");
  check("It names the script that finds the old element (app.js with div.close or querySelector, on one line)", lines.some((l) => /app\.js/.test(l) && /div\.close|querySelector/.test(l)));
  check("It names the style rules that target the old element (styles.css with div.close on one line, and the hover rule)", lines.some((l) => /styles\.css/.test(l) && /div\.close/.test(l)) && /hover/i.test(plan));
  // a dependency and a verb of changing it, on the same line of the plan (a bullet that says what depends on the old element and
  // what will be done about it) or the line right after it
  const verb = /\b(change|changes|changed|update|updates|updated|replace|replaces|rewrite|point|points|switch|switches|move|moves|retarget)\b/i;
  // ("in this change" is a noun, not a plan to change anything)
  const noNoun = (t) => t.replace(/\b(this|the|a|an|same|one|that|each|every|any|whole|single)\s+changes?\b/gi, "");
  check("It plans to update those dependencies, not only list them", lines.some((l, i) => /(app\.js|styles\.css|div\.close)/.test(l) && verb.test(noNoun(`${l} ${lines[i + 1] || ""}`))));
  const defaults = DEFAULTS.filter((d) => new RegExp(`\\b${d}`, "i").test(plan));
  check("It says which browser defaults the button brings (at least two of padding, border, font, margin, background, color, display)", defaults.length >= 2, `found: ${defaults.join(", ") || "none"}`);
  // "risk level medium", "medium risk", or a level on the "Element change" line itself ("Element change: medium",
  // "Element change (`div` to `button`): low-to-medium")
  check("It gives a risk level (low, medium or high)", /\brisk\b[^.\n]{0,60}\b(low|medium|high)\b|\b(low|medium|high)\b[^.\n]{0,25}\brisk\b|\belement change\b[^\n]{0,80}\b(low|medium|high)\b/i.test(plan));
  check("It tells the reader to look at the rendered result", /\b(render(ed)?|in a browser|visual(ly)?|screenshot|look at)\b/i.test(plan));
  const falseAlarm = sentences(plan).filter((s) => /:(first|last)-child/.test(s) && /\b(break|breaks|stop matching|no longer match|no longer matches)\b/i.test(s) && !/\b(not|n't|unaffected|still|no longer affected|isn't|aren't)\b/i.test(s));
  check("It does not say the :first-child and :last-child rules break (they do not: the close control sits between them)", falseAlarm.length === 0, falseAlarm[0] || "");
  check("The plan does not claim the page is 'fully accessible'", !/fully accessible/i.test(plan.replace(/\b(do not|don't|never|not)\b[^.]{0,40}fully accessible/gi, "")));
  return { results, warnings: [] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const agentDir = argv.find((a, i) => !a.startsWith("--") && !["--plan"].includes(argv[i - 1]));
  if (!agentDir || !opt("--plan")) { console.error("Usage: node check_swap_plan.mjs <agent project dir> --plan <plan.md> [--json]"); process.exit(2); }
  const out = gradeSwapPlan({ planText: read(opt("--plan")), changed: changedFiles(path.resolve(agentDir), SWAP_BASELINE), toolUses: [{ name: "ExitPlanMode", input: {} }] });
  const failed = out.results.filter((r) => !r.ok);
  if (argv.includes("--json")) console.log(JSON.stringify({ passed: out.results.length - failed.length, failed: failed.length, results: out.results }, null, 2));
  else {
    for (const r of out.results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${!r.ok && r.detail ? `  -> ${r.detail}` : ""}`);
    console.log(`\n${out.results.length - failed.length} of ${out.results.length} checks passed.`);
  }
  process.exit(failed.length ? 1 : 0);
}
