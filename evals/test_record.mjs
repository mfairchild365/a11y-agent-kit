#!/usr/bin/env node
// Tests verify-fix.mjs --record and _record.mjs: the text record of one fix. No browser, no model.
// Usage: node evals/test_record.mjs   (exits 1 if any case behaves differently than expected)

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRecord, latestRun, nextRun, runName, validId, writeRecord } from "../skills/building-accessible-ui/scripts/_record.mjs";
import { afterReport } from "./check_fix_verify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const verifyFix = path.join(here, "..", "skills", "building-accessible-ui", "scripts", "verify-fix.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "record-test-"));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const read = (p) => fs.readFileSync(p, "utf8");
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

// ---- ids
check("ordinary ids are accepted", ["IP-12345", "audit-settings-2026-03-04", "a", "A.b_c-1", "7"].every(validId));
check("ids that are paths, hidden, spaced or too long are refused", ["", " ", ".", "..", "../x", "a/b", "a\\b", ".hidden", "-x", "a b", "a..b", "x\n", "a".repeat(65), null, 5, undefined].every((id) => !validId(id)));
check("64 characters is the limit", validId("a".repeat(64)) && !validId("a".repeat(65)));

// ---- run numbers
check("the first run is 1", nextRun([]) === 1 && nextRun(undefined) === 1);
check("the next run follows the highest, gaps and all", nextRun(["run-001"]) === 2 && nextRun(["run-001", "run-003"]) === 4);
check("names that aren't run-NNN are ignored", nextRun(["run-1", "notes.md", "run-abc", ".gitignore", "run-0010"]) === 11);
check("a short number is not a run name (it would otherwise raise the next run)", nextRun(["run-1", "run-20"]) === 1);
check("the next run follows the highest even when the names are out of order", nextRun(["run-003", "run-001"]) === 4 && nextRun(["run-002", "run-010", "run-004"]) === 11);
check("run names are padded to three digits and grow past 999", runName(7) === "run-007" && runName(42) === "run-042" && runName(1000) === "run-1000" && nextRun(["run-999"]) === 1000);

// ---- what a run holds
const result = { verdict: "fixed", targets: [], findings: [] };
const base = { id: "T-1", run: 2, result, beforeText: "BEFORE\n", afterText: "AFTER\n", summary: "SUMMARY", generatedAt: "2026-01-01T00:00:00.000Z", gitCommit: "abc1234" };
let files = buildRecord(base);
check("a run holds the two reports, verify.json and the summary, and nothing else", files.map((f) => f.name).join() === "before.report.md,after.report.md,verify.json,summary.md");
check("the reports are kept exactly as given", files.find((f) => f.name === "before.report.md").content === "BEFORE\n" && files.find((f) => f.name === "after.report.md").content === "AFTER\n");
const vj = JSON.parse(files.find((f) => f.name === "verify.json").content);
check("verify.json is versioned, names the run, the date and the commit, and carries the result", vj.version === 1 && vj.record.id === "T-1" && vj.record.run === 2 && vj.record.generatedAt === base.generatedAt && vj.record.gitCommit === "abc1234" && vj.record.signedIn === false && vj.result.verdict === "fixed");
check("a plan is kept first when there is one", buildRecord({ ...base, planText: "PLAN\n" })[0].name === "plan.md" && buildRecord({ ...base, planText: "PLAN\n" })[0].content === "PLAN\n");
check("an empty plan is still a plan, a missing one is not", buildRecord({ ...base, planText: "" })[0].name === "plan.md" && buildRecord({ ...base, planText: null })[0].name !== "plan.md");
check("an unsigned run has no .gitignore and no warning in its summary", !files.some((f) => f.name === ".gitignore") && files.find((f) => f.name === "summary.md").content === "SUMMARY\n");
files = buildRecord({ ...base, signedIn: true });
check("a signed-in run gets a .gitignore that ignores everything, a warning in its summary, and signedIn in verify.json", files.find((f) => f.name === ".gitignore").content === "*\n" && /signed-in page/.test(files.find((f) => f.name === "summary.md").content) && files.find((f) => f.name === "summary.md").content.endsWith("SUMMARY\n") && JSON.parse(files.find((f) => f.name === "verify.json").content).record.signedIn === true);

