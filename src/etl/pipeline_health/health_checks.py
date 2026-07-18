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

import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

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


# ---------------------------------------------------------------------------
# Execution health checks (FEATURE-012, task 12.5)
# ---------------------------------------------------------------------------
#
# ExecutionSuccessCheck / ExecutionDurationCheck answer "did the last N
# invocations of each pipeline Lambda succeed, and how long did they take?"
# CloudWatch's standard Errors/Invocations metrics are calendar-period
# aggregates and cannot answer "was invocation N-1 specifically a failure",
# so both checks read discrete per-invocation ``REPORT`` events via
# CloudWatch Logs Insights (review M2) through one shared, bounded-polling
# adapter (:class:`_LogsInsightsExecutionHistory`).

#: Rule 1/2 invocation window (see
#: dev/plans/FEATURE-012-pipeline-health-monitoring.md, "Design & patterns").
EXECUTION_HISTORY_WINDOW = 5

#: Rule 2 duration thresholds, in seconds.
DURATION_YELLOW_THRESHOLD_SECONDS = 5 * 60
DURATION_RED_THRESHOLD_SECONDS = 10 * 60

#: Bounded Logs Insights polling (review M2): never block indefinitely.
LOGS_INSIGHTS_MAX_POLL_ATTEMPTS = 10
LOGS_INSIGHTS_POLL_INTERVAL_SECONDS = 1.0

#: How far back to search for the last invocations. Generous relative to
#: the pipeline's weekly cadence so a fresh deployment's first few weekly
#: runs are still found.
LOGS_INSIGHTS_LOOKBACK_SECONDS = 30 * 24 * 60 * 60


@dataclass(frozen=True)
class _InvocationRecord:
    """One parsed ``REPORT`` log event: duration and success/failure."""

    duration_seconds: float
    succeeded: bool


class LogsInsightsQueryError(Exception):
    """
    Raised internally when a Logs Insights query cannot be completed.

    Covers both an explicit ``Failed``/``Cancelled`` query status and
    bounded-polling timeout (review M2). Callers (the Strategy classes)
    must catch this and translate it into a non-crashing yellow/red
    :class:`HealthCheckResult` — it must never escape ``evaluate()``.
    """


