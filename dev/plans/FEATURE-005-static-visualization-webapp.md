# FEATURE-005 — Static Visualization Web App (S3 + CloudFront)

**Status:** 🔵 Planned · **Effort:** M (~1.5–2 d) · **Priority:** Medium
**Branch root:** `feature/static-visualization-webapp` · **Created:** 2026-06-03 · **Updated:** 2026-06-07

> Authored by `@architect`. Reviewed by `@reviewer` (see `dev/reviews/REVIEW-FEATURE-005.md`).
> Implemented by `@implementer` from `dev/plans/technical/FEATURE-005-technical-plan.yaml`.
>
> **Renumbered 2026-06-05.** Was FEATURE-004; became FEATURE-005 after the Gold Aggregation Lambda
> was inserted as FEATURE-004. The data source is `gold/aggregations/latest.json` (schema v1.0,
> frozen by FEATURE-004), not a silver aggregation.

## Objective

Ship a tiny, server-less static web app (plain HTML + Plotly.js) on S3 + CloudFront that visualises
the gold-layer Idealista aggregations. The MVP renders **one** chart end-to-end (price/m² time
series per neighbourhood); the remaining charts are added iteratively, each as an interchangeable
renderer behind a stable interface.

## Context

A former Flask prototype (`app.py` + `vlcrealestate/`, since removed) demonstrated the target
charts on a server. Running servers (EC2/EKS/App Runner) is unjustified for a weekly-updated, tiny
dataset. FEATURE-004 already produces a single pre-aggregated `gold/aggregations/latest.json`
(schema v1.0). A static frontend that fetches that one JSON via CloudFront is the cheapest, most
secure, and lowest-maintenance setup. This feature replaces the prototype with that static app and
gives it a custom domain.

## Dependencies

- **Needs:** FEATURE-004 (Gold Aggregation Lambda) — produces `gold/aggregations/latest.json`, the
  sole data source. The schema v1.0 contract is frozen in
  [FEATURE-004-technical-plan.yaml](technical/FEATURE-004-technical-plan.yaml) (`json_contract`).
- **Unblocks:** —
- **Coordinates with:** FEATURE-006 (prod promotion) — the frontend is wired in `dev` first, then
  promoted to `prod` alongside silver/gold, mirroring the established rollout.

## Design & patterns

The frontend is small but deliberately structured so charts plug in without touching the data layer
or each other. Even in plain JS (ESM modules, no framework) the OOP/SOLID intent is explicit.

- **Strategy + Open/Closed — `ChartRenderer`.** Each chart is a renderer object exposing a common
  shape (`id`, `title`, `render(populationBlock) -> PlotlyFigure`). Adding the rent-vs-sale scatter,
  the ratio time series, or the boxplots later means **adding a renderer module**, never editing the
  dashboard or existing charts. The MVP ships one renderer; the rest follow the same contract.
- **Adapter + Dependency Inversion — `DataSource`.** A thin adapter wraps `fetch()` and returns the
  parsed schema-v1.0 object. The `Dashboard` depends on the `DataSource` interface, not on `fetch`
  directly, so tests inject an in-memory fake that returns a fixture — no network in unit tests.
- **Single Responsibility — `Dashboard` orchestrator.** One object wires the `DataSource` and the
  list of `ChartRenderer`s, mounts each into its container, and owns nothing else (no transform
  logic, no fetch logic).
- **Pure transforms stay pure.** `formatSeries(block)` and friends are small, stateless functions
  the renderers call — unit-tested in isolation with Vitest. No class wrapping where a function does.
- **Schema-version guard.** The `DataSource` checks `schema_version` and fails loudly on a mismatch,
  so a future gold-schema bump cannot silently render a broken dashboard.

> **No over-engineering.** No framework, no bundler, no state-management library. The interfaces
> above are the minimum needed to add charts safely; anything heavier is rejected.

## Approach

MVP-first: deliver one chart through the whole stack (frontend → infra → custom domain → deploy),
then iterate. Every task is a TDD slice: a failing Vitest/Terraform check first, minimal code to
pass, then cleanup.

### Phase 1 — Frontend skeleton + first chart (MVP)
- [ ] `frontend/` scaffold: `index.html` (title + one chart container + `window.CONFIG.DATA_URL`),
  `styles.css`, ESM entry `app.js`.
