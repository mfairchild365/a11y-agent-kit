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
import runpy
import sys
from pathlib import Path

SC = Path.home() / ".claude/plugins/cache/claude-plugins-official/skill-creator"
generators = sorted(SC.glob("*/skills/skill-creator/eval-viewer/generate_review.py"))
if not generators:
    sys.exit(f"generate_review.py not found under {SC}")
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
