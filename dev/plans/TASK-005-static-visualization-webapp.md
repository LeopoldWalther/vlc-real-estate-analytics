# TASK-005: Static Visualization Web App (S3 + CloudFront)

**Status:** 🔵 Planned
**Branch:** `feature/static-visualization-webapp`
**Assignee:** Unassigned
**Created:** 2026-06-03
**Updated:** 2026-06-05
**Estimated Effort:** M (1–1.5 days)
**Priority:** Medium

> **Renumbered 2026-06-05.** Was TASK-004; became TASK-005 after inserting the Gold Aggregation Lambda as the new TASK-004. Data source is now `gold/aggregations/latest.json` (produced by TASK-004), not a silver aggregation.

## Objective
Ship a tiny static web app (HTML + Plotly.js) hosted on S3 + CloudFront that visualizes the **gold-layer** Idealista aggregations, replacing the EC2/EKS Flask prototype.

## Context
The former Flask prototype (`app.py` + `vlcrealestate/`, since removed from the repo) demonstrated the target visualization. For cost reasons we don't want to run servers (EC2/EKS/App Runner). With small data and weekly updates, a static frontend fetching one pre-aggregated JSON (produced by TASK-004 Gold) is the cheapest, most secure setup.

## Dependencies
**Requires:**
- TASK-004 (Gold Aggregation Lambda) — produces `gold/aggregations/latest.json`

**Blocks:** —

**Related:**
- Former prototype template `vlcrealestate/templates/index.html` (since removed)

## Implementation Plan

### Phase 1: Static frontend
- [ ] Create `frontend/` with:
  - `index.html` — minimal layout, title, container divs (one per chart)
  - `app.js` — fetch `gold/aggregations/latest.json` via CloudFront, render Plotly charts
  - `styles.css`
- [ ] Chart 1: mean priceByArea over time per neighborhood (Linien-Chart wie Prototyp; sale + rent)
- [ ] Chart 2: rent-vs-sale ratio per neighborhood (Scatter/Bar mean_priceByArea_sale vs _rent)
- [ ] Chart 3: listing counts over time per neighborhood (sale/rent)
- [ ] Konfigurierbare Daten-URL über `window.CONFIG.DATA_URL`

### Phase 2: Hosting infrastructure (Terraform)
- [ ] New module `infrastructure/modules/frontend/`:
  - Private S3 bucket for frontend assets
  - CloudFront distribution with **Origin Access Control (OAC)**
  - CloudFront origin/behavior für `gold/aggregations/*.json` aus dem Gold-Bucket/Prefix (zweiter Origin)
- [ ] S3 Block Public Access für beide Buckets aktiv
- [ ] Optional eigene Domain + ACM-Zertifikat (Phase 2 nice-to-have)

### Phase 3: Deployment
- [ ] GitHub Actions Workflow `.github/workflows/deploy-frontend.yml`
  - Build (statisch, kein Bundler nötig)
  - `aws s3 sync frontend/ s3://<frontend-bucket>/`
  - `aws cloudfront create-invalidation`
- [ ] Output der CloudFront Distribution URL als Terraform Output

### Phase 4: Tests & docs
- [ ] Lightweight JS Unit Test (z. B. Vitest) für Datentransformation im Frontend
- [ ] Manuelles E2E: latest.json wird gerendert, Filter funktionieren
- [ ] `documentation/FRONTEND_LAYER.md` mit Architektur + Deploy-Schritten

## TDD Strategy (Mandatory)

### RED
- [ ] JS Test: `formatSeries(json)` schlägt fehl, weil Funktion fehlt
- [ ] Terraform Plan Test: erwartete Ressourcen (S3, CF, OAC) fehlen

### GREEN
- [ ] Implementiere `formatSeries` minimal
- [ ] Minimaler Terraform-Modulcode bis `terraform validate` + Plan grün

### REFACTOR
- [ ] Modularisieren, Konstanten extrahieren, Lint sauber

## Files to Modify/Create

