"""
Pipeline-health domain model and status helpers (FEATURE-012, task 12.1).

Defines the traffic-light :data:`HealthStatus` values, the immutable
:class:`HealthCheckResult` value object (JSON-schema constants included),
the narrow :class:`HealthCheck` Protocol every rule implements, and the
pure :func:`worst_status` composition helper (red beats yellow beats
green — see ``dev/plans/FEATURE-012-pipeline-health-monitoring.md``,
"Design & patterns").

A Composite-pattern class hierarchy was considered and rejected: "take
the worst of N enum values" is fully expressed by one plain function.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Protocol, runtime_checkable

#: Traffic-light status literals (JSON schema constants). Plain strings
#: rather than an Enum so ``HealthCheckResult.to_dict()`` is JSON-safe
#: without a serialization shim.
GREEN = "green"
YELLOW = "yellow"
RED = "red"

#: Ordered worst-to-best precedence used by :func:`worst_status`.
_STATUS_PRECEDENCE: Dict[str, int] = {RED: 0, YELLOW: 1, GREEN: 2}

HealthStatus = str
"""Type alias documenting that a status is one of GREEN, YELLOW, RED."""


def worst_status(statuses: List[HealthStatus]) -> HealthStatus:
    """
    Return the worst of the given statuses (red > yellow > green).

    Pure, order-independent composition rule shared by every Ampel rule
    and by the overall pipeline-health aggregation.

    Args:
        statuses: Non-empty list of ``HealthStatus`` values.

    Returns:
        The single worst status among *statuses*.

    Raises:
        ValueError: If *statuses* is empty.
    """
    if not statuses:
        raise ValueError("worst_status requires at least one status")
    return min(statuses, key=lambda status: _STATUS_PRECEDENCE[status])


@dataclass(frozen=True)
class HealthCheckResult:
    """
    Immutable, JSON-safe outcome of one health check evaluation.

    Encapsulation: callers only ever see the four public fields; the
    :meth:`to_dict` method is the single serialization boundary so the
    gold JSON schema stays stable even if internal representations
    change.

    Insufficient-history cases (e.g. a fresh deployment with fewer than
    5 invocations) are represented as data in ``details`` — they are not
    exceptions, matching the acceptance criterion that short history
    never raises.
    """

    status: HealthStatus
    summary: str
    details: Dict[str, Any] = field(default_factory=dict)
    evaluated_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize to the exact JSON-safe shape persisted to gold.

        Returns:
            Dict with only ``status``, ``summary``, ``details`` and
            ``evaluated_at`` (ISO-8601 string) keys.
        """
        return {
            "status": self.status,
            "summary": self.summary,
            "details": self.details,
            "evaluated_at": self.evaluated_at.isoformat(),
        }


@runtime_checkable
class HealthCheck(Protocol):
    """
    Narrow interface every Ampel rule implements (Interface Segregation).

    A single ``evaluate()`` operation returning a :class:`HealthCheckResult`
    — callers never need to know how a rule gathers its evidence (Logs
    Insights, CloudWatch metrics, Cost Explorer, ...).
    """

    def evaluate(self) -> HealthCheckResult:
        """Evaluate this rule now and return its result."""
        ...


__all__: List[str] = [
    "GREEN",
    "RED",
    "YELLOW",
    "HealthCheck",
    "HealthCheckResult",
    "HealthStatus",
    "worst_status",
]
