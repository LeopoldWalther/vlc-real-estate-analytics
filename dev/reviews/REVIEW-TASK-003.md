# REVIEW — TASK-003: Silver Cleaning Lambda (Bronze → Silver Parquet)

**Reviewer:** reviewer_agent
**Reviewed plan:** [dev/plans/TASK-003-silver-cleaning-lambda.md](../plans/TASK-003-silver-cleaning-lambda.md)
**Date:** 2026-06-04
**Verdict:** ⚠️ **Changes Recommended** — gutes Fundament, aber drei Datenmodell-/Trigger-Fehler und eine Lücke bei „früh mit echten S3-Daten testen" müssen vor der Umsetzung behoben werden.

---

## Executive Summary

Der Plan ist architektonisch grundsätzlich richtig (kostenoptimal: Lambda + S3, kein Glue/Athena/Step Functions). Die Prüfung gegen die **echten** Bronze-Daten in `data/s3/` hat jedoch mehrere konkrete Probleme aufgedeckt, die sonst erst zur Laufzeit (oder schlimmer: still als Datenverlust) auffallen würden:

1. **`dateDownload` existiert nicht in den Rohdaten** → muss aus dem Object-Key abgeleitet werden.
2. **Per-File-S3-Trigger ist die falsche Granularität** → eine Woche = viele paginierte Dateien; pro-Datei-Aggregation ist partiell und falsch.
3. **Partition `operation/year/month` mit fixem `part.parquet` überschreibt wöchentliche Snapshots im selben Monat** → stiller Datenverlust.
4. **Frühes Testen mit echten S3-Daten ist NICHT eingeplant** (nur moto + In-Memory). Genau das war die explizite Frage — Antwort unten.

---

## Schema-Realität (verifiziert an echten Dateien)

Aus `data/s3/rent_20230409_120044_1.json` (echte Felder pro Element):

| Feld | Vorhanden? | Hinweis |
|------|-----------|---------|
| `priceByArea` | ✅ ja (z. B. 16.0, 10.0, 12.0) | Kann direkt verwendet werden — **kein** `price/size` nötig |
| `neighborhood` | ✅ ja (z. B. „El Pilar", „Sant Francesc") | Aggregationsschlüssel |
| `operation` | ✅ ja („rent"/„sale") | Auch im Dateinamen-Präfix |
| `price`, `size` | ✅ ja | Fallback für `priceByArea` falls null |
| `district`, `propertyType`, `status` | ✅ ja | Optional für spätere Filter |
| **`dateDownload`** | ❌ **nein** | **Nur** im Object-Key: `{op}_{YYYYMMDD}_{HHMMSS}_{page}.json` |

**Datei-Layout real:** `rent_20230409_120044_1.json` … `_6.json`, `sale_..._1.json` … `_17.json`.
→ Pro Operation und Woche **mehrere Seiten** (rent ~6, sale ~14–17). Das Datum + die Uhrzeit identifizieren den Snapshot.

---

## Strengths

- ✅ Richtige Kostenentscheidung (kein Glue/Athena/Step Functions bei kleinem Volumen).
- ✅ Trennung „pure transform" vs. „AWS-Handler" ist sauber und testbar.
- ✅ Parquet + vor-aggregiertes `latest.json` als Frontend-Quelle ist ein gutes, günstiges Muster.
- ✅ TDD-Sektion und Datei-Boundaries vorhanden.
- ✅ AWS-managed Pandas-Layer statt eigenem pyarrow-Build ist die richtige Wahl.

---

## Concerns

### 🔴 CRITICAL

**C1 — `dateDownload` muss aus dem Object-Key geparst werden**
Der CSV-Prototyp (`wrangle_data.py`, inzwischen aus dem Repo entfernt) groupt nach `neighborhood + dateDownload`. In den Rohdaten gibt es `dateDownload` aber nicht.
→ **Fix:** Helper `parse_key_metadata(key) -> (operation, snapshot_date, page)` aus dem Dateinamen. `snapshot_date` als Spalte in den DataFrame injizieren, bevor aggregiert wird. Dies ist die **erste** zu testende Funktion (RED).

