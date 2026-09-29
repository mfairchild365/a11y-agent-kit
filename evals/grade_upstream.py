#!/usr/bin/env python3
"""Optional second grading layer: runs the pinned upstream Playwright checks
(microsoft/a11y-llm-eval) against the runs for the 7 evals that have an
upstream equivalent, and merges their assertions into each run's
grading.json as "[upstream] ..." expectations.

Requires evals/.upstream/a11y-llm-eval to exist — run evals/fetch-upstream.sh
first. This script never fetches on its own, so a missing checkout is always
a deliberate, visible step rather than a surprise network call.

Usage:
    python3 grade_upstream.py <workspace-iteration-dir>
"""
import json
import subprocess
import sys
from pathlib import Path

EVALS_DIR = Path(__file__).resolve().parent
UPSTREAM_ROOT = EVALS_DIR / ".upstream" / "a11y-llm-eval"
RUNNER = UPSTREAM_ROOT / "node_runner" / "runner.js"

# eval name (as used in evals.json / eval-<name> dirs) -> upstream test_cases scenario
EVAL_TO_UPSTREAM_SCENARIO = {
    "contact-form": "simple-contact-form",
    "consent-checkbox": "single-checkbox",
    "quiz-checkbox-groups": "checkbox-group",
    "notification-radio-group": "radio-button-group",
    "faq-disclosure": "disclosure-widget",
    "delete-confirm-dialog": "modal-dialog",
    "shop-home-page": "shopping-home-page",
}


def find_output_html(run_dir: Path) -> Path | None:
    outputs = run_dir / "outputs"
    if not outputs.is_dir():
        return None
    preferred = outputs / "index.html"
    if preferred.exists():
        return preferred
    html_files = sorted(outputs.glob("*.html"))
    return html_files[0] if html_files else None


def run_upstream_checks(html_path: Path, test_js: Path, out_json: Path) -> dict | None:
    proc = subprocess.run(
        ["node", str(RUNNER), str(html_path), str(test_js), str(out_json)],
        capture_output=True,
        text=True,
    )
    if not out_json.exists():
        print(f"  runner produced no output ({proc.returncode}): {proc.stderr.strip()[:300]}", file=sys.stderr)
        return None
    with open(out_json) as f:
        return json.load(f)


def merge_upstream_expectations(grading_path: Path, assertions: list[dict]) -> None:
    if grading_path.exists():
        with open(grading_path) as f:
            grading = json.load(f)
    else:
        grading = {"expectations": []}

    # Drop any prior [upstream] entries (re-runnable), keep everything else.
    expectations = [e for e in grading.get("expectations", []) if not e.get("text", "").startswith("[upstream] ")]

    for a in assertions:
        if a.get("type") != "R":
            continue  # requirement-type only; best-practice items aren't counted here
        if a.get("status") == "na":
            continue
        expectations.append({
            "text": f"[upstream] {a['name']}",
            "passed": a.get("status") == "pass",
            "evidence": a.get("message") or "(no message)",
        })

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
        print("Usage: python3 grade_upstream.py <workspace-iteration-dir>", file=sys.stderr)
        return 2

    if not RUNNER.exists():
        print(
            f"Upstream runner not found at {RUNNER}.\n"
            "Run evals/fetch-upstream.sh first — this script never fetches on its own.",
            file=sys.stderr,
        )
        return 1

    iteration_dir = Path(sys.argv[1])
    if not iteration_dir.is_dir():
        print(f"Not a directory: {iteration_dir}", file=sys.stderr)
        return 2

    checked = 0
    skipped_no_mapping = 0
    for eval_dir in sorted(iteration_dir.glob("eval-*")):
        eval_name = eval_dir.name.removeprefix("eval-")
        scenario = EVAL_TO_UPSTREAM_SCENARIO.get(eval_name)
        if scenario is None:
            skipped_no_mapping += 1
            continue
        test_js = UPSTREAM_ROOT / "test_cases" / scenario / "test.js"
        if not test_js.exists():
            print(f"  no test.js for scenario {scenario}, skipping {eval_dir}", file=sys.stderr)
            continue

        for run_dir in sorted(eval_dir.glob("*/run-*")):
            html_path = find_output_html(run_dir)
            grading_path = run_dir / "grading.json"
            if html_path is None:
                print(f"[skip: no html] {run_dir}")
                continue
            out_json = run_dir / "upstream-checks.json"
            result = run_upstream_checks(html_path, test_js, out_json)
            if result is None:
                continue
            assertions = result.get("testFunctionResult", {}).get("assertions", [])
            merge_upstream_expectations(grading_path, assertions)
            n_pass = sum(1 for a in assertions if a.get("type") == "R" and a.get("status") == "pass")
            n_total = sum(1 for a in assertions if a.get("type") == "R")
            print(f"[{n_pass}/{n_total}] {run_dir} ({scenario})")
            checked += 1

    print(f"\nChecked {checked} runs across {len(EVAL_TO_UPSTREAM_SCENARIO)} mapped scenarios "
          f"({skipped_no_mapping} eval dirs have no upstream mapping and were skipped).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
