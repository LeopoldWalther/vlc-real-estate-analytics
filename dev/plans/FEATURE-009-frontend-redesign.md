# FEATURE-009 — Frontend redesign: clean, modern, mobile-first dashboard

**Status:** 🔵 Planned · **Effort:** M–L (~14–18 h) · **Priority:** Medium
**Branch root:** `feature/frontend-redesign` · **Created:** 2026-06-10 · **Updated:** 2026-07-16

> Authored by `@architect`. Reviewed by `@reviewer` (see `dev/reviews/REVIEW-FEATURE-009.md`).
> Implemented by `@implementer` from `dev/plans/technical/FEATURE-009-technical-plan.yaml`.

## Objective

Turn the VLC dashboard (`vlc-report.leopoldwalther.com`) into a **clean, modern, mobile-first**
data product that stands up as a freelance-portfolio showcase: a coherent design system, a
KPI headline row, a **unified Plotly chart theme**, dark mode, and charts that adapt their size,
margins, legends, and fonts to the viewport.

## Context

The current frontend (FEATURE-005) is a deliberately minimal vanilla-JS single page. It works but
looks unfinished:

- `frontend/styles.css` is ~90 lines — generic greys (`#f8f9fa`, Bootstrap-ish borders), no brand
  identity, **no media queries**, no dark mode.
- All 8 Plotly charts hand-roll their own `layout` (see `src/charts/*.js`): each sets its own
  `margin`, `legend`, and an **in-chart `title`** stamped by `app.js`. Result: inconsistent
  spacing, desktop-default legends that overlap on phones, axis labels that collide, and duplicated
  layout literals across five modules.
- No summary/KPI layer — a visitor lands on eight raw charts with no "so what?" headline.
- No loading or error UI: while `latest.json` loads, the page shows empty white boxes; on failure it
  shows nothing.
- No favicon, no meta description, no Open Graph tags — looks unfinished when shared as a link.

The owner has confirmed (2026-07-16): **clean, modern layout is the goal, and reworking the
visualizations themselves is explicitly in scope.**

### Decisions carried forward / reaffirmed

- **No SPA framework, zero-build stack stays.** React/Next/Vue/Svelte would add a build pipeline and
  hydration for a single page of charts — over-engineering that distracts from the data-engineering
  story. The stack stays **vanilla ES modules + vendored Plotly + Vitest**. The "modern" look comes
  from craft (a real design-token system + a redesigned Plotly theme), not from a framework.
  *This is the primary approach; see Open Questions for the Tailwind alternative if faster style
  iteration is wanted later.*
- **The personal portfolio site (`leopoldwalther.com` apex) stays OUT of scope** and lives in a
  **separate repo** with its own static-site generator (Astro recommended) and Terraform stack. The
  only contract: that repo consumes `infrastructure/shared/dns/` outputs (`hosted_zone_id`,
  `certificate_arn`) via `terraform_remote_state`. No code is shared between the two sites; this
  redesign only *informs* that repo's design language.

## Dependencies

- **Needs:** FEATURE-005 — frontend exists ✅ · FEATURE-006 — prod serves
  `vlc-report.leopoldwalther.com` ✅
- **Unblocks:** nothing in this repo; sets the visual language the external portfolio-site repo will
  echo.

## Design & patterns

The redesign keeps the existing module structure (renderers as Strategy objects, `DataSource` as an
Adapter) and adds three small, focused collaborators. No classes are introduced where a config
object or pure function suffices (avoid over-engineering).

- **`ChartTheme` (Strategy + Factory)** — `frontend/src/chart_theme.js` exports
  `buildLayout({ viewport, colorScheme, overrides })` that returns a fully-themed Plotly layout:
  brand colorway, `Inter` font, subtle gridlines, transparent paper/plot backgrounds (so cards show
  through), viewport-tuned margins, and a responsive legend (horizontal bottom on mobile, right on
  desktop). **All five chart modules consume it** instead of hand-rolling layouts — this removes the
  duplicated literals (DRY) and gives one place to change the look (Single Responsibility /
  Open-Closed: a new theme variant is a new config branch, not edits in five files). Light and dark
  are two `colorScheme` strategies behind the same factory (polymorphism at the config level).
