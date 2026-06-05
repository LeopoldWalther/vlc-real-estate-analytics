# TASK-002: Idealista Web Scraper — Notebook MVP + Lambda Production

**Status:** 🟡 In Progress
**Branch:** `feature/idealista-web-scraper`
**Assignee:** @coder
**Created:** 2026-03-29
**Updated:** 2026-06-03
**Estimated Effort:** L (4–5 days total across both phases)
**Priority:** High

---

## Objective

Supplement the Idealista API collector (which is capped at 100 listings/month) with a web scraper that can retrieve unlimited search-result listings. Deliver two artefacts: (1) a Jupyter notebook for local, interactive development and testing, and (2) a production Lambda function that runs weekly on AWS.

---

## Context

The existing `idealista_listings_collector.py` Lambda uses the Idealista API (OAuth2). The API imposes monthly request quotas that limit how many listings can be collected. The public Idealista website serves the same data without programmatic limits. A scraper targeting the public search-results pages closes this gap and provides a second, parallel data source in the same S3 bronze layer.

**Existing project patterns to follow:**
- `src/etl/data_collection/idealista_listings_collector.py` → Lambda module pattern
- `src/notebooks/idealista_listings_collector.ipynb` → mirrored notebook for local testing
- Medallion architecture: raw output → `bronze/idealista-scraper/{date}/` in S3
- Strategy Pattern (`SearchConfig`), DI for AWS clients, custom exceptions, full type hints + docstrings

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1 — Jupyter Notebook (local dev & validation)            │
│                                                                 │
│  idealista_web_scraper.ipynb                                    │
│  ┌─────────────┐   ┌────────────────┐   ┌──────────────────┐   │
│  │ ScraperConfig│→ │ ScraperSession │→ │ SearchResults    │   │
│  │ (URLs, params)│  │ (cloudscraper  │  │ Parser (BS4+lxml)│   │
│  │              │  │  + retries)    │  │                  │   │
│  └─────────────┘   └────────────────┘  └────────┬─────────┘   │
│                                                  │             │
│                         ┌────────────────────────▼──────────┐  │
│                         │  ParsedListing dataclass          │  │
│                         │  (mirrors API elementList fields) │  │
│                         └────────────────────────┬──────────┘  │
│                                                  │             │
│                    ┌─────────────────────────────▼──────────┐  │
│                    │  Local output: data/s3/scraper_*.json  │  │
│                    │  Optional: S3 upload if creds available│  │
│                    └────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2 — AWS Lambda (weekly production)                       │
│                                                                 │
│  EventBridge cron(0 13 ? * SUN *)    ← 1 hour after API run    │
│         │                                                       │
│         ▼                                                       │
│  Lambda: idealista_web_scraper.lambda_handler()                 │
│  (extracted from notebook; same ScraperConfig, Parser classes)  │
│         │                                                       │
│         ▼                                                       │
│  S3: bronze/idealista-scraper/{YYYYMMDD}/                       │
│       {operation}_{date}_{time}_page{N}.json                    │
│         │                                                       │
│         ▼                                                       │
│  SNS: error alerts (shared topic with API collector)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| HTTP library | `cloudscraper` | Handles Cloudflare/bot-detection without paid proxies |
| HTML parser | `beautifulsoup4` + `lxml` | Fast, reliable; lxml is more lenient than html.parser |
| Data model | `dataclass` `ParsedListing` | Type-safe; `.to_dict()` emits camelCase keys matching API output |
| Rate limiting | `time.sleep(random.uniform(2, 4))` | Stays under bot thresholds; polite scraping |
| Pagination | URL query param `?pagina=N` | Matches observed Idealista URL pattern |
| Local output | `data/s3/` directory | Consistent with existing local S3 mirror; no AWS credentials required |
| S3 prefix | `bronze/idealista-scraper/` | Separate from API data; avoids naming collisions |
| Lambda schedule | `cron(0 13 ? * SUN *)` | 1 h after API collector (12:00); staggered to avoid rate-limiting |
| Infra scope | New Terraform module `scraper_lambda` | Reuses existing `s3/` and `sns/` modules; no Secrets Manager needed |

