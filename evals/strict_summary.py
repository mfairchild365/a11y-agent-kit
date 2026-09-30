#!/usr/bin/env python3
"""Strict "zero defects" scoring, matching the a11y-llm-eval report metric:
a run passes only if EVERY defect check passes (one failure fails the run).

Defect checks = every expectation in a run's grading.json except the two
process assertions (whether the response reported an automated check, and
whether it avoided a blanket "fully accessible" claim). Those are reported
separately because they aren't WCAG defects in the deliverable.

Two views, per configuration:
  strict_all           zero failures across all defect checks (axe + upstream
                       + LLM-graded scenario assertions)
  strict_programmatic  zero failures across axe + "[upstream]" checks only
                       (the only view comparable for runs without LLM grading)

Usage: python3 evals/strict_summary.py <workspace-dir> [--write]
  --write   also saves strict_summary.{json,md} in the workspace and adds a
            note to benchmark.json (if present) so the viewer shows it.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

PROCESS_PREFIXES = (
    "The response reports having run an automated accessibility check",
    "The response does not claim the output is 'fully accessible'",
)
AXE_PREFIX = "No WCAG (non-best-practice) axe violations"


def is_process(text: str) -> bool:
    return text.startswith(PROCESS_PREFIXES)


def is_programmatic(text: str) -> bool:
    return text.startswith(AXE_PREFIX) or text.startswith("[upstream] ")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    write = "--write" in sys.argv
    if len(args) != 1:
        print(__doc__)
        return 2
    ws = Path(args[0])
    rows = []
    for g in sorted(ws.glob("eval-*/*/run-*/grading.json")):
        eval_name = g.parts[-4].removeprefix("eval-")
        cfg = g.parts[-3]
        exps = json.load(open(g))["expectations"]
        defects = [e for e in exps if not is_process(e["text"])]
        prog = [e for e in defects if is_programmatic(e["text"])]
        llm_graded = any(not is_programmatic(e["text"]) for e in defects)
        rows.append({
            "eval": eval_name,
            "config": cfg,
            "strict_all": all(e["passed"] for e in defects),
            "strict_programmatic": all(e["passed"] for e in prog),
            "llm_graded": llm_graded,
            "defects_failed": [e["text"][:110] for e in defects if not e["passed"]],
        })

    by_cfg = defaultdict(list)
    for r in rows:
        by_cfg[r["config"]].append(r)

    lines = [f"# Strict (zero-defect) results: {ws.name}", "",
             "| config | strict_all | strict_programmatic |", "|---|---|---|"]
    summary = {}
    for cfg, rs in sorted(by_cfg.items()):
        n = len(rs)
        a = sum(r["strict_all"] for r in rs)
        p = sum(r["strict_programmatic"] for r in rs)
        llm = all(r["llm_graded"] for r in rs)
        summary[cfg] = {"runs": n, "strict_all": a, "strict_programmatic": p, "llm_graded": llm}
        lines.append(f"| {cfg} | {a}/{n}" + ("" if llm else " (no LLM grading; = programmatic)") + f" | {p}/{n} |")
    lines += ["", "## Runs that fail the strict rule", ""]
    for r in rows:
        if not r["strict_all"]:
            lines.append(f"- **{r['eval']}** ({r['config']}): " + "; ".join(r["defects_failed"]))
    text = "\n".join(lines)
    print(text)

    if write:
        json.dump({"summary": summary, "runs": rows}, open(ws / "strict_summary.json", "w"), indent=2)
        (ws / "strict_summary.md").write_text(text + "\n")
        bm = ws / "benchmark.json"
        if bm.exists():
            data = json.load(open(bm))
            notes = [n for n in data.get("notes", []) if not n.startswith("Strict zero-defect")]
            for cfg, s in sorted(summary.items()):
                notes.append(f"Strict zero-defect pass ({cfg}): {s['strict_all']}/{s['runs']} runs "
                             f"(programmatic-only: {s['strict_programmatic']}/{s['runs']}). "
                             "A run fails if any defect check fails; process assertions excluded.")
            data["notes"] = notes
            json.dump(data, open(bm, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
