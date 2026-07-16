# Review — FEATURE-009: Frontend redesign: mobile-first, professional polish

**Reviewer:** `@reviewer` · **Date:** 2026-06-17 · **Plan:** [FEATURE-009](../plans/FEATURE-009-frontend-redesign.md)
**Verdict:** ⚠️ Changes Recommended (folded into the technical plan below — no return trip to `@architect` needed)

## Summary

The architect's plan correctly identifies the problem (no responsive layout, hand-rolled Plotly
layouts duplicated across 5 chart modules, no loading/error UX, no metadata) and the right
non-goals (no SPA framework, portfolio site out of scope). It underspecifies three things the
codebase and the wider redesign brief actually need: a **KPI summary row** (median rent/sale,
implied yield, listing counts — currently absent from the plan's Approach/Files sections), an
explicit **dark/light theme system** (tokens + persistence + system-preference detection), and a
dedicated **state module** for the load lifecycle (the plan only vaguely says "extracted into a
testable helper" inside `app.js`). All three are addressable without inflating scope beyond a
disciplined ~10 atomic tasks, so I've expanded the plan's 6 checklist items into 13 dependency-safe
tasks rather than sending it back. Estimate raised from M (~8–10 h) to ~15–17 h to reflect the real
task count.

## Strengths

- ✅ Correct non-goal: no build step, no framework — keeps the zero-build vanilla-ESM architecture
  that FEATURE-005 established, avoiding hydration/bundler complexity for a single static page.
- ✅ `ChartTheme` (Strategy + Factory) is the right abstraction — all 5 renderers currently hand-roll
  near-identical `margin`/`legend`/`title` literals (verified in `price_time_series.js`,
  `price_time_series_district.js`, `rent_vs_sale_ratio.js`, `rent_vs_sale_ratio_time_series.js`,
  `boxplot_by_neighborhood.js`); centralising this is real DRY, not premature abstraction.
- ✅ Migrate-one-chart-per-commit risk mitigation is exactly right and is preserved verbatim as
  5 separate tasks (9.6–9.10) below.
- ✅ Correctly scopes the portfolio-site apex domain out, with the DNS/cert contract clearly stated.
- ✅ Existing chart tests (`price_time_series.test.js` etc.) already assert `figure.data`/`figure.layout`
  shape and null/empty-safety, giving the migration a strong regression harness for free.

## Findings

### 🔴 H1 — KPI summary row is a "Files" gap, not just an "Approach" gap

- **Problem:** The plan's Approach section never mentions a KPI/summary component, yet the redesign
  brief (and the fixture data available) clearly supports one: `boxplot_by_neighborhood` carries
  `median` per neighbourhood/operation, and `rent_vs_sale_ratio` carries
  `mean_sales_price_by_rent_ratio` (the basis for an implied gross yield). Without a dedicated pure
  module this logic will either not get built or get bolted onto `app.js` as untested inline code.
- **Impact:** Untestable business logic in `app.js`, or a missed requirement.
- **Recommendation:** New pure module `frontend/src/summary.js` (`summaryStats(data)` +
  `formatKpi(...)`), covered >80%, that:
  - aggregates city-wide median rent €/m²/mo and median sale €/m² from `boxplot_by_neighborhood`
    (weighted by `count` per group, not a naive mean-of-medians),
  - derives implied gross yield % from `rent_vs_sale_ratio`'s `mean_sales_price_by_rent_ratio`
    (`yield ≈ 12 / ratio × 100`, documented in the module docstring since the gold schema does not
    pre-compute it),
  - surfaces listing counts (`count_listings_sale`/`count_listings_rent` sums) and `generated_at` as
    "last updated",
  - never throws on a missing/empty population block — every field is null-able so the KPI row can
    render "—" instead of crashing.
- **Evidence:** `frontend/tests/fixtures/latest.sample.json` shape inspected directly; no city-wide
  aggregate exists in schema v1.0, so this is genuinely new derivation logic, not a pass-through.

### 🔴 H2 — Dark/light theme system is unspecified

- **Problem:** The plan's design-token section only mentions a single `:root` palette. The wider
  brief (and modern "professional polish" expectations) require dark/light support with system
  detection and persistence, which changes the token architecture (`:root` + `[data-theme="dark"]`
  + `prefers-color-scheme`) and the `ChartTheme` factory's signature (Plotly needs a different
  colorway/gridline/font color per scheme, not just per viewport).
- **Impact:** If bolted on late, it forces a breaking signature change to `buildLayout` after 5
  chart modules already migrated to it — expensive rework.
- **Recommendation:** Decide the `buildLayout` signature **before** any chart migrates:
  `buildLayout({ viewport, colorScheme, overrides })` (object param, not positional strings) so
  viewport and colour scheme vary independently. Add `resolveTheme(stored, systemPrefers)` to the
  new `dashboard_state.js` module (pure, testable) and wire it in `app.js` before first paint to
  avoid a flash of the wrong theme.
- **Evidence:** Current `chart_theme` sketch in the plan (`buildLayout('mobile')` /
  `buildLayout('desktop')`) is positional and viewport-only — incompatible with an independent
  colour-scheme axis.

### 🟡 M1 — Load-lifecycle state deserves its own pure module, not an `app.js`-embedded helper

- **Problem:** "extracted into a testable helper" (Phase 4, task 9.5 in the original plan) is vague
  about where that helper lives and what its contract is.
- **Recommendation:** `frontend/src/dashboard_state.js` — pure functions only, no DOM: `resolveTheme`,
  `resolveViewport(width)` (breakpoint resolution, replacing the vague "matchMedia listener" with a
  pure, unit-testable mapping), `shouldRerender(prev, next)` (only true when viewport class or
  colour scheme actually changed — directly implements the plan's own debounce-and-only-rerender-on-
  actual-change mitigation), and a `loading → ready | error` lifecycle helper where `retry` resets to
  `loading`. `app.js` becomes a thin DOM-applying consumer (Dependency Inversion: DOM code depends on
  this module's pure contract, not the reverse).
- **Effort:** Already folded into task 9.3 below; no schedule impact since it replaces ad hoc logic
  the plan already required somewhere.

### 🟡 M2 — Chart renderer signature must gain a `context` param for viewport/theme to reach `buildLayout`

- **Problem:** Renderers currently only take `render(populationBlock)`. To let `buildLayout` vary by
  viewport/colour-scheme, renderers need to know the current viewport/scheme at render time, and the
  plan doesn't say how that information reaches them.
- **Recommendation:** Extend each renderer to `render(populationBlock, context = { viewport: 'desktop', colorScheme: 'light' })`.
  The default keeps every existing call site (`renderer.render(fixture.general)`) and every existing
  test green without modification — only new assertions are added, existing ones don't need touching.
  `app.js` (task 9.11) is the only caller that ever passes a non-default `context`.
- **Effort:** S — a signature default, not a behavioural change to existing call sites.

### 🟢 L1 — `chart_theme.js` must exclude `layout.title`; renderers keep title ownership

- **Suggestion:** Since `app.js` currently stamps a population label into `fig.layout.title` for
  toggle charts (`` `${renderer.title} — ${popLabel}` ``), `buildLayout`'s output must never include
  a `title` key (confirmed as an explicit constraint) so the renderer's own
  `{ ...buildLayout(...), title: { text: title } }` merge is never silently overwritten. Cheap to get
  right up front, expensive to debug later (silently wrong title / lost population label).
- **Why:** Keeps a single source of truth for the (dynamic) title outside the theme factory —
  correct separation of concerns.

### 🟢 L2 — Favicon + meta/OG/Twitter tags belong in task 9.1, not their own micro-task

- **Suggestion:** The original plan's 9.6 ("Meta/SEO finish") has almost no dependencies and no JS;
  bundling it into the same CSS/HTML foundation task (9.1) avoids a near-zero-value dedicated branch
  and PR.
- **Why:** Reduces task count without losing testability — meta tags are manually verified either way.

## Alternatives considered

- **Compute KPI/summary values server-side in the gold Lambda (FEATURE-004/007) instead of in the
  frontend.** Trade-off: single source of truth, no client-side aggregation math — but reopens a
  closed, deployed Lambda schema (schema v1.0 is frozen) purely for a presentation concern, and this
  feature's non-goals explicitly keep scope to the frontend. Verdict: stick with a pure
  `summary.js` in the frontend; revisit server-side pre-aggregation only if the yield/median math
  needs to reconcile with other consumers.
- **Single positional `buildLayout(viewport)` (as literally sketched in the architect's plan).**
  Trade-off: simpler signature, but cannot express dark/light independently of viewport without a
  breaking change after 5 renderers already depend on it. Verdict: use the object-param factory
  (`buildLayout({ viewport, colorScheme, overrides })`) from the first commit.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Migrating 5 chart modules to `buildLayout` breaks a hidden layout assumption (e.g. `boxmode: 'group'` on boxplots) | Med | Med | 🟡 | One module per commit/task (9.6–9.10); each task's acceptance criteria requires byte-identical `data[]` and existing test suite green before merge |
| Dark-mode Plotly colours clash with `--color-*` CSS tokens (two independent palettes drifting) | Med | Low | 🟢 | `chart_theme.js` derives its dark/light colorway constants from the same brand palette documented alongside the CSS tokens (task 9.1 note) |
| KPI aggregation math (weighted median-of-medians, implied yield formula) is a judgement call not specified by product | Med | Med | 🟡 | Document the formula choice in `summary.js`'s docstring (task 9.4) and flag as an open question in the plan's progress log; cheap to change later since it's a pure function |
| Debounced viewport/theme re-render still janky on low-end phones (already flagged by architect) | Low | Med | 🟢 | `shouldRerender` only returns true on an actual breakpoint/scheme class change, not every resize tick (task 9.3) |
| `.github/workflows/deploy-frontend.yml` accidentally touched by an app.js/index.html task | Low | High | 🟡 | Explicitly listed in `forbidden_files` for every task in the technical plan |

## Effort check

- **Plan estimate:** M (~8–10 h)
- **Reviewer estimate:** M/L (~15–17 h) — confidence Medium
- **Why it differs / hidden complexity:** The architect's 6-item checklist collapses what is
  actually ~13 independently testable units of work once KPI summary logic, theme
  persistence/detection, and a proper state module are accounted for (H1, H2, M1). The 5×
  chart-migration tasks (9.6–9.10) are individually small (~0.5–1 h each) but the plan's Approach
  section implicitly treated them as a single "Phase 3" line item.

## Reuse & conflicts

- **Reuse:** `frontend/src/data_source.js`'s `DataSource`/`FakeDataSource` Adapter pattern is the
  template `dashboard_state.js` and `summary.js` should follow for their own test doubles — no new
  pattern needed, just consistency.
- **Reuse:** `frontend/tests/fixtures/latest.sample.json` is sufficient for every new module's tests;
  no new fixture needs to be authored.
- **Conflict / coordinate with:** None — FEATURE-009 has no other in-flight frontend work. Confirmed
  `.github/workflows/deploy-frontend.yml` requires no changes (same S3/CloudFront targets, no new
  build step).

## Approval criteria

- **Blockers (must fix):** H1 (KPI summary module), H2 (dark/light theme system + `buildLayout`
  signature) — both folded into the technical plan below, not left for the Implementer to invent.
- **Recommended:** M1 (dedicated `dashboard_state.js`), M2 (`context` param on renderers) — folded in.
- **Optional:** L1, L2 — folded in.

## Next step

Proceed directly to implementation — all findings are resolved in
`dev/plans/technical/FEATURE-009-technical-plan.yaml` (13 tasks, 9.1–9.13). No return trip to
`@architect` needed.

```
@implementer Implement FEATURE-009
```

---

### Post-implementation notes
*Filled in after the task ships.*

- **Worked well:** <…>
- **Missed in review:** <…>
- **Estimated vs. actual:** <X> vs. <Y>
