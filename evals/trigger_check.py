#!/usr/bin/env python3
"""Trigger-only check that mirrors real skill discovery.

skill-creator's run_eval.py registers the description as a slash command and
gives up if the first tool call isn't the skill, which under-reports triggering
(it scored the current description at ~3% although the same skill fired in
108/108 real runs). This script instead:

  - installs the real skill under <neutral dir>/.claude/skills/ with the
    description under test substituted into SKILL.md,
  - runs `claude -p` pinned to a model, in a neutral directory, with only
    project settings loaded,
  - watches the stream and stops as soon as the model either invokes the
    Skill tool (triggered) or starts implementing / exhausts a few tool calls
    (not triggered), so no pages are generated and runs stay short.

Usage (repo root):
    python3 evals/trigger_check.py --model claude-sonnet-4-6 \
        --desc current=<file> --desc B=<file> --runs 3 --out <dir>
Use --desc NAME=- to keep the skill's current description.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILL_SRC = REPO / "skills" / "building-accessible-ui"
QUERIES = json.load(open(REPO / "evals" / "trigger_eval.json"))
ALLOWED = "Skill,Read,Write,Edit,Glob,Grep,Bash"
STOP_TOOLS = {"Write", "Edit"}  # file creation = implementing; Bash/Read/Glob are exploration
MAX_TOOL_CALLS = 10
FIXTURE = REPO / "evals" / "trigger_fixture"
PLAN_SPEC = {5, 6, 7}  # should-trigger queries that ask for a spec/plan rather than code


def install_skill(cwd: Path, description: str | None) -> None:
    dest = cwd / ".claude" / "skills" / "building-accessible-ui"
    shutil.copytree(SKILL_SRC, dest)
    if description is not None:
        p = dest / "SKILL.md"
        text = p.read_text()
        new, n = re.subn(r"^description:.*$", lambda m: "description: " + description, text, count=1, flags=re.M)
        assert n == 1, "description line not found"
        p.write_text(new)


def run_one(job):
    label, description, qi, query, n, model, scratch, timeout = job
    cwd = scratch / f"{label}__q{qi}__r{n}"
    if cwd.exists():
        shutil.rmtree(cwd)
    cwd.mkdir(parents=True)
    shutil.copytree(FIXTURE, cwd, dirs_exist_ok=True)
    install_skill(cwd, description)
    cmd = ["claude", "-p", "--model", model, "--no-session-persistence",
           "--setting-sources", "project", "--strict-mcp-config",
           "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED,
           "--output-format", "stream-json", "--verbose", query]
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    triggered, calls, first_tools = False, 0, []
    ended = "no_result"  # stream closed without a result event (crash or kill)
    # Kill from a timer thread: a check inside the read loop never fires if the
    # process stalls without printing anything.
    timed_out = threading.Event()

    def on_timeout():
        timed_out.set()
        proc.kill()

    watchdog = threading.Timer(timeout, on_timeout)
    watchdog.start()
    try:
        for line in proc.stdout:
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ev.get("type") == "assistant":
                stop = False
                for c in (ev.get("message") or {}).get("content") or []:
                    if c.get("type") != "tool_use":
                        continue
                    calls += 1
                    name = c.get("name")
                    first_tools.append(name)
                    if name == "Skill" and "building-accessible-ui" in json.dumps(c.get("input", {})):
                        triggered, stop, ended = True, True, "skill"
                    elif name in STOP_TOOLS:
                        stop, ended = True, "wrote"
                    elif calls >= MAX_TOOL_CALLS:
                        stop, ended = True, "explore_cap"
                if stop:
                    break
            elif ev.get("type") == "result":
                ended = "text"
                break
    finally:
        watchdog.cancel()
        if timed_out.is_set() and ended == "no_result":
            ended = "timeout"
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        shutil.rmtree(cwd, ignore_errors=True)
    return label, qi, triggered, first_tools, ended


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--desc", action="append", required=True, help="NAME=path-to-description-file, or NAME=- for current")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--timeout", type=int, default=150)
    ap.add_argument("--scratch", type=Path, default=Path(tempfile.gettempdir()) / "bau-trigger")
    ap.add_argument("--only", type=int, action="append", help="run only these query indexes")
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    a.scratch.mkdir(parents=True, exist_ok=True)
    a.out.mkdir(parents=True, exist_ok=True)
    descs = {}
    for d in a.desc:
        name, path = d.split("=", 1)
        descs[name] = None if path == "-" else Path(path).read_text().strip()
    jobs = [(name, desc, qi, q["query"], n, a.model, a.scratch, a.timeout)
            for name, desc in descs.items()
            for qi, q in enumerate(QUERIES) if a.only is None or qi in a.only
            for n in range(1, a.runs + 1)]
    print(f"{len(jobs)} runs, model={a.model}", flush=True)
    qis = [qi for qi in range(len(QUERIES)) if a.only is None or qi in a.only]
    results = {name: {qi: [] for qi in qis} for name in descs}
    firsts = {name: {qi: [] for qi in qis} for name in descs}
    ends = {name: {qi: [] for qi in qis} for name in descs}
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for label, qi, trig, tools, ended in ex.map(run_one, jobs):
            results[label][qi].append(trig)
            firsts[label][qi].append(tools)
            ends[label][qi].append(ended)
    summary = {}
    for name in descs:
        st = [(qi, r) for qi, r in results[name].items() if QUERIES[qi]["should_trigger"]]
        sn = [(qi, r) for qi, r in results[name].items() if not QUERIES[qi]["should_trigger"]]
        summary[name] = {
            "should_trigger_fired": sum(sum(r) for _, r in st), "should_trigger_runs": sum(len(r) for _, r in st),
            "should_not_fired": sum(sum(r) for _, r in sn), "should_not_runs": sum(len(r) for _, r in sn),
            "per_query": [{"query": QUERIES[qi]["query"], "should_trigger": QUERIES[qi]["should_trigger"],
                           "fired": sum(r), "runs": len(r), "tools": firsts[name][qi],
                           "ended": ends[name][qi]}
                          for qi, r in sorted(results[name].items())],
        }
    json.dump(summary, open(a.out / f"trigger_{a.model}.json", "w"), indent=2)
    for name, s in summary.items():
        print(f"{name:10} should-trigger fired {s['should_trigger_fired']}/{s['should_trigger_runs']}   "
              f"should-NOT fired {s['should_not_fired']}/{s['should_not_runs']}")
        groups = {
            "build/change/review": [qi for qi in results[name] if QUERIES[qi]["should_trigger"] and qi not in PLAN_SPEC],
            "plan/spec": sorted(PLAN_SPEC & set(results[name])),
            "should-not": [qi for qi in results[name] if not QUERIES[qi]["should_trigger"]],
        }
        for gname, qis in groups.items():
            fired = sum(sum(results[name][qi]) for qi in qis)
            total = sum(len(results[name][qi]) for qi in qis)
            reasons = {}
            for qi in qis:
                for e in ends[name][qi]:
                    reasons[e] = reasons.get(e, 0) + 1
            print(f"  {gname:20} fired {fired}/{total}   ended: {reasons}")
        for qi in sorted(results[name]):
            if QUERIES[qi]["should_trigger"] and not all(results[name][qi]):
                print(f"  MISS q{qi} ended={ends[name][qi]} tools={firsts[name][qi]}")

if __name__ == "__main__":
    sys.exit(main())
