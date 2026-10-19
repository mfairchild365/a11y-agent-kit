#!/usr/bin/env node
// Tests skills/building-accessible-ui/scripts/snapshot.mjs. The process handling (a script that crashes, hangs,
// prints garbage, or prints too much) runs against stand-in scripts, so it needs no browser. The last part runs
// the real scripts on a before and after page and feeds the two snapshots to verify-fix.
// Usage: node evals/test_snapshot.mjs [--no-browser | --browser-only]   (exits 1 if any case behaves differently than expected)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readScriptOutput, SCRIPTS } from "../skills/building-accessible-ui/scripts/snapshot.mjs";
import { diffSnapshots } from "../skills/building-accessible-ui/scripts/_verify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.join(here, "..", "skills", "building-accessible-ui", "scripts");
const snapshotJs = path.join(scriptsDir, "snapshot.mjs");
const noBrowser = process.argv.includes("--no-browser");
const browserOnly = process.argv.includes("--browser-only");
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-test-"));
const cli = (...args) => spawnSync(process.execPath, [snapshotJs, ...args], { encoding: "utf8", timeout: 120000, env: process.env });
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

if (!browserOnly) {
  // ---- reading one script's output
  const good = JSON.stringify({ findings: [{ id: "b@#2" }, { id: "a@#1" }, { id: "a@#1" }], stopReason: "complete" });
  check("findings become sorted, de-duplicated ids", JSON.stringify(readScriptOutput(good)) === JSON.stringify({ stopReason: "complete", findings: ["a@#1", "b@#2"] }));
  check("the stopReason is passed on as it is", readScriptOutput(JSON.stringify({ findings: [], stopReason: "stop-cap" })).stopReason === "stop-cap");
  check("a log line before the JSON is tolerated", readScriptOutput(`warming up\n${good}\n`).findings.length === 2);
  check("empty output is an error", readScriptOutput("").stopReason === "error");
  check("text that is not JSON is an error", readScriptOutput("Error: boom").stopReason === "error");
  check("JSON that is a list is an error", readScriptOutput("[]").stopReason === "error");
  check("JSON without a stopReason is an error", readScriptOutput(JSON.stringify({ findings: [] })).stopReason === "error");
  check("JSON without findings is an error", readScriptOutput(JSON.stringify({ stopReason: "complete" })).stopReason === "error");
  check("a finding without an id is an error, not a silent drop", readScriptOutput(JSON.stringify({ findings: [{ check: "x" }], stopReason: "complete" })).stopReason === "error");
  check("plain string findings are accepted", JSON.stringify(readScriptOutput(JSON.stringify({ findings: ["x@1"], stopReason: "complete" })).findings) === '["x@1"]');
  check("a failed read never carries findings", readScriptOutput("nope").findings.length === 0);
  check("every one of the six scripts is listed", Object.keys(SCRIPTS).join() === "tree-pass,keyboard-walk,shift-tab-walk,arrow-walk,escape-return,focus-contrast");

  // ---- the process handling, with stand-in scripts
  const fakes = path.join(tmp, "fakes");
  fs.mkdirSync(fakes);
  const fake = (name, body) => fs.writeFileSync(path.join(fakes, `${name}.mjs`), body);
  const okBody = (id, stopReason = "complete") => `console.log(JSON.stringify({ findings: [{ id: ${JSON.stringify(id)} }], stopReason: ${JSON.stringify(stopReason)} }));`;
  const all = { "tree-pass": okBody("t@#1"), "keyboard-walk": okBody("k@#2"), "shift-tab-walk": okBody("s@#3"), "arrow-walk": okBody("a@#4"), "escape-return": okBody("e@#5"), "focus-contrast": okBody("f@#6") };
  for (const [n, b] of Object.entries(all)) fake(n, b);
  const out = path.join(tmp, "out", "snap.json");

  let r = cli("page.html", "--out", out, "--scripts-dir", fakes);
  check("all six scripts succeed: exit 0 and a snapshot of every script", r.status === 0 && Object.keys(readJson(out).scripts).length === 6 && readJson(out).version === 1);
  check("the snapshot lists each script's findings and stopReason", (() => { const s = readJson(out).scripts; return s["keyboard-walk"].findings[0] === "k@#2" && s["tree-pass"].stopReason === "complete"; })());
  check("the output folder is created", fs.existsSync(out));
  check("the snapshot records the target", readJson(out).target === "page.html");

  fake("arrow-walk", "process.exit(3);");
  r = cli("page.html", "--out", out, "--scripts-dir", fakes);
  check("a script that crashes is recorded as an error, the others still run, and the exit is 1", r.status === 1 && readJson(out).scripts["arrow-walk"].stopReason === "error" && readJson(out).scripts["focus-contrast"].findings.length === 1);
  check("a crashed script has no findings", readJson(out).scripts["arrow-walk"].findings.length === 0);

  fake("arrow-walk", "console.log('this is not json');");
  r = cli("page.html", "--out", out, "--scripts-dir", fakes);
  check("a script that prints garbage is recorded as an error", r.status === 1 && readJson(out).scripts["arrow-walk"].stopReason === "error" && /JSON/.test(readJson(out).scripts["arrow-walk"].detail));

  fake("arrow-walk", "setInterval(() => {}, 1000);");
  const started = Date.now();
  r = cli("page.html", "--out", out, "--scripts-dir", fakes, "--script-timeout", "800");
  check("a script that hangs is stopped and recorded as a timeout", r.status === 1 && readJson(out).scripts["arrow-walk"].stopReason === "timeout" && Date.now() - started < 20000);
  check("a script that hangs does not stop the ones after it", readJson(out).scripts["escape-return"].findings[0] === "e@#5");

  fake("arrow-walk", "process.stdout.write('x'.repeat(1024 * 1024)); setTimeout(() => { for (let i = 0; i < 30; i++) process.stdout.write('x'.repeat(1024 * 1024)); }, 10); setInterval(() => {}, 1000);");
  r = cli("page.html", "--out", out, "--scripts-dir", fakes, "--script-timeout", "30000");
  check("a script that prints too much is stopped and recorded as an error", r.status === 1 && readJson(out).scripts["arrow-walk"].stopReason === "error" && /20 MB/.test(readJson(out).scripts["arrow-walk"].detail));

  fs.rmSync(path.join(fakes, "focus-contrast.mjs"));
  r = cli("page.html", "--out", out, "--scripts-dir", fakes);
  check("a missing script is recorded as an error", r.status === 1 && readJson(out).scripts["focus-contrast"].stopReason === "error" && /not in/.test(readJson(out).scripts["focus-contrast"].detail));
  fake("focus-contrast", all["focus-contrast"]);
  fake("arrow-walk", all["arrow-walk"]);

  fake("keyboard-walk", okBody("k@#2", "stop-cap"));
  r = cli("page.html", "--out", out, "--scripts-dir", fakes);
  check("a script that stopped at a cap is still a success, with its stopReason recorded", r.status === 0 && readJson(out).scripts["keyboard-walk"].stopReason === "stop-cap");
  fake("keyboard-walk", all["keyboard-walk"]);

  // flags reach only the scripts that take them
  const echo = (name) => fake(name, `console.log(JSON.stringify({ findings: process.argv.slice(2).map((a) => ({ id: a })), stopReason: "complete" }));`);
  for (const n of Object.keys(all)) echo(n);
  r = cli("http://x/", "--out", out, "--scripts-dir", fakes, "--max-stops", "7", "--max-ms", "900", "--load-timeout", "1234");
  const ids = (n) => readJson(out).scripts[n].findings;
  check("--max-stops goes to the walks and focus-contrast only", ids("keyboard-walk").includes("7") && ids("shift-tab-walk").includes("7") && ids("focus-contrast").includes("7") && !ids("tree-pass").includes("7") && !ids("arrow-walk").includes("7") && !ids("escape-return").includes("7"));
  check("--max-ms goes to every script except tree-pass", ["keyboard-walk", "shift-tab-walk", "arrow-walk", "escape-return", "focus-contrast"].every((n) => ids(n).includes("900")) && !ids("tree-pass").includes("900"));
  check("--load-timeout goes to every script", Object.keys(all).every((n) => ids(n).includes("1234")));
  check("every script gets the target and --json", Object.keys(all).every((n) => ids(n).includes("http://x/") && ids(n).includes("--json")));
  r = cli("http://x/", "--out", out, "--scripts-dir", fakes);
  check("no flag given means none is passed", Object.keys(all).every((n) => !ids(n).includes("--max-ms") && !ids(n).includes("--max-stops")));

  // --only
  for (const [n, b] of Object.entries(all)) fake(n, b);
  r = cli("page.html", "--out", out, "--scripts-dir", fakes, "--only", "tree-pass,arrow-walk");
  check("--only runs just the named scripts", r.status === 0 && Object.keys(readJson(out).scripts).sort().join() === "arrow-walk,tree-pass");
  r = cli("page.html", "--out", out, "--scripts-dir", fakes, "--only", "tree-pass,tree-pass");
  const runLog = path.join(tmp, "runs.log");
  fake("tree-pass", `import fs from "node:fs"; fs.appendFileSync(${JSON.stringify(runLog)}, "run\\n"); ${all["tree-pass"]}`);
  cli("page.html", "--out", out, "--scripts-dir", fakes, "--only", "tree-pass,tree-pass");
  check("a name repeated in --only runs once (a browser run is not free)", fs.readFileSync(runLog, "utf8").trim().split("\n").length === 1);
  fake("tree-pass", all["tree-pass"]);

  // usage errors
  check("no target is a usage error", cli("--out", out).status === 2);
  check("no --out is a usage error", cli("page.html").status === 2);
  check("--only with an unknown name is a usage error", cli("page.html", "--out", out, "--only", "tree-pass,nope", "--scripts-dir", fakes).status === 2);
  check("--only with nothing is a usage error", cli("page.html", "--out", out, "--only", "", "--scripts-dir", fakes).status === 2);
  check("a flag with no value is a usage error", cli("page.html", "--out", out, "--max-ms").status === 2);
  check("a non-numeric cap is a usage error", cli("page.html", "--out", out, "--max-ms", "soon", "--scripts-dir", fakes).status === 2 && cli("page.html", "--out", out, "--script-timeout", "0", "--scripts-dir", fakes).status === 2);
  check("an unwritable --out is a usage error", cli("page.html", "--out", path.join(tmp, "fakes", "tree-pass.mjs", "x.json"), "--scripts-dir", fakes).status === 2);

  // a snapshot feeds the comparison
  const snapA = { version: 1, scripts: { "tree-pass": { stopReason: "complete", findings: ["a@#1"] } } };
  const snapB = { version: 1, scripts: { "tree-pass": { stopReason: "error", findings: [] } } };
  check("a failed script on one side is not comparable, so it is never read as all resolved", (() => { const d = diffSnapshots(snapA, snapB); return d.notComparable.length === 1 && d.resolved.length === 0; })());
}

