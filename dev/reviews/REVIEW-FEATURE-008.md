# Review — FEATURE-008: OOP/SOLID refactor of the ETL pipeline

**Reviewer:** `@reviewer` · **Date:** 2026-06-15 · **Plan:** [FEATURE-008](../plans/FEATURE-008-oop-refactor-pipeline.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

The design intent is correct and worth doing for a consulting showcase: isolate the AWS edges behind
narrow Protocols, inject adapters, and keep thin handlers. The guardrail against over-engineering is
well-stated and the phasing is sane. **But two of the plan's headline promises are not true against
the live tree:** (1) "No infrastructure changes — pure code/test/docs refactor" is false, because the
proposed shared `src/etl/common/` package **cannot be imported by any of the three Lambdas as they are
currently packaged** — fixing that requires editing the Terraform `archive_file` blocks in all three
modules; and (2) "all existing tests pass unmodified" is unrealistic for **bronze**, whose tests patch
module-level boto3 globals that the refactor deliberately removes. Acknowledge and scope both, and the
plan is solid.

## Strengths

- ✅ **Right unifying idea.** Dependency Inversion at the AWS edge (`ObjectStore`, `SecretsProvider`,
  `Notifier` Protocols + adapters + in-memory fakes) is the correct seam and directly serves the
  project's stated OOP/SOLID standards in `copilot-instructions.md`.
- ✅ **Explicit anti-over-engineering guardrail.** "Pure helpers stay pure" is called out, and pure
  modules like [gold_aggregate.py](../../src/etl/data_processing/gold_aggregate.py) and
  [silver_transform.py](../../src/etl/data_processing/silver_transform.py) are genuinely fine as-is.
- ✅ **Behaviour-preserving framing.** Treating the existing moto integration tests as the RED
  guardrail and refactoring in separately-committed phase slices is the correct, low-risk approach.
- ✅ **Gold schema regression is named.** The frozen schema-v1.0 contract
  ([gold_aggregate.py](../../src/etl/data_processing/gold_aggregate.py#L10-L40)) is flagged as a
  byte-for-byte invariant — exactly the thing most likely to break in a gold refactor.
- ✅ **Some patterns already exist** and just need surfacing, not inventing: `SearchConfig` and
  `IdealistaAPIError` already live in
  [idealista_listings_collector.py](../../src/etl/data_collection/idealista_listings_collector.py#L48-L99).

## Findings

### 🔴 H1 — "No infrastructure changes" is false: a shared `common/` package breaks all three Lambda zips

- **Problem:** The plan's cost section says *"No infrastructure changes. This is a pure
  code/test/docs refactor"* and the open question leans toward a shared `src/etl/common/` package.
  But the three Lambdas are packaged so that `src/etl/common/` is **not in any deployment artifact**:
  - **Bronze** is zipped from a single file —
    `source_file = .../data_collection/idealista_listings_collector.py`
    ([lambda_bronze/main.tf](../../infrastructure/modules/lambda_bronze/main.tf#L17-L20)). A sibling
    `common/` package is simply not in the zip.
  - **Silver/Gold** are zipped from `source_dir = .../data_processing`
    ([lambda_silver/main.tf](../../infrastructure/modules/lambda_silver/main.tf#L18-L23)). `common/`
    is a **sibling** of `data_processing`, so it is excluded too. The current flat import
    `from gold_aggregate import build_aggregation_json`
    ([gold_aggregation_lambda.py](../../src/etl/data_processing/gold_aggregation_lambda.py#L50)) only
    works because the zip root *is* the `data_processing` contents.
- **Impact:** With a shared package the Lambdas import-error at cold start (`ModuleNotFoundError:
  common`) — a production outage, not a refactor. The plan's "no infra / no cost change" claim and its
  risk register both miss this entirely.
- **Recommendation:** Pick one and write it into the plan explicitly:
  1. **Shared package (recommended) + packaging change.** Move the three handlers under a common
     parent (e.g. `src/etl/`) and change all three modules to `source_dir = .../src/etl` with
     appropriate `excludes`, OR add a small build step that stages `common/` next to each handler
     before `archive_file`. Either way **the three `archive_file`/`handler` blocks change** — this is
     an infrastructure edit and must be a task with `terraform validate` in the gate.
  2. **Duplicate the tiny Protocols per Lambda.** No packaging change, keeps artifacts independent,
     at the cost of ~30 duplicated lines × 3. Acceptable given how small the interfaces are.
- **Evidence:** `source_file` (bronze) vs `source_dir = data_processing` (silver/gold); flat
  `from gold_aggregate import …` import.

### 🔴 H2 — "Existing tests pass unmodified" is unrealistic for bronze

- **Problem:** Bronze creates its boto3 clients **at module import time**
  ([idealista_listings_collector.py](../../src/etl/data_collection/idealista_listings_collector.py#L29-L31))
  and its tests mock those module globals + `requests` directly (`@patch`, `mock_aws_clients`) in
  [test_idealista_collector.py](../../src/etl/data_collection/tests/test_idealista_collector.py#L82-L160).
  The refactor's whole point is to delete those module-level clients and inject adapters — which means
  those patch targets disappear and the bronze tests **must** be reworked, not merely re-pathed.
  Silver/gold already create their client inside the handler, so their moto tests survive; bronze is
  the outlier the success criterion overlooks.
- **Impact:** The "all existing tests pass unmodified (save import paths)" success criterion is
  unachievable as written; an implementer following it literally will either skip the bronze refactor
  or fake the criterion.
- **Recommendation:** Reword to: *integration/behaviour tests preserve assertions; **bronze unit
  tests are rewritten** against the injected fakes as part of Phase 2.* Keep at least one end-to-end
  bronze test (moto or mocked `requests`) as the behaviour guardrail. Add "bronze tests migrated to
  injected fakes" to the Phase-2 acceptance criteria.
- **Evidence:** module-level `boto3.client(...)` + `@patch`-on-globals test style in bronze only.

### 🟡 M1 — No golden-master fixture exists yet for the gold schema invariant

- **Problem:** The plan asserts the gold output must be byte-for-byte identical and "assert against a
  stored fixture," but no such fixture exists. Without capturing the **current** output first, there
  is nothing to diff the refactor against.
- **Recommendation:** Make the **first** gold task (before any refactor) generate and commit a golden
  `latest.json` from a fixed silver input, then assert equality after. This turns "byte-for-byte" from
  an aspiration into an enforced gate.
- **Effort:** S.

### 🟡 M2 — mypy pre-commit hook only covers one file; new classes go untyped

- **Problem:** The mypy hook is scoped to a single file —
  `files: ^src/etl/data_collection/idealista_listings_collector\.py$`
  ([.pre-commit-config.yaml](../../.pre-commit-config.yaml#L34-L40)). The new `common/` adapters and
  the collector/cleaner/aggregator classes would **not** be type-checked, despite the plan's
  "mypy passes" criterion implying coverage.
- **Recommendation:** Widen the hook's `files:` pattern (e.g. `^src/etl/`) as part of Phase 1 and fix
  any fallout. Add the necessary `additional_dependencies` (boto3-stubs, pandas-stubs) so the hook
  actually runs against the new modules.
- **Effort:** S–M (expect some initial type errors in existing untyped helpers).

### 🟡 M3 — Protocol granularity: keep `ObjectStore` minimal and segregated

- **Problem:** A single fat `ObjectStore` with `get_bytes`/`put_bytes`/`list_keys` is fine, but the
  silver incremental guard also needs an existence check (`HeadObject`) and gold only ever
  reads+writes. A god-interface would violate Interface Segregation, which the plan claims to honour.
- **Recommendation:** Either keep `ObjectStore` to the three methods and implement "exists" as
  `key in list_keys(prefix)`, or add a separate narrow `exists(key) -> bool`. Name the ISP decision in
  the docstring so the reviewer can see the intent.
- **Effort:** S.

### 🟢 L1 — Resolve the open question in favour of the shared package **with** the packaging task

- **Suggestion:** Adopt the shared `src/etl/common/` package (DRY, single source of truth for the
  Protocols) **and** include the explicit Terraform packaging task from H1. The duplication
  alternative is acceptable but ages badly once a fourth consumer appears.
- **Why:** One definition of each edge interface — worth the one-time packaging change.

### 🟢 L2 — Don't rebuild `SearchConfig`; extend it into the Strategy

- **Suggestion:** `SearchConfig` already encapsulates the search params. Phase 2 should *promote* it
  to the per-operation Strategy (sale/rent configs), not introduce a parallel value object. Avoids a
  redundant abstraction.

## Alternatives considered

- **Duplicate Protocols per Lambda (no shared package).** Sidesteps H1's packaging change entirely;
  artifacts stay independent. Trade-off: ~90 duplicated lines total vs. zero infra churn. Verdict:
  acceptable fallback if you want to keep this a strictly code-only PR — but then say so and drop the
  "shared package" wording.
- **Refactor bronze only / defer silver+gold.** Smaller blast radius, but bronze is the hardest case
  (module-level clients, `requests`) and silver/gold are already half-way there. Verdict: do all
  three; the value is in the consistent edge abstraction.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Shared `common/` not in any Lambda zip → cold-start ImportError | High | High | 🔴 | Packaging task + `terraform validate`; or duplicate Protocols (H1) |
| Bronze test suite assumed "unmodified" but must be rewritten | High | Med | 🔴 | Reword criterion; rewrite bronze unit tests in Phase 2 (H2) |
| Gold output drifts byte-for-byte during refactor | Med | High | 🟡 | Golden-master fixture captured before refactor (M1) |
| New classes ship untyped (mypy hook too narrow) | High | Low | 🟡 | Widen mypy `files:` pattern in Phase 1 (M2) |
| Over-abstraction creeps in | Low | Med | 🟢 | Pure helpers stay pure; reviewer checks each named pattern |

## Effort check

- **Plan estimate:** M (~1.5–2 d).
- **Reviewer estimate:** M–L (~2–2.5 d) — confidence Med.
- **Why it differs / hidden complexity:** the packaging change (H1), the bronze test rewrite (H2),
  and widening mypy (M2) are real work the plan currently treats as free. Pure-function reuse pulls
  the other way, but net it's a touch heavier than M.

## Reuse & conflicts

- **Reuse:** `SearchConfig` + `IdealistaAPIError`
  ([idealista_listings_collector.py](../../src/etl/data_collection/idealista_listings_collector.py#L48-L99))
  — promote, don't replace. Pure modules `silver_transform.py` / `gold_aggregate.py` — keep as-is.
- **Coordinate with:** FEATURE-007 just landed the orchestrator and added `rows_written` /
  `parquet_files_written` to the silver return and an `ExtractSummary` ASL step that parses the bronze
  `body` JSON. **The refactor must preserve the silver return shape and the bronze `body` fields** or
  the success-summary SNS email breaks. Add that to the behaviour-preserving guardrail.

## Approval criteria

- **Blockers (must fix):** H1 (packaging decision + task or duplicate Protocols), H2 (reword the
  "tests unmodified" criterion + plan the bronze test rewrite).
- **Recommended:** M1 (golden-master fixture), M2 (widen mypy), M3 (ISP-clean `ObjectStore`).
- **Optional:** L1, L2.

## Next step

Address H1–H2 in the plan (decide shared-package-with-packaging-task vs. duplicate Protocols; reword
the bronze test criterion), fold in M1–M3, then `@implementer Implement FEATURE-008` against the
technical plan emitted alongside this review
([FEATURE-008-technical-plan.yaml](../plans/technical/FEATURE-008-technical-plan.yaml)).

---

### Post-implementation notes
*Filled in after the task ships.*

- **Worked well:** <…>
- **Missed in review:** <…>
- **Estimated vs. actual:** <X> vs. <Y>