class _LogsInsightsExecutionHistory:
    """
    Bounded-polling Adapter around CloudWatch Logs Insights.

    Wraps ``start_query``/``get_query_results`` behind a small, testable
    surface (Adapter pattern, mirrors :class:`~common.object_store.ObjectStore`
    and :class:`~common.metrics_publisher.MetricsPublisher`): the injected
    ``logs_client`` is a boto3 ``logs`` client (Dependency Inversion — never
    constructed here), and polling is bounded by
    ``max_poll_attempts`` so a stuck query surfaces as a
    :class:`LogsInsightsQueryError`, never an indefinite hang.

    The query string extracts, per invocation, the ``REPORT`` line
    duration and an ``error_marker`` capture group flagging common Lambda
    failure signatures (unhandled exception, timeout, out-of-memory exit).
    This is a best-effort approximation of real Lambda log shapes — the
    exact regex is not asserted upon in tests (which stub
    ``get_query_results`` directly), only the resulting parsed records are.
    """

    _QUERY_STRING_TEMPLATE = (
        "fields @timestamp, @duration as duration_ms, @message"
        " | filter @message like /REPORT/"
        " | parse @message /(?<error_marker>Task timed out|ERROR|"
        "Process exited before completing request)/"
        " | fields @timestamp, duration_ms, error_marker"
        " | sort @timestamp desc"
        " | limit {limit}"
    )

    def __init__(
        self,
        logs_client: object,
        max_poll_attempts: int = LOGS_INSIGHTS_MAX_POLL_ATTEMPTS,
        poll_interval_seconds: float = LOGS_INSIGHTS_POLL_INTERVAL_SECONDS,
        lookback_seconds: int = LOGS_INSIGHTS_LOOKBACK_SECONDS,
        sleep_fn: Any = time.sleep,
        now_fn: Any = time.time,
    ) -> None:
        """
        Args:
            logs_client: boto3 ``logs`` client (injected; a
                ``botocore.stub.Stubber`` wraps it in tests).
            max_poll_attempts: Bounded number of ``get_query_results``
                polls before giving up (review M2 — never block forever).
            poll_interval_seconds: Sleep between polls.
            lookback_seconds: Logs Insights query time window, ending now.
            sleep_fn: Injected sleep function (tests pass a no-op fake so
                polling loops run instantly).
            now_fn: Injected clock (seconds since epoch) for deterministic
                query time windows in tests.
        """
        self._logs_client = logs_client
        self._max_poll_attempts = max_poll_attempts
        self._poll_interval_seconds = poll_interval_seconds
        self._lookback_seconds = lookback_seconds
        self._sleep = sleep_fn
        self._now = now_fn

    def fetch(
        self, function_name: str, window: int = EXECUTION_HISTORY_WINDOW
    ) -> List[_InvocationRecord]:
        """
        Return up to *window* most-recent invocation records, newest first.

        Args:
            function_name: Lambda function name; log group is derived as
                ``/aws/lambda/{function_name}``.
            window: Maximum number of invocations to return.

        Returns:
            Newest-first list of parsed invocation records (possibly empty
            when the function has no matching log events yet).

        Raises:
            LogsInsightsQueryError: The query failed, was cancelled, or
                bounded polling was exhausted without reaching ``Complete``.
        """
        log_group_name = f"/aws/lambda/{function_name}"
        end_time = int(self._now())
        start_time = end_time - self._lookback_seconds

        start_response = self._logs_client.start_query(  # type: ignore[attr-defined]
            logGroupName=log_group_name,
            startTime=start_time,
            endTime=end_time,
            queryString=self._QUERY_STRING_TEMPLATE.format(limit=window),
            limit=window,
        )
        query_id = start_response["queryId"]

        for attempt in range(self._max_poll_attempts):
            result = self._logs_client.get_query_results(  # type: ignore[attr-defined]
                queryId=query_id
            )
            status = result.get("status")
            if status == "Complete":
                return [self._parse_row(row) for row in result.get("results", [])]
            if status in ("Failed", "Cancelled", "Timeout"):
                raise LogsInsightsQueryError(
                    f"Logs Insights query {status.lower()} for {function_name!r}"
                )
            if attempt < self._max_poll_attempts - 1:
                self._sleep(self._poll_interval_seconds)

        raise LogsInsightsQueryError(
            f"Logs Insights query timed out for {function_name!r} after "
            f"{self._max_poll_attempts} poll attempts"
        )

    @staticmethod
    def _parse_row(row: List[Dict[str, str]]) -> "_InvocationRecord":
        """Map one Logs Insights result row to an :class:`_InvocationRecord`."""
        fields = {entry["field"]: entry["value"] for entry in row}
        duration_ms = float(fields.get("duration_ms", 0.0))
        error_marker = fields.get("error_marker", "")
        return _InvocationRecord(
            duration_seconds=duration_ms / 1000.0,
            succeeded=not bool(error_marker),
        )


