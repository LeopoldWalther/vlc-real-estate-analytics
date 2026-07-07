# FEATURE-008 — OOP/SOLID refactor of the ETL pipeline

**Status:** � In Progress · **Effort:** M (~1.5–2 d) · **Priority:** Medium
**Branch root:** `feature/oop-refactor-pipeline` · **Created:** 2026-06-07 · **Updated:** 2026-06-07

> Authored by `@architect`. Reviewed by `@reviewer` (see `dev/reviews/REVIEW-FEATURE-008.md`).
> Implemented by `@implementer` from `dev/plans/technical/FEATURE-008-technical-plan.yaml`.

## Objective

Refactor the three existing ETL Lambdas (Bronze Collector, Silver Cleaner, Gold Aggregator) from a
procedural, module-level-client style into an object-oriented design that demonstrably honours the
four pillars of OOP, the SOLID principles, and a small set of deliberately chosen design patterns —
**without changing any observable behaviour**. The full test suite must stay green throughout.

## Context

The pipeline works and is fully tested, but it grew bottom-up:

- `src/etl/data_collection/idealista_listings_collector.py` — boto3 clients created at module level;
  the `lambda_handler` orchestrates auth, paginated fetch, S3 write and SNS notify inline.
- `src/etl/data_processing/silver_cleaning_lambda.py` + `silver_transform.py` — the handler reads
  bronze, the pure `clean()`/transform functions live separately, S3 access is inline.
- `src/etl/data_processing/gold_aggregation_lambda.py` + `gold_aggregate.py` — the handler reads the
  silver history and calls the pure `build_aggregation_json()`; aggregations are free functions.

This is fine functionally, but for a consulting showcase the design intent is not visible in the
code. The AWS edges (boto3, requests) are not isolated behind interfaces, the handlers carry several
responsibilities, and variant behaviour (per-operation collection, per-dataset aggregation) is
expressed as functions rather than interchangeable objects. This feature makes the design explicit.

**Guardrail — do not over-engineer.** Small, stateless transformations that have no configuration or
collaborators may remain pure functions. We introduce classes and patterns only where they remove
real duplication or coupling, and each one is named and justified in the technical plan.

## Dependencies

- **Needs:** FEATURE-003 (Silver) and FEATURE-004 (Gold) — the code being refactored must exist and
  be merged to `main` first.
- **Unblocks:** FEATURE-007 (Step Functions orchestration) — thin, well-factored handlers are easier
  to wire into a state machine. Not a hard blocker, but cleaner if 008 lands first.

## Approach

The unifying idea is **Dependency Inversion at the AWS edge**: introduce narrow, project-owned
interfaces for the side effects (object storage, secrets, notifications) and inject concrete AWS
adapters into the orchestrators. Each Lambda keeps a thin `lambda_handler` that wires objects via a
**Factory** and delegates to an orchestrator object. Tests swap in in-memory fakes instead of moto
where it simplifies them, while existing moto integration tests stay as the safety net.

Every task is behaviour-preserving and TDD-framed: the existing tests are the RED guardrail; new
unit tests assert the new seams; the implementation is the GREEN/REFACTOR.

### Phase 1 — Shared edge interfaces (Abstraction + Adapter + DI)
- [ ] Define `ObjectStore` `Protocol` (`get_bytes`, `put_bytes`, `list_keys`) in a shared
  `src/etl/common/` package, with an `S3ObjectStore` adapter wrapping boto3 and an
  `InMemoryObjectStore` fake for tests. *(Interface Segregation, Dependency Inversion, Adapter.)*
- [ ] Define `SecretsProvider` `Protocol` (`get_secret`) with a `SecretsManagerProvider` adapter and
  a fake. *(Adapter, DI.)*
- [ ] Define `Notifier` `Protocol` (`notify_failure`) with an `SnsNotifier` adapter and a fake.
  *(Adapter, DI.)*

### Phase 2 — Bronze Collector as an object (Template Method + Strategy + Factory)
- [ ] Encapsulate search parameters in a `SearchConfig` value object (already conceptually present);
  expose operation variants (`sale`, `rent`) as interchangeable configs. *(Strategy.)*
- [ ] Introduce a `BronzeCollector` that takes `ObjectStore`, `SecretsProvider`, `Notifier`, and a
  `SearchConfig` via the constructor and exposes a single `collect()` method following a
  fetch → parse → persist skeleton. *(Single Responsibility, Template Method, DI.)*
- [ ] Add a `build_collector(env)` Factory and reduce `lambda_handler` to: build → `collect()` →
  return. *(Factory; thin handler.)*

### Phase 3 — Silver Cleaner as an object (Encapsulation + SRP)
- [ ] Introduce a `SilverCleaner` that owns the cleaning rules (encapsulated, not reachable from
  outside) and depends on `ObjectStore`; keep the genuinely pure transform helpers as functions it
  calls. *(Encapsulation, SRP, DI.)*
