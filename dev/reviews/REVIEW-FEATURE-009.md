# Review — FEATURE-009: Frontend redesign: clean, modern, mobile-first dashboard

**Reviewer:** `@reviewer` · **Date:** 2026-07-16 · **Plan:** [FEATURE-009](../plans/FEATURE-009-frontend-redesign.md)
**Verdict:** ⚠️ Changes Recommended

## Summary

The plan is directionally strong and fits the existing zero-build vanilla ES module frontend. The proposed design-token CSS, pure helper modules, and unified Plotly layout factory are appropriate and avoid framework overreach. The main adjustment needed is execution granularity: the chart migration and app orchestration work should be split into smaller, independently testable slices so the Implementer can keep the suite green at every commit.

## Strengths

- ✅ Preserves the current architecture: static HTML/CSS, vanilla ES modules, vendored Plotly, Vitest.
- ✅ Correctly identifies the current UX gaps: no responsive CSS, duplicated Plotly layouts, no loading/error states, no KPI headline layer, weak share metadata.
- ✅ Uses lightweight abstractions deliberately: pure functions/config factories instead of unnecessary classes.
- ✅ Keeps AWS cost and deployment surface unchanged.
- ✅ The "titles in HTML, Plotly layouts for plots only" decision improves accessibility and mobile layout control.

## Findings

### 🟡 M1 — Chart migration task is too broad for safe implementation

- **Problem:** Task 9.7 migrates all five chart modules in one task while also asking for one commit each.
- **Impact:** This mixes multiple independently testable changes and makes rollback/debugging harder if a chart test fails.
- **Recommendation:** Split into one technical task per chart module/factory group: neighbourhood time series, district time series, rent-vs-sale scatter, ratio time series, and boxplot.
- **Effort:** S

### 🟡 M2 — DOM/app behaviour has limited automated coverage

- **Problem:** `frontend/app.js` is excluded from Vitest coverage, but FEATURE-009 adds significant orchestration there: theme toggle, retry, KPI rendering, population badge updates, responsive Plotly config, and rerender listeners.
- **Impact:** Regressions can ship despite green unit tests, especially because the deploy workflow runs only `npm test`.
- **Recommendation:** Keep complex decisions in pure helpers (`dashboard_state`, `summary`, `chart_theme`) and keep `app.js` thin. Avoid adding jsdom/browser-test infrastructure unless needed; require explicit manual smoke checks for app wiring.
- **Effort:** M

### 🟡 M3 — KPI schema assumptions need to be pinned to the existing gold fixture

- **Problem:** The plan names KPI outputs but does not specify exactly which fields in `latest.json` drive median rent, median sale, counts, and last-updated.
- **Impact:** The Implementer may infer fields incorrectly or compute a misleading "gross yield".
- **Recommendation:** Write `summary.test.js` first against `frontend/tests/fixtures/latest.sample.json`; document formulas in test names and `frontend/README.md`.
- **Effort:** S

### 🟢 L1 — Lighthouse target should remain a release check, not a hard CI gate

- **Suggestion:** Keep Lighthouse mobile ≥90 as a manual dev-deploy acceptance check.
- **Why:** There is no existing Lighthouse workflow, and adding one would increase scope for a visual redesign feature.

### 🟢 L2 — Avoid introducing external font/network dependencies

- **Suggestion:** Prefer system font stack or self-hosted assets only.
- **Why:** The deploy sync publishes all frontend assets to S3/CloudFront; external fonts would add privacy/performance concerns and weaken the zero-build/static story.

## Alternatives considered

- **SPA framework** — React/Vue/Svelte would improve component ergonomics but add build/dependency complexity for a single static dashboard. Verdict: reject.
- **Tailwind CLI** — Faster utility-class iteration, but adds a build step and deploy workflow changes. Verdict: defer; hand-authored design tokens are sufficient.
- **Full browser test setup** — More confidence for DOM interactions, but adds setup cost. Verdict: skip for now; use pure helper tests plus manual smoke checks.

## Risks

| Risk | Likelihood | Impact | Severity | Mitigation |
| --- | --- | --- | --- | --- |
| Plotly rerender jank on mobile | Med | Med | 🟡 | Debounce and rerender only when viewport class or theme changes |
| KPI values computed from wrong fields | Med | Med | 🟡 | Test against existing fixture and document formulas |
| CSS rewrite causes mobile horizontal scroll | Med | High | 🟡 | Manual checks at 360/768/1280 px; card containers use overflow control |
| Dark-mode Plotly/CSS colors diverge | Med | Med | 🟡 | One `chart_theme` colorScheme factory plus CSS tokens |
| Deploy publishes unwanted files | Low | Low | 🟢 | Existing workflow excludes tests/node_modules/coverage; new source files are intended static assets |

## Effort check

- **Plan estimate:** M-L (~14-18h)
- **Reviewer estimate:** M-L (~16-20h) — confidence Medium
- **Why it differs / hidden complexity:** App orchestration, dark-mode rerendering, KPI formula validation, and mobile Plotly tuning usually require more manual iteration than pure JS tasks.

## Reuse & conflicts

- **Reuse:** `frontend/src/transforms.js` and existing chart renderer Strategy shape should remain unchanged.
- **Reuse:** Existing Vitest fixture `frontend/tests/fixtures/latest.sample.json` should drive summary/KPI tests.
- **Reuse:** Existing `.github/workflows/deploy-frontend.yml` already runs `npm ci` and `npm test`; no deploy workflow change is needed.
- **Conflict / coordinate with:** Avoid touching ETL, infrastructure, or deploy workflows unless a frontend asset-serving issue is discovered.

## Approval criteria

- **Blockers (must fix):** none
- **Recommended:** M1 split chart migration; M2 keep app orchestration thin and manually smoke-test; M3 pin KPI formulas to fixture
- **Optional:** L1 keep Lighthouse manual; L2 avoid external fonts

## Next step

Use the technical plan below rather than the broad architect task list, then:

`@implementer Implement FEATURE-009`

---

### Post-implementation notes

*Filled in after the task ships.*

- **Worked well:** —
- **Missed in review:** —
- **Estimated vs. actual:** —
