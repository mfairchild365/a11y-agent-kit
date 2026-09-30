#!/usr/bin/env python3
"""Run skill-creator's trigger evaluation inside the Claude Code sandbox.

skill-creator's scripts/run_eval.py fans out with ProcessPoolExecutor, which
the sandbox blocks (os.sysconf("SC_SEM_NSEMS_MAX") -> EPERM). Each query only
launches a `claude -p` subprocess, so threads do the same job. This wrapper
swaps the executor and then runs the unmodified script.

Usage (run from a neutral project dir that has a .claude/ folder, because
run_eval writes its temporary command files into the project root it finds
from the current directory):

    mkdir -p "$TMPDIR/trig/.claude" && cd "$TMPDIR/trig"
    python3 /path/to/evals/run_trigger_eval.py --eval-set ... --skill-path ... \
        --description "..." --model claude-sonnet-4-6 --runs-per-query 3
"""
import concurrent.futures as cf
import os
import runpy
import sys
from pathlib import Path

cf.ProcessPoolExecutor = cf.ThreadPoolExecutor

# SKILL_CREATOR_DIR (the skill-creator skill's own directory) overrides the
# default lookup in the Claude Code plugin cache.
if os.environ.get("SKILL_CREATOR_DIR"):
    roots = [Path(os.environ["SKILL_CREATOR_DIR"])]
else:
    SC = Path.home() / ".claude/plugins/cache/claude-plugins-official/skill-creator"
    roots = sorted(SC.glob("*/skills/skill-creator"))
if not roots or not (roots[-1] / "scripts" / "run_eval.py").exists():
    sys.exit("skill-creator not found; install the plugin or set SKILL_CREATOR_DIR")
sys.path.insert(0, str(roots[-1]))
runpy.run_module("scripts.run_eval", run_name="__main__")
