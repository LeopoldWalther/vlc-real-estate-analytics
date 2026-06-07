# Review — FEATURE-005: Static Visualization Web App (S3 + CloudFront)

**Reviewer:** `@reviewer` · **Date:** 2026-06-07 · **Plan:** [FEATURE-005](../plans/FEATURE-005-static-visualization-webapp.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

The plan is well-scoped, MVP-first, and the OOP/SOLID intent (`ChartRenderer` Strategy,
`DataSource` Adapter/DI, `Dashboard` SRP) is exactly right for a plain-JS frontend without
over-engineering. Two structural changes are needed before implementation: (1) split the DNS +
ACM certificate into a separate `infrastructure/shared/dns/` Terraform stack with its own state
(the agreed **Option A**), since the `leopoldwalther.com` hosted zone is an account-level shared
resource the frontend only *consumes*; and (2) acknowledge that Vitest/JS testing cannot be one of
the validator's tracked CI gates and pin Plotly.js as a vendored, same-origin asset. With those
folded into the technical plan the feature is ready to build.

## Strengths

- ✅ **MVP-first, TDD slices.** One chart through the whole stack first, then iterate — every task
  is a RED → GREEN → REFACTOR slice. Keeps risk front-loaded and each branch small.
- ✅ **Design honours SOLID without ceremony.** Strategy (`ChartRenderer`), Adapter + Dependency
  Inversion (`DataSource`), SRP (`Dashboard`), pure transforms. Adding a chart = adding a renderer
  module; the dashboard and data layer never change. The explicit "no framework, no bundler" guard
  rail is the correct call for a weekly, tiny dataset.
- ✅ **Schema-version guard.** `DataSource` fails loudly on a `schema_version` mismatch — the right
  defence against silent gold-schema drift (the frozen v1.0 contract lives in
  [FEATURE-004-technical-plan.yaml](../plans/technical/FEATURE-004-technical-plan.yaml)).
- ✅ **Same-origin data via a second CloudFront origin.** Serving `gold/aggregations/*.json` through
  the same distribution avoids CORS entirely and keeps the data private behind OAC. Clean.
- ✅ **Security defaults are correct.** Private S3 + Block Public Access + Origin Access Control
  (not legacy OAI). No public buckets.
- ✅ **Honest, resolved cost + domain.** Hosted zone correctly treated as a pre-existing shared
  account cost; the feature's marginal cost is ~$0.15/mo. Domain decision is closed.

## Findings

### 🔴 H1 — Separate the DNS + certificate into a `shared/dns` stack (Option A)

- **Problem:** Phase 3 places the ACM certificate and Route 53 records *inside* the frontend
  module. The `leopoldwalther.com` hosted zone is an account-level, multi-project resource, and the
  `*.leopoldwalther.com` wildcard cert is explicitly meant to be reused by future portfolio
  subdomains. Coupling those to this feature's frontend module means a `terraform destroy` of the
  frontend could tear down shared DNS infrastructure, and a second project would have no clean way
  to consume the cert.
- **Impact:** Wrong ownership boundary; risk of destroying shared infra; no reuse path.
- **Recommendation:** Create a standalone `infrastructure/shared/dns/` stack with its **own state
  key** (`vlc-state/shared/dns/terraform.tfstate` in the existing state bucket). It (a) reads the
  existing hosted zone via `data "aws_route53_zone"`, (b) issues the wildcard ACM cert in
  **us-east-1** with DNS validation, and (c) exports `zone_id` + `certificate_arn` as outputs. The
  frontend stack consumes those via `terraform_remote_state`. Apply `shared/dns` **once** before
  the frontend stack. Keep it in *this* repo for now (a second repo for four files is premature) —
  the separate state key makes a later repo extraction a no-rebuild copy.
- **Evidence:** State backend is per-key (`vlc-state/dev/...` in `vlc-real-estate-analytics-tf-state`),
  so adding `vlc-state/shared/dns/...` fits the existing convention with zero new infrastructure.

### 🟡 M1 — us-east-1 provider alias for ACM is mandatory and must be asserted

- **Problem:** CloudFront only accepts certificates from **us-east-1**; the account default is
  eu-central-1. The plan flags the risk but the technical plan must *enforce* it.
- **Recommendation:** In the `shared/dns` stack declare a `provider "aws" { alias = "us_east_1"
  region = "us-east-1" }` and pin `aws_acm_certificate` + `aws_acm_certificate_validation` to it.
  Add an acceptance criterion that `terraform validate` covers the aliased provider.
- **Effort:** S

### 🟡 M2 — Vitest cannot be a validator-tracked CI gate; pin coverage enforcement honestly

- **Problem:** The plan promises "Vitest coverage ≥ 80% … CI gates pass", but the workflow
  validator's allowed gate set is `{python-lint-and-test, terraform-validate, workflow-consistency}`
  only. A JS test gate cannot appear in the technical plan's `validation.required_checks` without
  failing the validator.
- **Recommendation:** Keep `required_checks` to `terraform-validate` + `workflow-consistency`.
  Enforce JS tests via a *separate* `node-test.yml` workflow (runs on push/PR) and/or a pre-commit
  hook — outside the validator's tracked-gate list. Treat the ≥80% Vitest target as a task
  acceptance criterion, not a tracked CI gate.
- **Effort:** S

### 🟡 M3 — Vendor Plotly.js, do not load it from a CDN

- **Problem:** "plain HTML + Plotly.js" doesn't state how Plotly is delivered. A CDN `<script>`
  introduces a third-party runtime origin, undermines the same-origin/OAC story, and pins an
  uncontrolled version.
- **Recommendation:** Vendor a version-pinned `plotly.min.js` into the asset bucket and load it
  same-origin. Record the pinned version. Keeps the page self-contained, offline-cacheable, and CSP
  -friendly.
- **Effort:** S

### 🟢 L1 — CloudFront error responses for a single-page app

- **Suggestion:** Map S3/OAC 403/404 to a clean error (or `index.html`) via CloudFront custom error
  responses so a stray path doesn't surface an XML S3 error.
- **Why:** Better UX on the showcase domain — safe to skip for the MVP.

### 🟢 L2 — Per-environment `DATA_URL` config

- **Suggestion:** Inject `window.CONFIG.DATA_URL` via a tiny `config.js` synced per environment
  rather than hard-coding, so the same `app.js` works in dev and prod.
- **Why:** Smooths the FEATURE-006 prod promotion — minor.

## Alternatives considered

- **DNS/cert inside the frontend module (the original Phase 3).** Simpler to wire in one place.
  Trade-off: wrong ownership boundary, destroy-blast-radius on shared infra, no reuse path. Verdict:
  rejected in favour of the `shared/dns` stack (H1).
- **Separate `portfolio-shared-infra` repo now.** Cleanest long-term ownership. Trade-off: a whole
  repo + pipeline for four Terraform files while only one project consumes it — premature
  optimisation against the project's own anti-over-engineering rule. Verdict: stay single-repo;
  the separate *state key* already enables a no-rebuild extraction later.
- **CloudFront default domain, no custom domain.** Removes ACM/Route 53 entirely. Verdict: the
  custom domain is a deliberate consulting-showcase choice and the marginal cost is ~$0.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| ACM cert created in eu-central-1, CloudFront rejects it | Med | High | 🟡 | Dedicated `aws.us_east_1` provider alias, asserted in technical plan (M1) |
| `terraform destroy` of frontend removes shared DNS/cert | Med | High | 🔴 | Separate `shared/dns` stack + own state (H1) |
| Wildcard ACM DNS validation hangs / slow apply | Low | Med | 🟡 | `aws_acm_certificate_validation` waits on the records; apply `shared/dns` once, before the frontend |
| Stale assets after deploy | Med | Low | 🟢 | CloudFront invalidation in the deploy workflow; short Cache-Control on `latest.json` |
| Gold schema drift breaks frontend silently | Low | Med | 🟡 | `schema_version` guard in `DataSource` fails loudly |
| Third-party CDN for Plotly weakens same-origin posture | Med | Low | 🟡 | Vendor a pinned `plotly.min.js` (M3) |

## Effort check

- **Plan estimate:** M (~1.5–2 d)
- **Reviewer estimate:** M–L (~2–2.5 d / ~14 h) — confidence Med
- **Why it differs / hidden complexity:** the `shared/dns` split (H1) adds a small one-time stack
  and a `terraform_remote_state` wiring step, and vendoring Plotly + the deploy workflow add minor
  overhead. The JS work itself is light once the `ChartRenderer` contract exists.

## Reuse & conflicts

- **Reuse:** `infrastructure/environments/dev/backend.tf` convention (per-key state in
  `vlc-real-estate-analytics-tf-state`) — the `shared/dns` stack reuses the same bucket with a new
  key. `infrastructure/modules/lambda_*` show the established module/IAM/outputs style to mirror.
- **Reuse:** FEATURE-004 frozen gold JSON contract (schema v1.0) — the `DataSource` and every
  transform read it verbatim; fixtures for Vitest come straight from that shape.
- **Coordinate with:** FEATURE-006 (prod promotion) — wire the frontend module + a `vlc-report`
  (or `vlc-report-dev`) record in dev first; prod alias + promotion deferred to 006, mirroring the
  silver/gold rollout.

## Approval criteria

- **Blockers (must fix):** H1 — `shared/dns` stack with its own state, consumed via remote state.
- **Recommended:** M1 (us-east-1 alias asserted), M2 (JS gate outside the validator set), M3
  (vendor Plotly).
- **Optional:** L1 (CloudFront error responses), L2 (per-env `config.js`).

## Next step

The blocker and recommendations are folded into
[FEATURE-005-technical-plan.yaml](../plans/technical/FEATURE-005-technical-plan.yaml). Proceed with:

```
@implementer Implement FEATURE-005
```

---

### Post-implementation notes
*Filled in after the task ships.*

- **Worked well:** <…>
- **Missed in review:** <…>
- **Estimated vs. actual:** <X> vs. <Y>