**C2 — Per-File-`ObjectCreated`-Trigger ist die falsche Granularität**
Eine Woche besteht aus 6–17 paginierten Dateien pro Operation. Ein Trigger pro Objekt führt zu:
- 20+ Lambda-Invocations pro Woche statt 1,
- Aggregation über **eine einzelne Seite** → unvollständige Wochenwerte,
- `latest.json` (Zeitreihe über **alle** Wochen) lässt sich aus einer einzelnen neuen Datei gar nicht korrekt bauen.

→ **Fix (empfohlen):** Trigger **entkoppeln** vom Einzelobjekt. Optionen:
1. **Scheduled EventBridge** kurz nach dem Collector (z. B. So 12:30 UTC): liest den/die Snapshot-Dateien einer Woche gebündelt, schreibt Silver-Parquet für die Woche, und rebuildet `latest.json` aus der **gesamten** Silver-Historie. *(Einfachste, robusteste Variante.)*
2. Collector sendet am Ende ein „snapshot complete"-Event (SNS/EventBridge) → Silver-Lambda. Mehr Kopplung, mehr Code.

**C3 — Partition `operation/year/month` + fixes `part.parquet` = Datenverlust**
Mehrere Wochen-Snapshots fallen in denselben Monat. `…/operation=sale/year=2023/month=04/part.parquet` würde den ersten Snapshot durch den nächsten **überschreiben**.
→ **Fix:** Snapshot-Datum in den Schlüssel aufnehmen, z. B. `…/operation=sale/snapshot_date=2023-04-09/part.parquet` **oder** `date_download` als Spalte führen und nach `operation` + `snapshot_date` partitionieren. „Idempotent = deterministischer Pfad" gilt nur, wenn der Pfad das **vollständige Datum** enthält, nicht nur Monat.

### 🟡 SIGNIFICANT

**S1 — Frühes Testen mit echten S3-Daten fehlt (= die eigentliche Frage)**
Der Plan testet nur mit moto (gemockt) + In-Memory-DataFrames. Es gibt aber **>1000 echte Bronze-JSONs** in `data/s3/`. Diese sollten **früh** genutzt werden:
- **Schema-Contract-Test in Phase 1 (RED):** ein kuratiertes, eingechecktes Sample (3–5 echte, ggf. gekürzte Dateien) unter `src/etl/data_processing/tests/fixtures/bronze/` (Achtung: `data/s3/` ist gitignored → bewusst kopierte, kleine Fixtures committen). Test prüft: `priceByArea`, `neighborhood`, `operation` vorhanden; `elementList` nicht leer; Transform liefert nicht-leere Aggregation.
- **Exploratives Skript/Notebook** (analog TASK-002-Pattern): lädt echte `data/s3`-Dateien lokal, validiert Verteilungen/Edge-Cases (null `priceByArea`, fehlende `neighborhood`) **bevor** Infra gebaut wird.
- **Optionaler Real-Bucket-Smoke-Test:** hinter `RUN_S3_IT=1` + AWS-Creds gegated, liest 1–2 echte Objekte aus dem **dev**-Bucket → end-to-end Validierung früh statt erst beim manuellen Deploy.

→ **Fix:** Diese drei Punkte als Phase-1-Aufgaben (vor Handler/Infra) einplanen. Siehe Restructured Plan unten.

**S2 — CSV-Pfad streichen**
Plan/`requirements.txt` erwähnen „JSON oder CSV". Bronze ist **ausschließlich JSON**. Der CSV-Zweig war nur Input des alten Prototyps. → CSV-Lesepfad entfernen (weniger Code, weniger Fehlerfläche).