- [ ] Reduce the silver `lambda_handler` to a Factory wire-up + `clean()` call.

### Phase 4 — Gold Aggregator as objects (Strategy + Open/Closed)
- [ ] Model each aggregation as an `Aggregation` strategy (e.g. price time series, rent-vs-sale
  ratio, neighbourhood boxplot) behind a common interface so new datasets plug in by adding a class,
  not by editing a function. *(Strategy, Open/Closed, Polymorphism.)*
- [ ] Introduce a `GoldAggregator` that composes the strategies, depends on `ObjectStore`, and
  produces the frozen schema-v1.0 contract; reduce the gold `lambda_handler` to a Factory wire-up.
  *(SRP, DI.)* Keep the schema contract byte-for-byte identical.

### Phase 5 — Docs
- [ ] Update the three `documentation/DATA_*_LAYER.md` files with a short "Design" subsection naming
  the patterns and the class responsibilities. Update the Source Code Layout in `README.md`.

## Files

- **Create:** `src/etl/common/object_store.py`, `secrets_provider.py`, `notifier.py` — shared
  Protocols + AWS adapters + in-memory fakes.
- **Create:** collector/cleaner/aggregator class modules alongside each existing handler.
- **Change:** the three `*_lambda.py` handlers — reduced to Factory wire-up + one delegate call.
- **Change:** `silver_transform.py`, `gold_aggregate.py` — pure helpers retained; variant logic moved
  behind interfaces where it earns its keep.
- **Tests:** new unit tests per class using in-memory fakes; existing moto integration tests kept as
  the behaviour-preserving safety net.
- **Docs:** `documentation/DATA_COLLECTION_LAYER.md`, `DATA_PROCESSING_LAYER.md`,
  `DATA_GOLD_LAYER.md`, `README.md`.

## Test strategy

- **Unit:** each new class tested in isolation against in-memory fakes — collaborators injected, no
  AWS. Cover happy path, empty input, and failure-notification paths. Target >80% on new code.
- **Integration:** keep the existing moto-based handler tests unchanged; they are the contract that
  proves the refactor preserved behaviour. They must pass without modification (only import paths may
  change).
- **Regression:** the Gold schema-v1.0 JSON must be byte-for-byte identical before and after — assert
  against a stored fixture.

## Estimated monthly cloud cost

> No infrastructure changes. This is a pure code/test/docs refactor — the same Lambdas, schedules,
> IAM, and storage. **No change to the existing ~$2–3/month per environment.**

## Success criteria

- [ ] Each Lambda exposes a thin `lambda_handler` that only wires objects (Factory) and delegates.
- [ ] AWS SDKs (boto3, requests) are reached only inside adapter classes, never in core logic.
- [ ] The four OOP pillars and the SOLID principles are each demonstrably present and named in
  docstrings/plan.
- [ ] All existing tests pass unmodified (save import paths); new unit tests added per class.
- [ ] Gold schema-v1.0 output is byte-for-byte unchanged.
- [ ] Coverage holds >80%; pre-commit (black, ruff, mypy) and CI gates pass.
- [ ] Docs updated with a "Design" subsection per layer.

## Open questions & risks

- **Question:** Should the shared interfaces live in a new `src/etl/common/` package or be duplicated
  per Lambda to keep deployment packages independent? *(Recommendation: shared package, packaged into
  each Lambda artifact — confirm at review.)*
- **Risk:** Refactor accidentally changes behaviour — *Mitigation:* keep existing integration tests
  unmodified as the guardrail; refactor in small, separately-committed slices per phase.
- **Risk:** Over-abstraction creeps in (patterns for their own sake) — *Mitigation:* the Reviewer
  explicitly checks for over-engineering; pure helpers stay pure.
- **Assumption:** FEATURE-004 (Gold) is merged to `main` before implementation starts.

## Progress log

- **2026-06-07** — Plan authored by `@architect`. Awaiting review.
- **2026-07-07** — Task 8.1 done by `@implementer`. **Packaging decision: shared `src/etl/common/`
  package (review H1 option a).** All three Lambda `archive_file` blocks now build the zip from
  dynamic `source` blocks: handler-directory top-level `*.py` at the zip root (flat imports
  preserved) + `common/*.py` staged under `common/` via `fileset()` — future class modules
  (8.4–8.6) are picked up without further infra edits. Gold golden-master captured (review M1):
  deterministic silver fixture (161 rows) + byte-for-byte `gold_latest_golden.json` asserted by
  `tests/test_gold_golden_master.py` with frozen `generated_at`. `terraform validate` green, full
  ETL suite green (86 passed).
