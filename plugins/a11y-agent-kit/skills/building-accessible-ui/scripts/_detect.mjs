// Pure logic for detect-a11y-tests.mjs: what accessibility test setup does a project already have? It is given
// a list of files and a way to read them, and reports what it finds, with the evidence. No file system access
// of its own, so every decision can be tested on its own.
//
// What it finds:
//   frameworks      accessibility tooling named in a package.json (exact package names only)
//   runners         the project's test runners (the root package.json's first, then any nested package's)
//   a11yTestFiles   test files that use an axe or pa11y call (comments are ignored)
//   testScripts     the root package.json scripts that run tests
//   setup           existing-a11y-tests | dev-time-only | test-framework-only | none
//   suggestion      where a new accessibility test would go, in the project's own terms
//
// Findings, as ids: framework@<package>, runner@<name>, a11y-test-file@<path>, test-script@<name>.
// It is evidence for a plan, not a verdict: a project can test accessibility in ways it can't see (a service, a
// CI job outside the repo).

export const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt", "out", "vendor", ".cache", ".turbo", "storybook-static", "playwright-report", "test-results"]);
export const isIgnored = (p) => p.split("/").some((part) => IGNORED_DIRS.has(part));

// kind says what the tool is for: unit and e2e tools run in a test suite; a crawler or CI audit runs against a
// served site; dev-time tools show problems while developing but are not a test; the engine alone is only a library.
const A11Y_PACKAGES = {
  "jest-axe": "unit", "vitest-axe": "unit",
  "@axe-core/playwright": "e2e", "cypress-axe": "e2e", "axe-playwright": "e2e", "@axe-core/webdriverio": "e2e", "@axe-core/puppeteer": "e2e",
  "pa11y": "crawler", "pa11y-ci": "crawler",
  "@lhci/cli": "ci-audit", "lighthouse": "ci-audit",
  "@axe-core/react": "dev-time", "@storybook/addon-a11y": "dev-time",
  "axe-core": "engine",
};
const RUNNER_PACKAGES = { "jest": "jest", "vitest": "vitest", "@playwright/test": "playwright", "cypress": "cypress", "mocha": "mocha", "karma": "karma", "ava": "ava", "@storybook/test-runner": "storybook-test-runner", "uvu": "uvu", "tape": "tape" };
const BINDING_FOR = { jest: "jest-axe", vitest: "vitest-axe", playwright: "@axe-core/playwright", cypress: "cypress-axe" };
const TEST_FILE = /(^|\/)(__tests__\/.+|[^/]+\.(test|spec|cy)\.[cm]?[jt]sx?)$/;
const TEST_SCRIPT = /^(test|e2e|a11y|test:.+|.+:test|.+:e2e|.+:a11y|a11y:.+|cypress.*|playwright.*|pa11y.*)$/;
const MARKERS = /\b(toHaveNoViolations|checkA11y|injectAxe|AxeBuilder|runAxe|axe\.run|axe\s*\(\s*(container|document|html|el|wrapper|page|baseElement|rendered)|pa11y\s*\()|from\s+['"](jest-axe|vitest-axe|cypress-axe|axe-playwright|@axe-core\/[a-z]+|axe-core|pa11y)['"]|require\(\s*['"](jest-axe|vitest-axe|axe-core|pa11y)['"]\s*\)/;

// The files worth reading: package.json files and test files.
export const isRelevant = (p) => p === "package.json" || p.endsWith("/package.json") || TEST_FILE.test(p);

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1");

export function detect({ files, read, maxRead = 200, maxBytes = 200000 }) {
  const result = { setup: "none", frameworks: [], runners: [], a11yTestFiles: [], testScripts: [], packages: [], testFileCount: 0, errors: [], suggestion: null, stopReason: "complete", findings: [] };
  const usable = (files || []).map((f) => String(f).replace(/\\/g, "/").replace(/^\.\//, "")).filter((f) => f && !isIgnored(f)).sort();

  const frameworks = new Map(), runners = new Map();
  const pkgFiles = usable.filter((f) => f === "package.json" || f.endsWith("/package.json")).slice(0, 25);
  for (const f of pkgFiles) {
    const text = read(f);
    if (text == null) { result.errors.push(`${f}: could not be read`); continue; }
    let pkg;
    try { pkg = JSON.parse(text.replace(/^﻿/, "")); } catch (e) { result.errors.push(`${f}: not valid JSON`); continue; }
    if (!pkg || typeof pkg !== "object") continue;
    result.packages.push(f);
    const deps = { ...(pkg.optionalDependencies || {}), ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const name of Object.keys(deps)) {
      if (Object.prototype.hasOwnProperty.call(A11Y_PACKAGES, name) && !frameworks.has(name)) frameworks.set(name, { name, kind: A11Y_PACKAGES[name], evidence: f });
      if (Object.prototype.hasOwnProperty.call(RUNNER_PACKAGES, name) && !runners.has(RUNNER_PACKAGES[name])) runners.set(RUNNER_PACKAGES[name], { name: RUNNER_PACKAGES[name], evidence: `${f} (${name})`, root: f === "package.json" });
    }
    if (f === "package.json" && pkg.scripts && typeof pkg.scripts === "object") {
      for (const [name, cmd] of Object.entries(pkg.scripts)) {
        if (typeof cmd !== "string") continue;
        if (/\bnode\s+--test\b/.test(cmd) && !runners.has("node:test")) runners.set("node:test", { name: "node:test", evidence: `package.json (scripts.${name})`, root: true });
        if (TEST_SCRIPT.test(name) && result.testScripts.length < 10) result.testScripts.push({ name, command: cmd });
      }
    }
  }

  const testFiles = usable.filter((f) => TEST_FILE.test(f));
  result.testFileCount = testFiles.length;
  let read_ = 0;
  for (const f of testFiles) {
    if (read_ >= maxRead) { result.stopReason = "read-cap"; break; }
    const text = read(f);
    if (text == null || text.length > maxBytes) continue;
    read_++;
    if (MARKERS.test(stripComments(text))) result.a11yTestFiles.push(f);
  }

  result.frameworks = [...frameworks.values()].sort((a, b) => a.name.localeCompare(b.name));
  // A runner declared in the root package.json comes before one from a nested package: it is the project's own.
  result.runners = [...runners.values()].sort((a, b) => Number(b.root) - Number(a.root) || a.name.localeCompare(b.name));
  const kinds = new Set(result.frameworks.map((x) => x.kind));
  if (result.a11yTestFiles.length || ["unit", "e2e", "crawler", "ci-audit"].some((k) => kinds.has(k))) result.setup = "existing-a11y-tests";
  else if (kinds.has("dev-time") || kinds.has("engine")) result.setup = "dev-time-only";
  else if (result.runners.length || result.testFileCount) result.setup = "test-framework-only";

  if (result.setup === "existing-a11y-tests") {
    result.suggestion = result.a11yTestFiles.length ? `extend ${result.a11yTestFiles[0]}` : `add the test beside the ${result.frameworks.find((x) => ["unit", "e2e", "crawler", "ci-audit"].includes(x.kind)).name} setup`;
  } else if (result.runners.length) {
    const r = result.runners[0].name;
    result.suggestion = BINDING_FOR[r] ? `add a test with the ${r} runner and ${BINDING_FOR[r]}` : `add a test with the ${r} runner, using axe-core directly`;
  } else if (result.setup !== "none") result.suggestion = "add a test in the project's test files, using axe-core directly";

  const ids = new Set();
  for (const x of result.frameworks) ids.add(`framework@${x.name}`);
  for (const x of result.runners) ids.add(`runner@${x.name}`);
  for (const f of result.a11yTestFiles) ids.add(`a11y-test-file@${f}`);
  for (const s of result.testScripts) ids.add(`test-script@${s.name}`);
  result.findings = [...ids].sort();
  return result;
}