class ExecutionSuccessCheck:
    """
    Strategy: Ampel rule 1 — did the last invocations of each function succeed?

    Worst of all monitored functions wins (Single Responsibility: this
    class only composes success/failure, :class:`ExecutionDurationCheck`
    only composes duration — both share the same Logs Insights evidence).
    """

    key: str = "execution_success"

    def __init__(
        self,
        logs_client: object,
        function_names: List[str],
        window: int = EXECUTION_HISTORY_WINDOW,
        history: Optional[_LogsInsightsExecutionHistory] = None,
    ) -> None:
        """
        Args:
            logs_client: boto3 ``logs`` client (injected).
            function_names: Names of the 3 pipeline Lambdas to monitor.
            window: Invocation window size (``EXECUTION_HISTORY_WINDOW``).
            history: Optional pre-built history adapter (tests inject one
                with a fake clock/sleep); built from *logs_client* when
                omitted.
        """
        self._function_names = list(function_names)
        self._window = window
        self._history = history or _LogsInsightsExecutionHistory(logs_client)

    def evaluate(self) -> HealthCheckResult:
        """Evaluate rule 1 across every monitored function."""
        per_function: Dict[str, Any] = {}
        statuses: List[HealthStatus] = []

        for function_name in self._function_names:
            status, detail = self._evaluate_one(function_name)
            per_function[function_name] = detail
            statuses.append(status)

        overall = worst_status(statuses) if statuses else GREEN
        return HealthCheckResult(
            status=overall,
            summary=f"Execution success: {overall} across {len(self._function_names)} function(s)",
            details={"functions": per_function},
        )

    def _evaluate_one(
        self, function_name: str
    ) -> "tuple[HealthStatus, Dict[str, Any]]":
        """Evaluate one function; never raises (query errors become yellow)."""
        try:
            records = self._history.fetch(function_name, self._window)
        except LogsInsightsQueryError as exc:
            return YELLOW, {"status": YELLOW, "query_error": str(exc)}

        count = len(records)
        if count == 0:
            return YELLOW, {
                "status": YELLOW,
                "insufficient_history": True,
                "invocations_checked": 0,
            }

        latest = records[0]
        if not latest.succeeded:
            return RED, {"status": RED, "invocations_checked": count}

        earlier_failed = any(not record.succeeded for record in records[1:])
        if earlier_failed:
            return YELLOW, {"status": YELLOW, "invocations_checked": count}

        detail: Dict[str, Any] = {"status": GREEN, "invocations_checked": count}
        if count < self._window:
            detail["insufficient_history"] = True
        return GREEN, detail


class ExecutionDurationCheck:
    """
    Strategy: Ampel rule 2 — how long did the last invocations of each
    function take?

    Reads the same :class:`_LogsInsightsExecutionHistory` evidence as
    :class:`ExecutionSuccessCheck` (one shared query helper, two Strategy
    classes consuming its result — see design doc).
    """

    key: str = "execution_duration"

    def __init__(
        self,
        logs_client: object,
        function_names: List[str],
        window: int = EXECUTION_HISTORY_WINDOW,
        history: Optional[_LogsInsightsExecutionHistory] = None,
    ) -> None:
        """
        Args:
            logs_client: boto3 ``logs`` client (injected).
            function_names: Names of the 3 pipeline Lambdas to monitor.
            window: Invocation window size (``EXECUTION_HISTORY_WINDOW``).
            history: Optional pre-built history adapter (tests inject one).
        """
        self._function_names = list(function_names)
        self._window = window
        self._history = history or _LogsInsightsExecutionHistory(logs_client)

    def evaluate(self) -> HealthCheckResult:
        """Evaluate rule 2 across every monitored function."""
        per_function: Dict[str, Any] = {}
        statuses: List[HealthStatus] = []

        for function_name in self._function_names:
            status, detail = self._evaluate_one(function_name)
            per_function[function_name] = detail
            statuses.append(status)

        overall = worst_status(statuses) if statuses else GREEN
        return HealthCheckResult(
            status=overall,
            summary=f"Execution duration: {overall} across {len(self._function_names)} function(s)",
            details={"functions": per_function},
        )

    def _evaluate_one(
        self, function_name: str
    ) -> "tuple[HealthStatus, Dict[str, Any]]":
        """Evaluate one function; never raises (query errors become yellow)."""
        try:
            records = self._history.fetch(function_name, self._window)
        except LogsInsightsQueryError as exc:
            return YELLOW, {"status": YELLOW, "query_error": str(exc)}

        count = len(records)
        if count == 0:
            return YELLOW, {
                "status": YELLOW,
                "insufficient_history": True,
                "invocations_checked": 0,
            }

        max_duration = max(record.duration_seconds for record in records)
        if max_duration > DURATION_RED_THRESHOLD_SECONDS:
            status = RED
        elif max_duration >= DURATION_YELLOW_THRESHOLD_SECONDS:
            status = YELLOW
        else:
            status = GREEN

        detail: Dict[str, Any] = {
            "status": status,
            "invocations_checked": count,
            "max_duration_seconds": max_duration,
        }
        if count < self._window:
            detail["insufficient_history"] = True
        return status, detail


