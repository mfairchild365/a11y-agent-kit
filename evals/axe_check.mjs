#!/usr/bin/env node
// Runs axe-core against a single HTML file and reports WCAG vs best-practice
// violations separately. This is the base-layer, skill-agnostic accessibility
// check every eval gets, independent of the scenario-specific assertions in
// evals.json and the upstream behavioral checks in grade_upstream.py.
//
// Usage: node axe_check.mjs <path-to-html-file>
// Prints one JSON object to stdout: { wcag: [...], bp: [...] }
// Exits 1 if there are any non-best-practice (WCAG) violations, else 0.

import { chromium } from "playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const axeSource = createRequire(import.meta.url)("axe-core").source;

const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error("Usage: node axe_check.mjs <path-to-html-file>");
  process.exit(2);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.resolve(htmlPath)).href, { waitUntil: "load" });
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => await window.axe.run());

  const wcag = results.violations.filter((v) => !v.tags.includes("best-practice"));
  const bp = results.violations.filter((v) => v.tags.includes("best-practice"));

  const summarize = (v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.map((n) => n.target),
  });

  console.log(JSON.stringify({ wcag: wcag.map(summarize), bp: bp.map(summarize) }, null, 2));
  process.exit(wcag.length > 0 ? 1 : 0);
} finally {
  await browser.close();
}
