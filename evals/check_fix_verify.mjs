#!/usr/bin/env node
// Grades what verify-fix.mjs would say about an agent's fix of evals/guard_fixture/project, with no LLM judge and
// no browser of its own. It is given the agent's project folder, the approved plan the agent was told to follow
// (evals/guard_fixture/plans/approved-<variant>.md) and which of the two automatable defects the agent's page
// now passes (check_guard_run.mjs works that out with axe).
//
// There is no auditor in this loop, so the "after" report is made from the "before" report: the card of every
// issue whose defect now passes is removed, and the other cards stay. That is what a correct re-audit would
// show, and it lets the real verify rules run: the verdict (are the targets resolved, is anything new) and the
// coverage of the plan's Guards (does a test exist, is it part of this change, or is there a reason).
//
//   normal   verdict fixed; both Guards covered by a test that exists in the change
//   optout   verdict fixed; both Guards waived, and no test file added
//
// (afterExtra is text added to the after report's findings; the tests use it to add a new issue.)
//
// Usage: node check_fix_verify.mjs <agent project dir> --variant normal|optout --fixed button,contrast [--json]
// Exits 1 if a check fails.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePlan, verify } from "../skills/building-accessible-ui/scripts/_verify.mjs";
import { changedFiles } from "./check_plan_run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, "guard_fixture", "project");
export const approvedPlanPath = (variant) => path.join(here, "guard_fixture", "plans", `approved-${variant}.md`);
const CARD_OF = { button: 1, contrast: 2 };

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// The report with the cards of the resolved issues taken out. A card runs from its "#### N." heading to the
// next heading of any level.
export function afterReport(reportText, fixed) {
  const drop = new Set(fixed.map((f) => CARD_OF[f]).filter(Boolean));
  const lines = String(reportText).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const card = line.match(/^####\s+(\d+)\./);
    if (card) skipping = drop.has(Number(card[1]));
    else if (/^#{1,4}\s/.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

// Text added to the findings, before the Minor issues section where cards stop.
const MINOR = "\n## Minor issues";
const withExtra = (text, extra) => (!extra ? text : text.includes(MINOR) ? text.replace(MINOR, () => `\n${extra}${MINOR}`) : `${text}\n${extra}`);

export function gradeVerify({ agentDir, variant = "normal", fixed = [], reportText = read(path.join(BASELINE, "report.md")), planText = read(approvedPlanPath(variant)), afterExtra = "" }) {
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
  const plan = parsePlan(planText);
  const changed = changedFiles(agentDir);
  const r = verify({
    beforeText: reportText,
    afterText: withExtra(afterReport(reportText, fixed), afterExtra),
    targets: plan.targets,
    renames: plan.renames,
    guards: plan.guards,
    changedFiles: changed,
    exists: (p) => fs.existsSync(path.join(agentDir, p)),
  });
  check("verify-fix says the plan's targets are fixed and nothing is new", r.verdict === "fixed", `verdict ${r.verdict}${r.findings.length ? `: ${r.findings.join(", ")}` : ""}`);
  const c = r.coverage ? r.coverage.counts : { covered: 0, waived: 0, uncovered: 0, manual: 0 };
  if (variant === "optout") {
    check("Both Guards are waived with the plan's reason", c.waived === 2 && c.uncovered === 0 && c.covered === 0, JSON.stringify(c));
    check("No test file was added or changed", !changed.some((f) => /\.(test|spec)\.[cm]?[jt]s$/.test(f)), changed.filter((f) => /\.(test|spec)\.[cm]?[jt]s$/.test(f)).join(", "));
  } else {
    check("Both Guards are covered by a test that exists and is part of the change", c.covered === 2 && c.uncovered === 0 && c.waived === 0, `${JSON.stringify(c)}${r.coverage ? ` problems: ${r.coverage.problems.join(", ") || "none"}` : ""}`);
  }
  check("verify-fix found no regression candidate", r.regressions.length === 0 && r.worsened.length === 0, [...r.regressions.map((x) => x.id || x.key), ...r.worsened.map((x) => x.key || x.id)].join(", "));
  return { results, warnings: [], verify: r };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const agentDir = argv.find((a, i) => !a.startsWith("--") && !["--variant", "--fixed"].includes(argv[i - 1]));
  const variant = opt("--variant") || "normal";
  if (!agentDir || !["normal", "optout"].includes(variant)) { console.error("Usage: node check_fix_verify.mjs <agent project dir> --variant normal|optout --fixed button,contrast [--json]"); process.exit(2); }
  const fixed = (opt("--fixed") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const out = gradeVerify({ agentDir: path.resolve(agentDir), variant, fixed });
  const failed = out.results.filter((r) => !r.ok);
  if (argv.includes("--json")) console.log(JSON.stringify({ passed: out.results.length - failed.length, failed: failed.length, results: out.results }, null, 2));
  else {
    for (const r of out.results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${!r.ok && r.detail ? `  -> ${r.detail}` : ""}`);
    console.log(`\n${out.results.length - failed.length} of ${out.results.length} checks passed.`);
  }
  process.exit(failed.length ? 1 : 0);
}