# ---------------------------------------------------------------------------
# API quota health check (FEATURE-012, task 12.6)
# ---------------------------------------------------------------------------
#
# ApiQuotaCheck answers "how close is each Idealista credential set to its
# 100 requests/month quota?" over the last 5 fully-completed calendar
# months (excluding the current in-progress month, which would otherwise
# bias the result green just because the month has not finished yet).
#
# Scope decision (review M3): this repo's dev and prod environments share
# the same LVW/PMV Idealista credentials (confirmed in review), so quota
# is **credential-global**, not environment-local — the metric carries no
# ``Environment`` dimension (none was added in task 12.3) and this check
# never filters by one. If dev/prod ever use separate credentials, an
# ``Environment`` dimension would need to be added at the publish site
# (task 12.3) and filtered here.

#: Idealista's quota, per credential set, per calendar month.
API_QUOTA_MONTHLY_REQUESTS = 100

#: Rule 3 thresholds, in requests/month (percentages of
#: API_QUOTA_MONTHLY_REQUESTS, made explicit as request counts per the
#: acceptance criteria: 80 and 95).
API_QUOTA_YELLOW_THRESHOLD_REQUESTS = 80
API_QUOTA_RED_THRESHOLD_REQUESTS = 95

#: Rule 3 evaluation window: last N fully-completed calendar months.
API_QUOTA_EVALUATION_MONTHS = 5

#: Human-readable labels for each credential set (review M3: details must
#: label LVW as "sale" and PMV as "rent", never exposing secret names
#: beyond these two approved labels).
CREDENTIAL_SET_LABELS: Dict[str, str] = {"LVW": "sale", "PMV": "rent"}

METRICS_NAMESPACE = "VlcRealEstate/Idealista"
API_REQUESTS_METRIC_NAME = "ApiRequests"


def _month_start(year: int, month: int) -> datetime:
    """Return the first instant of *year*-*month* (UTC, naive)."""
    return datetime(year, month, 1)


def _add_months(dt: datetime, months: int) -> datetime:
    """Return *dt* shifted by *months* whole calendar months (day fixed at 1)."""
    total = dt.year * 12 + (dt.month - 1) + months
    year, month = divmod(total, 12)
    return datetime(year, month + 1, 1)


