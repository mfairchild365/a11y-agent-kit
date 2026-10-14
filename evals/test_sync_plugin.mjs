#!/usr/bin/env node
// Tests scripts/sync_plugin.mjs against throwaway plugin trees. No browser needed.
// Usage: node evals/test_sync_plugin.mjs   (exits 1 if any case behaves differently than expected)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashTerm } from "../scripts/check_generic.mjs";
import { codexToml, main, splitFrontmatter } from "../scripts/sync_plugin.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sync-plugin-"));
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

let n = 0;
// A valid tree: one plugin at version 1.0.0, one skill, one agent, its generated TOML.
function tree(edit = () => {}) {
  const root = path.join(tmp, `t${++n}`);
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  put(".claude-plugin/marketplace.json", JSON.stringify({ name: "kit", plugins: [{ name: "kit" }] }));
  for (const rel of [".claude-plugin/plugin.json", ".cursor-plugin/plugin.json", "gemini-extension.json"]) put(rel, JSON.stringify({ name: "kit", version: "1.0.0" }));
  put("skills/demo/SKILL.md", "---\nname: demo\ndescription: d\n---\n# Demo\n");
  put("agents/rev.agent.md", "---\nname: rev\ndescription: Reviews: things, with a colon and an accent: café\n---\n\nBody line.\n");
  put("scripts/brand_terms.sha256", hashTerm("Examplecorp") + "\n");
  put("codex/agents/rev.toml", codexToml(path.join(root, "agents/rev.agent.md")));
  const ctx = { root, put, remove: (rel) => fs.rmSync(path.join(root, rel), { recursive: true, force: true }) };
  edit(ctx);
  return root;
}
const run = (root, ...flags) => { const err = []; const out = []; const code = main([...flags, "--root", root], { out: (s) => out.push(s), err: (s) => err.push(s) }); return { code, err: err.join("\n"), out: out.join("\n") }; };

check("frontmatter keeps colons inside values", (() => { const { meta, body } = splitFrontmatter(path.join(tree(), "agents/rev.agent.md")); return meta.description.startsWith("Reviews: things") && body === "Body line.\n"; })());
check("a valid tree passes --check", run(tree(), "--check").code === 0);
check("the TOML escapes non-ASCII and keeps the body in a literal string", (() => { const t = fs.readFileSync(path.join(tree(), "codex/agents/rev.toml"), "utf8"); return t.includes("caf\\u00e9") && t.includes("developer_instructions = '''\nBody line.\n'''"); })());
check("a stale TOML fails --check", (() => { const r = run(tree(({ put }) => put("codex/agents/rev.toml", "old")), "--check"); return r.code === 1 && r.err.includes("is stale"); })());
check("a missing TOML fails --check", run(tree(({ remove }) => remove("codex/agents/rev.toml")), "--check").code === 1);
check("a TOML with no source agent fails --check", (() => { const r = run(tree(({ put }) => put("codex/agents/gone.toml", "x")), "--check"); return r.code === 1 && r.err.includes("has no source agent"); })());
check("a version mismatch fails --check", (() => { const r = run(tree(({ put }) => put("gemini-extension.json", JSON.stringify({ name: "kit", version: "2.0.0" }))), "--check"); return r.code === 1 && r.err.includes("version differs"); })());
check("a name mismatch fails --check", (() => { const r = run(tree(({ put }) => put(".cursor-plugin/plugin.json", JSON.stringify({ name: "other", version: "1.0.0" }))), "--check"); return r.code === 1 && r.err.includes("name differs"); })());
check("a skill whose name differs from its directory fails --check", (() => { const r = run(tree(({ put }) => put("skills/demo/SKILL.md", "---\nname: other\n---\n")), "--check"); return r.code === 1 && r.err.includes("!= directory"); })());
check("a blocklisted term in a file fails --check, with its location", (() => { const r = run(tree(({ put }) => put("docs.md", "line\nwe integrate with ExampleCorp\n")), "--check"); return r.code === 1 && r.err.includes("docs.md:2 names a blocklisted term"); })());
check("--check never writes", (() => { const root = tree(({ put }) => put("codex/agents/rev.toml", "old")); run(root, "--check"); return fs.readFileSync(path.join(root, "codex/agents/rev.toml"), "utf8") === "old"; })());
check("regenerating fixes a stale file and removes an orphan", (() => { const root = tree(({ put }) => { put("codex/agents/rev.toml", "old"); put("codex/agents/gone.toml", "x"); }); const r = run(root); return r.code === 0 && run(root, "--check").code === 0 && !fs.existsSync(path.join(root, "codex/agents/gone.toml")); })());
check("a body containing ''' is refused", (() => { try { codexToml(path.join(tree(({ put }) => put("agents/rev.agent.md", "---\nname: rev\ndescription: d\n---\nbad ''' here\n")), "agents/rev.agent.md")); return false; } catch { return true; } })());
check("CRLF line endings are handled like LF", (() => { const root = tree(({ put }) => put("agents/rev.agent.md", "---\r\nname: rev\r\ndescription: d\r\n---\r\n\r\nBody line.\r\n")); return splitFrontmatter(path.join(root, "agents/rev.agent.md")).body === "Body line.\n"; })());

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