---

## Scraped Fields

The scraper targets the following fields from each search-result card, matching the existing API `elementList` schema as closely as possible:

| Field | API key | Source on page |
|---|---|---|
| Listing ID | `propertyCode` | URL slug `/inmueble/{id}/` |
| Thumbnail | `thumbnail` | `img.item-multimedia` src |
| Price | `price` | `.item-price` text |
| Size (m²) | `size` | `.item-detail` containing "m²" |
| Rooms | `rooms` | `.item-detail` containing "hab." |
| Floor | `floor` | `.item-detail` containing "planta" |
| Address | `address` | `.item-address` text |
| Neighborhood | `neighborhood` | `.item-address` span |
| Price/m² | `priceByArea` | `.item-price-down` calculated |
| Listing URL | `url` | `article.item a.item-link` href |
| Operation | `operation` | Passed in from `ScraperConfig` |
| Has elevator | `hasLift` | Search filter embedded in URL |

*Note: `latitude`, `longitude`, `district`, `description`, `rooms`, `bathrooms` may not be available on search-result cards (detail pages not scraped in MVP). Fields unavailable from search results will be set to `null`.*

---

## Target URLs

```
# Rent (alquiler)
https://www.idealista.com/alquiler-viviendas/valencia-valencia/
  con-de-100-metros-cuadrados,hasta-160-metros-cuadrados,con-ascensor,buen-estado/
  ?pagina=N

# Sale (venta)
https://www.idealista.com/venta-viviendas/valencia-valencia/
  con-de-100-metros-cuadrados,hasta-160-metros-cuadrados,con-ascensor,buen-estado/
  ?pagina=N
```

---

## Phase 1 — Jupyter Notebook MVP

### Objective
Validate the scraping approach interactively: confirm `cloudscraper` bypasses bot detection, identify the correct CSS selectors, extract all target fields, and save to the local `data/s3/` directory.

### Step 1.1: Dependencies
- Add to `src/etl/requirements-dev.txt`: `cloudscraper>=1.2.71`, `beautifulsoup4>=4.12.0`, `lxml>=5.1.0`
- Create `src/etl/data_collection/scraper_requirements.txt` for Lambda packaging (separate from `requirements.txt` to keep Lambda layers clean)

### Step 1.2: Notebook Structure (`src/notebooks/idealista_web_scraper.ipynb`)

**Cell 1 — Markdown header:** Purpose, usage instructions, Idealista URL format

**Cell 2 — Imports:**
```python
import cloudscraper
from bs4 import BeautifulSoup
import json, time, random, re
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
import boto3  # optional S3 upload
```

**Cell 3 — `ScraperConfig` class:**
Mirrors `SearchConfig` pattern. Holds base URLs for rent and sale, pagination template, output directory, optional S3 bucket/prefix. Exposes `build_url(operation, page)`.

**Cell 4 — `IdealistaScraperError` exception:**
Custom exception for domain-specific errors (HTTP errors, parse failures, rate limiting).

**Cell 5 — `ParsedListing` dataclass:**
All target fields with type annotations. `.to_dict()` method emitting camelCase keys. Explicit `null` defaults for fields unavailable on search-result cards.

**Cell 6 — `ScraperSession` class:**
Wraps `cloudscraper.create_scraper()`. Configures browser fingerprint. `.get_page(url)` with retry logic (3 attempts, exponential backoff). Rate-limiting delay between pages.

**Cell 7 — `SearchResultsParser` class:**
Takes raw HTML string, returns `List[ParsedListing]`. Uses a `DOM_SELECTORS` dict constant (makes selector updates easy when Idealista changes their markup). Includes `_parse_price()`, `_parse_size()`, `_parse_floors()`, `_extract_property_code()` helpers.