class ApiQuotaCheck:
    """
    Strategy: Ampel rule 3 — Idealista API quota usage per credential set.

    Adapter around CloudWatch ``GetMetricData``, reading the custom
    ``VlcRealEstate/Idealista``/``ApiRequests`` metric (published by
    ``BronzeCollector``, task 12.3) summed per calendar month, over the
    last :data:`API_QUOTA_EVALUATION_MONTHS` fully-completed months.
    """

    key: str = "api_quota"

    def __init__(
        self,
        cloudwatch_client: object,
        credential_sets: "tuple[str, ...]" = ("LVW", "PMV"),
        evaluation_months: int = API_QUOTA_EVALUATION_MONTHS,
        now_fn: Any = datetime.utcnow,
    ) -> None:
        """
        Args:
            cloudwatch_client: boto3 ``cloudwatch`` client (injected; a
                ``botocore.stub.Stubber`` wraps it in tests).
            credential_sets: Credential-set dimension values to evaluate
                (defaults to both LVW=sale and PMV=rent).
            evaluation_months: Number of fully-completed calendar months
                to evaluate (defaults to 5).
            now_fn: Injected clock returning the current UTC ``datetime``,
                so month-boundary logic (which month is "in progress" and
                therefore excluded) is deterministic in tests.
        """
        self._client = cloudwatch_client
        self._credential_sets = tuple(credential_sets)
        self._evaluation_months = evaluation_months
        self._now = now_fn

    def evaluate(self) -> HealthCheckResult:
        """Evaluate rule 3 across every monitored credential set."""
        month_starts = self._evaluated_month_starts()
        per_credential_set: Dict[str, Any] = {}
        statuses: List[HealthStatus] = []

        for credential_set in self._credential_sets:
            monthly_usage = self._monthly_usage(credential_set, month_starts)
            status = self._status_for(monthly_usage)
            statuses.append(status)
            per_credential_set[credential_set] = {
                "status": status,
                "label": CREDENTIAL_SET_LABELS.get(credential_set, credential_set),
                "monthly_requests": {
                    month.strftime("%Y-%m"): usage
                    for month, usage in zip(month_starts, monthly_usage)
                },
                "quota": API_QUOTA_MONTHLY_REQUESTS,
            }

        overall = worst_status(statuses) if statuses else GREEN
        return HealthCheckResult(
            status=overall,
            summary=f"API quota: {overall} across {len(self._credential_sets)} credential set(s)",
            details={
                "credential_scope": "global",
                "credential_scope_note": (
                    "Quota is credential-global: dev and prod share the same "
                    "LVW/PMV Idealista credentials (review M3), so no "
                    "Environment dimension is applied."
                ),
                "credential_sets": per_credential_set,
            },
        )

    def _evaluated_month_starts(self) -> List[datetime]:
        """
        Return the last N fully-completed calendar months, oldest first.

        The current in-progress month is always excluded (review M3 /
        acceptance criterion: partial-month data must never bias green).
        """
        current_month_start = _month_start(self._now().year, self._now().month)
        months = [
            _add_months(current_month_start, -offset)
            for offset in range(self._evaluation_months, 0, -1)
        ]
        return months

    def _monthly_usage(
        self, credential_set: str, month_starts: List[datetime]
    ) -> List[float]:
        """Sum ``ApiRequests`` for *credential_set* over each month in *month_starts*."""
        if not month_starts:
            return []

        start_time = month_starts[0]
        end_time = _add_months(month_starts[-1], 1)

        response = self._client.get_metric_data(  # type: ignore[attr-defined]
            MetricDataQueries=[
                {
                    "Id": "usage",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": METRICS_NAMESPACE,
                            "MetricName": API_REQUESTS_METRIC_NAME,
                            "Dimensions": [
                                {"Name": "CredentialSet", "Value": credential_set}
                            ],
                        },
                        "Period": 2592000,  # nominal; we bucket by month ourselves
                        "Stat": "Sum",
                    },
                }
            ],
            StartTime=start_time,
            EndTime=end_time,
        )

        timestamps = response["MetricDataResults"][0].get("Timestamps", [])
        values = response["MetricDataResults"][0].get("Values", [])
        by_month: Dict[str, float] = {
            month.strftime("%Y-%m"): 0.0 for month in month_starts
        }
        for timestamp, value in zip(timestamps, values):
            month_key = timestamp.strftime("%Y-%m")
            if month_key in by_month:
                by_month[month_key] += value

        return [by_month[month.strftime("%Y-%m")] for month in month_starts]

    @staticmethod
    def _status_for(monthly_usage: List[float]) -> HealthStatus:
        """Apply the 80/95-request Ampel thresholds across the evaluated months."""
        if any(usage >= API_QUOTA_RED_THRESHOLD_REQUESTS for usage in monthly_usage):
            return RED
        if any(usage >= API_QUOTA_YELLOW_THRESHOLD_REQUESTS for usage in monthly_usage):
            return YELLOW
        return GREEN


# ---------------------------------------------------------------------------
# AWS cost health check (FEATURE-012, task 12.7)
# ---------------------------------------------------------------------------
#
# AwsCostCheck answers "is the project's month-to-date AWS spend within
# budget?" using Cost Explorer's GetCostAndUsage grouped by SERVICE.
#
# Review M1: Cost Explorer is effectively a global API and is commonly
# reached via the us-east-1 endpoint, while this stack otherwise runs in
# eu-central-1. AwsCostCheck itself only ever receives an
# already-constructed ``cost_explorer_client`` (no client construction
# inside the check) — the Lambda factory (task 12.8) is responsible for
# constructing that client with ``boto3.client("ce", region_name="us-east-1")``.

#: Rule 4 thresholds, in USD, month-to-date.
AWS_COST_YELLOW_THRESHOLD_USD = 2.0
AWS_COST_RED_THRESHOLD_USD = 5.0

#: Cost Explorer has no native "exclude domain registration" filter,
#: so a service-name exclusion list is the pragmatic choice (see design
#: doc "Design & patterns" - domain/registrar charges are not reliably
#: taggable resources).
DEFAULT_EXCLUDED_SERVICES: "tuple[str, ...]" = (
    "Amazon Registrar",
    "Amazon Route 53 Domains",
)


