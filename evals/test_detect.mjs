#!/usr/bin/env node
// Tests skills/building-accessible-ui/scripts/_detect.mjs (the pure rules) and detect-a11y-tests.mjs (the folder
// walk, with real temporary projects). No browser needed.
// Usage: node evals/test_detect.mjs   (exits 1 if any case behaves differently than expected)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detect, isIgnored, isRelevant } from "../skills/building-accessible-ui/scripts/_detect.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "skills", "building-accessible-ui", "scripts", "detect-a11y-tests.mjs");
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

const run = (tree, opts = {}) => detect({ files: Object.keys(tree), read: (p) => (typeof tree[p] === "string" ? tree[p] : null), ...opts });
const pkg = (o) => JSON.stringify(o);
const dev = (...names) => pkg({ devDependencies: Object.fromEntries(names.map((n) => [n, "^1.0.0"])) });
const has = (r, id) => r.findings.includes(id);

// ---- accessibility tooling, by exact package name
check("jest-axe in devDependencies is unit-test tooling, and the setup is existing-a11y-tests", (() => { const r = run({ "package.json": dev("jest-axe", "jest") }); return has(r, "framework@jest-axe") && r.frameworks[0].kind === "unit" && r.setup === "existing-a11y-tests"; })());
check("each test-time tool counts as an existing a11y setup", ["vitest-axe", "@axe-core/playwright", "cypress-axe", "axe-playwright", "@axe-core/webdriverio", "@axe-core/puppeteer", "pa11y", "pa11y-ci", "@lhci/cli", "lighthouse"].every((n) => run({ "package.json": dev(n) }).setup === "existing-a11y-tests"));
check("dependencies and optionalDependencies count as well as devDependencies", run({ "package.json": pkg({ dependencies: { "jest-axe": "1" } }) }).setup === "existing-a11y-tests" && run({ "package.json": pkg({ optionalDependencies: { "pa11y": "1" } }) }).setup === "existing-a11y-tests");
check("peerDependencies do not count", run({ "package.json": pkg({ peerDependencies: { "jest-axe": "1" } }) }).setup === "none");
check("a development aid or the bare engine is dev-time-only", run({ "package.json": dev("@storybook/addon-a11y") }).setup === "dev-time-only" && run({ "package.json": dev("axe-core") }).setup === "dev-time-only" && run({ "package.json": dev("@axe-core/react") }).setup === "dev-time-only");
check("lookalike package names do not match", ["jest-axes", "not-jest-axe", "axe-core-fake", "my-pa11y", "@axe-core/playwright-extra", "jest-axe2", "Jest-Axe", "pa11y-ci-extras"].every((n) => run({ "package.json": dev(n) }).frameworks.length === 0));
check("a package named like an object method does not break it", run({ "package.json": dev("constructor", "toString", "__proto__", "hasOwnProperty") }).setup === "none");
check("the tool is reported once even when several package.json files name it", (() => { const r = run({ "package.json": dev("jest-axe"), "packages/a/package.json": dev("jest-axe"), "packages/b/package.json": dev("jest-axe") }); return r.frameworks.length === 1 && r.packages.length === 3; })());
check("tooling in a nested package is found, with that package as the evidence", run({ "package.json": pkg({}), "packages/web/package.json": dev("vitest-axe") }).frameworks[0].evidence === "packages/web/package.json");