**Cell 8 — Pagination loop:**
`scrape_operation(config, operation)` → iterates pages until `next page` link is absent or max pages reached. Appends results, respects rate limit.

**Cell 9 — Local save:**
`save_locally(listings, operation, output_dir)` → writes `data/s3/scraper_{operation}_{date}_page{N}.json` matching existing file naming convention. JSON envelope: `{"operation": ..., "source": "web_scraper", "collected_at": ..., "page": N, "totalPages": N, "elementList": [...]}`.

**Cell 10 — Optional S3 upload:**
`upload_to_s3(bucket, key, data, s3_client)` → guarded by `if USE_S3:` flag. Uses same upload logic as existing collector.

**Cell 11 — Run for rent:**
Execute scrape for `operation="rent"`. Display `pd.DataFrame(listings)` preview.

**Cell 12 — Run for sale:**
Execute scrape for `operation="sale"`. Display preview.

**Cell 13 — Compare with API data:**
Load an existing `data/s3/rent_*.json` API file. Show field coverage comparison table.

### Step 1.3: Validate locally
- Run notebook end-to-end
- Confirm ~200+ listings retrieved across 4–5 pages
- Spot-check 3 listings against live Idealista search to verify accuracy
- Capture real HTML snippet as test fixture (save to `tests/fixtures/search_results_rent.html`)

---

## Phase 2 — Lambda Production Module

### Objective
Extract the validated notebook logic into a production-ready Python module, write tests, build the Terraform infrastructure, and deploy.

### Step 2.1: Python Module (`src/etl/data_collection/idealista_web_scraper.py`)

Follow exact same structure as `idealista_listings_collector.py`:

```
Module-level constants
IdealistaScraperError
ParsedListing dataclass
ScraperConfig class
ScraperSession class
SearchResultsParser class
scrape_operation(config, operation, s3_client) → List[ParsedListing]
upload_to_s3(s3_client, bucket, key, data) → None
send_notification(sns_client, topic_arn, message) → None  (reuse error pattern)
lambda_handler(event, context) → Dict[str, Any]
main() → None   (CLI entry point for local execution)
```

**Key differences from notebook:**
- Module-level `s3_client`, `sns_client` (injectable for tests, no `secrets_client` needed)
- `lambda_handler` validates env vars (`S3_BUCKET`, `S3_PREFIX`, `SNS_TOPIC_ARN`)
- `main()` allows `python idealista_web_scraper.py --output-dir data/s3/` local execution
- All functions < 50 lines; full docstrings + type hints
- `DOM_SELECTORS` dict defined at module top (easy maintenance when selectors change)

### Step 2.2: Scraper Requirements (`src/etl/data_collection/scraper_requirements.txt`)

```
cloudscraper>=1.2.71
beautifulsoup4>=4.12.0
lxml>=5.1.0
requests>=2.31.0
boto3>=1.34.0
```

*Packaged separately from `requirements.txt` to allow independent Lambda Layer management.*

### Step 2.3: Tests (`src/etl/data_collection/tests/test_web_scraper.py`)

Test classes following existing `test_idealista_collector.py` patterns:

| Class | Tests |
|---|---|
| `TestScraperConfig` | `build_url` for rent/sale/pagination |
| `TestParsedListing` | `to_dict()` field names, null defaults |
| `TestScraperSession` | Retry logic (mock HTTP 429/503), rate limit delay |
| `TestSearchResultsParser` | Parse realistic HTML fixture → correct listing fields |
| `TestScrapeOperation` | Full mock scrape: 2 pages, correct pagination stop |
| `TestUploadToS3` | S3 put_object called with correct key/body |
| `TestLambdaHandler` | Missing env vars, successful run, SNS on error |

**HTML fixture file:** `src/etl/data_collection/tests/fixtures/search_results_rent.html`
Captured from a real Idealista search result page (static snapshot). At minimum 3 listing cards. Required so parser tests don't rely on live HTTP requests.

