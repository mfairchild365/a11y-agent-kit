// Pure rules and the file writing for verify-fix.mjs --record: a small, text-only record of one fix, kept in a folder the project chose.
//
//   <folder>/<id>/run-001/
//     plan.md            the approved plan (when verify-fix was given one)
//     before.report.md   the audit before the change
//     after.report.md    the audit after it
//     verify.json        { version, record: { id, run, generatedAt, gitCommit, signedIn }, result }
//     summary.md         the pull request summary
//     .gitignore         only for a record from a signed-in page: "*", so the folder is not committed by accident
//
// Each verify run is a new run-NNN folder. A run is never overwritten or edited, and the latest is the highest number. The report
// HTML and screenshots are not kept: they are large, they change on every run, and they are where account data from a signed-in page
// is likeliest to end up.

import fs from "node:fs";
import path from "node:path";

export const ID_RULE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// An id becomes a folder name, so it can't be a path: letters, digits, dot, dash and underscore, starting with a letter or digit,
// at most 64 characters, and no "..".
export const validId = (id) => typeof id === "string" && ID_RULE.test(id) && !id.includes("..");

export const runName = (n) => `run-${String(n).padStart(3, "0")}`;
// The number of the next run, given the names already in the id's folder. Anything that isn't run-NNN is ignored.
export function nextRun(names) {
  let max = 0;
  for (const n of names || []) { const m = /^run-([0-9]{3,})$/.exec(n); if (m) max = Math.max(max, Number(m[1])); }
  return max + 1;
}

// The files of one run: [{ name, content }]. result is verify()'s result. generatedAt is an ISO date string.
export function buildRecord({ id, run, result, beforeText, afterText, planText = null, summary, signedIn = false, generatedAt, gitCommit = null }) {
  const files = [];
  if (planText != null) files.push({ name: "plan.md", content: planText });
  files.push({ name: "before.report.md", content: beforeText });
  files.push({ name: "after.report.md", content: afterText });
  files.push({ name: "verify.json", content: JSON.stringify({ version: 1, record: { id, run, generatedAt, gitCommit, signedIn: !!signedIn }, result }, null, 2) + "\n" });
  const note = signedIn ? "> This audit was of a signed-in page, so it may show account data. This folder has a `.gitignore` that keeps it out of version control. Review the reports before you remove it.\n\n" : "";
  files.push({ name: "summary.md", content: `${note}${String(summary).replace(/\n*$/, "")}\n` });
  if (signedIn) files.push({ name: ".gitignore", content: "*\n" });
  return files;
}

// Writes a new run folder for `id` under `folder` and returns { dir, run }. makeFiles(run) returns the run's files once its number is known. Throws an Error with a plain message when it can't. Nothing that
// exists is changed; a run that fails halfway is removed, so there is no half-written record.
export function writeRecord(folder, id, makeFiles) {
  if (!validId(id)) throw new Error(`the record id "${id}" can't be used as a folder name (letters, digits, dot, dash and underscore; start with a letter or digit; at most 64 characters)`);
  const base = path.resolve(folder);
  const idDir = path.join(base, id);
  if (path.dirname(idDir) !== base) throw new Error(`the record id "${id}" would leave the records folder`);
  if (fs.existsSync(base) && !fs.statSync(base).isDirectory()) throw new Error(`${folder} is a file, not a folder`);
  try { fs.mkdirSync(idDir, { recursive: true }); } catch (e) { throw new Error(`can't create ${path.join(folder, id)} (${e.code || e.message})`); }
  for (let attempt = 0; attempt < 50; attempt++) {
    const run = nextRun(fs.readdirSync(idDir));
    const dir = path.join(idDir, runName(run));
    try { fs.mkdirSync(dir); } catch (e) { if (e.code === "EEXIST") continue; throw new Error(`can't create ${dir} (${e.code || e.message})`); }
    try {
      for (const f of makeFiles(run)) fs.writeFileSync(path.join(dir, f.name), f.content, { flag: "wx" });
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw new Error(`can't write the record in ${dir} (${e.code || e.message}); nothing was kept`);
    }
    return { dir, run };
  }
  throw new Error(`can't find a free run number under ${path.join(folder, id)}`);
}

// The latest run's folder for `id`, or null: the one with the highest run number. Its after.report.md is the previous report for a re-check.
export function latestRun(folder, id) {
  if (!validId(id)) return null;
  const idDir = path.join(path.resolve(folder), id);
  if (!fs.existsSync(idDir) || !fs.statSync(idDir).isDirectory()) return null;
  const n = nextRun(fs.readdirSync(idDir)) - 1;
  return n >= 1 ? path.join(idDir, runName(n)) : null;
}