// ---- writing it
const rec = path.join(tmp, "records");
const make = (run) => buildRecord({ ...base, run });
let w1 = writeRecord(rec, "T-1", make);
check("the first write makes <folder>/<id>/run-001, creating the folders", w1.run === 1 && path.basename(w1.dir) === "run-001" && fs.existsSync(path.join(w1.dir, "verify.json")) && JSON.parse(read(path.join(w1.dir, "verify.json"))).record.run === 1);
const h1 = sha(path.join(w1.dir, "verify.json"));
let w2 = writeRecord(rec, "T-1", make), w3 = writeRecord(rec, "T-1", make);
check("later writes are new runs, and an earlier run is never touched", w2.run === 2 && w3.run === 3 && sha(path.join(w1.dir, "verify.json")) === h1 && JSON.parse(read(path.join(w3.dir, "verify.json"))).record.run === 3);
check("another id gets its own folder, starting at run-001", writeRecord(rec, "T-2", make).run === 1);
check("the latest run is the highest number, and stray names don't count", (fs.mkdirSync(path.join(rec, "T-1", "notes")), latestRun(rec, "T-1") === w3.dir));
check("an id whose folder holds no runs has no latest run", (fs.mkdirSync(path.join(rec, "empty-id")), fs.writeFileSync(path.join(rec, "empty-id", "notes.md"), "x"), latestRun(rec, "empty-id") === null));
check("an id with no record has no latest run; a bad id has none either", latestRun(rec, "T-9") === null && latestRun(rec, "../x") === null && latestRun(path.join(tmp, "nowhere"), "T-1") === null);
check("a path-like id never finds a run outside the records folder, even when one exists there", (fs.mkdirSync(path.join(tmp, "T-1", "run-001"), { recursive: true }), latestRun(rec, "../T-1") === null && latestRun(rec, "..") === null));
check("a bad id is refused and nothing is created", throws(() => writeRecord(rec, "../x", make), /can't be used as a folder name/) && !fs.existsSync(path.join(tmp, "x")) && throws(() => writeRecord(rec, "a/b", make)));
const aFile = path.join(tmp, "afile");
fs.writeFileSync(aFile, "x");
check("a folder that is a file is refused, and the file is untouched", throws(() => writeRecord(aFile, "T-1", make), /is a file/) && read(aFile) === "x");
const before = fs.readdirSync(path.join(rec, "T-2")).join();
check("a write that fails halfway removes its run, so there is no half record", throws(() => writeRecord(rec, "T-2", () => [{ name: "a.md", content: "1" }, { name: "a.md", content: "2" }]), /nothing was kept/) && fs.readdirSync(path.join(rec, "T-2")).join() === before);
check("files that fail to build also leave nothing behind", throws(() => writeRecord(rec, "T-2", () => { throw new Error("boom"); }), /nothing was kept/) && fs.readdirSync(path.join(rec, "T-2")).join() === before);
check("the run number after a failed write is the one that failed (it is reused, not skipped)", writeRecord(rec, "T-2", make).run === 2);

// ---- the command
const guard = path.join(here, "guard_fixture");
const beforeReport = path.join(tmp, "before.md"), afterReportFile = path.join(tmp, "after.md"), plan = path.join(tmp, "plan.md"), changed = path.join(tmp, "changed.txt");
fs.writeFileSync(beforeReport, read(path.join(guard, "project", "report.md")));
fs.writeFileSync(afterReportFile, afterReport(read(path.join(guard, "project", "report.md")), ["button", "contrast"]));
fs.copyFileSync(path.join(guard, "plans", "approved-normal.md"), plan);
fs.writeFileSync(changed, "tests/guards.test.mjs\n");
const run = (args) => spawnSync(process.execPath, [verifyFix, beforeReport, afterReportFile, ...args], { encoding: "utf8", cwd: tmp });
const common = ["--plan", plan, "--changed-files", changed];
const folder = path.join(tmp, "out");

let r = run([...common, "--record", folder, "--id", "IP-1"]);
const dir1 = path.join(folder, "IP-1", "run-001");
check("--record writes run-001, says where, and the verdict is still printed", r.status === 0 && /^verdict: /m.test(r.stdout) && r.stderr.includes("Record written to") && fs.existsSync(dir1));
check("the record holds the plan, both reports exactly, verify.json and the summary", ["plan.md", "before.report.md", "after.report.md", "verify.json", "summary.md"].every((n) => fs.existsSync(path.join(dir1, n))) && read(path.join(dir1, "before.report.md")) === read(beforeReport) && read(path.join(dir1, "after.report.md")) === read(afterReportFile) && read(path.join(dir1, "plan.md")) === read(plan));
const json = JSON.parse(run([...common, "--format", "json"]).stdout);
check("verify.json's result is the same as --format json", JSON.stringify(JSON.parse(read(path.join(dir1, "verify.json"))).result) === JSON.stringify(json));
check("summary.md is the --format pr summary", read(path.join(dir1, "summary.md")) === run([...common, "--format", "pr"]).stdout.replace(/\n*$/, "\n"));
check("no .gitignore for a page that was not signed in", !fs.existsSync(path.join(dir1, ".gitignore")) && JSON.parse(read(path.join(dir1, "verify.json"))).record.signedIn === false);
const meta = JSON.parse(read(path.join(dir1, "verify.json"))).record;
check("the record names the id, the run, a recent ISO date, and a commit or null", meta.id === "IP-1" && meta.run === 1 && Math.abs(Date.now() - Date.parse(meta.generatedAt)) < 60000 && (meta.gitCommit === null || typeof meta.gitCommit === "string"));
const h = sha(path.join(dir1, "verify.json"));
r = run([...common, "--record", folder, "--id", "IP-1"]);
check("a second run is run-002 and the first is untouched", r.status === 0 && fs.existsSync(path.join(folder, "IP-1", "run-002")) && sha(path.join(dir1, "verify.json")) === h);
r = run(["--target", "4.1.2|Close button", "--target", '1.4.3|"New" badge', "--record", folder, "--id", "no-plan"]);
check("with --target and no plan file there is no plan.md", r.status === 0 && fs.existsSync(path.join(folder, "no-plan", "run-001", "verify.json")) && !fs.existsSync(path.join(folder, "no-plan", "run-001", "plan.md")));

// the flags
check("--record without --id is a usage error that says --id is needed, and writes nothing", (() => { const r0 = run([...common, "--record", path.join(tmp, "x1")]); return r0.status === 2 && /needs --id/.test(r0.stderr) && !fs.existsSync(path.join(tmp, "x1")); })());
check("--id without --record is a usage error", run([...common, "--id", "T-1"]).status === 2);
check("--record with no folder is a usage error", run([...common, "--record"]).status === 2 && run([...common, "--record", "--id", "T-1"]).status === 2);
r = run([...common, "--record", path.join(tmp, "x2"), "--id", "../escape"]);
check("an id that is a path is refused before anything runs, and nothing is created", r.status === 2 && /can't be used as a folder name/.test(r.stderr) && !fs.existsSync(path.join(tmp, "x2")) && !fs.existsSync(path.join(tmp, "escape")));
r = run(["--target", "nonsense", "--record", path.join(tmp, "x3"), "--id", "T-3"]);
check("a run that verified nothing (bad targets) is not recorded, and says so", /Not recorded: nothing was verified \(invalid-targets\)/.test(r.stderr) && !fs.existsSync(path.join(tmp, "x3")));
fs.writeFileSync(path.join(tmp, "junk.md"), "this is not an audit report\n");
r = spawnSync(process.execPath, [verifyFix, path.join(tmp, "junk.md"), path.join(tmp, "junk.md"), ...common, "--record", path.join(tmp, "x4"), "--id", "T-4"], { encoding: "utf8" });
check("reports that can't be read as audits are not recorded either", /Not recorded: nothing was verified \(unparseable\)/.test(r.stderr) && !fs.existsSync(path.join(tmp, "x4")));
r = run([...common, "--record", aFile, "--id", "T-5"]);
check("a record that can't be written is an error (exit 2), after the verdict was printed", r.status === 2 && /^verdict: /m.test(r.stdout) && /Could not write the record/.test(r.stderr));
r = run(["--target", "1.4.1|Notices", "--strict", "--record", folder, "--id", "strict"]);
check("--strict still decides the exit code, and the record is written either way", r.status === 1 && fs.existsSync(path.join(folder, "strict", "run-001", "verify.json")));

// signed in
r = run([...common, "--record", folder, "--id", "signed", "--signed-in"]);
const dirS = path.join(folder, "signed", "run-001");
check("--signed-in: the run has a .gitignore, says so in its summary and verify.json, and warns on stderr", r.status === 0 && read(path.join(dirS, ".gitignore")) === "*\n" && /signed-in page/.test(read(path.join(dirS, "summary.md"))) && JSON.parse(read(path.join(dirS, "verify.json"))).record.signedIn === true && /signed-in page/.test(r.stderr));
const snapA = path.join(tmp, "a.snapshot.json"), snapB = path.join(tmp, "b.snapshot.json");
const SECRET = "C:/secret/state.json-TOKEN-12345";
fs.writeFileSync(snapA, JSON.stringify({ version: 1, target: SECRET, signedIn: true, scripts: {} }));
fs.writeFileSync(snapB, JSON.stringify({ version: 1, scripts: {} }));
r = run([...common, "--before-snapshot", snapB, "--after-snapshot", snapA, "--record", folder, "--id", "snap-signed"]);
check("a snapshot that says it ran signed in makes the record signed in, with no flag", fs.existsSync(path.join(folder, "snap-signed", "run-001", ".gitignore")) && JSON.parse(read(path.join(folder, "snap-signed", "run-001", "verify.json"))).record.signedIn === true);
check("nothing from a snapshot's own fields is copied into the record", fs.readdirSync(path.join(folder, "snap-signed", "run-001")).filter((n) => n !== ".gitignore").every((n) => !read(path.join(folder, "snap-signed", "run-001", n)).includes(SECRET)));
fs.writeFileSync(snapA, JSON.stringify({ version: 1, signedIn: false, scripts: {} }));
r = run([...common, "--before-snapshot", snapB, "--after-snapshot", snapA, "--record", folder, "--id", "snap-plain"]);
check("a snapshot with signedIn false does not", !fs.existsSync(path.join(folder, "snap-plain", "run-001", ".gitignore")));

// the .gitignore really works
const repo = path.join(tmp, "repo");
fs.mkdirSync(repo);
const git = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
if (git("init", "-q").status === 0) {
  const runIn = (args) => spawnSync(process.execPath, [verifyFix, beforeReport, afterReportFile, ...common, ...args], { encoding: "utf8", cwd: repo });
  runIn(["--record", "records", "--id", "plain"]);
  runIn(["--record", "records", "--id", "signed", "--signed-in"]);
  const status = git("status", "--porcelain", "-uall").stdout;
  check("in a git repository, a plain record shows up as new files to commit", /records\/plain\/run-001\/verify\.json/.test(status));
  check("outside any commit the record has no commit (null)", JSON.parse(read(path.join(repo, "records", "plain", "run-001", "verify.json"))).record.gitCommit === null);
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "start");
  runIn(["--record", "records", "--id", "after-commit"]);
  const head = git("rev-parse", "--short", "HEAD").stdout.trim();
  check("in a repository with a commit, the record names it", head.length > 0 && JSON.parse(read(path.join(repo, "records", "after-commit", "run-001", "verify.json"))).record.gitCommit === head);
  check("in a git repository, a signed-in record is ignored", !/records\/signed/.test(status) && git("check-ignore", "records/signed/run-001/after.report.md").status === 0);
} else check("git is not available here, so the .gitignore check was skipped", true);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