- [ ] `src/data_source.js` — `DataSource` adapter over `fetch`, with `schema_version` guard and an
  in-memory fake for tests. *(Adapter, DI.)*
- [ ] `src/transforms.js` — pure `formatSeries(block)` → one Plotly trace per `(operation,
  neighbourhood)` from `general.price_time_series_neighborhood`. *(Pure function, Vitest RED→GREEN.)*
- [ ] `src/charts/price_time_series.js` — first `ChartRenderer` (price/m² over time per
  neighbourhood, sale + rent). *(Strategy.)*
- [ ] `src/dashboard.js` — `Dashboard` wires `DataSource` + `[priceTimeSeriesRenderer]` and mounts
  it. *(SRP.)*

### Phase 2 — Hosting infrastructure (Terraform)
- [ ] New module `infrastructure/modules/frontend/`:
  - Private S3 bucket for frontend assets; **S3 Block Public Access** on.
  - CloudFront distribution with **Origin Access Control (OAC)** to the asset bucket.
  - Second CloudFront origin/behaviour for `gold/aggregations/*.json` from the listings bucket, so
    the frontend and its data are same-origin (no CORS).
  - Cache policies: long TTL for static assets, short TTL (e.g. 1 h) for `latest.json`.

### Phase 3 — Custom domain (ACM + Route 53)

> **Decided.** Target domain: **`vlc-report.leopoldwalther.com`**. The root `leopoldwalther.com`
> was registered via **Route 53**, so its public hosted zone already exists in the account — the
> implementer references the existing zone (data source / variable), it is **not** created here.
> The root zone is a shared, account-level resource; this feature only adds one subdomain record set
> and is designed so future portfolio projects reuse the same zone + a wildcard certificate.

- [ ] ACM certificate in **us-east-1** (CloudFront requirement) via a `aws.us_east_1` provider
  alias. Issue a **wildcard** `*.leopoldwalther.com` cert so future subdomains reuse it (one cert,
  DNS-validated against the existing hosted zone).
- [ ] Route 53 alias A/AAAA records for `vlc-report.leopoldwalther.com` pointing at the CloudFront
  distribution, created in the **existing** `leopoldwalther.com` hosted zone (looked up by name).
- [ ] ACM DNS-validation records created in the same hosted zone.

### Phase 4 — Deployment
- [ ] `.github/workflows/deploy-frontend.yml` (`workflow_dispatch`, dev/prod input, mirrors
  `deploy-lambda.yml`): `aws s3 sync frontend/ s3://<asset-bucket>/` then
  `aws cloudfront create-invalidation`.
- [ ] Terraform output: CloudFront distribution URL **and** the custom-domain URL.

### Phase 5 — Iteratively add the remaining charts (each a new renderer)
- [ ] `rent_vs_sale_ratio` scatter (mean_priceByArea_sale vs _rent per neighbourhood) — `general` +
  `relevant`.
- [ ] `rent_vs_sale_ratio_time_series` line — `general` + `relevant`.
- [ ] `boxplot_by_neighborhood` (5-number summary → Plotly box) — `general` + `relevant`.
- [ ] `price_time_series_district` line (count-weighted district series).
- [ ] A population toggle (general ↔ relevant) where both blocks exist.

### Phase 6 — Tests & docs
- [ ] Vitest unit tests per transform + renderer using the in-memory `DataSource` fake.
- [ ] Manual E2E: `latest.json` renders via CloudFront on the custom domain; charts interactive.
- [ ] `documentation/FRONTEND_LAYER.md` — architecture, the `ChartRenderer`/`DataSource` design,
  deploy steps. Update README Source Code Layout + medallion diagram to include the frontend.

## Files

- **Create:** `frontend/index.html`, `frontend/styles.css`, `frontend/app.js`,
  `frontend/src/data_source.js`, `frontend/src/transforms.js`, `frontend/src/dashboard.js`,
  `frontend/src/charts/price_time_series.js` (+ later renderer modules).
- **Create:** `frontend/tests/transforms.test.js` (+ later per-renderer tests),
  `frontend/package.json` (Vitest dev dependency only — no runtime bundler).
- **Create:** `infrastructure/modules/frontend/{main.tf,variables.tf,outputs.tf}`.
- **Create:** `.github/workflows/deploy-frontend.yml`, `documentation/FRONTEND_LAYER.md`.
- **Change:** `infrastructure/environments/dev/main.tf` — instantiate the frontend module (dev
  first; prod deferred to FEATURE-006).
