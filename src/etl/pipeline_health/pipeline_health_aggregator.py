"""
Pipeline-health aggregator (FEATURE-012, task 12.8).

Mirrors :class:`gold_aggregator.GoldAggregator`'s orchestration shape
exactly: a thin class that runs a fixed set of Strategy-pattern health
checks (Single Responsibility — orchestration only, the check math lives
in :mod:`pipeline_health.health_checks`), composes the overall traffic
light via :func:`~pipeline_health.health_checks.worst_status`, and writes
the result via the existing :class:`~common.object_store.ObjectStore`
Adapter — no new storage abstraction needed (design doc, "Design & patterns").
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict

from common.object_store import ObjectStore
from health_checks import GREEN, HealthCheck, HealthCheckResult, worst_status

logger = logging.getLogger()

#: JSON schema version for gold/pipeline_health/latest.json.
SCHEMA_VERSION = "1.0"

#: Output key, mirroring gold_aggregator's "latest.json" convention.
OUTPUT_KEY = "gold/pipeline_health/latest.json"


def _safe_evaluate(name: str, check: HealthCheck) -> HealthCheckResult:
    """
    Run one check, catching any exception so one failing check never
    prevents the others from producing a result (acceptance criterion,
    task 12.8) — aggregator *construction* is still allowed to raise.

    Args:
        name: Human-readable check name, used only in the error detail.
        check: The :class:`HealthCheck` Strategy instance to run.

    Returns:
        The check's own result, or a synthetic ``green``-worst (i.e.
        conservative) result documenting the failure in ``details`` when
        the check itself raised.
    """
    try:
        return check.evaluate()
    except Exception as exc:  # noqa: BLE001 — isolate one bad check from the rest
        logger.error("Health check %r raised %s: %s", name, type(exc).__name__, exc)
        from health_checks import RED

        return HealthCheckResult(
            status=RED,
            summary=f"{name} check failed to evaluate: {exc}",
            details={"error": str(exc), "error_type": type(exc).__name__},
        )


@dataclass(frozen=True)
class PipelineHealthResult:
    """
    Immutable summary of one pipeline-health aggregation run.

    Attributes:
        key: S3 key the health JSON was written to.
        size_bytes: Size of the written JSON payload.
        overall_status: The composed traffic-light status.
    """

    key: str
    size_bytes: int
    overall_status: str


class PipelineHealthAggregator:
    """
    Run the 4 Ampel health checks and persist gold/pipeline_health/latest.json.

    Single Responsibility: orchestration only — every check owns its own
    evidence-gathering, storage stays behind :class:`ObjectStore`.
    Open/Closed: a 5th sub-light is one more injected check, not an edit
    to this class.
    """

    def __init__(
        self,
        *,
        object_store: ObjectStore,
        execution_success_check: HealthCheck,
        execution_duration_check: HealthCheck,
        api_quota_check: HealthCheck,
        aws_cost_check: HealthCheck,
    ) -> None:
        """
        Args:
            object_store: Storage abstraction for the gold write.
            execution_success_check: Already-constructed
                ``ExecutionSuccessCheck`` (or test double) — Ampel rule 1.
            execution_duration_check: Already-constructed
                ``ExecutionDurationCheck`` (or test double) — Ampel rule 2.
            api_quota_check: Already-constructed ``ApiQuotaCheck`` (or test
                double) — Ampel rule 3.
            aws_cost_check: Already-constructed ``AwsCostCheck`` (or test
                double) — Ampel rule 4.

        Raises:
            Any exception raised by argument validation is allowed to
            propagate — construction failures are not caught, only
            per-check evaluation failures (see :func:`_safe_evaluate`).
        """
        self._store = object_store
        self._checks: Dict[str, HealthCheck] = {
            "execution_success": execution_success_check,
            "execution_duration": execution_duration_check,
            "api_quota": api_quota_check,
            "aws_cost": aws_cost_check,
        }

    def aggregate(self) -> PipelineHealthResult:
        """
        Run every check, compose the overall status, and write the JSON.

        Returns:
            Summary with the written key, payload size and overall status.
        """
        document = self.build_document()
        body = json.dumps(document, default=str).encode("utf-8")

        self._store.put_bytes(OUTPUT_KEY, body, content_type="application/json")
        logger.info("Wrote pipeline health (%d bytes) to %s", len(body), OUTPUT_KEY)

        return PipelineHealthResult(
            key=OUTPUT_KEY,
            size_bytes=len(body),
            overall_status=document["overall_status"],
        )

    def build_document(self) -> Dict[str, Any]:
        """
        Assemble the pipeline-health JSON document.

        Returns:
            Dict with ``schema_version``, ``generated_at`` (ISO-8601 UTC),
            ``overall_status`` and the four named checks, each serialized
            via :meth:`HealthCheckResult.to_dict`.
        """
        results = {
            name: _safe_evaluate(name, check) for name, check in self._checks.items()
        }
        statuses = [result.status for result in results.values()] or [GREEN]

        return {
            "schema_version": SCHEMA_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "overall_status": worst_status(statuses),
            **{name: result.to_dict() for name, result in results.items()},
        }


__all__ = [
    "OUTPUT_KEY",
    "SCHEMA_VERSION",
    "PipelineHealthAggregator",
    "PipelineHealthResult",
]
