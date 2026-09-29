#!/usr/bin/env python3
"""Base-layer programmatic grading: run axe_check.mjs against every run's
delivered HTML file and merge a single expectation into that run's
grading.json. Safe to run before or after the LLM grader — both merge into
the same file, keyed by expectation text, and each recomputes the summary.

Usage:
    python3 grade_axe.py <workspace-iteration-dir>
    python3 grade_axe.py evals/workspace/iteration-1

Expects the skill-creator run layout:
    <iteration-dir>/eval-<name>/<with_skill|without_skill>/run-<N>/outputs/index.html
"""
import json
import subprocess
import sys
from pathlib import Path

AXE_EXPECTATION_TEXT = "No WCAG (non-best-practice) axe violations in the delivered file"
EVALS_DIR = Path(__file__).resolve().parent
AXE_CHECK = EVALS_DIR / "axe_check.mjs"


def find_output_html(run_dir: Path) -> Path | None:
    outputs = run_dir / "outputs"
    if not outputs.is_dir():
        return None
    preferred = outputs / "index.html"
    if preferred.exists():
        return preferred
    html_files = sorted(outputs.glob("*.html"))
    return html_files[0] if html_files else None


def run_axe(html_path: Path) -> dict:
    proc = subprocess.run(
        ["node", str(AXE_CHECK), str(html_path.resolve())],
        capture_output=True,
        text=True,
        cwd=EVALS_DIR,
    )
    if proc.returncode not in (0, 1):
        return {
            "passed": False,
            "evidence": f"axe_check.mjs errored (exit {proc.returncode}): {proc.stderr.strip()[:500]}",
        }
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {
            "passed": False,
            "evidence": f"axe_check.mjs produced non-JSON output: {proc.stdout.strip()[:500]} {proc.stderr.strip()[:500]}",
        }
    wcag = data.get("wcag", [])
    if not wcag:
        evidence = "No WCAG violations found by axe-core."
        if data.get("bp"):
            bp_ids = ", ".join(v["id"] for v in data["bp"])
            evidence += f" ({len(data['bp'])} best-practice-only items, not counted: {bp_ids})"
        return {"passed": True, "evidence": evidence}
    ids = ", ".join(f"{v['id']} ({v['impact']})" for v in wcag)
    return {"passed": False, "evidence": f"{len(wcag)} WCAG violation(s): {ids}"}


def merge_expectation(grading_path: Path, text: str, passed: bool, evidence: str) -> None:
    if grading_path.exists():
        with open(grading_path) as f:
            grading = json.load(f)
    else:
        grading = {"expectations": []}

    expectations = [e for e in grading.get("expectations", []) if e.get("text") != text]
    expectations.append({"text": text, "passed": passed, "evidence": evidence})
    grading["expectations"] = expectations

    total = len(expectations)
    passed_count = sum(1 for e in expectations if e.get("passed"))
    grading["summary"] = {
        "passed": passed_count,
        "failed": total - passed_count,
        "total": total,
        "pass_rate": round(passed_count / total, 4) if total else 0.0,
    }

    grading_path.parent.mkdir(parents=True, exist_ok=True)
    with open(grading_path, "w") as f:
        json.dump(grading, f, indent=2)


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 grade_axe.py <workspace-iteration-dir>", file=sys.stderr)
        return 2

    iteration_dir = Path(sys.argv[1])
    if not iteration_dir.is_dir():
        print(f"Not a directory: {iteration_dir}", file=sys.stderr)
        return 2

    run_dirs = sorted(iteration_dir.glob("eval-*/*/run-*"))
    if not run_dirs:
        print(f"No run-* directories found under {iteration_dir}/eval-*/*/", file=sys.stderr)
        return 1

    checked = 0
    for run_dir in run_dirs:
        html_path = find_output_html(run_dir)
        grading_path = run_dir / "grading.json"
        if html_path is None:
            merge_expectation(grading_path, AXE_EXPECTATION_TEXT, False, "No outputs/*.html file found for this run.")
            print(f"[skip: no html] {run_dir}")
            continue
        result = run_axe(html_path)
        merge_expectation(grading_path, AXE_EXPECTATION_TEXT, result["passed"], result["evidence"])
        status = "PASS" if result["passed"] else "FAIL"
        print(f"[{status}] {run_dir}")
        checked += 1

    print(f"\nChecked {checked}/{len(run_dirs)} runs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
