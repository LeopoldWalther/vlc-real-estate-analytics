# Review — FEATURE-007: Step Functions orchestration (bronze → silver → gold)

**Reviewer:** `@reviewer` · **Date:** 2026-06-09 · **Plan:** [FEATURE-007](../plans/FEATURE-007-step-functions-orchestration.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

Replacing three wall-clock-coupled cron schedules with one dependency-aware Standard state machine is
the right architectural move — the timing fragility is real and Step Functions costs ~$0 at this
cadence. **But there is one correctness bug that defeats the feature's headline promise:** the bronze
Lambda **swallows its exceptions and returns `statusCode: 500`** instead of raising, so a Step
Functions `Catch` will never fire for a bronze failure — and silver/gold run on partial bronze data,
exactly the bug this feature claims to kill. Fix that (via a `Choice` state on `$.Payload.statusCode`)
and the plan is solid.

## Strengths

- ✅ **Correct problem, correct tool.** Three dependent stages coupled only by 15-min cron gaps is
  genuinely fragile; a state machine with retry/catch is the textbook fix. Standard (not Express) is
  right — the bronze Lambda can run up to 15 min, past Express's 5-min cap.
- ✅ **Honest, well-reasoned cost section** that explicitly reverses the earlier FEATURE-003/004
  "no Step Functions" decision now that the trade-off changed. ~$0.02/mo, owned and documented.
- ✅ **Idempotent stages make retries safe.** Silver has a `HeadObject` incremental guard
  ([silver_cleaning_lambda.py](../../src/etl/data_processing/silver_cleaning_lambda.py#L217)), gold
  overwrites `latest.json`, bronze writes timestamped keys — so a Step Functions `Retry` re-invoking
  a `Task` does not corrupt state. This de-risks the retry blocks considerably.
- ✅ **ASL via `templatefile` with injected ARNs** + a network-free ASL unit test is the right,
  testable pattern. No hardcoded ARNs, deterministic assertions.
- ✅ **Least-privilege IAM** scoped to the three Lambda ARNs + `sns:Publish` is correctly specified.

## Findings

### 🔴 H1 — Bronze failures won't trigger `Catch`; silver/gold still run on bad data

- **Problem:** The state machine relies on a failed `Task` raising so `Catch` routes to
  `NotifyFailure` and downstream stages stop. That works for **silver** and **gold** — both let
  exceptions propagate. It does **not** work for **bronze**: the handler wraps its body in
  `try/except` and **returns** `{"statusCode": 500, "body": ...}` on any error instead of raising
  ([idealista_listings_collector.py](../../src/etl/data_collection/idealista_listings_collector.py#L475-L482)).
  To `arn:aws:states:::lambda:invoke`, a 500-in-payload is a **successful** invocation — `Catch` never
  fires, the pipeline proceeds to silver, and silver cleans a partial/empty bronze snapshot.
- **Impact:** The feature's #1 success criterion ("a failure in any stage stops downstream stages")
  is **false for the bronze stage** — the most likely stage to fail (external Idealista API). This is
  the exact stale-data bug the plan exists to remove, reintroduced silently.
- **Recommendation:** Make the orchestration **handler-agnostic** rather than relying on each handler
  raising. After each `Task` add a `Choice` state that inspects `$.Payload.statusCode`: `!= 200` →
  `NotifyFailure`. This catches both raised exceptions (via `Catch`) **and** swallowed-500 returns
  (via `Choice`), works uniformly across all three Lambdas, and **touches no tested Python**. (If you
  prefer to change the bronze handler to `raise` instead, that is also valid but edits well-tested
  collection code and leaves the inconsistency for the next stage that swallows errors.)
- **Evidence:** bronze `except Exception … return {"statusCode": 500}`; silver/gold docstrings
  explicitly say "Raises: … Propagated on unexpected errors."

### 🟡 M1 — Stale risk: FEATURE-004 / `lambda_gold` already exists

- **Problem:** The plan lists "FEATURE-004 not yet complete (tasks 4.2–4.4 pending)" as a risk and
  gates the gold task state on it. In the live tree
  [modules/lambda_gold/main.tf](../../infrastructure/modules/lambda_gold/main.tf) exists, is wired in
  dev, and has its own `gold_weekly_trigger`. The gold ARN is available now.
- **Recommendation:** Drop the FEATURE-004 gating risk and implement all three task states in one
  pass. Update the Dependencies + Open-questions sections.
- **Effort:** S (doc only).

### 🟡 M2 — `Catch` must carry the error into the SNS message (`ResultPath`)

- **Problem:** As drawn, `Catch` routes to `NotifyFailure`, but if it doesn't preserve `$.Error` /
  `$.Cause` the SNS alert says "a stage failed" with no detail — barely better than today's three
  alarms.
- **Recommendation:** Set `ResultPath: "$.error"` on each `Catch` and template the SNS message to
  include the failed state name + `$.error.Error` + `$.error.Cause`. Add "alert names the failed
  stage and reason" to the acceptance criteria.
- **Effort:** S.

### 🟡 M3 — Scheduler→StartExecution needs its own IAM role; pick one trigger service

- **Problem:** The plan says "EventBridge Scheduler rule," but the existing per-Lambda triggers use
  **EventBridge Rules** (`aws_cloudwatch_event_rule`), a different service. Whichever drives
  `StartExecution` needs its own IAM role allowing `states:StartExecution` on the state machine —
  that role isn't called out in the Phase-2 IAM list (which only covers the state-machine's own role).
- **Recommendation:** Decide explicitly (EventBridge Scheduler is the newer recommended service) and
  add the **trigger role** (`states:StartExecution`) to the IAM task. Keep the `test_mode` input on
  the `StartExecution` payload for dev.
- **Effort:** S.

### 🟢 L1 — Endorse the `create_schedule = false` flag over deleting the per-Lambda rules

- **Suggestion:** Resolve the plan's open question in favour of the **flag**. Gating each module's
  EventBridge rule behind `create_schedule` (default `true`) keeps `lambda_bronze/silver/gold`
  independently deployable and testable, matches the codebase's module-independence ethos, and makes
  the change reversible. The env sets `create_schedule = false` when wiring the orchestrator.
- **Why:** Reversibility + module reuse — safe to skip but clearly better.

### 🟢 L2 — Confirm silver's empty-event path is the orchestrated path

- **Suggestion:** In the state machine, invoke silver with `{}` (no `snapshot_date`) so it uses its
  "latest snapshot" branch on the snapshot bronze just wrote — that is the correct weekly-run
  behaviour. Add a one-line assertion to the integration test that silver processed the new snapshot.
  Safe to skip.

## Alternatives considered

- **Change the bronze handler to `raise` instead of returning 500.** Valid and arguably cleaner
  long-term, but edits well-tested collection code and still leaves the pattern unenforced for future
  stages. Trade-off: purity vs. blast radius. Verdict: prefer the `Choice`-on-`statusCode` state (H1)
  — handler-agnostic, zero Python churn; optionally fix the bronze handler later as separate cleanup.
- **Express Workflows.** Cheaper per run but bills by duration×memory and caps at 5 min — unsuitable
  for a 15-min bronze Lambda. Plan already rejects this correctly.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Bronze 500-swallow defeats Catch; bad data flows downstream | High | High | 🔴 | `Choice` on `$.Payload.statusCode` after each Task (H1) |
| Apply deletes 3 live schedules + adds state machine in one change | Med | Med | 🟡 | Gated manual apply; verify single schedule post-apply (plan already notes) |
| SNS alert lacks failure detail | Med | Med | 🟡 | `ResultPath` carries `$.Error/$.Cause` (M2) |
| Missing trigger IAM role for StartExecution | Med | Med | 🟡 | Add trigger role to IAM task (M3) |
| Drift between 006 (separate crons) and 007 (state machine) in prod | Med | Med | 🟡 | Land 007 in dev; amend 006 to promote the orchestrator + `create_schedule=false` |

## Effort check

- **Plan estimate:** M (~12–16 h).
- **Reviewer estimate:** M (~12–16 h) — confidence High. H1 via a `Choice` state adds ~1 h of ASL +
  test, not a rewrite. FEATURE-004 already landing (M1) removes the gating delay the plan budgeted
  for, roughly offsetting the H1 addition.

## Reuse & conflicts

- **Reuse:** existing SNS topic `idealista_notifications`; the three Lambda modules unchanged in code;
  module conventions from `lambda_bronze` (IAM, log group, tags).
- **Conflict / coordinate with:** **FEATURE-006** (just reviewed). 006 wires the *separate* silver +
  gold Lambdas with their own crons into prod. If 007 lands first, prod must wire the **state
  machine** and set `create_schedule = false` instead of promoting three crons. Land 007 in dev →
  then amend 006's prod wiring. The two plans must not both own the prod schedule.

## Approval criteria

- **Blockers (must fix):** H1 (failure propagation for the bronze stage).
- **Recommended:** M1 (drop stale FEATURE-004 gating), M2 (`Catch` carries error detail), M3 (trigger
  IAM role + pick one trigger service).
- **Optional:** L1 (`create_schedule` flag), L2 (silver empty-event assertion).

## Next step

Address H1 (add a `Choice`-on-`statusCode` state after each `Task`), fold in M1–M3, then
`@implementer Implement FEATURE-007`. Land in dev only; coordinate the prod wiring with FEATURE-006.

---

### Post-implementation notes
*Filled in after the task ships.*

- **Worked well:** —
- **Missed in review:** —
- **Estimated vs. actual:** —
