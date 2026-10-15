#!/usr/bin/env node
// Runs the six browser scripts against one page and saves a small snapshot of what each one found, so a later
// run (after a fix) can be compared with it by verify-fix.mjs. Cheap, needs no model, and the file is small
// enough to commit.
//
// The scripts: tree-pass, keyboard-walk, shift-tab-walk, arrow-walk, escape-return, focus-contrast. They run one
// after another (each starts its own browser), each as a separate process, so one that crashes or hangs costs
// only its own entry. The snapshot records, per script, the stopReason and the finding ids:
//   { "version": 1, "target": "<url or file>", "scripts": { "<name>": { "stopReason": "...", "findings": ["<id>", ...] } } }
// A script that crashed, printed something unreadable, or ran too long is recorded with stopReason "error" or
// "timeout" and no findings, so the comparison can say "not comparable" instead of "all resolved".
//
// Usage: node snapshot.mjs <url or html file> --out snapshot.json [--only tree-pass,keyboard-walk]
//        [--max-stops 200] [--max-ms 20000] [--load-timeout 15000] [--script-timeout 180000]
//   --max-stops, --max-ms and --load-timeout are passed to the scripts that take them.
//   --script-timeout is the most one script may run, in milliseconds, before it is stopped.
//   --scripts-dir <dir> runs the scripts from another folder (for tests with stand-in scripts).
// Exit: 0 when every script produced a result, 1 when any script failed or timed out (the snapshot is still
// written), 2 on a usage error.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SCRIPTS = {
  "tree-pass": ["--load-timeout"],
  "keyboard-walk": ["--max-stops", "--max-ms", "--load-timeout"],
  "shift-tab-walk": ["--max-stops", "--max-ms", "--load-timeout"],
  "arrow-walk": ["--max-ms", "--load-timeout"],
  "escape-return": ["--max-ms", "--load-timeout"],
  "focus-contrast": ["--max-stops", "--max-ms", "--load-timeout"],
};
const MAX_OUTPUT = 20 * 1024 * 1024;

// What one script's output means: { stopReason, findings, detail? }. Never throws.
export function readScriptOutput(stdout) {
  const text = String(stdout || "").trim();
  let data;
  try { data = JSON.parse(text); } catch {
    const last = text.split(/\r?\n/).filter(Boolean).pop();
    try { data = JSON.parse(last); } catch { return { stopReason: "error", findings: [], detail: "the script did not print JSON" }; }
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.stopReason !== "string" || !Array.isArray(data.findings)) {
    return { stopReason: "error", findings: [], detail: "the script's JSON has no stopReason and findings" };
  }
  const ids = data.findings.map((f) => (typeof f === "string" ? f : f && typeof f.id === "string" ? f.id : null));
  if (ids.some((id) => id === null)) return { stopReason: "error", findings: [], detail: "a finding has no id" };
  return { stopReason: data.stopReason, findings: [...new Set(ids)].sort() };
}

function runScript(file, args, timeoutMs) {
  return new Promise((resolve) => {
    let out = "", err = "", size = 0, done = false, timedOut = false, tooBig = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    let child;
    try { child = spawn(process.execPath, [file, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); }
    catch (e) { return resolve({ stopReason: "error", findings: [], detail: `could not start: ${e.message}` }); }
    const timer = setTimeout(() => { timedOut = true; try { child.kill("SIGKILL"); } catch {} }, timeoutMs);
    child.stdout.on("data", (d) => { size += d.length; if (size > MAX_OUTPUT) { tooBig = true; try { child.kill("SIGKILL"); } catch {} } else out += d; });
    child.stderr.on("data", (d) => { if (err.length < 2000) err += d; });
    child.on("error", (e) => finish({ stopReason: "error", findings: [], detail: `could not start: ${e.message}` }));
    child.on("close", (code) => {
      if (timedOut) return finish({ stopReason: "timeout", findings: [], detail: `stopped after ${timeoutMs} ms` });
      if (tooBig) return finish({ stopReason: "error", findings: [], detail: "the script printed more than 20 MB" });
      const r = readScriptOutput(out);
      if (r.stopReason === "error") return finish({ ...r, detail: `${r.detail}${code ? ` (exit ${code})` : ""}${err.trim() ? `: ${err.trim().split(/\r?\n/)[0].slice(0, 200)}` : ""}` });
      finish(r);
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const VALUE_FLAGS = ["--out", "--only", "--max-stops", "--max-ms", "--load-timeout", "--script-timeout", "--scripts-dir"];
  const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const target = argv.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(argv[i - 1]));
  const usage = (msg) => {
    if (msg) console.error(msg);
    console.error("Usage: node snapshot.mjs <url or html file> --out snapshot.json [--only a,b] [--max-stops 200] [--max-ms 20000] [--load-timeout 15000] [--script-timeout 180000]");
    process.exit(2);
  };
  const out = opt("--out");
  if (!target || !out) usage();
  for (const f of VALUE_FLAGS) if (argv.includes(f) && (argv[argv.indexOf(f) + 1] === undefined || argv[argv.indexOf(f) + 1].startsWith("--"))) usage(`${f} needs a value`);
  const numeric = {};
  for (const f of ["--max-stops", "--max-ms", "--load-timeout"]) {
    if (!argv.includes(f)) continue;
    const n = Number(opt(f));
    if (!(n > 0)) usage(`${f} needs a positive number`);
    numeric[f] = String(n);
  }
  const scriptTimeout = Number(opt("--script-timeout", 180000));
  if (!(scriptTimeout > 0)) usage("--script-timeout needs a positive number");
  const dir = path.resolve(opt("--scripts-dir", path.dirname(fileURLToPath(import.meta.url))));
  let names = Object.keys(SCRIPTS);
  if (argv.includes("--only")) {
    names = opt("--only").split(",").map((s) => s.trim()).filter(Boolean);
    const bad = names.filter((n) => !SCRIPTS[n]);
    if (!names.length || bad.length) usage(`--only takes names from: ${Object.keys(SCRIPTS).join(", ")}${bad.length ? ` (not: ${bad.join(", ")})` : ""}`);
    names = [...new Set(names)];
  }

  const snapshot = { version: 1, target, scripts: {} };
  for (const name of names) {
    const file = path.join(dir, `${name}.mjs`);
    const args = [target, "--json"];
    for (const flag of SCRIPTS[name]) if (numeric[flag]) args.push(flag, numeric[flag]);
    const r = fs.existsSync(file) ? await runScript(file, args, scriptTimeout) : { stopReason: "error", findings: [], detail: `${name}.mjs is not in ${dir}` };
    snapshot.scripts[name] = { stopReason: r.stopReason, findings: r.findings };
    if (r.detail) snapshot.scripts[name].detail = r.detail;
    console.error(`${name}: ${r.stopReason}, ${r.findings.length} finding(s)${r.detail ? ` (${r.detail})` : ""}`);
  }
  try { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n"); }
  catch (e) { usage(`Cannot write ${out}: ${e.code || e.message}`); }
  console.log(`snapshot written to ${out}`);
  process.exit(Object.values(snapshot.scripts).some((s) => s.stopReason === "error" || s.stopReason === "timeout") ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