if (!noBrowser) {
  // ---- the real scripts on a before and after page
  const page = (body) => `<!doctype html><html lang="en"><head><title>t</title></head><body>${body}</body></html>`;
  const beforeHtml = path.join(tmp, "before.html"), afterHtml = path.join(tmp, "after.html");
  fs.writeFileSync(beforeHtml, page('<div id="x" role="button" tabindex="0"></div><a href="#" id="ok">Home</a>'));
  fs.writeFileSync(afterHtml, page('<div id="x" role="button" tabindex="0">Save</div><a href="#" id="ok">Home</a>'));
  const b = path.join(tmp, "b.json"), a = path.join(tmp, "a.json");
  const rb = cli(beforeHtml, "--out", b, "--only", "tree-pass,keyboard-walk");
  const ra = cli(afterHtml, "--out", a, "--only", "tree-pass,keyboard-walk");
  check("real scripts: a snapshot is written for each page", rb.status === 0 && ra.status === 0 && fs.existsSync(b) && fs.existsSync(a));
  const sb = readJson(b), sa = readJson(a);
  check("real scripts: the unnamed button is a finding before and gone after", sb.scripts["keyboard-walk"].findings.some((f) => f.startsWith("focus-no-name@")) && !sa.scripts["keyboard-walk"].findings.some((f) => f.startsWith("focus-no-name@")));
  check("real scripts: both pages ran to completion", sb.scripts["tree-pass"].stopReason === "complete" && sa.scripts["keyboard-walk"].stopReason === "complete");
  check("real scripts: the diff says the finding is resolved and nothing is new", (() => { const d = diffSnapshots(sb, sa); return d.resolved.some((id) => id.startsWith("keyboard-walk:focus-no-name@")) && d.new.length === 0; })());
  check("real scripts: the same page twice gives the same snapshot", (() => { const c = path.join(tmp, "c.json"); cli(beforeHtml, "--out", c, "--only", "tree-pass,keyboard-walk"); const x = readJson(b), y = readJson(c); delete x.target; delete y.target; return JSON.stringify(x) === JSON.stringify(y); })());
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
