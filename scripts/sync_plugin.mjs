#!/usr/bin/env node
// Keep the plugin's per-tool files in sync.
//
//   - generates codex/agents/<name>.toml from agents/<name>.agent.md (Codex custom
//     agents are TOML, not Markdown)
//   - with --check, writes nothing and exits 1 if a generated file is stale, the
//     plugin name or version differs across manifests, a skill's frontmatter
//     name doesn't match its directory, or a tracked file names a blocklisted
//     company, brand or product (see scripts/check_generic.mjs)
//
// Usage (from the repo root):
//   node scripts/sync_plugin.mjs           regenerate
//   node scripts/sync_plugin.mjs --check   verify, for CI / before release
//   --root DIR                             use another tree (used by the tests)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTerms, scan } from "./check_generic.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MANIFESTS = [".claude-plugin/plugin.json", ".cursor-plugin/plugin.json", "gemini-extension.json"];

const readText = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const jsonAscii = (s) => JSON.stringify(s).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

export function splitFrontmatter(file) {
  const text = readText(file);
  if (!text.startsWith("---\n")) throw new Error(`${file}: missing frontmatter`);
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`${file}: missing frontmatter`);
  const meta = {};
  for (const line of text.slice(4, end).split("\n")) {
    const i = line.indexOf(":");
    const key = i < 0 ? line : line.slice(0, i);
    meta[key.trim()] = i < 0 ? "" : line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(end + 5).trim() + "\n" };
}

export function codexToml(mdPath) {
  const { meta, body } = splitFrontmatter(mdPath);
  if (body.includes("'''")) throw new Error(`${mdPath}: body contains ''' and can't be a TOML literal string`);
  return (
    `# Generated from agents/${path.basename(mdPath)} by scripts/sync_plugin.mjs. Don't edit.\n` +
    `name = ${jsonAscii(meta.name)}\n` +
    `description = ${jsonAscii(meta.description)}\n` +
    'sandbox_mode = "workspace-write"\n' +
    `developer_instructions = '''\n${body}'''\n`
  );
}

const readJson = (p) => JSON.parse(readText(p));
const listDir = (dir, test) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(test).sort() : []);

export function checkManifests(root) {
  const errors = [];
  const market = readJson(path.join(root, ".claude-plugin/marketplace.json"));
  const names = { ".claude-plugin/marketplace.json (name)": market.name };
  for (const entry of market.plugins) names[".claude-plugin/marketplace.json (plugin entry)"] = entry.name;
  const versions = {};
  for (const rel of MANIFESTS) {
    const data = readJson(path.join(root, rel));
    names[rel] = data.name;
    versions[rel] = data.version;
  }
  for (const [label, values] of [["name", names], ["version", versions]]) {
    if (new Set(Object.values(values)).size > 1) {
      errors.push(`${label} differs across manifests: ` + Object.entries(values).map(([k, v]) => `${k}=${v}`).join(", "));
    }
  }
  for (const dir of listDir(path.join(root, "skills"), () => true)) {
    const skill = path.join(root, "skills", dir, "SKILL.md");
    if (!fs.existsSync(skill)) continue;
    const { meta } = splitFrontmatter(skill);
    if (meta.name !== dir) errors.push(`skills/${dir}/SKILL.md: name '${meta.name}' != directory '${dir}'`);
  }
  return errors;
}

export function main(argv, io = { out: console.log, err: console.error }) {
  const check = argv.includes("--check");
  const root = path.resolve(argv.includes("--root") ? argv[argv.indexOf("--root") + 1] : path.join(here, ".."));
  const rel = (p) => path.relative(root, p).split(path.sep).join("/");
  const errors = checkManifests(root);
  const outDir = path.join(root, "codex", "agents");
  const expected = new Map();
  for (const md of listDir(path.join(root, "agents"), (f) => f.endsWith(".agent.md"))) {
    expected.set(path.join(outDir, md.replace(/\.agent\.md$/, "") + ".toml"), codexToml(path.join(root, "agents", md)));
  }
  const stale = [...expected].filter(([p, text]) => !fs.existsSync(p) || readText(p) !== text).map(([p]) => p);
  const orphans = listDir(outDir, (f) => f.endsWith(".toml")).map((f) => path.join(outDir, f)).filter((p) => !expected.has(p));

  if (check) {
    errors.push(...stale.map((p) => `${rel(p)} is stale; run scripts/sync_plugin.mjs`));
    errors.push(...orphans.map((p) => `${rel(p)} has no source agent`));
    const terms = path.join(root, "scripts", "brand_terms.sha256");
    if (fs.existsSync(terms)) {
      errors.push(...scan(root, loadTerms(terms)).map((h) => `${h.file}:${h.line} names a blocklisted term: "${h.text}"`));
    }
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    for (const p of stale) { fs.writeFileSync(p, expected.get(p)); io.out(`wrote ${rel(p)}`); }
    for (const p of orphans) { fs.unlinkSync(p); io.out(`removed ${rel(p)}`); }
  }
  for (const e of errors) io.err(`error: ${e}`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
