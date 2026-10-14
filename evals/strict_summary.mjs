#!/usr/bin/env node
// Strict "zero defects" scoring, matching the a11y-llm-eval report metric:
// a run passes only if EVERY defect check passes (one failure fails the run).
//
// Defect checks = every expectation in a run's grading.json except the two
// process assertions (whether the response reported an automated check, and
// whether it avoided a blanket "fully accessible" claim). Those are reported
// separately because they aren't WCAG defects in the deliverable.
//
// Two views, per configuration:
//   strict_all           zero failures across all defect checks (axe + upstream
//                        + LLM-graded scenario assertions)
//   strict_programmatic  zero failures across axe + "[upstream]" checks only
//                        (the only view comparable for runs without LLM grading)
//
// Usage: node evals/strict_summary.mjs <workspace-dir> [--write]
//   --write   also saves strict_summary.{json,md} in the workspace and adds a
//             note to benchmark.json (if present) so the viewer shows it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, runDirs, writeJson } from "./lib/runs.mjs";

const PROCESS_PREFIXES = [
  "The response reports having run an automated accessibility check",
  "The response does not claim the output is 'fully accessible'",
];
const AXE_PREFIX = "No WCAG (non-best-practice) axe violations";

export const isProcess = (text) => PROCESS_PREFIXES.some((p) => text.startsWith(p));
export const isProgrammatic = (text) => text.startsWith(AXE_PREFIX) || text.startsWith("[upstream] ");

export function summarize(ws) {
  const rows = [];
  for (const { dir, evalName, config } of runDirs(ws)) {
    const grading = path.join(dir, "grading.json");
    if (!fs.existsSync(grading)) continue;
    const defects = readJson(grading).expectations.filter((e) => !isProcess(e.text));
    const prog = defects.filter((e) => isProgrammatic(e.text));
    rows.push({
      eval: evalName,
      config,
      strict_all: defects.every((e) => e.passed),
      strict_programmatic: prog.every((e) => e.passed),
      llm_graded: defects.some((e) => !isProgrammatic(e.text)),
      defects_failed: defects.filter((e) => !e.passed).map((e) => e.text.slice(0, 110)),
    });
  }
  const byCfg = new Map();
  for (const r of rows) byCfg.set(r.config, [...(byCfg.get(r.config) || []), r]);

  const lines = [`# Strict (zero-defect) results: ${path.basename(path.resolve(ws))}`, "", "| config | strict_all | strict_programmatic |", "|---|---|---|"];
  const summary = {};
  for (const cfg of [...byCfg.keys()].sort()) {
    const rs = byCfg.get(cfg);
    const a = rs.filter((r) => r.strict_all).length;
    const p = rs.filter((r) => r.strict_programmatic).length;
    const llm = rs.every((r) => r.llm_graded);
    summary[cfg] = { runs: rs.length, strict_all: a, strict_programmatic: p, llm_graded: llm };
    lines.push(`| ${cfg} | ${a}/${rs.length}${llm ? "" : " (no LLM grading; = programmatic)"} | ${p}/${rs.length} |`);
  }
  lines.push("", "## Runs that fail the strict rule", "");
  for (const r of rows) if (!r.strict_all) lines.push(`- **${r.eval}** (${r.config}): ${r.defects_failed.join("; ")}`);
  return { summary, rows, text: lines.join("\n") };
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith("--"));
  if (args.length !== 1) {
    console.log("Usage: node evals/strict_summary.mjs <workspace-dir> [--write]");
    return 2;
  }
  const ws = args[0];
  const { summary, rows, text } = summarize(ws);
  console.log(text);
  if (argv.includes("--write")) {
    writeJson(path.join(ws, "strict_summary.json"), { summary, runs: rows });
    fs.writeFileSync(path.join(ws, "strict_summary.md"), text + "\n");
    const bm = path.join(ws, "benchmark.json");
    if (fs.existsSync(bm)) {
      const data = readJson(bm);
      const notes = (data.notes || []).filter((n) => !n.startsWith("Strict zero-defect"));
      for (const cfg of Object.keys(summary).sort()) {
        const s = summary[cfg];
        notes.push(`Strict zero-defect pass (${cfg}): ${s.strict_all}/${s.runs} runs (programmatic-only: ${s.strict_programmatic}/${s.runs}). A run fails if any defect check fails; process assertions excluded.`);
      }
      data.notes = notes;
      writeJson(bm, data);
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