**S3 — Aggregationsquelle für `latest.json` explizit machen**
`latest.json` braucht **alle** Wochen. Klar spezifizieren: Lambda liest Silver-Historie (alle Parquet) und baut die Zeitreihe neu — nicht aus dem einzelnen Input. Schema-Version (`schema_version`) ins JSON aufnehmen (Forward-Compat mit TASK-004).

### 🟢 MINOR

- **M1 — Memory inkonsistent:** Success Criteria „<256 MB", Technical Notes „512 MB". Auf einen Wert festlegen (empfohlen 512 MB wegen pandas/pyarrow Cold Start).
- **M2 — null/leere Felder:** Manche Elemente könnten `priceByArea: null` oder fehlendes `neighborhood` haben → Drop/Filter explizit testen (Edge-Case).
- **M3 — Managed-Layer-ARN:** Region-spezifischen ARN für `AWSSDKPandas-Python312` in TF als Variable führen, nicht hardcoden.

---

## Direkte Antwort auf die Nutzerfrage

> „Ist auch bedacht, dass frühzeitig mit den echten Daten aus S3 getestet wird?"

**Nein, im aktuellen Plan nicht ausreichend.** Der Plan nutzt nur moto + In-Memory-Daten und schiebt echtes Testen in „Manual / Phase 4". Empfehlung (siehe S1): echtes Testen **nach vorne ziehen** in Phase 1 über (a) eingecheckte echte Fixtures, (b) ein exploratives Notebook/Skript auf `data/s3/`, (c) optionalen, gegateten Real-Bucket-Smoke-Test gegen **dev**. Damit werden Schema-Annahmen (C1) und Trigger-/Partitionierungsfehler (C2/C3) früh statt spät sichtbar.

---

## Risk Matrix

| Risiko | Impact | Likelihood | Priorität |
|--------|--------|-----------|-----------|
| C1 `dateDownload` fehlt → falsche/kaputte Aggregation | Hoch | Sicher | P0 |
| C3 Monats-Partition überschreibt Snapshots → Datenverlust | Hoch | Hoch | P0 |
| C2 Per-File-Trigger → partielle Aggregation, Mehrfachläufe | Hoch | Hoch | P0 |
| S1 Schema-Drift unentdeckt (kein Real-Daten-Test früh) | Mittel | Mittel | P1 |
| S3 `latest.json` nur aus Einzeldatei → unvollständige Zeitreihe | Hoch | Mittel | P1 |
| M2 null `priceByArea`/`neighborhood` | Niedrig | Mittel | P2 |

---

## Empfohlene Plan-Restrukturierung (Phasen)

| Phase | Inhalt | Warum zuerst |
|-------|--------|--------------|
| **1. Schema-Contract + echte Fixtures** | `parse_key_metadata`, Real-Fixtures committen, Schema-Test (RED), exploratives Skript auf `data/s3/` | Validiert C1 + S1 **vor** allem anderen |
| **2. Pure Transform** | clean/aggregate (`neighborhood`+`snapshot_date`→`priceByArea` mean/count), `build_aggregation_json` mit `schema_version` | Kernlogik, voll unit-getestet |
| **3. Lambda-Handler** | S3 lesen (nur JSON), Snapshot bündeln, Parquet nach `operation/snapshot_date`, `latest.json` aus Silver-Historie | C2 + C3 fix |
| **4. Terraform** | **Scheduled** EventBridge (nicht per-File), IAM prefix-scoped, Log-Group, SNS | Trigger-Entscheidung umgesetzt |
| **5. Tests/Docs** | moto-IT, optionaler Real-Bucket-Smoke-Test (`RUN_S3_IT`), Doku | Absicherung |

---

## Coder Implementation Notes

**Critical findings (vor Implementierung zwingend beachten):**
- `dateDownload` gibt es nicht — **aus dem Object-Key** parsen (`{op}_{YYYYMMDD}_{HHMMSS}_{page}.json`).
- **Nicht** per-File triggern — **Scheduled EventBridge** nach dem Collector; Snapshot (alle Seiten einer Woche) gebündelt verarbeiten.
- Partition muss das **volle Datum** enthalten (`snapshot_date=YYYY-MM-DD`), sonst Überschreiben/Datenverlust.

