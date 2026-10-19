// Shared by tree-pass.mjs and keyboard-walk.mjs: finds Playwright and starts a browser.
//   PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's Chromium.
//   Playwright is found from the current directory or NODE_PATH.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export function toUrl(target) {
  return /^[a-z]+:\/\//i.test(target) ? target : pathToFileURL(path.resolve(target)).href;
}

export function loadPlaywright() {
  const roots = [process.cwd(), ...(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)];
  for (const root of roots) {
    for (const name of ["playwright", "playwright-core"]) {
      try {
        const req = createRequire(path.join(root, fs.existsSync(path.join(root, "package.json")) ? "package.json" : "noop.js"));
        return req(name);
      } catch { /* try the next */ }
      try { return createRequire(path.join(root, "noop.js"))(path.join(root, name)); } catch { /* next */ }
    }
  }
  console.error("Cannot find Playwright. Run from a folder that has it installed, or set NODE_PATH to its node_modules folder.");
  process.exit(2);
}

export async function launch() {
  const { chromium } = loadPlaywright();
  return chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
}
