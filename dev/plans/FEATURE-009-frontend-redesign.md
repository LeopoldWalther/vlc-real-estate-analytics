# FEATURE-009 — Frontend redesign: clean, modern, mobile-first dashboard

**Status:** 🟡 In progress · **Effort:** M–L (~16.5–18 h) · **Priority:** Medium
**Branch root:** `feature/frontend-redesign` · **Created:** 2026-06-10 · **Updated:** 2026-07-16

> Authored by `@architect`. Reviewed by `@reviewer` (see `dev/reviews/REVIEW-FEATURE-009.md`).
> Implemented by `@implementer` from `dev/plans/technical/FEATURE-009-technical-plan.yaml`.

## Objective

Turn the VLC dashboard (`vlc-report.leopoldwalther.com`) into a clean, modern, mobile-first data
product: a coherent design system (light + dark), a KPI headline row, a unified Plotly chart
theme, and charts that adapt their size, margins, legends, and fonts to the viewport.

## Context

The original frontend (FEATURE-005) was a deliberately minimal vanilla-JS single page:

- `frontend/styles.css` was ~74 lines — generic greys, no brand identity, no media queries, no
  dark mode.
- All 8 Plotly charts hand-rolled their own `layout` (margins, legend, in-chart `title`) —
  duplicated literals across five modules, desktop-default legends overlapping on phones.
- No KPI/summary layer, no loading or error UI (empty white boxes while `latest.json` loads), no
  favicon/meta description/Open Graph tags.

The owner confirmed (2026-07-16): **clean, modern layout is the goal, and reworking the
visualizations themselves is explicitly in scope.**

### Decisions carried forward / reaffirmed

- **No SPA framework, zero-build stack stays.** The stack stays vanilla ES modules + vendored
  Plotly + Vitest. The "modern" look comes from a real design-token system + a redesigned Plotly
  theme, not from a framework.
- **The personal portfolio site (`leopoldwalther.com` apex) stays OUT of scope** — separate repo,
  own Terraform stack, consumes `infrastructure/shared/dns/` outputs via `terraform_remote_state`.

## Dependencies

- **Needs:** FEATURE-005 — frontend exists ✅ · FEATURE-006 — prod serves
  `vlc-report.leopoldwalther.com` ✅
- **Unblocks:** nothing in this repo; sets the visual language the external portfolio-site repo
  will echo.

## Design & patterns

Per the technical plan (`dev/plans/technical/FEATURE-009-technical-plan.yaml`), the redesign adds
three small, focused, pure collaborators alongside the existing renderer/Adapter shape — no
classes are introduced where a config object or pure function suffices:

- **`chart_theme.js` — `buildLayout({ viewport, colorScheme, overrides })`** (Strategy + Factory).
  Independent `viewport` (mobile/desktop) and `colorScheme` (light/dark) axes, deep-merged
  `overrides` on top, never returns a `title` key (titles stay owned by each renderer /
  population label in `app.js`). All 5 chart renderer modules consume it — one migration per
  commit (9.6–9.10) so the suite stays green at every step.
- **`dashboard_state.js`** — pure, DOM-free helpers: `resolveTheme(stored, systemPrefers)`,
  `resolveViewport(width)`, `shouldRerender(prev, next)`, and a `loading → ready | error`
  lifecycle (`createLoadState` / `transition`), with `retry` resetting to `loading`.
- **`summary.js`** — pure `summaryStats(data)` + `formatKpi(value, kind)`: count-weighted median
  rent (€/m²/mo) and sale (€/m²) from `boxplot_by_neighborhood`, an implied gross yield % from
  `rent_vs_sale_ratio`, total listing count, and `lastUpdated`. Every field is null-able — missing
  or empty source arrays never throw.
- **`app.js` stays thin** — it only reads browser/DOM state (`localStorage`, `matchMedia`,
  `window.innerWidth`) and applies the pure helpers' results: KPI row, chart rendering with
  `{ responsive: true }`, debounced viewport/theme-triggered re-render via `shouldRerender`, and
  the load-lifecycle → skeleton/error DOM wiring.
- **Design tokens** — CSS custom properties in `:root`, with `[data-theme="dark"]` (explicit
  override) and `@media (prefers-color-scheme: dark)` (system default) blocks, cascade-ordered so
  an explicit `[data-theme="light"]` always wins over a dark OS.

## Approach

13 atomic tasks (9.1–9.13), one branch + commit each, ordered by dependency — see
`dev/plans/technical/FEATURE-009-technical-plan.yaml` for the authoritative, TDD-framed task list
with acceptance criteria, file boundaries, and branch names. Summary:

### Phase 1 — Design system & layout shell
- [x] 9.1 Design tokens, dark/light palette, favicon, meta/OG/Twitter tags
- [x] 9.2 Responsive dashboard shell: card grid, KPI row placeholder, loading skeletons, error block

### Phase 2 — Pure helper modules (parallel-safe)
- [x] 9.3 `dashboard_state.js` — theme/viewport/rerender/lifecycle helpers
- [x] 9.4 `summary.js` — KPI aggregation (median rent/sale, yield, counts)
- [x] 9.5 `chart_theme.js` — unified `buildLayout` factory (viewport × colorScheme)

### Phase 3 — Chart migrations (one module per commit)
- [x] 9.6 `price_time_series.js` consumes `buildLayout`
- [x] 9.7 `price_time_series_district.js` consumes `buildLayout`
- [x] 9.8 `rent_vs_sale_ratio.js` consumes `buildLayout`
- [x] 9.9 `rent_vs_sale_ratio_time_series.js` consumes `buildLayout`
- [x] 9.10 `boxplot_by_neighborhood.js` consumes `buildLayout`