- **Titles move out of Plotly into HTML card headers.** Each chart lives in a `<section class="card">`
  with an `<h2>` heading and optional caption; `layout.title` is dropped. This is the core viz
  rework: cleaner typography, consistent spacing, no in-SVG title stamping in `app.js`, and the
  population label becomes a small badge in the card header rather than an appended title string.
- **`summaryStats` (pure function)** — `frontend/src/summary.js` computes the KPI headline numbers
  (latest median rent €/m²/mo, latest median sale €/m², implied gross yield, listing counts, last
  updated) from the gold JSON. Side-effect-free and unit-tested; feeds the KPI card row.
- **`dashboardState` (pure state helper)** — `frontend/src/dashboard_state.js` models the
  load lifecycle (`loading → ready | error`) as a small pure reducer so the loading-skeleton /
  error-retry transitions are testable without the DOM. Keeps `app.js` thin (it just applies the
  state to the DOM).
- **Design tokens** — CSS custom properties in `:root` (`--color-*`, `--space-*`, `--radius-*`,
  `--font-*`, fluid type via `clamp()`), with a `[data-theme="dark"]` / `prefers-color-scheme`
  override block. Palette and dark mode are a one-block change (Open-Closed for styling).

## Approach

Each task is a TDD slice where JS is involved (failing Vitest first → minimal code → cleanup). Pure
CSS/HTML tasks are verified by the existing suite staying green plus manual visual checks. The suite
must stay green at **every** commit — migrate one chart module per commit.

### Phase 1 — Design system & layout shell (CSS/HTML only)

- [ ] 9.1 **Design tokens + identity:** `:root` custom properties (brand palette, spacing scale,
  fluid typography with `clamp()`, radii, shadows, `Inter` self-hosted or system-stack fallback).
  Refined sticky header with logo/wordmark + accent, footer with "data updated" timestamp + GitHub
  link. Test: existing Vitest suite green (no JS change) + visual smoke.
- [ ] 9.2 **Responsive card grid:** replace the stacked `.chart-section` list with a mobile-first CSS
  grid of `.card`s (1 col mobile / 2 col ≥768 px), each card = header (`<h2>` + caption) + chart
  body. Chart bodies size per viewport (`min-height` ~260 px mobile / ~380 px desktop). Toggle bar
  wraps, ≥44 px touch targets. Test: manual at 360 / 768 / 1280 px — no horizontal scroll at any
  width.
- [ ] 9.3 **Dark mode:** `prefers-color-scheme` default + a header toggle that sets
  `data-theme` and persists to `localStorage`. TDD on the pure `resolveTheme(stored, systemPrefers)`
  helper; CSS override block does the rest.

### Phase 2 — KPI headline row

- [ ] 9.4 **`summaryStats` (TDD):** failing Vitest first — given a gold fixture, returns
  `{ medianRentPerM2, medianSalePerM2, grossYieldPct, listingCounts, lastUpdated }`, guarding empty
  / missing blocks (returns `null` fields, never throws). Then implement.
- [ ] 9.5 **KPI cards render:** a compact, responsive row of stat cards above the charts (value +
  label + subtle trend arrow vs. previous snapshot if available). Pure `formatKpi` helpers unit
  tested; DOM wiring in `app.js` kept thin.

### Phase 3 — Unified chart theme (JS viz rework)

- [ ] 9.6 **`ChartTheme` factory (TDD):** failing Vitest first —
  `buildLayout({ viewport: 'mobile' })` returns compact margins + horizontal bottom legend + smaller
  fonts; `{ viewport: 'desktop' }` returns roomy margins + right legend; `{ colorScheme: 'dark' }`
  swaps font/grid/colorway; `overrides` deep-merge wins. Then implement.