**Watch-outs:**
- `priceByArea` kann `null` sein, `neighborhood` kann fehlen → vor `groupby` droppen (mit Test).
- `latest.json` aus **gesamter** Silver-Historie bauen, nicht aus dem neuen Input.
- `data/s3/` ist gitignored — Fixtures bewusst als kleine Kopien unter `tests/fixtures/bronze/` committen.

**Quick decisions (vorab entschieden):**
- Ein Bucket, getrennte Prefixes `bronze/` + `silver/` (kein zweiter Bucket).
- Nur JSON lesen (CSV-Pfad streichen).
- Memory 512 MB.
- `priceByArea` direkt nutzen; nur falls `null` → `price/size` als Fallback.

**File modification priority:**
1. `silver_transform.py` (+ `parse_key_metadata`) — Kern, zuerst testbar.
2. `tests/fixtures/bronze/*.json` + `test_silver_transform.py` — echte Daten früh.
3. `silver_cleaning_lambda.py` — nutzt 1.
4. `infrastructure/modules/lambda_silver/*.tf` — Scheduled Trigger.
5. `environments/{dev,prod}/main.tf` — Wiring.

**Testing shortcuts:**
- `pytest src/etl/data_processing/tests/test_silver_transform.py -v`
- Edge-Cases die MÜSSEN getestet werden: leere `elementList`, `priceByArea=null`, fehlendes `neighborhood`, mehrere Seiten desselben Snapshots → eine Aggregationszeile pro (`neighborhood`,`snapshot_date`).
- Optionaler Real-IT: `RUN_S3_IT=1 pytest -k real_bucket` (nur mit dev-Creds).

---

## Approval Criteria (vor Implementierung zu erfüllen)

- [ ] C1: `parse_key_metadata` + `snapshot_date`-Spalte spezifiziert und als RED-Test.
- [ ] C2: Trigger auf **Scheduled EventBridge** geändert (kein per-Object).
- [ ] C3: Partition enthält `snapshot_date` (volles Datum).
- [ ] S1: Phase-1-Aufgaben mit echten Fixtures + explorativem Skript + optionalem Real-Bucket-Test ergänzt.
- [ ] S2: CSV-Pfad entfernt.
- [ ] S3: `latest.json` baut aus Silver-Historie; `schema_version` enthalten.

Nach Einarbeitung erstelle ich den technischen Plan `dev/plans/technical/TASK-003-technical-plan.yaml`.

---

# Re-Review — 2026-06-05 (Medallion Split: Silver = cleaned individual listings)

**Reviewer:** reviewer_agent
**Anlass:** Plan-Überarbeitung nach Entdeckung des echten zweistufigen Notebook-Workflows in [src/notebooks/valenciaRealEstatePriceAnalysis.ipynb](../../src/notebooks/valenciaRealEstatePriceAnalysis.ipynb).
**Verdict:** ✅ **Approved (mit Watch-outs)** — der Re-Scope ist korrekt an der Quelle ausgerichtet; das technische YAML ist bereits konsistent re-scoped. Vor der Umsetzung von 3.2 müssen zwei Prozess-/Aufräumpunkte beachtet werden (siehe unten).

## Was sich geändert hat

Der ursprüngliche Plan (Review oben, 2026-06-04) hat Silver fälschlich als **Aggregations-Layer** modelliert (`clean()` aggregiert nach `neighborhood`, plus `build_aggregation_json` + `latest.json`). Die echte Quelle ist zweistufig:

- **Notebook §1.3 + §3** erzeugen eine Tabelle **bereinigter EINZEL-Listings** (eine Zeile pro Listing).
- Erst **§6 / wrangle_data.py** aggregieren für die Visualisierung.

→ Korrekter Medallion-Split: **TASK-003 = Silver (cleaned listings)**, **TASK-004 = Gold (Aggregation + Scope)**, **TASK-005 = Web App**.