### New
- `frontend/index.html`
- `frontend/app.js`
- `frontend/styles.css`
- `frontend/tests/format_series.test.js`
- `infrastructure/modules/frontend/main.tf`
- `infrastructure/modules/frontend/variables.tf`
- `infrastructure/modules/frontend/outputs.tf`
- `.github/workflows/deploy-frontend.yml`
- `documentation/FRONTEND_LAYER.md`

### Modified
- `infrastructure/environments/dev/main.tf` — instantiate frontend module
- `infrastructure/environments/prod/main.tf` — same

## Testing Requirements

### Unit
- [ ] `formatSeries` produziert pro Neighborhood eine Plotly-Trace
- [ ] Leeres JSON → leere Anzeige, kein JS-Error

### Integration
- [ ] Lokales `python -m http.server` lädt `latest.json` aus dev (via CloudFront)
- [ ] CloudFront invalidiert nach Deploy korrekt

### Manuell
- [ ] Visuelle Prüfung der Chart-Darstellung
- [ ] Lighthouse-Check (Performance + Best Practices)

## Success Criteria
- [ ] App erreichbar über CloudFront URL
- [ ] Buckets sind privat, nur via OAC erreichbar
- [ ] Page Load < 1s (klein und gecached)
- [ ] Deploy-Workflow grün
- [ ] Coverage ≥ 80% für neuen JS-Code

## Technical Notes

### Architecture
- Vollständig statisch, keine Server, keine API Gateway-Kosten
- Datenquelle: vor-aggregiertes JSON aus TASK-004 Gold (via CloudFront)
- Erweiterbar: später API Gateway + Query-Lambda bei dynamischen Filtern

### Performance
- Caching primär via CloudFront (TTL z. B. 1h für JSON, 1d für statische Assets)

### Security
- S3 Block Public Access an
- CloudFront → S3 ausschließlich über OAC
- Keine Credentials im Frontend
- CORS nicht nötig (alles same-origin via CloudFront)

### Gotchas
- CloudFront-Invalidierung nach Deploy nicht vergessen, sonst stale Assets
- `latest.json` braucht passenden Cache-Control Header

## Questions/Risks

### Open Questions
- [ ] Custom Domain gewünscht? (sonst CloudFront-Default Domain)
- [ ] Mehrere Charts in MVP (Phase 1) oder erst nur 1?

### Risks
- **CloudFront-Konfig-Drift:** *Mitigation:* alles in TF, kein Click-Ops
- **Schema-Änderungen in latest.json:** *Mitigation:* Versionierung im JSON (`schema_version`)

### Assumptions
- TASK-004 (Gold) stellt `gold/aggregations/latest.json` bereit
- Daten klein genug für vollständige Auslieferung in einem JSON

## Planning Summary (For Quick Reference)

**One-line objective:**
Ship a static S3+CloudFront frontend that visualizes pre-aggregated gold data, no servers, near-zero cost.

**Critical decisions:**
- Hosting: S3 + CloudFront mit OAC (kein EC2/EKS/App Runner)
- Daten: vor-aggregiertes JSON via CloudFront, keine API
- Stack: plain HTML + Plotly.js (kein Framework nötig im MVP)

**Subtasks at a glance:**
| Task | Priority | Est. Hours | Dependencies |
|------|----------|------------|--------------|
| 5.1 Static frontend (HTML/JS, 3 charts) | P0 | 4h | TASK-004 |
| 5.2 Terraform frontend module | P0 | 3h | None |
| 5.3 Deploy workflow           | P0 | 2h | 5.1, 5.2 |
| 5.4 Tests + docs              | P1 | 2h | 5.1–5.3 |

**Key files to modify:**
- `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`
- `infrastructure/modules/frontend/*.tf`
- `infrastructure/environments/{dev,prod}/main.tf`
- `.github/workflows/deploy-frontend.yml`

**Watch-outs for reviewer:**
- S3 wirklich privat (Block Public Access)
- OAC korrekt konfiguriert, kein OAI-Legacy
- Cache-Control für `latest.json` separat vom statischen Asset-Cache

**Blockers or open questions:**
- Custom Domain Ja/Nein
- MVP-Chart-Umfang

## Progress Log
- 2026-06-03: Plan erstellt
