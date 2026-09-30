#!/usr/bin/env python3
"""Keep the plugin's per-tool files in sync.

  - generates codex/agents/<name>.toml from agents/<name>.agent.md (Codex custom
    agents are TOML, not Markdown)
  - with --check, writes nothing and exits 1 if a generated file is stale, the
    plugin name or version differs across manifests, or a skill's frontmatter
    name doesn't match its directory

Usage (from the repo root):
    python3 scripts/sync_plugin.py           # regenerate
    python3 scripts/sync_plugin.py --check   # verify, for CI / before release
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFESTS = [".claude-plugin/plugin.json", ".cursor-plugin/plugin.json", "gemini-extension.json"]


def split_frontmatter(path):
    text = path.read_text()
    if not text.startswith("---\n"):
        sys.exit(f"{path}: missing frontmatter")
    head, body = text[4:].split("\n---\n", 1)
    meta = {}
    for line in head.splitlines():
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    return meta, body.strip() + "\n"


def codex_toml(md_path):
    meta, body = split_frontmatter(md_path)
    if "'''" in body:
        sys.exit(f"{md_path}: body contains ''' and can't be a TOML literal string")
    return (
        f"# Generated from agents/{md_path.name} by scripts/sync_plugin.py. Don't edit.\n"
        f"name = {json.dumps(meta['name'])}\n"
        f"description = {json.dumps(meta['description'])}\n"
        'sandbox_mode = "workspace-write"\n'
        f"developer_instructions = '''\n{body}'''\n"
    )


def check_manifests():
    errors = []
    market = json.loads((ROOT / ".claude-plugin/marketplace.json").read_text())
    names = {".claude-plugin/marketplace.json (name)": market["name"]}
    for entry in market["plugins"]:
        names[".claude-plugin/marketplace.json (plugin entry)"] = entry["name"]
    versions = {}
    for rel in MANIFESTS:
        data = json.loads((ROOT / rel).read_text())
        names[rel] = data["name"]
        versions[rel] = data["version"]
    for label, values in (("name", names), ("version", versions)):
        if len(set(values.values())) > 1:
            errors.append(f"{label} differs across manifests: " + ", ".join(f"{k}={v}" for k, v in values.items()))
    for skill in sorted((ROOT / "skills").glob("*/SKILL.md")):
        meta, _ = split_frontmatter(skill)
        if meta.get("name") != skill.parent.name:
            errors.append(f"{skill.relative_to(ROOT)}: name {meta.get('name')!r} != directory {skill.parent.name!r}")
    return errors


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="verify only; exit 1 on any mismatch")
    args = ap.parse_args()

    errors = check_manifests()
    out_dir = ROOT / "codex" / "agents"
    expected = {}
    for md in sorted((ROOT / "agents").glob("*.agent.md")):
        expected[out_dir / (md.name.removesuffix(".agent.md") + ".toml")] = codex_toml(md)

    stale = [p for p, text in expected.items() if not p.exists() or p.read_text() != text]
    orphans = [p for p in out_dir.glob("*.toml") if p not in expected] if out_dir.exists() else []

    if args.check:
        errors += [f"{p.relative_to(ROOT)} is stale; run scripts/sync_plugin.py" for p in stale]
        errors += [f"{p.relative_to(ROOT)} has no source agent" for p in orphans]
    else:
        out_dir.mkdir(parents=True, exist_ok=True)
        for p in stale:
            p.write_text(expected[p])
            print(f"wrote {p.relative_to(ROOT)}")
        for p in orphans:
            p.unlink()
            print(f"removed {p.relative_to(ROOT)}")

    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
