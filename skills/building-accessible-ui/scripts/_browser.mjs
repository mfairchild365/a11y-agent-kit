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

// --storage-state <file>: run the page signed in, with a Playwright storage state (cookies and local storage), which a project that tests
// with Playwright usually already saves from its own sign-in. Use the project's file. Don't create one by putting credentials in a file for
// this. The file is read by Playwright and by nothing else here: it is never printed, copied or written. A missing, unreadable or wrong file
// is a usage error (exit 2) that names the file and never shows what is in it. Call this before launching a browser.
export function contextOptions(argv) {
  const i = argv.indexOf("--storage-state");
  if (i < 0) return {};
  const fail = (message) => { console.error(message); process.exit(2); };
  const file = argv[i + 1];
  if (!file || file.startsWith("--")) fail("--storage-state needs the path of a Playwright storage state file");
  const full = path.resolve(file);
  let text;
  try { text = fs.readFileSync(full, "utf8"); } catch (e) { fail(`--storage-state: cannot read ${file} (${e.code || "error"})`); }
  let data;
  try { data = JSON.parse(text); } catch { fail(`--storage-state: ${file} is not JSON, so it is not a Playwright storage state`); }
  if (!data || typeof data !== "object" || Array.isArray(data) || !(Array.isArray(data.cookies) || Array.isArray(data.origins))) {
    fail(`--storage-state: ${file} is not a Playwright storage state (it needs a "cookies" or an "origins" list)`);
  }
  return { storageState: full };
}