### Step 2.4: Terraform Infrastructure (`infrastructure/modules/scraper_lambda/`)

New reusable module. Accepts the same variables as the existing `lambda` module but with scraper-specific defaults:

```hcl
# infrastructure/modules/scraper_lambda/main.tf
resource "aws_lambda_function" "scraper" {
  function_name = "${var.environment}-idealista-scraper"
  handler       = "idealista_web_scraper.lambda_handler"
  runtime       = "python3.12"
  timeout       = 900
  memory_size   = 256  # same as collector; scraper is memory-light
  ...
}

resource "aws_cloudwatch_event_rule" "scraper_schedule" {
  schedule_expression = "cron(0 13 ? * SUN *)"  # 1h after collector
}
```

IAM permissions needed (subset of existing `lambda` module):
- `s3:PutObject` on the listings bucket
- `sns:Publish` on the notifications topic
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

*No Secrets Manager permissions needed — scraper requires no API credentials.*

### Step 2.5: Environment Wiring

```hcl
# infrastructure/environments/dev/main.tf  (add module block)
module "idealista_scraper" {
  source       = "../../modules/scraper_lambda"
  environment  = "dev"
  s3_bucket    = module.listings_bucket.bucket_name
  sns_topic_arn = module.idealista_notifications.topic_arn
}
```

Mirror for `infrastructure/environments/prod/main.tf`.

### Step 2.6: Lambda Layer

`cloudscraper` + `beautifulsoup4` + `lxml` are too large for inline packaging. Package as a Lambda Layer:

```
src/etl/lambda_layers/scraper/
  python/
    cloudscraper/
    bs4/
    lxml/
    ...
```

Build script: `pip install -r scraper_requirements.txt -t python/ --platform manylinux2014_x86_64 --only-binary=:all:`

---

## Files to Modify / Create

| File | Action | Purpose |
|---|---|---|
| `src/notebooks/idealista_web_scraper.ipynb` | **CREATE** | Phase 1 interactive notebook |
| `src/etl/data_collection/idealista_web_scraper.py` | **CREATE** | Phase 2 Lambda module |
| `src/etl/data_collection/scraper_requirements.txt` | **CREATE** | Runtime deps for Lambda packaging |
| `src/etl/data_collection/tests/test_web_scraper.py` | **CREATE** | Unit + integration tests |
| `src/etl/data_collection/tests/fixtures/search_results_rent.html` | **CREATE** | Real HTML fixture for parser tests |
| `src/etl/requirements-dev.txt` | **MODIFY** | Add cloudscraper, bs4, lxml for local dev |
| `infrastructure/modules/scraper_lambda/main.tf` | **CREATE** | Lambda + IAM + EventBridge Terraform |
| `infrastructure/modules/scraper_lambda/variables.tf` | **CREATE** | Module input variables |
| `infrastructure/modules/scraper_lambda/outputs.tf` | **CREATE** | Module outputs |
| `infrastructure/environments/dev/main.tf` | **MODIFY** | Instantiate scraper_lambda module |
| `infrastructure/environments/prod/main.tf` | **MODIFY** | Instantiate scraper_lambda module |
| `documentation/DATA_COLLECTION_LAYER.md` | **MODIFY** | Add scraper section |

**Forbidden / out of scope:**
- Do NOT modify `idealista_listings_collector.py` or its tests
- Do NOT modify existing Lambda Terraform module (`infrastructure/modules/lambda/`)
- Do NOT modify CI/CD workflows (deploy pipeline is a separate future task)

---

## Testing Requirements

- [ ] `TestSearchResultsParser` passes with real HTML fixture (not mock HTML)
- [ ] `TestScrapeOperation` confirms pagination stops correctly at last page
- [ ] `TestLambdaHandler` confirms SNS notification sent on exception
- [ ] Notebook runs end-to-end locally without errors (manual smoke test)
- [ ] Scraped listing count ≥ 50 for both `rent` and `sale` (validates pagination)
- [ ] JSON output schema matches existing API JSON (validated with `jsonschema` or manual comparison)
- [ ] `pytest --cov=src/etl/data_collection/idealista_web_scraper tests/` coverage ≥ 80%