class AwsCostCheck:
    """
    Strategy: Ampel rule 4 — project-wide, month-to-date AWS cost.

    Adapter around Cost Explorer's ``GetCostAndUsage``, grouped by
    ``SERVICE``, excluding domain/registrar service names that are not
    part of the pipeline's own running cost (review M1/design doc).
    """

    key: str = "aws_cost"

    def __init__(
        self,
        cost_explorer_client: object,
        excluded_services: "tuple[str, ...]" = DEFAULT_EXCLUDED_SERVICES,
        now_fn: Any = datetime.utcnow,
    ) -> None:
        """
        Args:
            cost_explorer_client: Already-constructed boto3 ``ce`` client
                (injected; the Lambda factory in task 12.8 is responsible
                for using the ``us-east-1`` endpoint — see module comment,
                review M1). A ``botocore.stub.Stubber`` wraps it in tests.
            excluded_services: Cost Explorer ``SERVICE`` dimension values
                excluded from the threshold total (defaults to the
                documented domain/registrar services).
            now_fn: Injected clock returning the current UTC ``datetime``,
                so the month-to-date window is deterministic in tests.
        """
        self._client = cost_explorer_client
        self._excluded_services = tuple(excluded_services)
        self._now = now_fn

    def evaluate(self) -> HealthCheckResult:
        """Evaluate rule 4 for the current month-to-date."""
        now = self._now()
        start = _month_start(now.year, now.month).date()
        end = now.date()
        # Cost Explorer requires Start < End; a same-day evaluation still
        # needs a 1-day window.
        if end <= start:
            end = _add_months(_month_start(now.year, now.month), 1).date()

        response = self._client.get_cost_and_usage(  # type: ignore[attr-defined]
            TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )

        included_total = 0.0
        excluded_total = 0.0
        excluded_service_names: List[str] = []

        for result_by_time in response.get("ResultsByTime", []):
            for group in result_by_time.get("Groups", []):
                service_name = group["Keys"][0]
                amount = float(group["Metrics"]["UnblendedCost"]["Amount"])
                if service_name in self._excluded_services:
                    excluded_total += amount
                    if service_name not in excluded_service_names:
                        excluded_service_names.append(service_name)
                else:
                    included_total += amount

        if included_total >= AWS_COST_RED_THRESHOLD_USD:
            status = RED
        elif included_total >= AWS_COST_YELLOW_THRESHOLD_USD:
            status = YELLOW
        else:
            status = GREEN

        return HealthCheckResult(
            status=status,
            summary=f"AWS cost: {status} (${included_total:.2f} month-to-date, excluding domain/registrar)",
            details={
                "included_total_usd": round(included_total, 2),
                "excluded_total_usd": round(excluded_total, 2),
                "excluded_services": excluded_service_names,
                "excluded_services_configured": list(self._excluded_services),
            },
        )


__all__: List[str] = [
    "AWS_COST_RED_THRESHOLD_USD",
    "AWS_COST_YELLOW_THRESHOLD_USD",
    "API_QUOTA_EVALUATION_MONTHS",
    "API_QUOTA_MONTHLY_REQUESTS",
    "API_QUOTA_RED_THRESHOLD_REQUESTS",
    "API_QUOTA_YELLOW_THRESHOLD_REQUESTS",
    "CREDENTIAL_SET_LABELS",
    "ApiQuotaCheck",
    "AwsCostCheck",
    "DEFAULT_EXCLUDED_SERVICES",
    "DURATION_RED_THRESHOLD_SECONDS",
    "DURATION_YELLOW_THRESHOLD_SECONDS",
    "EXECUTION_HISTORY_WINDOW",
    "GREEN",
    "LOGS_INSIGHTS_LOOKBACK_SECONDS",
    "LOGS_INSIGHTS_MAX_POLL_ATTEMPTS",
    "LOGS_INSIGHTS_POLL_INTERVAL_SECONDS",
    "LogsInsightsQueryError",
    "RED",
    "YELLOW",
    "ExecutionDurationCheck",
    "ExecutionSuccessCheck",
    "HealthCheck",
    "HealthCheckResult",
    "HealthStatus",
    "worst_status",
]