// ---- runners
check("runners are found by package name, once each", (() => { const r = run({ "package.json": dev("jest", "@playwright/test", "vitest", "cypress", "mocha") }); return ["jest", "playwright", "vitest", "cypress", "mocha"].every((n) => has(r, `runner@${n}`)); })());
check("node --test in a root script is the node:test runner", has(run({ "package.json": pkg({ scripts: { test: "node --test tests/" } }) }), "runner@node:test"));
check("node --test in a nested package's scripts is ignored, as only the root's scripts count", !has(run({ "packages/a/package.json": pkg({ scripts: { test: "node --test" } }) }), "runner@node:test"));
check("a runner from the root package.json comes before one from a nested package", run({ "package.json": dev("vitest"), "packages/a/package.json": dev("cypress") }).runners.map((x) => x.name).join() === "vitest,cypress" && run({ "package.json": dev("vitest"), "packages/a/package.json": dev("jest") }).runners[0].name === "vitest");
check("runners alone make the setup test-framework-only, with a suggested axe binding", (() => { const r = run({ "package.json": dev("vitest") }); return r.setup === "test-framework-only" && /vitest-axe/.test(r.suggestion); })());
check("the suggested binding follows the runner", [["jest", "jest-axe"], ["@playwright/test", "@axe-core/playwright"], ["cypress", "cypress-axe"]].every(([r, b]) => new RegExp(b.replace(/[/@]/g, ".")).test(run({ "package.json": dev(r) }).suggestion)) && /axe-core directly/.test(run({ "package.json": dev("mocha") }).suggestion));
check("test scripts are listed from the root package.json only", (() => { const r = run({ "package.json": pkg({ scripts: { test: "jest", build: "tsc", "test:e2e": "playwright test", lint: "eslint", "a11y": "pa11y-ci" } }), "packages/a/package.json": pkg({ scripts: { test: "x" } }) }); return r.testScripts.map((s) => s.name).sort().join() === "a11y,test,test:e2e"; })());

// ---- test files
const TEST = "import { axe, toHaveNoViolations } from 'jest-axe';\nexpect.extend(toHaveNoViolations);\nit('x', async () => { expect(await axe(container)).toHaveNoViolations(); });";
check("a test file that calls axe is an a11y test file, even with no tooling in package.json", (() => { const r = run({ "src/a.test.tsx": TEST }); return has(r, "a11y-test-file@src/a.test.tsx") && r.setup === "existing-a11y-tests" && r.suggestion === "extend src/a.test.tsx"; })());
check("each marker is recognised", ["await checkA11y()", "cy.injectAxe()", "new AxeBuilder({ page })", "axe.run(document)", "await runAxe(page)", "expect(r).toHaveNoViolations()", "const r = await axe(container)", "import x from 'axe-core'", "require('jest-axe')", "pa11y('http://x')"].every((c) => has(run({ "x.spec.js": c }), "a11y-test-file@x.spec.js")));
check("a marker only in a comment is not a use", !has(run({ "x.test.js": "// toHaveNoViolations is not used yet\n/* new AxeBuilder() */\nit('x', () => {});" }), "a11y-test-file@x.test.js"));
check("a URL in a string does not hide a marker after it", has(run({ "x.test.js": "const u = 'http://x.test'; await injectAxe(page);" }), "a11y-test-file@x.test.js"));
check("a test file with no marker is just a test file", (() => { const r = run({ "x.test.js": "it('adds', () => expect(1+1).toBe(2));" }); return r.testFileCount === 1 && r.a11yTestFiles.length === 0 && r.setup === "test-framework-only"; })());
check("test file patterns: .test, .spec, .cy and __tests__", ["a.test.ts", "a.spec.tsx", "a.cy.js", "__tests__/a.js", "src/__tests__/deep/a.mjs"].every((p) => run({ [p]: "x" }).testFileCount === 1) && ["a.ts", "test.ts", "a.tests.ts", "a.test.py", "a.stories.tsx"].every((p) => run({ [p]: "x" }).testFileCount === 0));
check("files under node_modules and build folders are ignored", (() => { const r = run({ "node_modules/jest-axe/package.json": dev("jest-axe"), "node_modules/x/a.test.js": TEST, "dist/a.test.js": TEST, "src/real.test.js": "x" }); return r.testFileCount === 1 && r.frameworks.length === 0; })());
check("isIgnored and isRelevant agree with that", isIgnored("a/node_modules/b.js") && isIgnored("build/x") && !isIgnored("src/build.js") && isRelevant("package.json") && isRelevant("a/package.json") && isRelevant("a.test.js") && !isRelevant("a.js") && !isRelevant("package.json.bak"));
check("Windows paths are normalised", has(run({ "src\\a.test.tsx": TEST }, { read: () => TEST }), "a11y-test-file@src/a.test.tsx"));
check("a file too large to read is skipped, not an error", run({ "a.test.js": "x".repeat(300000) }).a11yTestFiles.length === 0);
check("more test files than the read cap: only the cap is read, and the stop reason says so", (() => { const tree = {}; for (let i = 0; i < 12; i++) tree[`t${i}.test.js`] = TEST; const r = run(tree, { maxRead: 5 }); return r.stopReason === "read-cap" && r.a11yTestFiles.length === 5 && r.testFileCount === 12; })());
check("under the cap the stop reason is complete", run({ "a.test.js": TEST }).stopReason === "complete");