---

## Success Criteria

- [ ] Notebook can be run locally with `pip install cloudscraper beautifulsoup4 lxml` and produces valid JSON output
- [ ] Module can be executed with `python idealista_web_scraper.py --output-dir data/s3/`
- [ ] Lambda handler passes all unit tests with mocked AWS/HTTP
- [ ] Terraform `validate` passes for both `dev` and `prod` environments
- [ ] Output JSON files contain `elementList` array matching field names used by `valenciaRealEstatePriceAnalysis.ipynb`
- [ ] All code: full type hints, docstrings, ruff + black + mypy pass

---

## Technical Notes

### Idealista Bot Detection
Idealista uses Cloudflare and aggressive fingerprinting. `cloudscraper` handles the Cloudflare JS challenge. Additional mitigations:
- Use `cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False})` for realistic UA
- Add `Referer` and `Accept-Language` headers
- Random delay between page requests: `time.sleep(random.uniform(2.0, 4.5))`
- Never run scraper in a tight loop without delays; Lambda timeout is 900 s so there is headroom

### DOM Selectors Strategy
Wrap all CSS selectors in a `DOM_SELECTORS` dict at the top of the module. When Idealista updates their markup (happens 2–3 times/year), only this dict needs updating:

```python
DOM_SELECTORS: Dict[str, str] = {
    "listing_cards":  "article.item",
    "link":           "a.item-link",
    "price":          "span.item-price",
    "size":           "span.item-detail-char",
    "address":        "span.item-address",
    "neighborhood":   "span.item-address-name",
    "thumbnail":      "img.item-multimedia",
}
```

### JSON Output Envelope
Match the existing S3 file structure from the API collector:

```json
{
  "operation": "rent",
  "source": "web_scraper",
  "collected_at": "2026-03-29T13:00:00Z",
  "page": 1,
  "totalPages": 5,
  "itemsPerPage": 30,
  "elementList": [
    {
      "propertyCode": "12345678",
      "price": 1200.0,
      "size": 115.0,
      "rooms": 3,
      "floor": "2",
      "address": "Calle de Colón",
      "neighborhood": "El Mercat",
      "url": "https://www.idealista.com/inmueble/12345678/",
      "thumbnail": "https://img3.idealista.com/...",
      "operation": "rent",
      "priceByArea": 10.0,
      "hasLift": true,
      "latitude": null,
      "longitude": null,
      "district": null,
      "bathrooms": null,
      "description": null
    }
  ]
}
```

### Lambda Layer Build
`lxml` contains compiled C extensions and must be built for Amazon Linux 2. Build command:
```bash
pip install -r scraper_requirements.txt \
  -t src/etl/lambda_layers/scraper/python/ \
  --platform manylinux2014_x86_64 \
  --python-version 3.12 \
  --only-binary=:all:
```

