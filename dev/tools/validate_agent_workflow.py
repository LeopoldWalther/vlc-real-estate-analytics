#!/usr/bin/env python3
"""Validate planning workflow consistency across agent and planning artifacts."""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PLANS_DIR = REPO_ROOT / "dev/plans"
TECHNICAL_PLANS_DIR = PLANS_DIR / "technical"
README_PATH = PLANS_DIR / "README.md"

VALID_REQUIRED_CHECKS = {
    "python-lint-and-test",
    "terraform-validate",
    "workflow-consistency",
}

STATUS_EMOJIS = {
    "planned": "🔵",
    "in-progress": "🟡",
    "complete": "🟢",
    "blocked": "🔴",
}

LEGACY_PATTERNS = [
    re.compile(r"\bdev/plan/"),
    re.compile(r"\bdev/plan\b"),
    re.compile(r"\bdev/implementations/"),
]


def _is_text_path(path: Path) -> bool:
    if path.name == ".gitkeep":
        return True
    return path.suffix.lower() in {".md", ".txt", ".yml", ".yaml"}


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _collect_readme_statuses() -> dict[str, str]:
    statuses: dict[str, str] = {}
    readme_text = _read_text(README_PATH)
    for line in readme_text.splitlines():
        if not line.startswith("| TASK-"):
            continue
        columns = [cell.strip() for cell in line.strip().split("|")[1:-1]]
        if len(columns) < 3:
            continue
        task_id = columns[0]
        status_col = columns[2]
        for emoji in STATUS_EMOJIS.values():
            if emoji in status_col:
                statuses[task_id] = emoji
                break
    return statuses


def _extract_plan_status(plan_path: Path) -> str | None:
    text = _read_text(plan_path)
    status_match = re.search(r"^\*\*Status:\*\*\s*(.+?)\s*$", text, flags=re.MULTILINE)
    if not status_match:
        return None
    raw_status = status_match.group(1)
    for emoji in STATUS_EMOJIS.values():
        if emoji in raw_status:
            return emoji
    return None


@dataclass
class TechnicalPlanState:
    path: Path
    task_id: str
    total_tasks: int
    done_tasks: int
    summary_total: int | None
    required_checks: list[str]
    reviewed_plan: str | None


def _extract_required_checks(text: str) -> list[str]:
    checks: list[str] = []
    in_block = False
    for line in text.splitlines():
        if re.match(r"^\s{4}required_checks:\s*$", line):
            in_block = True
            continue
        if in_block and re.match(r"^\s{4}[a-zA-Z_]+:\s*", line):
            break
        if in_block:
            match = re.match(r'^\s{6}-\s+"([^"]+)"\s*$', line)
            if match:
                checks.append(match.group(1))
    return checks


def _parse_technical_plan(path: Path) -> TechnicalPlanState | None:
    text = _read_text(path)

    task_match = re.search(r'^\s{4}for_task:\s+"([^"]+)"\s*$', text, flags=re.MULTILINE)
    if not task_match:
        return None
    task_id = task_match.group(1)

    # Skip generic examples that are not real tasks (e.g. TASK-001-foo-example).
    if not re.fullmatch(r"TASK-\d+", task_id):
        return None

    reviewed_plan_match = re.search(
        r'^\s{4}reviewed_plan:\s+"([^"]+)"\s*$', text, flags=re.MULTILINE
    )
    reviewed_plan = reviewed_plan_match.group(1) if reviewed_plan_match else None

    task_ids = re.findall(r'^\s{4}- id:\s+"[^"]+"\s*$', text, flags=re.MULTILINE)
    statuses = re.findall(r'^\s{6}status:\s+"([^"]+)"\s*$', text, flags=re.MULTILINE)
    done_tasks = sum(status == "done" for status in statuses)

    summary_match = re.search(r'^\s{4}total_tasks:\s+(\d+)\s*$', text, flags=re.MULTILINE)
    summary_total = int(summary_match.group(1)) if summary_match else None

    return TechnicalPlanState(
        path=path,
        task_id=task_id,
        total_tasks=len(task_ids),
        done_tasks=done_tasks,
        summary_total=summary_total,
        required_checks=_extract_required_checks(text),
        reviewed_plan=reviewed_plan,
    )


