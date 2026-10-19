#!/usr/bin/env node
// Runs every deterministic check in evals/check_fixtures/ against its fixtures and compares the result
// with each fixture's answer key. See evals/check_fixtures/README.md for the layout and rules.
//
// Usage: node evals/run_check_fixtures.mjs [--root DIR] [--check NAME]    (exits 1 on any failure)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
export const KINDS = ["positive", "negative", "edge", "termination"];
const DEFAULT_TIMEOUT_MS = 20000;

// JSON with the keys of every object in sorted order, so two answers that differ only in key order are equal.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const ids = (findings) => (findings || []).map((f) => (typeof f === "string" ? f : f && f.id)).sort();

// Returns [{check, fixture, ok, message}] for one check directory. Problems with the setup itself
// (a missing answer key, a missing kind) are results too, so they fail the run instead of being skipped.
export function runCheck(checkDir, { repo = repoRoot } = {}) {
  const check = path.basename(checkDir);
  const results = [];
  const add = (fixture, ok, message) => results.push({ check, fixture, ok, message });
  let config;
  try { config = JSON.parse(fs.readFileSync(path.join(checkDir, "check.json"), "utf8")); }
  catch (e) { add("check.json", false, `cannot read check.json: ${e.message}`); return results; }
  const skip = config.skipKinds || {};
  for (const [kind, reason] of Object.entries(skip)) {
    if (!KINDS.includes(kind) || typeof reason !== "string" || !reason.trim()) add("check.json", false, `skipKinds.${kind} needs a known kind and a written reason`);
  }
  for (const kind of KINDS) {
    const dir = path.join(checkDir, kind);
    const fixtures = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.endsWith(".expected.json")).sort() : [];
    if (!fixtures.length && !skip[kind]) add(kind, false, `no ${kind} fixtures, and no skipKinds.${kind} reason`);
    for (const file of fixtures) {
      const name = `${kind}/${file}`;
      const keyPath = path.join(dir, file.replace(/\.[^.]+$/, "") + ".expected.json");
      if (!fs.existsSync(keyPath)) { add(name, false, "no answer key (<name>.expected.json)"); continue; }
      let key;
      try { key = JSON.parse(fs.readFileSync(keyPath, "utf8")); } catch (e) { add(name, false, `answer key is not JSON: ${e.message}`); continue; }
      const want = ids(key.findings);
      if (kind === "negative" && want.length) { add(name, false, "a negative fixture's answer key must list no findings"); continue; }
      if (kind === "positive" && !want.length) { add(name, false, "a positive fixture's answer key must list at least one finding"); continue; }
      if (kind === "termination" && !key.stopReason) { add(name, false, "a termination fixture's answer key must name the expected stopReason"); continue; }

      const fixturePath = path.join(dir, file);
      const args = [...(config.args || ["{fixture}"])].map((a) => a.replace("{fixture}", fixturePath));
      const started = Date.now();
      const r = spawnSync(config.command || process.execPath, [path.resolve(repo, config.script), ...args], { cwd: repo, encoding: "utf8", timeout: config.timeoutMs || DEFAULT_TIMEOUT_MS, killSignal: "SIGKILL" });
      if (r.error && r.error.code === "ETIMEDOUT") { add(name, false, `did not terminate within ${config.timeoutMs || DEFAULT_TIMEOUT_MS} ms`); continue; }
      let out;
      try { out = JSON.parse(r.stdout); } catch { add(name, false, `the check did not print JSON (exit ${r.status}). ${(r.stderr || "").split("\n").find((l) => l.trim()) || ""}`); continue; }
      const got = ids(out.findings);
      const missing = want.filter((id) => !got.includes(id));
      const extra = got.filter((id) => !want.includes(id));
      const problems = [];
      if (missing.length) problems.push(`missed: ${missing.join(", ")}`);
      if (extra.length) problems.push(`unexpected (false positive): ${extra.join(", ")}`);
      if (!missing.length && !extra.length && JSON.stringify(got) !== JSON.stringify(want)) problems.push(`same ids but different counts (expected ${want.length}, got ${got.length})`);
      if (key.fields !== undefined) {
        if (!key.fields || typeof key.fields !== "object" || Array.isArray(key.fields)) problems.push("the answer key's fields must be an object");
        else for (const [name, want] of Object.entries(key.fields)) if (canon(out[name]) !== canon(want)) problems.push(`${name}: expected ${canon(want)}, got ${canon(out[name])}`);
      }
      if (key.stopReason && out.stopReason !== key.stopReason) problems.push(`stopReason ${JSON.stringify(out.stopReason)}, expected ${JSON.stringify(key.stopReason)}`);
      add(name, !problems.length, problems.length ? problems.join("; ") : `${got.length} finding(s)${out.stopReason ? `, stopReason ${out.stopReason}` : ""} in ${Date.now() - started} ms`);
    }
  }
  return results;
}

export function runAll(root, { only, repo } = {}) {
  const dirs = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("_") && (!only || e.name === only)).map((e) => path.join(root, e.name)) : [];
  return dirs.flatMap((d) => runCheck(d, { repo }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const results = runAll(path.resolve(opt("--root") || path.join(here, "check_fixtures")), { only: opt("--check") });
  if (!results.length) { console.log("No checks are registered under evals/check_fixtures/ yet."); process.exit(0); }
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check}/${r.fixture}  ${r.message}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} fixtures behaved as expected.`);
  process.exit(failed ? 1 : 0);
}