### Phase Sequencing (Critical Path)
```
1.1 Install deps + verify cloudscraper works (30 min)
  └─▶ 1.2 Build notebook iteratively — validate selectors live (1–2 days)
        └─▶ 1.3 Capture HTML fixtures (1 h)
              └─▶ 2.1 Extract notebook → Python module (half day)
                    ├─▶ 2.2 Write tests using fixtures (half day)
                    └─▶ 2.3 Terraform + Lambda Layer (half day)
                              └─▶ 2.4 Deploy to dev + smoke test (1 h)
                                    └─▶ 2.5 Deploy to prod (30 min)
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Idealista blocks `cloudscraper` | Medium | High | Add proxy rotation (future TASK-003) |
| DOM selectors change between plan and implementation | High | Medium | Capture fixture HTML immediately; use `DOM_SELECTORS` dict |
| `lxml` Lambda Layer build fails on macOS | Medium | Low | Use Docker / `--platform manylinux2014_x86_64` flag |
| Scraper runs while Idealista is under maintenance | Low | Low | SNS alert on HTTP 5xx; retry next week |
| Scraped data drifts from API schema | Medium | Medium | Automated schema comparison test in notebook Cell 13 |

---

## Questions / Open Items

- Should the scraper Lambda share the existing SNS topic (`idealista_notifications`) or get its own? **Recommendation: share** — reduces infra cost and alert consolidation is easier.
- Should Phase 2 deploy to `dev` only first, or both environments simultaneously? **Recommendation: `dev` first**, promote to `prod` after two successful weekly runs.
- Is a separate `deploy-scraper-lambda.yml` CI workflow needed, or can it be folded into the existing `deploy-lambda.yml`? *Defer to implementation phase.*

---

## Planning Summary (For Quick Reference)

**One-line objective:**
Build a web scraper for Idealista search-result pages: Jupyter notebook for local dev, Lambda for weekly AWS production.

**Critical decisions:**
- HTTP library: `cloudscraper` (Cloudflare bypass, no paid proxies)
- Parser: BeautifulSoup4 + lxml (fast, lenient)
- Output: JSON envelope matching existing API schema (`elementList` array)
- Lambda schedule: `cron(0 13 ? * SUN *)` — 1 h after API collector
- Local execution: `--output-dir` CLI flag (no AWS credentials required for Phase 1)

**Subtasks at a glance:**

| Subtask | Priority | Est. | Dependencies |
|---------|----------|------|--------------|
| 1.1 Install deps, validate cloudscraper | P0 | 0.5 h | None |
| 1.2 Build notebook (ScraperConfig, Session, Parser, pagination, local save) | P0 | 1–2 d | 1.1 |
| 1.3 Capture HTML fixtures, smoke test | P0 | 1 h | 1.2 |
| 2.1 Extract notebook → Python module | P0 | 4 h | 1.3 |
| 2.2 Write unit + integration tests | P0 | 4 h | 2.1 |
| 2.3 Terraform scraper_lambda module | P1 | 3 h | None |
| 2.4 Lambda Layer build + dev deploy | P1 | 2 h | 2.1, 2.3 |
| 2.5 Prod deploy + monitoring | P1 | 1 h | 2.4 |

**Key files to create:**
- [src/notebooks/idealista_web_scraper.ipynb](src/notebooks/idealista_web_scraper.ipynb) — Phase 1 notebook
- [src/etl/data_collection/idealista_web_scraper.py](src/etl/data_collection/idealista_web_scraper.py) — Phase 2 Lambda module
- [src/etl/data_collection/tests/test_web_scraper.py](src/etl/data_collection/tests/test_web_scraper.py) — unit tests
- [src/etl/data_collection/tests/fixtures/search_results_rent.html](src/etl/data_collection/tests/fixtures/search_results_rent.html) — HTML fixture

**Key files to modify:**
- [src/etl/requirements-dev.txt](src/etl/requirements-dev.txt) — add cloudscraper, bs4, lxml
- [infrastructure/environments/dev/main.tf](infrastructure/environments/dev/main.tf) — add scraper module
- [infrastructure/environments/prod/main.tf](infrastructure/environments/prod/main.tf) — add scraper module

**Watch-outs for reviewer:**
- `lxml` must be built for Amazon Linux 2 (not native macOS) for the Lambda Layer
- Test HTML fixtures must come from a real Idealista page, not hand-crafted HTML
- `ParsedListing.to_dict()` key names must match the camelCase used in `valenciaRealEstatePriceAnalysis.ipynb`
- Phase 2 infrastructure should NOT be deployed until Phase 1 notebook runs cleanly for at least one full week

**Blockers / open questions:**
- None — enough context to start Phase 1 immediately
