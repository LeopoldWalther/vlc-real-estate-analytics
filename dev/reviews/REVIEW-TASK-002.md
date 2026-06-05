# REVIEW-TASK-002

## Executive Summary

**Task reviewed:** TASK-002 — Idealista Web Scraper (Notebook MVP + Lambda Production)
**Verdict:** ✅ **Approved with Structured Split Plan**

Requested changes were applied: risks are now explicitly addressed and the implementation is split into smaller atomic subtasks with hard phase gates. The revised technical plan is ready for execution.

---

## What Was Addressed

### 1) Compliance / operational risk (HIGH) — **Addressed**
- Added pre-production policy checklist task.
- Added runtime kill switch requirement (`SCRAPER_ENABLED`) as mandatory acceptance criterion.
- Added controlled rollout tasks (dev soak period before prod enablement).

### 2) Scope too broad (HIGH) — **Addressed**
- Split into 12 atomic subtasks.
- Enforced phase gate: no Terraform/prod rollout before notebook and parser acceptance tests pass.

### 3) Parser fragility (HIGH) — **Addressed**
- Added dual real HTML fixtures (rent + sale).
- Added fallback selector tests and missing-selector tests.
- Added deterministic parser tests (network-free repeatability).

### 4) Data contract drift (MEDIUM) — **Addressed**
- Added explicit schema contract test task.
- Required keys must exist even when values are `null`.

### 5) Terraform duplication and delivery risk (MEDIUM) — **Addressed**
- Added explicit architecture decision task: reuse existing module vs dedicated module.
- Added acceptance criteria requiring documented trade-off before infra implementation.

---

## Strengths (unchanged)

- Correct two-phase direction (local notebook first, AWS second).
- Good alignment with existing project patterns.
- Clear S3 namespace separation (`bronze/idealista-scraper/`).

---

## Residual Risks and Controls

| Residual Risk | Control in Plan | Status |
|---|---|---|
| Selector drift in production | Dual fixtures + fallback tests + selector map | Controlled |
| Scraper blocking/rate limiting | Retry, jitter, throttling, kill switch | Controlled |
| Layer build incompatibility (`lxml`) | Dedicated packaging validation task | Controlled |
| Premature production rollout | Dev soak gate + explicit rollout task | Controlled |

---

## Effort Re-estimation

- Revised effort: **5–7 days** remains accurate after task split.
- Lower execution risk due to stronger sequencing and independent validation points.

---

## Approval Criteria (now encoded in technical plan)

1. Notebook MVP passes local end-to-end acceptance.
2. Parser robustness and contract tests pass with frozen fixtures.
3. `SCRAPER_ENABLED` fail-safe verified in module and infra.
4. Dev deployment validated before production rollout.

---

## Coder Implementation Notes

**Critical findings**
- Do not begin infra tasks before notebook + parser + contract test tasks are done.
- Keep all scraper tests under `src/etl/data_collection/tests/`.
- Ensure output schema is stable (required keys always present).

**Watch-outs**
- `lxml` packaging must be Amazon Linux compatible.
- Selector updates should touch only selector map + fixtures unless contract changed.

**Quick decisions**
- Keep separate `scraper_requirements.txt`.
- Keep `bronze/idealista-scraper/` prefix.
- Keep weekly schedule offset after API collector.

**Testing shortcuts**
- `pytest src/etl/data_collection/tests/test_web_scraper.py -v`
- `pytest --cov=src/etl/data_collection src/etl/data_collection/tests/test_web_scraper.py`

---

## Final Review Decision

✅ **Approved** — proceed with the revised split technical plan in [dev/plans/technical/TASK-002-technical-plan.yaml](dev/plans/technical/TASK-002-technical-plan.yaml).
