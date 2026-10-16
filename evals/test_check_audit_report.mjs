#!/usr/bin/env node
// Tests evals/check_audit_report.mjs itself: the good sample report must pass every check, the broken one
// must fail the checks it was built to fail, and breaking the good sample in one way at a time must fail
// exactly the check that guards that thing. Skips the axe check, so no browser is needed.
// Usage: node evals/test_check_audit_report.mjs   (exits 1 if the checker misjudges any case)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(here, "check_audit_report.mjs");
const sample = path.join(here, "audit_fixture", "sample");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-audit-"));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

function score(dir, digest, previous) {
  const r = spawnSync(process.execPath, [checker, dir, "--digest", digest, "--skip-axe", "--json", ...(previous ? ["--previous", previous] : [])], { encoding: "utf8" });
  let out;
  try { out = JSON.parse(r.stdout); } catch { return { crashed: true, stderr: r.stderr, failedNames: [] }; }
  return { crashed: false, failedNames: out.results.filter((x) => !x.ok).map((x) => x.name), out };
}
// Copies the good sample, applies edits to report.md and digest.md, and returns the checks that failed.
let n = 0;
function mutate(edit, previous) {
  const dir = path.join(tmp, `m${++n}`);
  fs.cpSync(path.join(sample, "good"), dir, { recursive: true });
  const files = { report: path.join(dir, "report.md"), digest: path.join(dir, "digest.md") };
  const text = { report: fs.readFileSync(files.report, "utf8").replace(/\r\n/g, "\n"), digest: fs.readFileSync(files.digest, "utf8").replace(/\r\n/g, "\n") };
  edit(text);
  fs.writeFileSync(files.report, text.report);
  fs.writeFileSync(files.digest, text.digest);
  return score(dir, files.digest, previous);
}
// A re-check of the good sample: the previous report is the good one; this one has the Close button card removed.
const PREVIOUS = path.join(sample, "good", "report.md");
const dropClose = (t) => { t.report = t.report.replace(/### Element: Close button[^]*?(?=### Element:|## Minor issues)/, ""); };
const recheck = (sinceText, digestText, { dropSection = false } = {}) => mutate((t) => {
  dropClose(t);
  if (!dropSection) t.report = t.report.replace("## Findings", `## Since the last audit\n\n${sinceText}\n\n## Findings`);
  if (digestText) t.digest = t.digest.replace("Checks:", `Since the last audit: ${digestText}\nChecks:`);
}, PREVIOUS);
const recheckFails = (r) => r.failedNames.filter((f) => /^(A re-check|Since the last audit|Digest has a 'Since)/.test(f));
const only = (r, ...names) => !r.crashed && r.failedNames.length === names.length && names.every((x) => r.failedNames.some((f) => f.startsWith(x)));

const good = score(path.join(sample, "good"), path.join(sample, "good", "digest.md"));
check("the good sample passes every check", !good.crashed && good.failedNames.length === 0);

const broken = score(path.join(sample, "broken"), path.join(sample, "broken", "digest.md"));
const brokenFails = (start) => broken.failedNames.some((f) => f.startsWith(start));
check("the broken sample fails the checks for a missing Triage line and missing Guards", !broken.crashed && ["Summary has a Triage line", "Triage gives every numbered issue", "Every full card has a Guard", "Digest has a Triage line", "Digest has a Guards line"].every(brokenFails));

check("a card with no Guard fails only the Guard check", only(mutate((t) => { t.report = t.report.replace(/- \*\*Guard:\*\*[^\n]*\n/, ""); t.digest = t.digest.replace("11 automatable", "10 automatable"); }), "Every full card has a Guard"));
check("a Guard that is neither automatable nor manual fails the Guard check", only(mutate((t) => { t.report = t.report.replace("**Guard:** automatable:", "**Guard:** maybe:"); t.digest = t.digest.replace("11 automatable", "10 automatable"); }), "Every full card has a Guard"));
check("an issue missing from Triage fails the Triage check", only(mutate((t) => { t.report = t.report.replace(" #19", ""); t.digest = t.digest.replace(" #19", ""); }), "Triage gives every numbered issue"));
check("an issue triaged twice fails the Triage check", only(mutate((t) => { t.report = t.report.replace("Investigate #16", "Investigate #16 #1"); t.digest = t.digest.replace("investigate #16", "investigate #16 #1"); }), "Triage gives every numbered issue"));
check("a Needs verification issue that is not Investigate fails", only(mutate((t) => { t.report = t.report.replace("Ticket #2 #7", "Ticket #16 #2 #7").replace("Investigate #16", "Investigate"); t.digest = t.digest.replace("ticket #2 #7", "ticket #16 #2 #7").replace("investigate #16", "investigate"); }), "Every Needs verification issue is triaged as Investigate"));
check("a Summary with no Triage line fails the Triage checks", (() => { const r = mutate((t) => { t.report = t.report.replace(/- \*\*Triage:\*\*[^\n]*\n/, ""); }); return !r.crashed && r.failedNames.some((f) => f.startsWith("Summary has a Triage line")); })());
check("a digest Triage that differs from the report fails only the digest check", only(mutate((t) => { t.digest = t.digest.replace("fix now #1", "fix now"); }), "Digest has a Triage line"));
check("a digest with no Guards line fails only that check", only(mutate((t) => { t.digest = t.digest.replace(/Guards:[^\n]*\n/, ""); }), "Digest has a Guards line"));
check("a Caller note after the digest, even one that mentions the Fix first list, is not part of the digest", mutate((t) => { t.digest += "\nCaller: relay this digest as it is, and don't repeat the Fix first list.\n"; }).failedNames.length === 0);
check("a second Fix first list in the digest still fails, Caller note or not", only(mutate((t) => { t.digest += "\n**Fix first**\n1. again\n\nCaller: relay it.\n"; }), "Digest has one Fix first list"));
check("a digest whose Guards counts are wrong fails only that check", only(mutate((t) => { t.digest = t.digest.replace("11 automatable, 1 manual", "12 automatable, 0 manual"); }), "Digest has a Guards line"));
check("a 'Since the last audit' section is allowed", (() => { const r = mutate((t) => { t.report = t.report.replace("## Findings", "## Since the last audit\n\nresolved 1 · still open 19 · new 0\n\n## Findings"); }); return !r.crashed && r.failedNames.length === 0; })());
check("a re-check with the right counts in the section and the digest passes the re-check checks", recheckFails(recheck("resolved 1 · still open 19 · new 0", "resolved 1 · still open 19 · new 0")).length === 0);
check("a re-check with no 'Since the last audit' section fails that check", recheckFails(recheck("", "resolved 1 · still open 19 · new 0", { dropSection: true })).some((f) => f.startsWith("A re-check has")));
check("a re-check whose counts disagree with compare-reports fails the counts check", recheckFails(recheck("resolved 3 · still open 17 · new 0", "resolved 3 · still open 17 · new 0")).some((f) => f.startsWith("Since the last audit gives")));
check("a re-check whose digest line disagrees with the report fails the digest check", recheckFails(recheck("resolved 1 · still open 19 · new 0", "resolved 0 · still open 20 · new 0")).some((f) => f.startsWith("Digest has a 'Since")));
check("a re-check with no digest line fails the digest check", recheckFails(recheck("resolved 1 · still open 19 · new 0", "")).some((f) => f.startsWith("Digest has a 'Since")));
check("without --previous the Since the last audit checks do not run", !good.failedNames.some((f) => /re-check|Since the last audit/i.test(f)));
check("generic test advice in Out of scope fails", only(mutate((t) => { t.report = t.report.replace("## Out of scope\n", "## Out of scope\n\nMaintainer notes: add more unit tests.\n"); }), "Out of scope mentions tests"));
check("a test note that cites an issue number is allowed", (() => { const r = mutate((t) => { t.report = t.report.replace("## Out of scope\n", "## Out of scope\n\nMaintainer notes: the suite runs axe on isolated components only, so #3 and #5 can't surface there.\n"); }); return !r.crashed && r.failedNames.length === 0; })());
check("some other extra section still fails", only(mutate((t) => { t.report = t.report.replace("## Findings", "## Appendix\n\ntext\n\n## Findings"); }), "Only the template's sections appear"));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "The checker judged every case correctly."}`);
process.exit(failed ? 1 : 0);
