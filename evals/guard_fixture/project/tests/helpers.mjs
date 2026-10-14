// Test helpers: open a page in a real browser, and run axe on it.
// Playwright and axe-core are found from the current folder or NODE_PATH.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

function roots() {
  return [process.cwd(), ...(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)];
}

function load(name) {
  for (const root of roots()) {
    try { return createRequire(path.join(root, "noop.js"))(path.join(root, name)); } catch { /* next */ }
  }
  throw new Error(`cannot find ${name}`);
}

export async function withPage(file, fn) {
  const { chromium } = load("playwright");
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(file)).href);
    await fn(page);
  } finally {
    await browser.close();
  }
}

// Returns the ids of the axe rules that failed. Pass rule ids to run only those rules.
export async function axeViolations(page, ruleIds) {
  const axePath = roots().map((r) => path.join(r, "axe-core", "axe.min.js")).find((p) => fs.existsSync(p));
  if (!axePath) throw new Error("cannot find axe-core");
  await page.evaluate(fs.readFileSync(axePath, "utf8"));
  return page.evaluate(async (rules) => (await window.axe.run(document, rules ? { runOnly: rules } : {})).violations.map((v) => v.id), ruleIds);
}
