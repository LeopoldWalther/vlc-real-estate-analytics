# FEATURE-009 — Frontend redesign: mobile-first, professional polish

**Status:** 🔵 Planned · **Effort:** M (~8–10 h) · **Priority:** Medium
**Branch root:** `feature/frontend-redesign` · **Created:** 2026-06-10 · **Updated:** 2026-06-10

> Authored by `@architect`. Reviewed by `@reviewer` (see `dev/reviews/REVIEW-FEATURE-009.md`).
> Implemented by `@implementer` from `dev/plans/technical/FEATURE-009-technical-plan.yaml`.

## Objective

Rework the VLC dashboard frontend so it is fully usable on smartphones and looks professional:
a coherent design system, mobile-first responsive layout, and Plotly charts that adapt their
size, margins, legends, and font sizes to the viewport.

## Context

The current frontend (FEATURE-005) is a deliberately minimal vanilla-JS single page:

- `frontend/styles.css` is 74 lines — functional but generic (default Bootstrap-ish greys, no
  brand identity, no media queries).
- The 8 Plotly charts use fixed `min-height: 400px` containers and desktop-default Plotly
  layouts; on a phone the legends overlap, margins eat half the width, and axis labels collide.
- No loading/error UI: while `latest.json` loads, the page shows empty white boxes.
- No favicon, no meta description, no Open Graph tags — looks unfinished when shared.

**Explicit non-goals (decided with the owner, 2026-06-10):**

- **No SPA framework.** React/Next/Vue would add a build pipeline and hydration complexity for a
  single page of charts — over-engineering. The stack stays vanilla ES modules + vendored
  Plotly + Vitest.
- **The personal portfolio site (leopoldwalther.com apex) is OUT of scope.** It lives in a
  **separate repository** with its own static-site generator (Astro recommended) and its own
  Terraform stack. The only contract with this repo: the new repo consumes
  `infrastructure/shared/dns/` outputs (`hosted_zone_id`, `certificate_arn` — the wildcard cert
  already lists the apex as SAN) via `terraform_remote_state`, then creates its own S3 bucket,
  CloudFront distribution, and apex A/AAAA alias records. No code or framework needs to be
  shared between the two sites.

## Dependencies

- **Needs:** FEATURE-005 — frontend exists ✅ · FEATURE-006 — prod serves vlc-report.leopoldwalther.com ✅
- **Unblocks:** nothing in this repo; informs the (external) portfolio-site repo's design language

## Design & patterns

The redesign keeps the existing module structure and adds one new collaborator:

- **`ChartTheme` (Strategy + Factory)** — `frontend/src/chart_theme.js` exports a
  `buildLayout(viewport, overrides)` factory that produces a Plotly layout object (fonts,
  margins, legend placement, colorway) tuned per breakpoint. All 5 chart modules consume it
  instead of hand-rolling layouts — removes duplication (DRY) and gives one place to change the
  look (Single Responsibility / Open-Closed: a new theme variant is a new config, not edits in
  five files).
- **CSS custom properties** as the design-token layer (`--color-*`, `--space-*`, `--radius-*`)
  so the palette is changed in one `:root` block.
- Pure functions stay pure — no classes are introduced where a config object suffices
  (avoid over-engineering).

## Approach

### Phase 1 — design system (CSS only)

- [ ] 9.1 Design tokens + visual identity: `:root` custom properties (palette, spacing,
  typography scale), card design with subtle shadow, refined header with accent color, footer
  with data-updated timestamp and GitHub link. Test: visual smoke + existing Vitest suite green
  (no JS change).

### Phase 2 — responsive layout

- [ ] 9.2 Mobile-first media queries: fluid padding, chart containers sized per viewport
  (`min-height` 280 px mobile / 400 px desktop), toggle bar wraps and stays tappable (≥44 px
  touch targets), header collapses gracefully. Test: manual at 375 px / 768 px / 1280 px;
  no horizontal scroll at any width.

### Phase 3 — responsive charts (JS)

