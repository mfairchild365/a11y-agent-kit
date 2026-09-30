#!/usr/bin/env python3
"""Run every eval headlessly through the `claude` CLI, pinned to an exact model.

Why the CLI rather than subagents: it lets us pin an exact model ID (e.g. the
one used in the a11y-llm-eval report) and start each run in a neutral working
directory with no repo context, no CLAUDE.md and none of the user's plugins.

Each run gets its own directory under <scratch>/<name>__<config>/:
  - with_skill:    the skill is installed at .claude/skills/building-accessible-ui/
                   so it is discovered and invoked like a real skill
  - without_skill: nothing installed

Results are copied into <workspace>/eval-<name>/<config>/run-1/ in the layout
skill-creator and the grading scripts expect.

Usage (from the repo root):
    python3 evals/run_cli_eval.py --model claude-sonnet-4-6 \
        --workspace evals/workspace/sonnet46 --scratch "$TMPDIR/s46"
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILL_SRC = REPO / "skills" / "building-accessible-ui"
EVALS = json.load(open(REPO / "evals" / "evals.json"))["evals"]
ALLOWED_TOOLS = "Read,Write,Edit,Glob,Grep,Bash,Skill"
INPUT_FILE = REPO / "evals" / "files" / "account-settings.html"


def build_prompt(e: dict) -> str:
    p = e["prompt"]
    if e["name"] == "existing-page-save-feature":
        p = p.replace("(evals/files/account-settings.html)", "(the file account-settings.html in the current directory)")
        return p + "\n\nWrite the complete updated page to index.html in the current directory, as a single self-contained file. Leave account-settings.html unchanged."
    return p + "\n\nWrite the finished page to index.html in the current directory."


def parse_stream(path: Path) -> dict:
    info = {"skills_listed": None, "plugins": None, "skill_tool_calls": 0, "tool_calls": {}, "result": "",
            "duration_ms": None, "tokens": None, "models": []}
    if not path.exists():
        return info
    for line in path.read_text().splitlines():
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = ev.get("type")
        if t == "system" and ev.get("subtype") == "init":
            info["skills_listed"] = ev.get("skills")
            info["plugins"] = ev.get("plugins")
        elif t == "assistant":
            for c in (ev.get("message") or {}).get("content") or []:
                if c.get("type") == "tool_use":
                    n = c.get("name")
                    info["tool_calls"][n] = info["tool_calls"].get(n, 0) + 1
                    if n == "Skill":
                        info["skill_tool_calls"] += 1
        elif t == "result":
            info["result"] = ev.get("result") or ""
            info["duration_ms"] = ev.get("duration_ms")
            mu = ev.get("modelUsage") or {}
            info["models"] = list(mu.keys())
            u = ev.get("usage") or {}
            info["tokens"] = sum(u.get(k, 0) or 0 for k in
                                 ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
    return info


def run_one(job) -> str:
    e, cfg, model, scratch, workspace, timeout, n = job
    name = e["name"]
    cwd = scratch / f"{name}__{cfg}__r{n}"
    if cwd.exists():
        shutil.rmtree(cwd)
    cwd.mkdir(parents=True)
    if cfg == "with_skill":
        shutil.copytree(SKILL_SRC, cwd / ".claude" / "skills" / "building-accessible-ui")
    if e["name"] == "existing-page-save-feature":
        shutil.copy(INPUT_FILE, cwd / "account-settings.html")
    cmd = ["claude", "-p", "--model", model, "--no-session-persistence",
           "--setting-sources", "project", "--strict-mcp-config",
           "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED_TOOLS,
           "--output-format", "stream-json", "--verbose", build_prompt(e)]
    t0 = time.time()
    try:
        with open(cwd / "stream.jsonl", "w") as out:
            subprocess.run(cmd, cwd=cwd, stdout=out, stderr=subprocess.STDOUT, timeout=timeout)
        status = "ok"
    except subprocess.TimeoutExpired:
        status = "timeout"
    wall = time.time() - t0

    run = workspace / f"eval-{name}" / cfg / f"run-{n}"
    (run / "outputs").mkdir(parents=True, exist_ok=True)
    info = parse_stream(cwd / "stream.jsonl")
    produced = (cwd / "index.html").exists()
    if produced:
        shutil.copy(cwd / "index.html", run / "outputs" / "index.html")
    (run / "outputs" / "response.md").write_text(info["result"] or "(no final message)")
    (run / "transcript.md").write_text(
        f"Model(s): {info['models']}\nStatus: {status}; index.html produced: {produced}\n"
        f"Tool calls: {info['tool_calls']}\nSkill tool invoked: {info['skill_tool_calls']} time(s)\n"
        f"Skills visible at start: {info['skills_listed']}\nPlugins loaded: {info['plugins']}\n")
    dur = (info["duration_ms"] or wall * 1000) / 1000
    json.dump({"total_tokens": info["tokens"], "duration_ms": int(dur * 1000), "total_duration_seconds": round(dur, 1)},
              open(run / "timing.json", "w"))
    json.dump({"status": status, "produced_index": produced, **{k: info[k] for k in
               ("models", "skill_tool_calls", "tool_calls", "skills_listed", "plugins")}},
              open(run / "meta.json", "w"), indent=2)
    meta = ws_meta(e)
    (workspace / f"eval-{name}").mkdir(exist_ok=True)
    json.dump(meta, open(workspace / f"eval-{name}" / "eval_metadata.json", "w"), indent=2)
    return f"{name:30} {cfg:14} run-{n} {status:8} index={produced} skillcalls={info['skill_tool_calls']} models={info['models']}"


def ws_meta(e):
    return {"eval_id": e["id"], "eval_name": e["name"], "prompt": e["prompt"], "assertions": e["expectations"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--workspace", required=True, type=Path)
    ap.add_argument("--scratch", required=True, type=Path)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--only", help="comma-separated eval names")
    ap.add_argument("--run-start", type=int, default=1, help="first run number")
    ap.add_argument("--runs", type=int, default=1, help="how many runs per cell")
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None
    a.workspace.mkdir(parents=True, exist_ok=True)
    a.scratch.mkdir(parents=True, exist_ok=True)
    jobs = [(e, cfg, a.model, a.scratch, a.workspace.resolve(), a.timeout, n)
            for n in range(a.run_start, a.run_start + a.runs)
            for e in EVALS if not only or e["name"] in only
            for cfg in ("with_skill", "without_skill")]
    print(f"{len(jobs)} runs, model={a.model}, workers={a.workers}", flush=True)
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for line in ex.map(run_one, jobs):
            print(line, flush=True)


if __name__ == "__main__":
    sys.exit(main())
