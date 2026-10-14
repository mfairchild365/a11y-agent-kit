#!/usr/bin/env node
// Tests evals/run_check_fixtures.mjs: it must pass a correct check, and fail loudly on every kind of
// wrong result or broken setup. No browser needed.
// Usage: node evals/test_check_runner.mjs   (exits 1 if the runner misjudges any case)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./run_check_fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const stub = path.join(here, "check_fixtures", "_selftest", "stub_check.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-runner-"));
const hang = path.join(tmp, "hang.mjs");
fs.writeFileSync(hang, "setInterval(() => {}, 1000);\n");
const notJson = path.join(tmp, "notjson.mjs");
fs.writeFileSync(notJson, 'console.log("oops");\n');

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

// Builds one check directory. fixtures: { "kind/name": [html, answerKeyObject|null] }
let n = 0;
function build({ script = stub, timeoutMs = 3000, skipKinds, fixtures }) {
  const dir = path.join(tmp, `check-${++n}`);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "check.json"), JSON.stringify({ script, timeoutMs, ...(skipKinds ? { skipKinds } : {}) }));
  for (const [rel, [html, key]] of Object.entries(fixtures)) {
    const file = path.join(dir, rel + ".html");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    if (key) fs.writeFileSync(path.join(dir, rel + ".expected.json"), JSON.stringify(key));
  }
  return dir;
}
const good = {
  "positive/a": ['<i data-flag="x"></i>', { findings: ["x"] }],
  "negative/a": ["<b></b>", { findings: [] }],
  "edge/a": ['<i data-flag="y"></i>', { findings: ["y"] }],
  "termination/a": ['<i data-stop="cap"></i>', { findings: [], stopReason: "cap-reached" }],
};
const run = (spec) => runCheck(build(spec), { repo: here });
const failures = (rs) => rs.filter((r) => !r.ok);
const failsWith = (rs, text) => failures(rs).some((r) => r.message.includes(text));

check("a correct check passes every fixture", failures(run({ fixtures: good })).length === 0);
check("a missed finding fails", failsWith(run({ fixtures: { ...good, "positive/a": ["<b></b>", { findings: ["x"] }] } }), "missed: x"));
check("a false positive on a negative fixture fails", failsWith(run({ fixtures: { ...good, "negative/a": ['<i data-flag="z"></i>', { findings: [] }] } }), "false positive"));
check("an extra finding on a positive fixture fails", failsWith(run({ fixtures: { ...good, "positive/a": ['<i data-flag="x"></i><i data-flag="w"></i>', { findings: ["x"] }] } }), "unexpected"));
check("the same id reported twice fails", failsWith(run({ fixtures: { ...good, "positive/a": ['<i data-flag="x"></i><i data-flag="x"></i>', { findings: ["x"] }] } }), "different counts"));
check("a wrong stopReason fails", failsWith(run({ fixtures: { ...good, "termination/a": ["<b></b>", { findings: [], stopReason: "cap-reached" }] } }), "stopReason"));
check("a check that never terminates fails", failsWith(run({ script: hang, timeoutMs: 400, fixtures: good }), "did not terminate"));
check("a check that prints something other than JSON fails", failsWith(run({ script: notJson, fixtures: good }), "did not print JSON"));
check("a fixture with no answer key fails", failsWith(run({ fixtures: { ...good, "edge/a": ['<i data-flag="y"></i>', null] } }), "no answer key"));
check("a missing kind with no reason fails", failsWith(run({ fixtures: { ...good, "termination/a": undefined } && Object.fromEntries(Object.entries(good).filter(([k]) => !k.startsWith("termination"))) }), "no termination fixtures"));
check("a missing kind with a written reason is allowed", failures(run({ skipKinds: { termination: "the check has no loop" }, fixtures: Object.fromEntries(Object.entries(good).filter(([k]) => !k.startsWith("termination"))) })).length === 0);
check("a skip with an empty reason fails", failsWith(run({ skipKinds: { termination: " " }, fixtures: Object.fromEntries(Object.entries(good).filter(([k]) => !k.startsWith("termination"))) }), "needs a known kind and a written reason"));
check("a negative answer key that lists findings is rejected", failsWith(run({ fixtures: { ...good, "negative/a": ["<b></b>", { findings: ["x"] }] } }), "negative fixture"));
check("a positive answer key that lists nothing is rejected", failsWith(run({ fixtures: { ...good, "positive/a": ["<b></b>", { findings: [] }] } }), "positive fixture"));
check("a termination answer key with no stopReason is rejected", failsWith(run({ fixtures: { ...good, "termination/a": ['<i data-stop="cap"></i>', { findings: [] }] } }), "stopReason"));
check("the shipped self-test check passes", failures(runCheck(path.join(here, "check_fixtures", "_selftest", "stub"), { repo: path.join(here, "..") })).length === 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "The runner judged every case correctly."}`);
process.exit(failed ? 1 : 0);