- [ ] 9.3 `ChartTheme` factory (TDD): failing Vitest first — `buildLayout('mobile')` returns
  compact margins, horizontal bottom legend, smaller fonts; `buildLayout('desktop')` returns
  current defaults. Then implement and wire `{responsive: true}` Plotly config plus the factory
  into all 5 chart modules.
- [ ] 9.4 Re-render on breakpoint change: listen to `matchMedia` change events and re-render
  charts with the new layout (debounced). TDD on the pure breakpoint-resolution helper.

### Phase 4 — UX & metadata polish

- [ ] 9.5 Loading skeleton + error state: show a pulsing placeholder per chart while
  `latest.json` loads; on fetch failure render a friendly retry message instead of empty boxes.
  TDD on the state-transition logic in `app.js` (extracted into a testable helper).
- [ ] 9.6 Meta/SEO finish: favicon (SVG), `<meta name="description">`, Open Graph + Twitter
  card tags, `lang`-correct title. No JS — manual verification.

## Files

- **Create:** `frontend/src/chart_theme.js` — viewport-aware Plotly layout factory
- **Create:** `frontend/tests/chart_theme.test.js` — breakpoints, margins, legend placement
- **Create:** `frontend/favicon.svg` — simple brand mark
- **Change:** `frontend/styles.css` — design tokens, card design, media queries
- **Change:** `frontend/index.html` — meta tags, favicon link, footer, loading skeleton markup
- **Change:** `frontend/app.js` — loading/error states, matchMedia re-render
- **Change:** `frontend/src/charts/*.js` (5 files) — consume `ChartTheme.buildLayout`
- **Tests:** existing chart tests updated to assert layouts come from the factory

## Test strategy

- **Unit (Vitest):** `chart_theme` breakpoint logic (mobile/tablet/desktop boundaries, override
  merging), loading/error state transitions, each chart module passes factory layout to Plotly.
  Target > 80 % on new code.
- **Integration:** existing chart-render tests stay green with the themed layouts.
- **Manual:** real-device check (iPhone-width 375 px) on dev before prod deploy; Lighthouse
  mobile score ≥ 90 for Performance + Best Practices + SEO.

## Estimated monthly cloud cost

No new AWS resources — same S3 bucket + CloudFront distribution serve the redesigned assets.

| Component | Pricing basis | Assumption | Est. / month |
|---|---|---|---|
| (no change) | — | — | ~$0 |
| **Total (new AWS components)** | | | **~$0/month** |

- **Budget check:** yes — unchanged.

## Success criteria

- [ ] No horizontal scrolling and readable charts at 375 px viewport width
- [ ] All charts use `ChartTheme.buildLayout`; no duplicated layout literals in chart modules
- [ ] Loading skeletons shown until data renders; fetch failure shows a retry message
- [ ] Favicon + meta description + OG tags present
- [ ] Lighthouse mobile ≥ 90 (Performance, Best Practices, SEO) on dev
- [ ] `npm test` green; coverage on new code > 80 %
- [ ] Deployed to dev, visually verified, then promoted to prod via `deploy-frontend.yml`

## Open questions & risks

- **Question:** Color palette / brand direction — derive from the future portfolio site's
  identity, or pick a neutral data-viz palette now? *Default: neutral palette now; tokens make a
  later rebrand a one-block change.*
- **Risk:** Plotly re-render on breakpoint change can be janky on low-end phones —
  *Mitigation:* debounce + only re-render when the breakpoint class actually changes, not on
  every resize pixel.
- **Risk:** Updating 5 chart modules at once can break existing tests — *Mitigation:* migrate
  one module per commit; suite must stay green at every step.
- **Assumption:** Vendored Plotly v2.35.2 supports `responsive: true` and `autosize` (it does;
  available since v1.x).

## Progress log

- **2026-06-10** — Plan authored. Decision recorded: no SPA framework for the dashboard;
  portfolio site (leopoldwalther.com) goes to a separate repo with Astro + own Terraform
  consuming `shared/dns` remote state.
