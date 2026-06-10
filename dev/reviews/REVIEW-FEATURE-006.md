# Review — FEATURE-006: Prod promotion (silver + gold + frontend)

**Reviewer:** `@reviewer` · **Date:** 2026-06-09 · **Plan:** [FEATURE-006](../plans/FEATURE-006-prod-promotion-silver-gold.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

The two-task silver+gold promotion is sound and low-risk — it mirrors the proven dev wiring with
pure Terraform and no Python changes. **But the plan is now under-scoped:** the user wants the prod
data served by the *same* visualization at `https://vlc-report.leopoldwalther.com`, and the current
plan does not promote the `frontend` module to prod at all. This review adds that as a first-class
task (6.3) and flags the data-ordering and stale-dependency issues that come with a live prod apply.

## Strengths

- ✅ **Pure Terraform, module reuse.** `lambda_silver` and `lambda_gold` are already built and tested
  in FEATURE-003/004; prod wiring is a copy of the dev blocks (minus `test_mode`). Minimal risk.
- ✅ **`frontend` module is environment-agnostic.** It takes `environment`, `aliases`, and the cert
  from remote state — so prod reuses it verbatim with a different alias. No module changes needed.
- ✅ **Deploy workflow already supports prod.** `deploy-frontend.yml` has an `environment: prod`
  choice and reads `frontend_asset_bucket_name` + `frontend_distribution_id` outputs — no workflow
  change required once those prod outputs exist.
- ✅ **No us-east-1 provider needed.** The wildcard cert + zone come from the `shared/dns` remote
  state (`certificate_arn`, `zone_id`), so prod avoids the common ACM-region pitfall entirely.
- ✅ **Wildcard cert already covers the prod name.** `*.leopoldwalther.com` covers
  `vlc-report.leopoldwalther.com` (one subdomain level) — same constraint dev already satisfies.

## Findings

### 🔴 H1 — Plan omits the prod frontend (the user's actual ask)

- **Problem:** FEATURE-006 only wires `silver_cleaner` + `gold_aggregator`. The user explicitly wants
  the prod data visualized at `https://vlc-report.leopoldwalther.com`, which requires promoting the
  `frontend` module + Route 53 records + outputs to prod — none of which the plan covers.
- **Impact:** Following the plan as written produces a working prod *pipeline* but **no prod website**.
  The headline deliverable is missing.
- **Recommendation:** Add **task 6.3 — wire `frontend` in prod**, mirroring
  [dev/main.tf](../../infrastructure/environments/dev/main.tf#L72) exactly:
  - `locals { frontend_domain = "vlc-report.leopoldwalther.com" }`
  - `data "terraform_remote_state" "dns"` block (same config as dev)
  - `module "frontend"` (pass `listings_bucket_*`, `certificate_arn`, `aliases = [local.frontend_domain]`)
  - `aws_route53_record.frontend_a` + `frontend_aaaa` (alias → `module.frontend.distribution_domain_name`, zone `Z2FDTNDATAQYW2`)
  - prod `outputs.tf`: `cloudfront_url`, `custom_domain_url`, `frontend_asset_bucket_name`,
    `frontend_distribution_id` (the workflow's `terraform output -raw` step **fails** without the last two).
- **Evidence:** [prod/main.tf](../../infrastructure/environments/prod/main.tf) has only bronze;
  [prod/outputs.tf](../../infrastructure/environments/prod/outputs.tf) has no frontend outputs;
  [deploy-frontend.yml](../../.github/workflows/deploy-frontend.yml#L66) reads those two outputs.

### 🔴 H2 — Prod has no gold data until silver+gold run *and* are backfilled

- **Problem:** `terraform apply` only *creates* the Lambdas; it does not populate gold. The prod
  frontend would load against a missing `gold/aggregations/latest.json` until the weekly schedule
  fires — and even then, the silver cleaner processes only the latest snapshot per operation, so the
  charts would show a near-empty history (the exact problem hit in dev).
- **Impact:** The prod site renders empty/sparse charts for up to a week, or until manually triggered.
- **Recommendation:** After apply, run the documented backfill in this order before deploying the
  frontend: (1) `backfill_silver.py` against the prod bucket + `prod-silver-cleaner` for all bronze
  dates, (2) confirm the silver parquet count, (3) invoke `prod-gold-aggregator`, (4) deploy frontend
  + invalidate. Capture this as an explicit ordered runbook in the task (review M3 of FEATURE-005
  is the same footgun).
- **Effort:** S (operational, no code).

### � H3 — Prod deploy is blocked: no AWS credentials, and static keys are the wrong fix

- **Problem:** The `Deploy Frontend` workflow run against `environment: prod` fails at
  **Configure AWS Credentials** with *"Credentials could not be loaded … Could not load credentials
  from any providers."* The `dev` GitHub Environment has `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` secrets; the `prod` Environment has none. Both `deploy-frontend.yml` and
  `deploy-lambda.yml` authenticate with **long-lived static IAM user keys**
  ([deploy-frontend.yml](../../.github/workflows/deploy-frontend.yml#L25-L28)).
- **Impact:** Prod frontend (and any prod Lambda deploy) cannot run. The headline FEATURE-006
  deliverable — the live prod site — is blocked at the last step.
- **Recommendation:** Do **not** simply paste static keys into the `prod` Environment. Adopt
  **GitHub OIDC**: a `token.actions.githubusercontent.com` OpenID Connect provider plus a
  least-privilege IAM role that GitHub Actions assumes for short-lived credentials — **no stored
  secrets, nothing to rotate or leak**. This is the AWS-recommended CI/CD pattern. Model the new
  account-global stack on the existing `shared/dns` pattern
  ([infrastructure/shared/dns](../../infrastructure/shared/dns)): a new
  `infrastructure/shared/github-oidc/` stack, applied once, owning the OIDC provider + deploy role.
  The role's trust policy restricts `sub` to this repo and its `dev` / `prod` environments; the
  permission policy is scoped to what the two deploy workflows actually do (S3 sync to the frontend
  asset buckets, CloudFront `CreateInvalidation`, Lambda update, and Terraform state/output reads).
  Then migrate **both** workflows to `role-to-assume` + `permissions: id-token: write` and delete the
  static-key secrets.
- **Evidence:** Failed `prod` run screenshot (Configure AWS Credentials, exit early); dev secrets
  exist but prod does not; both deploy workflows use `secrets.AWS_ACCESS_KEY_ID`.
- **Effort:** M (~2–3 h: ~1 h OIDC Terraform, ~1 h workflow migration + a test deploy on dev).

### �🟡 M1 — `terraform apply` on prod is a live, hard-to-reverse deployment

- **Problem:** This feature plans-and-validates, but the actual prod apply creates a public CloudFront
  distribution, Route 53 records, and scheduled Lambdas in the live account.
- **Recommendation:** Keep the feature scope as **plan + validate only**; gate the real
  `terraform apply` behind a deliberate, announced window after the ≥2-week dev soak the plan already
  mentions. Snapshot `terraform plan` output in the PR for review before applying.
- **Effort:** S.

### 🟡 M2 — Stale dependency direction in the plan header

- **Problem:** The plan says *"Unblocks: FEATURE-005 — visualization app reads gold."* FEATURE-005
  already shipped in dev; the real relationship is the inverse — FEATURE-006 **consumes** the
  FEATURE-005 `frontend` module and frozen gold schema v1.0.
- **Recommendation:** Update the Dependencies section: FEATURE-006 **Needs** FEATURE-005 (frontend
  module) and FEATURE-004 (gold module); it does not unblock 005.
- **Effort:** S (doc only).

### 🟡 M3 — Verify the managed pandas layer ARN before apply

- **Problem:** The default `pandas_layer_arn`
  (`…:AWSSDKPandas-Python312:16`) may be stale by the time prod is applied.
- **Recommendation:** Confirm the current `eu-central-1` version against the AWS SDK for pandas layer
  docs at apply time; bump the default if needed. Same value as dev keeps the two environments
  identical.
- **Effort:** S.

### 🟢 L1 — Coordinate with FEATURE-007 (Step Functions) on schedules

- **Suggestion:** If FEATURE-007 lands first, do **not** promote the per-Lambda EventBridge crons that
  007 removes — wire the `pipeline_orchestrator` state machine into prod instead. Until then,
  Lambda-with-cron is correct. Safe to keep as-is for now.

### 🟢 L2 — `vlc-report.leopoldwalther.com` is now free

- **Suggestion:** Dev moved off that name in FEATURE-005 task 5.7 (now `vlc-report-dev`), so prod can
  claim the apex name without a Route 53 collision. Worth a one-line note in the task so the
  implementer doesn't expect a conflict. Optional.

## Alternatives considered

- **Single distribution serving both dev + prod via path prefixes.** Rejected: couples the two
  environments, complicates cache/invalidations, and breaks the clean per-env S3+CloudFront isolation
  already established. Separate distributions per environment is the right call.
- **Promote frontend in a separate FEATURE-008+.** Rejected: the user wants prod data *and* its
  website together; splitting them leaves the deliverable half-done. Fold it into 006 as task 6.3.
- **Static IAM user keys in the prod Environment (vs. OIDC).** The fastest unblock for H3: create a
  dedicated deploy IAM user, scope a policy, store its keys as `prod` Environment secrets. Trade-off:
  long-lived credentials that must be rotated and can leak; two more secrets per environment; the
  same anti-pattern the dev workflow already carries. Verdict: use **OIDC** — comparable setup
  effort, no stored secrets, and it lets us retire the dev static keys too. A dedicated IAM user is
  the acceptable fallback only if OIDC is blocked.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Prod frontend omitted (plan as written) | High | High | 🔴 | Add task 6.3 (H1) |
| Prod site renders empty until backfill | High | Med | 🔴 | Ordered backfill→gold→deploy runbook (H2) |
| Prod deploy blocked — no creds; static keys are wrong fix | High | High | 🔴 | GitHub OIDC provider + least-privilege role (H3) |
| Live prod apply hard to reverse | Med | High | 🟡 | Plan-only scope; gated apply window (M1) |
| Workflow output step fails (missing prod outputs) | Med | Med | 🟡 | Add 4 frontend outputs to prod/outputs.tf (H1) |
| Stale pandas layer ARN | Low | Med | 🟡 | Verify at apply time (M3) |
| Schedule conflict if 007 lands first | Low | Med | 🟢 | Wire state machine instead of crons (L1) |

## Effort check

- **Plan estimate:** S (~2 h) — covers silver + gold only.
- **Reviewer estimate:** M (~6–7 h) — adds 6.3 prod frontend (~1 h TF) + 6.4 outputs/runbook
  (~0.5 h) + the operational backfill (~1 h, mostly waiting) + 6.6/6.7 GitHub OIDC provider/role and
  workflow migration (~2–3 h, H3). Confidence: High; all infra pieces already exist in dev or mirror
  the `shared/dns` pattern.

## Reuse & conflicts

- **Reuse:** `modules/lambda_silver`, `modules/lambda_gold`, `modules/frontend`, the `shared/dns`
  remote state, and `deploy-frontend.yml` — all consumed verbatim. Prod is a near-mirror of
  [dev/main.tf](../../infrastructure/environments/dev/main.tf).
- **Coordinate with:** FEATURE-007 (don't re-introduce per-Lambda crons it removes).

## Approval criteria

- **Blockers (must fix):** H1 (add prod frontend task + outputs), H2 (backfill→gold→deploy ordering),
  H3 (GitHub OIDC provider + role; migrate deploy workflows off static keys).
- **Recommended:** M1 (plan-only/gated apply), M2 (fix dependency direction), M3 (verify layer ARN).
- **Optional:** L1 (007 coordination), L2 (free-name note).

## Next step

H1, H2, M-items are done. Remaining: implement **6.6 (shared GitHub OIDC provider + deploy role)**
and **6.7 (migrate `deploy-frontend.yml` + `deploy-lambda.yml` to OIDC)**, then re-run the prod
frontend deploy. Keep the actual prod `terraform apply` as a deliberate gated step.
