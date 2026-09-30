#!/usr/bin/env python3
"""Build the skill-creator eval review viewer with a script-injection fix.

skill-creator's generate_review.py embeds run outputs into the viewer with a
bare json.dumps() inside a <script> block. Our deliverables are full HTML
files, so they contain literal "</script>", which ends the viewer's script
early and dumps the rest of the data into the page as text.

This wrapper escapes "</" as "<\\/" (still valid JSON, and inert inside a
script block) and then runs the unmodified generator.

Usage (from the repo root):
    python3 evals/build_review.py evals/workspace/iteration-1 [--previous-workspace ...]
The viewer is written to <workspace>/review.html (static mode).
"""
import json
import os
import runpy
import sys
from pathlib import Path

# SKILL_CREATOR_DIR (the skill-creator skill's own directory) overrides the
# default lookup in the Claude Code plugin cache.
if os.environ.get("SKILL_CREATOR_DIR"):
    generators = [Path(os.environ["SKILL_CREATOR_DIR"]) / "eval-viewer" / "generate_review.py"]
else:
    SC = Path.home() / ".claude/plugins/cache/claude-plugins-official/skill-creator"
    generators = sorted(SC.glob("*/skills/skill-creator/eval-viewer/generate_review.py"))
if not generators or not generators[-1].exists():
    sys.exit("generate_review.py not found; install skill-creator or set SKILL_CREATOR_DIR")
generator = generators[-1]

if len(sys.argv) < 2:
    sys.exit(__doc__)
workspace = Path(sys.argv[1])
extra = sys.argv[2:]

_dumps = json.dumps
json.dumps = lambda *a, **k: _dumps(*a, **k).replace("</", "<\\/")

sys.argv = [
    str(generator), str(workspace),
    "--skill-name", "building-accessible-ui",
    "--benchmark", str(workspace / "benchmark.json"),
    "--static", str(workspace / "review.html"),
    *extra,
]
runpy.run_path(str(generator), run_name="__main__")
