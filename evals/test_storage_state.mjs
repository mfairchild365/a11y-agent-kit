#!/usr/bin/env node
// Tests `--storage-state <file>` on the browser scripts and on snapshot.mjs: a Playwright storage state (cookies and local storage) lets a
// script see a page that needs a sign-in. A tiny local server stands in for the app: its page shows the signed-in content only when the
// request carries the session cookie. Needs Playwright and a browser (NODE_PATH=evals/node_modules; PW_CHANNEL=msedge or chrome if Chromium
// isn't installed). Nothing here calls a model.
// Usage: node evals/test_storage_state.mjs   (exits 1 if any case behaves differently than expected)

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.join(here, "..", "skills", "building-accessible-ui", "scripts");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "storage-state-test-"));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

// The "app": a sign-in page, and a signed-in page with a button that has no name (#secret) and a status message on click.
const SIGNED_IN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Account</title></head><body><main><h1>Account</h1>
<button id="secret" type="button" onclick="document.getElementById('s').textContent='Saved'"><svg width="10" height="10" aria-hidden="true"></svg></button>
<div id="s" role="status"></div>
<div id="tabs" role="tablist" aria-label="Sections"><button role="tab" aria-selected="true" tabindex="0">One</button><button role="tab" aria-selected="false" tabindex="-1">Two</button></div>
<button id="opener" type="button" aria-haspopup="dialog" onclick="document.getElementById('dlg').showModal()">Open settings</button>
<dialog id="dlg"><p>Settings</p><button type="button" onclick="this.closest('dialog').close()">Close</button></dialog></main></body></html>`;
// What shows that a script saw the signed-in page: the scripts that list widgets or triggers name those; the rest name the unnamed button.
const MARKER = { "tree-pass": "#secret", "keyboard-walk": "#secret", "shift-tab-walk": "#secret", "focus-contrast": "#secret", "arrow-walk": "#tabs", "escape-return": "#opener" };
const SIGNED_OUT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign in</title></head><body><main><h1>Sign in</h1><a href="/login">Sign in</a></main></body></html>`;
// The server runs in its own process: the scripts are started with spawnSync, which would block a server in this one.
const serverFile = path.join(tmp, "server.mjs");
fs.writeFileSync(serverFile, `import http from "node:http";
const SIGNED_IN = ${JSON.stringify(SIGNED_IN)}, SIGNED_OUT = ${JSON.stringify(SIGNED_OUT)};
const server = http.createServer((req, res) => {
  const ok = (req.headers.cookie || "").split(";").some((c) => c.trim() === "session=ok");
  res.writeHead(200, { "content-type": "text/html" });
  res.end(ok ? SIGNED_IN : SIGNED_OUT);
});
server.listen(0, "127.0.0.1", () => console.log("PORT " + server.address().port));
`);
const serverProc = spawn(process.execPath, [serverFile], { stdio: ["ignore", "pipe", "inherit"] });
const port = await new Promise((resolve, reject) => {
  serverProc.stdout.on("data", (d) => { const m = /PORT ([0-9]+)/.exec(String(d)); if (m) resolve(Number(m[1])); });
  serverProc.on("exit", () => reject(new Error("the test server stopped")));
});
const url = `http://127.0.0.1:${port}/`;