- [ ] 9.7 **Migrate all chart modules (one commit each):** each of the five modules
  (`price_time_series`, `price_time_series_district`, `rent_vs_sale_ratio`,
  `rent_vs_sale_ratio_time_series`, `boxplot_by_neighborhood`) drops its hand-rolled `layout` and
  calls `buildLayout(...)` with only its axis titles as `overrides`; `layout.title` removed. Update
  each module's test to assert the layout comes from the factory. Suite green after every commit.
- [ ] 9.8 **Move titles to HTML + `responsive: true`:** `index.html` card headers carry the titles;
  `app.js` stops stamping `layout.title`, passes `{ responsive: true }` to Plotly, and renders the
  population as a header badge instead of an appended title string.

### Phase 4 — Responsive & theme re-render

- [ ] 9.9 **Re-render on breakpoint / theme change (TDD):** pure `resolveViewport(width)` +
  `shouldRerender(prev, next)` helpers tested first. Then wire debounced `matchMedia` listeners
  (breakpoint) and a `data-theme` change hook so charts re-render with the correct
  `ChartTheme` variant only when the breakpoint/scheme actually changes (not per resize pixel).

### Phase 5 — UX & metadata polish

- [ ] 9.10 **Loading skeleton + error/retry (TDD):** `dashboard_state` reducer tested first
  (`loading → ready | error`, retry resets to `loading`). Then render a pulsing skeleton per card
  while `latest.json` loads and a friendly retry button on fetch failure — no more empty white boxes.
- [ ] 9.11 **Meta/SEO finish:** SVG favicon, `<meta name="description">`, Open Graph + Twitter card
  tags, correct `lang`/title, theme-color meta for mobile browser chrome. Manual verification.

### Phase 6 — Ship

- [ ] 9.12 **Docs + deploy:** update `frontend/README.md` (design tokens, theme factory, how to add a
  chart), run full `npm test`, deploy to **dev**, real-device check + Lighthouse, then promote to
  **prod** via `deploy-frontend.yml`.

## Files

- **Create:** `frontend/src/chart_theme.js` — viewport + colorScheme aware Plotly layout factory
- **Create:** `frontend/tests/chart_theme.test.js` — breakpoints, margins, legend, dark colorway, override merge
- **Create:** `frontend/src/summary.js` — pure `summaryStats` + `formatKpi` helpers
- **Create:** `frontend/tests/summary.test.js` — KPI computation + empty/missing guards
- **Create:** `frontend/src/dashboard_state.js` — pure load-lifecycle reducer + `resolveTheme` / `resolveViewport` helpers
- **Create:** `frontend/tests/dashboard_state.test.js` — state transitions, theme/viewport resolution
- **Create:** `frontend/favicon.svg` — brand mark
- **Change:** `frontend/styles.css` — full rewrite: design tokens, card grid, dark mode, media queries, skeletons
- **Change:** `frontend/index.html` — card grid markup, KPI row, header + theme toggle, meta/OG tags, favicon, skeleton placeholders
- **Change:** `frontend/app.js` — thin orchestration: apply `dashboardState` to DOM, render KPIs, pass `{responsive:true}`, drop title stamping, wire re-render listeners
- **Change:** `frontend/src/charts/*.js` (5 modules) — consume `ChartTheme.buildLayout`; remove `layout.title` and hand-rolled margins/legends
- **Change:** existing chart tests — assert layouts come from the factory (no literal margins)
- **Change:** `frontend/README.md` — document tokens, theme factory, add-a-chart recipe

## Test strategy

- **Unit (Vitest):** `chart_theme` (breakpoint + colorScheme boundaries, override deep-merge),
  `summaryStats` / `formatKpi` (values + empty/missing guards), `dashboard_state`
  (loading/ready/error/retry, `resolveTheme`, `resolveViewport`, `shouldRerender`), and each chart
  module passing the factory layout to Plotly. Target > 80 % on new code.