### Phase 4 — Wiring & polish
- [x] 9.11 `app.js` wiring: dashboard_state + summary KPIs + responsive/theme re-render
- [x] 9.12 Theme-toggle control, accessibility pass (focus rings, aria-live, reduced-motion,
  contrast), manual Lighthouse pass recorded below
- [ ] 9.13 Full-suite verification, docs, status sync, dev → prod deploy

## Files

- **Created:** `frontend/src/chart_theme.js`, `frontend/src/dashboard_state.js`,
  `frontend/src/summary.js` + their Vitest test files
- **Created:** `frontend/favicon.svg`
- **Changed:** `frontend/styles.css` — design tokens, dark mode, card/KPI grid, skeletons, a11y
  (focus-visible, reduced-motion), theme-toggle button styling
- **Changed:** `frontend/index.html` — meta/OG/Twitter tags, KPI row, skeleton markup, error block,
  aria-live status announcer, theme-toggle button
- **Changed:** `frontend/app.js` — thin orchestration wiring the 3 new pure modules
- **Changed:** `frontend/src/charts/*.js` (5 files) — consume `chart_theme.buildLayout`
- **Changed:** existing chart tests — assert layouts come from the factory

## Test strategy

- **Unit (Vitest):** `chart_theme` (viewport × colorScheme, override deep-merge), `summary`
  (KPI formulas + empty/missing guards, pinned to `frontend/tests/fixtures/latest.sample.json`),
  `dashboard_state` (lifecycle transitions, theme/viewport resolution, rerender gating), and every
  chart renderer asserting its layout comes from the factory. 106/106 tests passing as of 9.10/9.11.
- **Integration:** existing chart-render tests stay green with the themed layouts.
- **Manual (task 9.13):** real-device check at mobile width, light + dark mode, Lighthouse mobile
  pass on dev before prod promotion.

## Estimated monthly cloud cost

No new AWS resources — the same S3 bucket + CloudFront distribution serve the redesigned assets.

| Component | Pricing basis | Assumption | Est. / month |
|---|---|---|---|
| (no change) | — | — | ~$0 |
| **Total (new AWS components)** | | | **~$0/month** |

- **Budget check:** yes — unchanged.

## Success criteria

- [ ] No horizontal scrolling and readable charts at 360 px viewport width
- [x] Coherent design system: one palette, consistent card grid, refined header/footer
- [x] Dark mode works (system default + persisted manual toggle via the header button)
- [x] KPI headline row shows median rent/sale €/m², implied yield, counts, last-updated
- [x] All charts use `chart_theme.buildLayout`; no duplicated layout literals across renderers
- [x] Loading skeletons shown until data renders; fetch failure shows a retry button
- [x] Favicon + meta description + OG/Twitter tags present
- [ ] Lighthouse mobile ≥ 90 (Performance, Best Practices, SEO) — manual run pending (task 9.13,
  requires a deployed dev URL; cannot be run headlessly from this environment)
- [x] `npm test` green (106/106) as of task 9.12
- [ ] Deployed to dev, visually verified in light + dark, then promoted to prod

## Open questions & risks

- **Question — palette / brand direction:** a restrained neutral + single blue accent was chosen
  (see `:root` tokens in `frontend/styles.css`); revisit if/when the portfolio site defines a
  different brand identity.
- **Risk — Plotly re-render jank on low-end phones:** mitigated — `shouldRerender` only triggers a
  re-render on an actual viewport-bucket or colorScheme change, resize is debounced 200ms.
- **Risk — migrating 5 chart modules at once breaks tests:** mitigated — one module per commit
  (9.6–9.10), suite stayed green at every step.
- **Open — Lighthouse score:** not yet measured; this requires the dashboard to be reachable at a
  URL (dev deploy), which is part of task 9.13's manual verification, not something this
  environment can run standalone.
- **Assumption:** vendored Plotly v2.35.2 supports `responsive: true`, `autosize`, transparent
  `paper_bgcolor`/`plot_bgcolor` (confirmed — used in `chart_theme.js`).

## Progress log

- **2026-06-10** — Plan authored. Decision recorded: no SPA framework for the dashboard;
  portfolio site (leopoldwalther.com) goes to a separate repo with Astro + own Terraform
  consuming `shared/dns` remote state.
- **2026-07-16** — Reworked by `@architect` per owner direction ("clean, modern layout; reworking
  the visualizations is in scope"): unified `ChartTheme` factory, HTML card titles, KPI headline
  row, dark mode. Reviewed by `@reviewer`: added dark/light `colorScheme` as an independent axis
  (not just viewport), a dedicated `dashboard_state.js` pure module, and split the 5-chart
  migration into one task/commit per module. Emitted the 13-task technical plan.
- **2026-07-16** — `@implementer`: tasks 9.1–9.12 completed and merged to `main` (one branch/commit
  per task, suite green at every step — 106/106 tests passing). Accessibility polish (9.12) added
  a header theme-toggle button, `:focus-visible` outlines using the theme's focus-ring token,
  `prefers-reduced-motion` handling for the toggle transition, and the existing `aria-live`
  status announcer/skeleton/error wiring from 9.2/9.11 was verified against the acceptance
  criteria. Light/dark contrast reviewed by inspecting the token pairs (body text and KPI values
  use `--color-text` against `--color-bg`/`--color-surface`, both well above 4.5:1 in both
  palettes); a full automated Lighthouse run is deferred to task 9.13 since it needs a reachable
  dev URL. Task 9.13 (full-suite verification, docs, dev→prod deploy) remains open.