// ---- bad input
check("a package.json that is not JSON is noted and the others are still read", (() => { const r = run({ "package.json": "{ nope", "packages/a/package.json": dev("jest-axe") }); return r.errors.length === 1 && /not valid JSON/.test(r.errors[0]) && r.setup === "existing-a11y-tests"; })());
check("a package.json with a byte order mark is read", run({ "package.json": "﻿" + dev("jest-axe") }).setup === "existing-a11y-tests");
check("a package.json that can't be read is noted", run({ "package.json": null }, { read: () => null }).errors[0].endsWith("could not be read"));
check("package.json holding null, a list or a string is skipped without a crash", ["null", "[]", '"x"', "1"].every((t) => run({ "package.json": t }).setup === "none"));
check("scripts that are not strings are skipped", run({ "package.json": pkg({ scripts: { test: ["a"], build: 1 } }) }).testScripts.length === 0);
check("no files at all is setup none with no findings", (() => { const r = detect({ files: [], read: () => null }); return r.setup === "none" && r.findings.length === 0 && r.suggestion === null; })());
check("more than 25 package.json files are not all read", run(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`p${String(i).padStart(2, "0")}/package.json`, dev("jest-axe")]))).packages.length === 25);
check("findings are sorted and unique", (() => { const r = run({ "package.json": dev("jest-axe", "jest"), "b.test.js": TEST, "a.test.js": TEST }); return JSON.stringify(r.findings) === JSON.stringify([...r.findings].sort()) && new Set(r.findings).size === r.findings.length; })());

// ---- the command line, on real folders
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "detect-"));
const put = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
put("proj/package.json", dev("vitest-axe", "vitest"));
put("proj/src/a.test.tsx", TEST);
put("proj/node_modules/x/package.json", dev("jest-axe"));
put("empty/readme.md", "x");
let r = cli(path.join(tmp, "proj"), "--json");
let out = JSON.parse(r.stdout);
check("the command line reads a real folder and ignores node_modules", r.status === 0 && out.setup === "existing-a11y-tests" && out.findings.includes("framework@vitest-axe") && !out.findings.includes("framework@jest-axe") && out.stopReason === "complete");
check("the plain output names the setup and the suggestion", /^setup: existing-a11y-tests\s+\(extend src\/a\.test\.tsx\)/.test(cli(path.join(tmp, "proj")).stdout));
check("a folder with nothing is setup none", JSON.parse(cli(path.join(tmp, "empty"), "--json").stdout).setup === "none");
check("--max-files stops the walk and says so", JSON.parse(cli(path.join(tmp, "proj"), "--json", "--max-files", "1").stdout).stopReason === "file-cap");
check("a symlink is not followed", (() => { try { fs.symlinkSync(path.join(tmp, "proj"), path.join(tmp, "empty", "link"), "junction"); } catch { return true; } return JSON.parse(cli(path.join(tmp, "empty"), "--json").stdout).testFileCount === 0; })());
check("a missing folder is a usage error", cli(path.join(tmp, "nope")).status === 2 && /is not a folder/.test(cli(path.join(tmp, "nope")).stderr));
check("no argument is a usage error", cli().status === 2);
check("bad caps are a usage error", cli(path.join(tmp, "proj"), "--max-files", "0").status === 2 && cli(path.join(tmp, "proj"), "--max-ms", "-5").status === 2);
check("--tree reads a virtual project", (() => { const t = path.join(tmp, "tree.json"); fs.writeFileSync(t, JSON.stringify({ files: { "package.json": dev("cypress-axe"), "node_modules/x/a.test.js": TEST } })); const o = JSON.parse(cli("--tree", t, "--json").stdout); return o.setup === "existing-a11y-tests" && o.testFileCount === 0; })());
check("a --tree file that is not a project is a usage error", (() => { const t = path.join(tmp, "bad-tree.json"); fs.writeFileSync(t, JSON.stringify({ nope: 1 })); return cli("--tree", t).status === 2 && cli("--tree", path.join(tmp, "missing.json")).status === 2; })());

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
