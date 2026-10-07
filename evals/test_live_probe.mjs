#!/usr/bin/env node
// Tests skills/building-accessible-ui/scripts/live-region-probe.mjs against live_fixture/patterns.html.
// Needs a browser and Playwright: run outside the Claude Code sandbox, with PW_CHANNEL=msedge (or chrome)
// if Playwright's own Chromium isn't installed.
//
// Usage: node evals/test_live_probe.mjs        (exits 1 if any pattern is classed differently than expected)

import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const probe = path.join(here, "..", "skills", "building-accessible-ui", "scripts", "live-region-probe.mjs");
const page = path.join(here, "live_fixture", "patterns.html");

// each case: the button to click, and what the probe must report (classes in order, plus fields to check)
const cases = [
  { id: "transient", classes: ["transient"], expect: (m) => m[0].existedBeforeTheAction && m[0].exposedToAT && m[0].level === "polite" && typeof m[0].dwellMs === "number" && m[0].dwellMs < 500 },
  { id: "inserted", classes: ["inserted-with-text"], expect: (m) => !m[0].existedBeforeTheAction },
  { id: "hidden", classes: ["hidden-region"], expect: (m) => m[0].exposedToAT === false },
  { id: "refill", classes: ["present"], expect: (m) => m[0].mutationsInSameTask >= 2 },
  { id: "plain-text", classes: ["no-live-region"], expect: () => true },
  { id: "persist", classes: ["present"], expect: (m) => m[0].existedBeforeTheAction && m[0].exposedToAT },
  { id: "alert", classes: ["present"], expect: (m) => m[0].level === "assertive" },
  { id: "replace", classes: ["transient", "present"], expect: (m) => m[0].text === "Loading..." && m[1].text === "5 results" },
  { id: "shadow-open", classes: ["present"], expect: (m) => m[0].text === "Open shadow message" },
  { id: "shadow-closed", classes: ["present"], expect: (m) => m[0].text === "Closed shadow message" },
];

let failed = 0;
for (const c of cases) {
  const r = spawnSync(process.execPath, [probe, page, "--click", "#" + c.id, "--wait", "800", "--json"], { encoding: "utf8", cwd: here });
  let out;
  try { out = JSON.parse(r.stdout); } catch { console.log(`FAIL  ${c.id}: the probe did not return JSON. ${(r.stderr || "").split("\n").find((l) => l.trim()) || ""}`); failed++; continue; }
  const got = out.messages.map((m) => m.class);
  const okClasses = JSON.stringify(got) === JSON.stringify(c.classes);
  const okExtra = okClasses && c.expect(out.messages);
  console.log(`${okClasses && okExtra ? "PASS" : "FAIL"}  ${c.id.padEnd(14)} classes: ${got.join(", ") || "none"}${okClasses && !okExtra ? "  (the class is right, but a detail check failed)" : ""}${okClasses ? "" : `  (expected ${c.classes.join(", ")})`}`);
  if (!(okClasses && okExtra)) failed++;
}
console.log(`\n${cases.length - failed} of ${cases.length} patterns classed as expected.`);
process.exit(failed ? 1 : 0);
