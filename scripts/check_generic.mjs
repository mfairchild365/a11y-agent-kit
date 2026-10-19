#!/usr/bin/env node
// Fails if any published file names a company, brand, product or internal tool on the blocklist.
//
// The blocklist (scripts/brand_terms.sha256) holds SHA-256 hashes, not the names, so the list can be
// published without naming anything. Each term is normalized the same way: lowercase, letters and digits
// only, so "Some-Term", "some term" and "SomeTerm" all hash alike. Lines are checked as runs of 1 to 3
// consecutive words joined together, which catches multi-word names.
//
// Usage (from the repo root):
//   node scripts/check_generic.mjs                  check every tracked file
//   node scripts/check_generic.mjs --hash "A Name"  print the line to add to scripts/brand_terms.sha256
//   node scripts/check_generic.mjs --root DIR --terms FILE   (used by the tests)

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_WORDS = 3;
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".woff", ".woff2", ".zip"]);
const SKIP_FILES = new Set(["package-lock.json", "scripts/brand_terms.sha256"]);

export const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const hashTerm = (s) => createHash("sha256").update(normalize(s)).digest("hex");

export function loadTerms(file) {
  const terms = new Set();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const hash = line.replace(/#.*/, "").trim();
    if (!hash) continue;
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`${file}: not a SHA-256 hash: ${hash}`);
    terms.add(hash);
  }
  return terms;
}

function listFiles(root) {
  try {
    if (!fs.existsSync(path.join(root, ".git"))) throw new Error("not the root of a git checkout");
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\0").filter(Boolean);
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== ".git" && e.name !== "node_modules") walk(rel); } else files.push(rel);
      }
    };
    walk("");
    return files;
  }
}

// Returns [{file, line, text}] for every line that contains a blocklisted term.
export function scan(root, terms) {
  const hits = [];
  for (const rel of listFiles(root)) {
    if (SKIP_FILES.has(rel) || SKIP_EXT.has(path.extname(rel).toLowerCase())) continue;
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue; // tracked but deleted in the working tree
    const lines = fs.readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      const words = line.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      for (let start = 0; start < words.length; start++) {
        for (let n = 1; n <= MAX_WORDS && start + n <= words.length; n++) {
          const gram = words.slice(start, start + n).join("");
          if (terms.has(createHash("sha256").update(gram).digest("hex"))) {
            hits.push({ file: rel, line: i + 1, text: words.slice(start, start + n).join(" ") });
          }
        }
      }
    });
  }
  return hits;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  if (argv.includes("--hash")) {
    const term = opt("--hash");
    if (!term || !normalize(term)) { console.error("Give a non-empty term: --hash \"Some Name\""); process.exit(2); }
    console.log(hashTerm(term));
    process.exit(0);
  }
  const root = path.resolve(opt("--root") || path.join(here, ".."));
  const hits = scan(root, loadTerms(opt("--terms") || path.join(here, "brand_terms.sha256")));
  for (const h of hits) console.log(`${h.file}:${h.line}: names a blocklisted term: "${h.text}"`);
  console.log(hits.length ? `\n${hits.length} hit(s). Published files must stay generic.` : "No blocklisted terms in tracked files.");
  process.exit(hits.length ? 1 : 0);
}
