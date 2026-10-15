#!/usr/bin/env node
// Runs focus-contrast.mjs on the seeded audit page (evals/audit_fixture/index.html), where the two notice links
// have a #6aa6f0 focus ring on two fills (seed "banner-focus-ring"): the script must flag exactly those two,
// at the ratios the audit corrections record (about 2.52:1 on the info fill and 2.59:1 on the error fill), and
// pass every other control. Needs a browser: set NODE_PATH to evals/node_modules, and PW_CHANNEL=msedge (or
// chrome) if Playwright's own Chromium isn't installed.
// Usage: node evals/test_focus_contrast_on_audit_fixture.mjs   (exits 1 if the result differs)

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "skills", "building-accessible-ui", "scripts", "focus-contrast.mjs");
const page = path.join(here, "audit_fixture", "index.html");
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  -> ${detail}` : ""}`); if (!ok) failed++; };

const r = spawnSync(process.execPath, [script, page, "--json"], { encoding: "utf8", timeout: 120000 });
let out = null;
try { out = JSON.parse(r.stdout); } catch { /* reported below */ }
check("the script ran and printed JSON", !!out, (r.stderr || "").split("\n")[0]);
if (out) {
  const flagged = out.controls.filter((c) => c.verdict === "fail");
  const ratios = flagged.map((c) => c.best).sort((a, b) => a - b);
  check("the walk covered the whole page", out.stopReason === "complete" && out.controls.length >= 8, `${out.stopReason}, ${out.controls.length} controls`);
  check("exactly the two notice links are flagged as low contrast", flagged.length === 2 && flagged.every((c) => /a$/.test(c.selector)) && out.findings.length === 2 && out.findings.every((f) => f.id.startsWith("focus-indicator-low-contrast@")), flagged.map((c) => c.selector).join("; "));
  check("their ratios are about 2.52:1 (info fill) and 2.59:1 (error fill), unrounded", ratios.length === 2 && Math.abs(ratios[0] - 2.52) < 0.01 && Math.abs(ratios[1] - 2.59) < 0.01, ratios.map((n) => n.toFixed(4)).join(", "));
  check("every other control passes", out.controls.filter((c) => c.verdict !== "fail").every((c) => c.verdict === "pass" || c.verdict === "ua-default"), out.controls.filter((c) => !["fail", "pass", "ua-default"].includes(c.verdict)).map((c) => `${c.selector}: ${c.verdict}`).join("; "));
}
console.log(`\n${failed ? `${failed} case(s) failed.` : "The seeded page gives the recorded result."}`);
process.exit(failed ? 1 : 0);