const SECRET = "SUPER-SECRET-TOKEN-VALUE-12345";
const stateFile = path.join(tmp, "state.json");
fs.writeFileSync(stateFile, JSON.stringify({ cookies: [{ name: "session", value: "ok", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }, { name: "token", value: SECRET, domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] }));
const badJson = path.join(tmp, "bad.json");
fs.writeFileSync(badJson, `not json ${SECRET}`);
const wrongShape = path.join(tmp, "wrong.json");
fs.writeFileSync(wrongShape, JSON.stringify({ secret: SECRET }));

const run = (script, args) => spawnSync(process.execPath, [path.join(scripts, `${script}.mjs`), ...args], { encoding: "utf8", env: process.env, timeout: 120000 });

// ---- each script sees the signed-in page only with the state
for (const script of ["tree-pass", "keyboard-walk", "shift-tab-walk", "arrow-walk", "escape-return", "focus-contrast"]) {
  const withState = run(script, [url, "--json", "--storage-state", stateFile]);
  const without = run(script, [url, "--json"]);
  check(`${script}: with a storage state it sees the signed-in page (${MARKER[script]})`, withState.status === 0 && withState.stdout.includes(MARKER[script]));
  check(`${script}: without one it sees the sign-in page, not ${MARKER[script]}`, without.status === 0 && !without.stdout.includes(MARKER[script]) && without.stdout.length > 0);
}
for (const script of Object.keys(MARKER)) {
  const swapped = run(script, ["--storage-state", stateFile, url, "--json"]);
  check(`${script}: the flag may come before the page, and its value is not mistaken for the page`, swapped.status === 0 && swapped.stdout.includes(MARKER[script]));
}

// ---- the live-region probe
const probeWith = run("live-region-probe", [url, "--click", "#secret", "--wait", "500", "--json", "--storage-state", stateFile]);
const probeWithout = run("live-region-probe", [url, "--click", "#secret", "--wait", "500", "--json"]);
check("live-region-probe: with a storage state it can click #secret and sees the status message", probeWith.status === 0 && /Saved/.test(probeWith.stdout));
check("live-region-probe: the flag may come before the page", /Saved/.test(run("live-region-probe", ["--storage-state", stateFile, url, "--click", "#secret", "--wait", "500", "--json"]).stdout));
check("live-region-probe: without one there is no #secret to click", !/Saved/.test(probeWithout.stdout));

// ---- bad files are usage errors that never show the file's contents
const bad = [
  ["a missing file", [url, "--storage-state", path.join(tmp, "nope.json")], /cannot read/],
  ["a file that is not JSON", [url, "--storage-state", badJson], /not JSON/],
  ["a JSON file that is not a storage state", [url, "--storage-state", wrongShape], /not a Playwright storage state/],
  ["a flag with no value", [url, "--storage-state"], /needs the path/],
  ["a flag followed by another flag", [url, "--storage-state", "--json"], /needs the path/],
];
for (const [name, args, message] of bad) {
  const r = run("tree-pass", args);
  check(`${name} is a usage error (exit 2) with a clear message`, r.status === 2 && message.test(r.stderr));
  check(`${name}: nothing from inside the file is printed`, !r.stdout.includes(SECRET) && !r.stderr.includes(SECRET));
}
check("a bad state is caught before a browser starts (fast, even with no Playwright path)", (() => { const t0 = Date.now(); run("keyboard-walk", [url, "--storage-state", badJson]); return Date.now() - t0 < 8000; })());
check("a good run never prints the file's contents either", (() => { const r = run("tree-pass", [url, "--storage-state", stateFile]); return !r.stdout.includes(SECRET) && !r.stderr.includes(SECRET); })());

// ---- snapshot.mjs forwards it to every script
const snap = path.join(tmp, "snap.json");
const s = spawnSync(process.execPath, [path.join(scripts, "snapshot.mjs"), url, "--out", snap, "--only", "tree-pass,keyboard-walk", "--storage-state", stateFile], { encoding: "utf8", env: process.env, timeout: 240000 });
const snapJson = fs.existsSync(snap) ? JSON.parse(fs.readFileSync(snap, "utf8")) : null;
check("snapshot: with a storage state the scripts see the signed-in page", s.status === 0 && !!snapJson && snapJson.scripts["tree-pass"].findings.some((f) => f.includes("#secret")) && snapJson.scripts["keyboard-walk"].findings.some((f) => f.includes("#secret")));
const snap2 = path.join(tmp, "snap2.json");
spawnSync(process.execPath, [path.join(scripts, "snapshot.mjs"), url, "--out", snap2, "--only", "tree-pass"], { encoding: "utf8", env: process.env, timeout: 240000 });
check("snapshot: without one they see the sign-in page", JSON.parse(fs.readFileSync(snap2, "utf8")).scripts["tree-pass"].findings.every((f) => !f.includes("#secret")));
check("snapshot: neither the file's contents nor its path are written to the snapshot", !fs.readFileSync(snap, "utf8").includes(SECRET) && !fs.readFileSync(snap, "utf8").includes("state.json"));
const badSnap = spawnSync(process.execPath, [path.join(scripts, "snapshot.mjs"), url, "--out", path.join(tmp, "x.json"), "--storage-state", badJson], { encoding: "utf8" });
check("snapshot: a bad state is a usage error and nothing is written", badSnap.status === 2 && !fs.existsSync(path.join(tmp, "x.json")) && !badSnap.stderr.includes(SECRET));

serverProc.kill();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
