"""
Ad-hoc exploration of real bronze listings for data-quality assessment.

This script is a developer utility (not part of the Lambda runtime). It scans
the locally synced bronze JSON snapshots and reports how often the fields the
silver transform depends on are missing or null -- specifically ``priceByArea``
and ``neighborhood`` -- so the cleaning rules in subtask 3.2 are grounded in the
real data distribution rather than assumptions.

Usage::

    python src/etl/data_processing/explore_bronze.py [DATA_DIR]

``DATA_DIR`` defaults to ``data/s3`` relative to the repository root.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

# Default location of locally synced bronze snapshots (gitignored).
DEFAULT_DATA_DIR = Path("data/s3")


@dataclass
class QualityReport:
    """Aggregated data-quality counters across scanned bronze files.

    Attributes:
        files_scanned: Number of JSON files successfully parsed.
        files_failed: File names that could not be parsed as JSON.
        total_elements: Total number of listing elements seen.
        null_price_by_area: Elements with missing or null ``priceByArea``.
        missing_neighborhood: Elements with missing/null/empty ``neighborhood``.
        missing_operation: Elements with missing/null ``operation``.
    """

    files_scanned: int = 0
    files_failed: List[str] = field(default_factory=list)
    total_elements: int = 0
    null_price_by_area: int = 0
    missing_neighborhood: int = 0
    missing_operation: int = 0


def _scan_file(path: Path, report: QualityReport) -> None:
    """Update ``report`` in place with counters derived from one bronze file.

    Args:
        path: Path to a single bronze JSON file.
        report: Aggregated report to mutate.
    """
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        report.files_failed.append(path.name)
        return

    report.files_scanned += 1

    for element in payload.get("elementList", []):
        report.total_elements += 1

        # priceByArea may be absent or explicitly null in the API response.
        if element.get("priceByArea") is None:
            report.null_price_by_area += 1

        # neighborhood is frequently absent for listings outside named barrios;
        # treat missing, null, and empty string as missing for cleaning rules.
        neighborhood = element.get("neighborhood")
        if neighborhood is None or neighborhood == "":
            report.missing_neighborhood += 1

        if element.get("operation") is None:
            report.missing_operation += 1


def build_report(data_dir: Path) -> QualityReport:
    """Scan every ``*.json`` file under ``data_dir`` and return a report.

    Args:
        data_dir: Directory containing bronze JSON snapshots.

    Returns:
        A populated :class:`QualityReport`.

    Raises:
        FileNotFoundError: If ``data_dir`` does not exist.
    """
    if not data_dir.is_dir():
        raise FileNotFoundError(f"data directory not found: {data_dir}")

    report = QualityReport()
    for path in sorted(data_dir.glob("*.json")):
        _scan_file(path, report)
    return report


def _percent(part: int, whole: int) -> str:
    """Format ``part/whole`` as a percentage string, guarding division by zero."""
    if whole == 0:
        return "n/a"
    return f"{(part / whole) * 100:.1f}%"


def format_report(report: QualityReport) -> str:
    """Render a human-readable summary of a :class:`QualityReport`."""
    lines: List[str] = [
        "Bronze data-quality report",
        "=" * 30,
        f"Files scanned        : {report.files_scanned}",
        f"Files failed to parse: {len(report.files_failed)}",
        f"Total elements       : {report.total_elements}",
        f"Null priceByArea     : {report.null_price_by_area} "
        f"({_percent(report.null_price_by_area, report.total_elements)})",
        f"Missing neighborhood : {report.missing_neighborhood} "
        f"({_percent(report.missing_neighborhood, report.total_elements)})",
        f"Missing operation    : {report.missing_operation} "
        f"({_percent(report.missing_operation, report.total_elements)})",
    ]
    if report.files_failed:
        lines.append("")
        lines.append("Unparseable files:")
        lines.extend(f"  - {name}" for name in report.files_failed)
    return "\n".join(lines)


def main(argv: List[str]) -> int:
    """CLI entry point.

    Args:
        argv: Command-line arguments excluding the program name.

    Returns:
        Process exit code (0 on success, 1 if the data directory is missing).
    """
    data_dir = Path(argv[0]) if argv else DEFAULT_DATA_DIR
    try:
        report = build_report(data_dir)
    except FileNotFoundError as exc:
        print(exc, file=sys.stderr)
        return 1

    print(format_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