## Verifikation gegen die echte Notebook-Quelle

Die vier Cleaning-Schritte im Notebook wurden direkt geprüft:

| Notebook-Schritt | Code (Zeile) | Silver (TASK-003)? | Gold (TASK-004)? |
|---|---|---|---|
| Issue 1: Spaltenreduktion | `df_reduced = df_all_pages[[...]]` (1828) | ✅ ja | — |
| Issue 2: `bathrooms > 0.0` | `df_clean = df_reduced[df_reduced.bathrooms > 0.0]` (1908) | ✅ ja | — |
| Issue 3: District-Scope | `df_clean[df_clean['district'].isin(["Extramurs","Ciutat Vella","L'Eixample"])]` (1957) | ❌ **nein** | ✅ ja |
| Issue 4: sale `1000 < priceByArea < 10000` | `(df.operation=='sale') & (df.priceByArea < 10000.0) & (df.priceByArea > 1000.0)` (1996) | ✅ ja | — |

**Befund:** Die Plan-Zuordnung (Silver = Issues 1/2/4 + null-Drop; Gold = Issue 3 + Aggregation) entspricht **exakt** der Notebook-Logik. Die Plan-Spaltenliste behält `district` bei → Gold kann später nach `district` filtern. ✅ Korrekt.

## Konsistenzprüfung der Artefakte

- ✅ [TASK-003-technical-plan.yaml](../plans/technical/TASK-003-technical-plan.yaml): 3.2 ist auf `status: planned` zurückgesetzt, Titel/Beschreibung/`commit_message`/Acceptance-Criteria auf cleaned-listings re-scoped; 3.3 schreibt cleaned-listings-Parquet, kein `latest.json`. 3.4/3.5 unverändert korrekt.
- ✅ Workflow-Validator (`python dev/tools/validate_agent_workflow.py`): **passed** (nach Reparatur des Status-Headers, der ein U+FFFD-Replacement-Char statt 🟡 enthielt).
- ✅ README-Tabelle + Mermaid: T002→T003→T004→T005, Status konsistent.

## Concerns (Re-Scope)

### 🟡 SIGNIFICANT

**RS1 — Branch-Wiederverwendung mit veralteten Commits**
Subtask 3.2 nutzt im YAML denselben Branch `feature/silver-cleaning-lambda/3.2-pure-transform`, der bereits den **alten** (aggregierenden) Code mit `clean()`/`build_aggregation_json` enthält (gepusht, nicht gemerged). Re-Scope auf denselben Branch-Namen führt zu vermischter Historie.
→ **Empfehlung:** Entweder den Branch hart zurücksetzen (`git reset --hard main` vor Neuimplementierung) **oder** neuen Suffix verwenden (z. B. `3.2-cleaned-listings`). YAML entsprechend anpassen, falls neuer Branch.

**RS2 — Veralteten Code + Tests aktiv entfernen (nicht nur überschreiben)**
[silver_transform.py](../../src/etl/data_processing/silver_transform.py) enthält aktuell den aggregierenden `clean()` **und** `build_aggregation_json` + `SCHEMA_VERSION`; [test_silver_transform.py](../../src/etl/data_processing/tests/test_silver_transform.py) testet beide (`TestBuildAggregationJson`, `test_clean_..._aggregates_price_by_area`, `test_clean_collapses_multiple_pages_to_one_row`). Diese müssen **gelöscht/ersetzt** werden, sonst schlägt die Suite fehl oder die obsolete Aggregation bleibt im Silver-Modul.
→ `build_aggregation_json` + `SCHEMA_VERSION` wandern nach `gold_aggregate.py` (TASK-004). `parse_key_metadata` **bleibt** unverändert (3.1, gemerged).

### 🟢 MINOR