def _expected_status_for_progress(done_tasks: int, total_tasks: int) -> str:
    if total_tasks <= 0:
        return STATUS_EMOJIS["planned"]
    if done_tasks == 0:
        return STATUS_EMOJIS["planned"]
    if done_tasks == total_tasks:
        return STATUS_EMOJIS["complete"]
    return STATUS_EMOJIS["in-progress"]


def _find_plan_file_for_task(task_id: str) -> Path | None:
    candidates = sorted(PLANS_DIR.glob(f"{task_id}-*.md"))
    if not candidates:
        return None
    return candidates[0]


def validate() -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    # 1) Legacy path drift check.
    for scope in (REPO_ROOT / ".github", REPO_ROOT / "dev"):
        for path in scope.rglob("*"):
            if not path.is_file() or not _is_text_path(path):
                continue
            content = _read_text(path)
            for pattern in LEGACY_PATTERNS:
                if pattern.search(content):
                    rel_path = path.relative_to(REPO_ROOT).as_posix()
                    errors.append(
                        f"Legacy path reference found in {rel_path}: pattern '{pattern.pattern}'"
                    )
                    break

    # 2) Technical plan consistency checks.
    readme_statuses = _collect_readme_statuses()

    for tech_path in sorted(TECHNICAL_PLANS_DIR.glob("TASK-*-technical-plan.yaml")):
        state = _parse_technical_plan(tech_path)
        if state is None:
            continue

        rel_tech_path = tech_path.relative_to(REPO_ROOT).as_posix()

        if state.summary_total is not None and state.summary_total != state.total_tasks:
            errors.append(
                f"{rel_tech_path}: summary.total_tasks={state.summary_total} but parsed tasks={state.total_tasks}"
            )

        if not state.required_checks:
            errors.append(f"{rel_tech_path}: validation.required_checks is empty")
        else:
            for check in state.required_checks:
                if check not in VALID_REQUIRED_CHECKS:
                    errors.append(
                        f"{rel_tech_path}: unknown required_check '{check}'. Allowed: {sorted(VALID_REQUIRED_CHECKS)}"
                    )

        if state.reviewed_plan:
            reviewed_plan_path = REPO_ROOT / state.reviewed_plan
            if not reviewed_plan_path.exists():
                errors.append(
                    f"{rel_tech_path}: reviewed_plan does not exist: {state.reviewed_plan}"
                )

        plan_file = _find_plan_file_for_task(state.task_id)
        if plan_file is None:
            errors.append(
                f"{rel_tech_path}: no top-level plan found for task {state.task_id} under dev/plans/"
            )
            continue

        plan_status = _extract_plan_status(plan_file)
        expected_status = _expected_status_for_progress(state.done_tasks, state.total_tasks)
        rel_plan_path = plan_file.relative_to(REPO_ROOT).as_posix()

        if plan_status is None:
            errors.append(f"{rel_plan_path}: missing or unrecognized **Status:** header")
        elif plan_status != expected_status:
            errors.append(
                f"{rel_plan_path}: status {plan_status} does not match technical progress {state.done_tasks}/{state.total_tasks} (expected {expected_status})"
            )

        readme_status = readme_statuses.get(state.task_id)
        if readme_status is None:
            warnings.append(
                f"dev/plans/README.md: no task table row found for {state.task_id}"
            )
        elif readme_status != expected_status:
            errors.append(
                f"dev/plans/README.md: status {readme_status} for {state.task_id} does not match technical progress {state.done_tasks}/{state.total_tasks} (expected {expected_status})"
            )

    return errors, warnings


def main() -> int:
    errors, warnings = validate()

    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"  - {warning}")

    if errors:
        print("Errors:")
        for error in errors:
            print(f"  - {error}")
        return 1

    print("Workflow consistency validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