- **Change:** `README.md` — Source Code Layout + medallion diagram.

## Test strategy

- **Unit (Vitest, >80% on new JS):** `formatSeries` produces one trace per neighbourhood; empty/
  missing population block → empty render, no throw; `DataSource` rejects a wrong `schema_version`;
  each renderer returns a valid Plotly figure from a fixture block.
- **Integration:** `terraform validate` + `plan` show the expected S3 + CloudFront + OAC + ACM +
  Route 53 resources; local `python -m http.server` loads a fixture `latest.json` and renders.
- **Manual:** custom-domain page loads < 1 s (cached); charts interactive; Lighthouse performance +
  best-practices pass.

## Estimated monthly cloud cost

| Component | Pricing basis | Assumption | Est. / month |
|---|---|---|---|
| S3 (frontend assets) | ~$0.023/GB + requests | A few MB of static assets, low traffic | < $0.05 |
| CloudFront | 1 TB/mo egress free tier, then ~$0.085/GB | Personal/portfolio traffic, well under free tier | < $0.10 |
| Route 53 hosted zone | $0.50 per hosted zone/mo + query charges | Shared `leopoldwalther.com` zone — **already exists** (registered root), not new to this feature | $0.00 (shared) |
| Route 53 queries | ~$0.40 per million queries | Low portfolio traffic | < $0.01 |
| ACM certificate | Free for use with CloudFront | One reusable `*.leopoldwalther.com` wildcard cert | $0.00 |
| **Total (new AWS components)** | | | **~$0.15/month** |

- **Cost drivers & cheaper alternatives:** because the `leopoldwalther.com` hosted zone already
  exists (the root was registered via Route 53) and the wildcard cert is reused across subdomains,
  this feature adds almost nothing — only marginal CloudFront/S3/query cost. The $0.50/mo hosted-zone
  fee is an existing account-level cost shared by all future portfolio subdomains, not attributable
  to this feature.
- **External / non-AWS costs:** the `.com` domain registration (~$13/year via Route 53) is already
  paid and covers all subdomains.
- **Budget check:** well within the project's < $5/month target (combined with bronze/silver/gold).

## Success criteria

- [ ] MVP chart renders the gold data end-to-end on the custom-domain CloudFront URL.
- [ ] S3 buckets are private; CloudFront reaches them only via OAC (no public bucket, no OAI legacy).
- [ ] Adding a new chart requires only a new `ChartRenderer` module — dashboard and data layer
  unchanged (verified by the Phase 5 additions).
- [ ] `DataSource` rejects a mismatched `schema_version`.
- [ ] Page load < 1 s (cached); deploy workflow green.
- [ ] Vitest coverage ≥ 80% on new JS; pre-commit + CI gates pass.
- [ ] Docs updated (`FRONTEND_LAYER.md` + README).

## Open questions & risks

- **Resolved 2026-06-07:** domain = **`vlc-report.leopoldwalther.com`**; root `leopoldwalther.com`
  registered via Route 53, so the hosted zone **already exists** and is referenced, not created.
- **Risk:** ACM cert must live in **us-east-1** for CloudFront — easy to get wrong from an
  eu-central-1 default provider. *Mitigation:* dedicated `aws.us_east_1` provider alias, asserted in
  the technical plan.
- **Risk:** stale assets after deploy. *Mitigation:* CloudFront invalidation step in the workflow;
  separate short Cache-Control for `latest.json`.
- **Risk:** gold schema drift breaks the frontend silently. *Mitigation:* `schema_version` guard in
  `DataSource` fails loudly.
- **Assumption:** `latest.json` stays small enough to ship whole (no pagination/API needed).

## Progress log

- **2026-06-03** — Plan created.
- **2026-06-07** — Reworked to the current FEATURE template: added Design & patterns
  (`ChartRenderer` Strategy, `DataSource` Adapter, `Dashboard` SRP), cloud-cost estimate, and the
  agreed decisions — custom domain now (ACM us-east-1 + Route 53), MVP = one chart then iterate,
  plain HTML + Plotly.js + ESM + Vitest. Unified to English.
- **2026-06-07** — Domain decided: `vlc-report.leopoldwalther.com`. Root `leopoldwalther.com`
  registered via Route 53 (hosted zone exists). Phase 3 updated to reference the existing zone and
  issue a reusable `*.leopoldwalther.com` wildcard cert. Open question resolved.