- **RM1 — Fehlende Spalten robust behandeln:** Beim Rückgeben von Einzel-Listings können Felder wie `parkingSpace`, `hasLift`, `floor`, `status` in einzelnen Elementen fehlen → konsistent auf `None` setzen, damit das spätere Parquet-Schema stabil ist. Edge-Case-Test ergänzen.
- **RM2 — `operation` Quelle vereinheitlichen:** Im Handler kommt `operation` aus dem Key (zuverlässig), im Element existiert es ebenfalls. Für Silver konsistent die key-abgeleitete `operation` verwenden (deckt sich mit Partitionierung).
- **RM3 — `clean()` bleibt pandas-frei (stdlib, Liste von Dicts):** 3.2 erlaubt nur `silver_transform.py` + Test; pandas/pyarrow erst im Handler (3.3). Beibehalten — hält 3.2 schnell und isoliert testbar.

## Coder Implementation Notes (Re-Scope)

**Critical findings (zwingend):**
- 3.2 = `clean()` gibt **eine Zeile pro Listing** zurück (KEINE Aggregation, KEIN `build_aggregation_json`, KEIN District-Filter).
- `build_aggregation_json` + `SCHEMA_VERSION` aus `silver_transform.py` **entfernen** → gehören zu Gold (TASK-004).
- Vor 3.2: Branch-Lage klären (RS1) — alten 3.2-Branch resetten oder neu benennen.

**Watch-outs:**
- Bestehende Tests `TestBuildAggregationJson` + die aggregierenden `clean`-Tests **löschen/ersetzen** (RS2).
- Fehlende optionale Spalten → `None`, damit Parquet-Schema (3.3) stabil bleibt (RM1).
- `parse_key_metadata` NICHT anfassen (3.1 ist gemerged).

**Quick decisions (vorab):**
- Silver-Spaltenliste = Notebook Issue 1 minus `dateDownload`, plus `snapshot_date` (key-abgeleitet).
- `clean()` Signatur bleibt `clean(elements, snapshot_date, operation)` → liefert `List[Dict]` Einzel-Listings.
- Validity-Filter: `bathrooms > 0`; sale `1000 < priceByArea < 10000`; rent ungefiltert; drop null `priceByArea`/leeres `neighborhood`.
- District-Scope + alle Aggregation → ausschließlich Gold (TASK-004).

**Testing shortcuts:**
- `pytest src/etl/data_processing/tests/test_silver_transform.py -v`
- Pflicht-Edge-Cases: leere `elementList`; `bathrooms<=0` drop; sale `priceByArea` 500/15000 drop, 5000 keep; rent `priceByArea` 12 keep; null `priceByArea`/fehlendes `neighborhood` drop; mehrere Seiten → Zeilenzahl = Summe gültiger Listings (keine Kollabierung).

## Approval Criteria (Re-Scope)

- [x] Silver-Scope = cleaned individual listings (Issues 1/2/4 + null-Drop), kein District-Scope, keine Aggregation — im Plan + YAML.
- [x] Gold-Aggregation + `latest.json` aus Silver verschoben (TASK-004).
- [x] Technisches YAML 3.2 auf `planned` zurückgesetzt und re-scoped.
- [x] Workflow-Validator grün.
- [x] **RS1:** Branch in `feature/silver-cleaning-lambda/3.2-cleaned-listings` umbenannt und Pointer auf `main` zurückgesetzt (saubere Basis, keine vermischte Historie); YAML-Branch-Feld aktualisiert.
- [x] **RS2:** Obsoleter Aggregations-Code (`clean`/`build_aggregation_json`/`SCHEMA_VERSION`) + Tests (`TestClean`/`TestBuildAggregationJson`) entfernt — `silver_transform.py` + `test_silver_transform.py` auf `main`-Stand (nur `parse_key_metadata` + Schema-Contract).

**Fazit:** Plan und technisches YAML sind freigegeben; RS1/RS2 sind umgesetzt. `silver_transform.py` ist eine saubere Basis für die Neuimplementierung von 3.2 (cleaned individual listings) durch `@coder`.