- **Integration:** existing chart-render tests stay green with the themed layouts and no in-chart
  titles.
- **Manual:** real-device check at iPhone width (360–390 px) on **dev** before prod; light + dark
  mode; Lighthouse **mobile ≥ 90** (Performance, Best Practices, SEO) — target ≥ 95.

## Estimated monthly cloud cost

No new AWS resources — the same S3 bucket + CloudFront distribution serve the redesigned assets.

| Component | Pricing basis | Assumption | Est. / month |
|---|---|---|---|
| (no change) | — | — | ~$0 |
| **Total (new AWS components)** | | | **~$0/month** |

- **Cost drivers & cheaper alternatives:** none added; asset size stays small (vendored Plotly is the
  bulk and is unchanged).
- **External / non-AWS costs:** none. `Inter` is self-hosted or a system-font fallback — no Google
  Fonts call.
- **Budget check:** yes — unchanged, well within the < $5/month target.

## Success criteria

- [ ] No horizontal scrolling and readable charts at 360 px viewport width
- [ ] Coherent design system: one palette, consistent card grid, refined header/footer
- [ ] **Dark mode** works (system default + persisted manual toggle)
- [ ] **KPI headline row** shows median rent/sale €/m², implied yield, counts, last-updated
- [ ] All charts use `ChartTheme.buildLayout`; **no duplicated layout literals and no in-chart titles**
- [ ] Loading skeletons shown until data renders; fetch failure shows a retry button
- [ ] Favicon + meta description + OG/Twitter + theme-color tags present
- [ ] Lighthouse mobile ≥ 90 (target ≥ 95) for Performance, Best Practices, SEO on dev
- [ ] `npm test` green; coverage on new code > 80 %
- [ ] Deployed to dev, visually verified in light + dark, then promoted to prod

## Open questions & risks

- **Question — palette / brand direction:** derive from the future portfolio site now, or pick a
  neutral, professional data-viz palette? *Default: a restrained neutral + single accent (slate/ink
  base, one blue or teal accent) chosen now; tokens make a later rebrand a one-block change.*
- **Question — Tailwind vs hand-authored tokens:** the primary approach is hand-authored design-token
  CSS (zero build). *Alternative:* add Tailwind via its CLI (a single `tailwindcss` build step in
  `deploy-frontend.yml`, still no runtime framework) if faster style iteration is wanted. *Default:
  hand-authored tokens — keeps the zero-build stack and the "no over-engineering" story intact.*
- **Question — chart consolidation:** keep all 8 charts, or curate to a tighter set for the headline
  view (e.g. tabs/sections)? *Default: keep all 8 but group them into labelled sections; revisit if
  the mobile page feels long.*
- **Risk — Plotly re-render jank on low-end phones:** *Mitigation:* debounce + only re-render when the
  breakpoint/colorScheme class actually changes, not on every resize pixel (Task 9.9).
- **Risk — migrating 5 chart modules at once breaks tests:** *Mitigation:* one module per commit; suite
  green at every step (Task 9.7).
- **Assumption:** vendored Plotly v2.35.2 supports `responsive: true`, `autosize`, and transparent
  `paper_bgcolor`/`plot_bgcolor` (it does).

## Progress log

- **2026-06-10** — Plan authored. Decision: no SPA framework; portfolio site goes to a separate repo
  (Astro + own Terraform consuming `shared/dns`).
- **2026-07-16** — Reworked by `@architect` per owner direction ("clean, modern layout; reworking the
  visualizations is in scope"). Added: unified `ChartTheme` factory, titles moved to HTML card
  headers, KPI headline row (`summaryStats`), dark mode, and a testable `dashboard_state` reducer.
  Effort raised M → M–L. "No SPA framework, zero-build" reaffirmed as primary; Tailwind noted as an
  alternative.
