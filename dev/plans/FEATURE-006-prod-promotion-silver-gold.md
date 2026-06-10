# FEATURE-006 — Prod promotion: wire silver + gold lambdas in production

**Status:** 🟢 Complete · **Effort:** S–M (~7 h) · **Priority:** High
**Branch root:** `feature/prod-promotion-silver-gold` · **Created:** 2026-06-05 · **Updated:** 2026-06-10

> Authored by `@architect`. Reviewed by `@reviewer` (see `dev/reviews/REVIEW-FEATURE-006.md`).
> Implemented by `@implementer` from `dev/plans/technical/FEATURE-006-technical-plan.yaml`.

## Objective

Wire the silver cleaning lambda (`lambda_silver`) and gold aggregation lambda (`lambda_gold`) into the
production Terraform environment so the full bronze → silver → gold pipeline runs weekly in prod,
mirroring the dev setup.

## Context

Both Lambda modules were intentionally kept out of prod during development:

- **Silver (`lambda_silver`):** dev-wired in FEATURE-003 task 3.5; acceptance criterion
  explicitly states *"Prod wiring intentionally deferred until after dev soak."*
- **Gold (`lambda_gold`):** will be dev-wired in FEATURE-004 task 4.4; prod wiring deferred here.

`infrastructure/environments/prod/main.tf` currently only contains `listings_bucket`,
`idealista_secrets`, `idealista_notifications`, and `idealista_collector` (bronze). It is missing
`silver_cleaner` and `gold_aggregator` module blocks.

`infrastructure/environments/prod/variables.tf` is also missing `pandas_layer_arn`, which is
required by both `lambda_silver` and `lambda_gold` (they use the
`AWSSDKPandas-Python312` managed layer).

## Dependencies

- **Needs:** FEATURE-003 — `infrastructure/modules/lambda_silver` must exist ✅ done
- **Needs:** FEATURE-004 — `infrastructure/modules/lambda_gold` must exist (tasks 4.2–4.4 pending)
- **Coordinates with:** FEATURE-007 — Step Functions orchestration. If 007 lands first, this feature
  should promote the **state machine** (`pipeline_orchestrator`) into prod instead of (or in addition
  to) the two Lambda modules, and must **not** re-introduce the independent per-Lambda EventBridge
  schedules that 007 removes. See "Open questions & risks".
- **Unblocks:** FEATURE-005 — visualization app reads gold aggregations written by prod pipeline

## Approach

Two focused Terraform-only tasks, no Python code changes.

### Task 6.1 — Wire silver lambda in prod

Add `pandas_layer_arn` variable to `prod/variables.tf` (same default ARN as dev: the AWS-managed
`AWSSDKPandas-Python312:16` layer for `eu-central-1`), then add the `module "silver_cleaner"` block
to `prod/main.tf`. No `test_mode` argument (prod runs full pagination). Run `terraform validate`.

### Task 6.2 — Wire gold lambda in prod

Add the `module "gold_aggregator"` block to `prod/main.tf`, mirroring the dev wiring from
FEATURE-004 task 4.4. Run `terraform validate`.

## Files

- **Change:** `infrastructure/environments/prod/variables.tf` — add `pandas_layer_arn` variable
- **Change:** `infrastructure/environments/prod/main.tf` — add `silver_cleaner` module block (6.1) and `gold_aggregator` module block (6.2)

## Test strategy

- **Terraform validate:** `terraform validate` must pass in `infrastructure/environments/prod/` after each task
- **Terraform fmt:** `terraform fmt -check` must pass (CI gate via `terraform-validate.yml`)
- **No unit tests:** pure Terraform wiring; module logic is already tested in FEATURE-003 / FEATURE-004
- **Manual (post-deploy):** confirm both lambdas appear in AWS Lambda console under prod environment after `terraform apply`

## Success criteria

- [ ] `infrastructure/environments/prod/variables.tf` declares `pandas_layer_arn` with the managed layer ARN default
- [ ] `infrastructure/environments/prod/main.tf` contains `module "silver_cleaner"` block matching dev (minus `test_mode`)
- [ ] `infrastructure/environments/prod/main.tf` contains `module "gold_aggregator"` block matching dev
- [ ] `terraform fmt -check` passes in `infrastructure/environments/prod/`
- [ ] `terraform validate` passes in `infrastructure/environments/prod/`
- [ ] `workflow-consistency` CI check passes
- [ ] No secrets or literal ARNs hardcoded — all via variables

## Open questions & risks

- **Coordination with FEATURE-007 (Step Functions):** 007 replaces the three independent EventBridge
  schedules with a single state machine in dev. If 007 lands before this feature is applied to prod,
  6.1/6.2 should be revised to wire the `pipeline_orchestrator` state machine into prod (passing the
  prod Lambda + SNS ARNs) rather than promoting the Lambdas with their standalone crons. *Decision
  needed:* sequence 007 → 006, or keep 006 as Lambda-only and add a 6.3 for the state machine.
- **Assumption:** `pandas_layer_arn` default `arn:aws:lambda:eu-central-1:336392948345:layer:AWSSDKPandas-Python312:16` is still the latest stable version. Verify against https://aws-sdk-pandas.readthedocs.io/en/stable/layers.html before applying.
- **Risk:** Running `terraform apply` on prod triggers live deployments. The implementer should plan a controlled apply window (e.g. after a successful dev soak period of ≥ 2 weeks). *Mitigation:* Keep task as plan-and-validate only; the actual `terraform apply` is a separate manual step outside this feature.
- **Dependency:** Task 6.2 is blocked until FEATURE-004 task 4.4 lands and `infrastructure/modules/lambda_gold/` exists.

## Progress log

- **2026-06-05** — Plan authored. FEATURE-003 (silver) is prod-ready. FEATURE-004 (gold) is in progress (task 4.1 done, 4.2–4.4 pending). Both tasks are queued pending FEATURE-004 completion.
