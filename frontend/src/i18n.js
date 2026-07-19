/**
 * i18n.js — pure translation lookup for the dashboard's 5 supported locales.
 *
 * Design intent: mirrors dashboard_state.js/filters.js — no DOM, no fetch,
 * no `document`/`window` references. app.js walks the DOM for elements
 * carrying `data-i18n`/`data-i18n-attr` and calls `t()` for each; this
 * module only owns the translation data and lookup/interpolation logic.
 *
 * Keys are flat dot-free strings (e.g. 'kpi.medianRent') grouped by prefix
 * for readability; `charts.<rendererId>.title` / `.xaxis` / `.yaxis` cover
 * the Plotly chart titles/axis labels so translating a language also
 * translates every chart, not just the static page chrome.
 */

export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'ar', 'tr'];
export const DEFAULT_LOCALE = 'en';

const RTL_LOCALES = new Set(['ar']);

const en = {
  'app.title': 'Valencia Real Estate Analytics',
  'app.subtitle': 'Weekly market snapshot · Valencia city centre',
  'app.themeToggleLabel': 'Toggle dark mode',
  'app.languageToggleLabel': 'Change language',

  'error.message': "We couldn't load the latest market data. Please check your connection and try again.",
  'error.retryButton': 'Retry',

  'status.loading': 'Loading market data…',
  'status.ready': 'Market data loaded.',
  'status.error': 'Failed to load market data.',

  'kpi.medianRent': 'Median rent, last 3 months (€/m²/mo)',
  'kpi.medianSale': 'Median sale, last 3 months (€/m²)',
  'kpi.grossYield': 'Implied gross yield',
  'kpi.listingCount': 'Total listings',
  'kpi.lastUpdated': 'Last updated',

  'population.label': 'Population:',
  'population.all': 'All listings',
  'population.filteredFallback': 'Filtered apartments',
  'population.filteredPrefix': 'Flats',
  'population.sizeGte': '≥{value} m²',
  'population.lift': 'lift',
  'population.roomsGte': '≥{value} rooms',
  'population.bathroomsGte': '≥{value} baths',
  'population.floorNot': 'not floor {value}',

  'filters.districts': 'Districts',
  'filters.neighborhoods': 'Neighborhoods',
  'filters.clear': 'Clear filters',
  'filters.badgeAll': 'All',
  'filters.selectUpToDistricts': 'Select up to 3 districts',
  'filters.selectUpToNeighborhoods': 'Select up to 3 neighborhoods',
  'filters.noDataAvailable': 'No data available',

  'footer.dataUpdated': 'Data last updated: —',
  'footer.sourceLink': 'Source on GitHub',

  'charts.price-time-series-rent.title': 'Rent price per m² per month over time by neighbourhood',
  'charts.price-time-series-rent.yaxis': 'Price per m² per month (€)',
  'charts.price-time-series-sale.title': 'Sale price per m² over time by neighbourhood',
  'charts.price-time-series-sale.yaxis': 'Sale price per m² (€)',
  'charts.price-time-series-district-rent.title': 'Rent price per m² per month over time by district',
  'charts.price-time-series-district-rent.yaxis': 'Price per m² per month (€)',
  'charts.price-time-series-district-sale.title': 'Sale price per m² over time by district',
  'charts.price-time-series-district-sale.yaxis': 'Sale price per m² (€)',
  'charts.rent-vs-sale-ratio.title': 'Rent vs Sale price per m² by neighbourhood',
  'charts.rent-vs-sale-ratio.xaxis': 'Rent price per m² per month (€)',
  'charts.rent-vs-sale-ratio.yaxis': 'Sale price per m² (€)',
  'charts.rent-vs-sale-ratio-time-series.title': 'Sale/Rent price ratio over time by neighbourhood',
  'charts.rent-vs-sale-ratio-time-series.yaxis': 'Sale/Rent ratio',
  'charts.boxplot-by-neighborhood-rent.title': 'Rent price per m² distribution by neighbourhood',
  'charts.boxplot-by-neighborhood-rent.yaxis': 'Rent price per m² per month (€)',
  'charts.boxplot-by-neighborhood-sale.title': 'Sale price per m² distribution by neighbourhood',
  'charts.boxplot-by-neighborhood-sale.yaxis': 'Sale price per m² (€)',
  'charts.xaxis.date': 'Date',

  'tabs.trendAnalysis': 'Trend Analysis',
  'tabs.dataBasis': 'Data Basis',

  'dataBasis.intro': 'How this data was collected: search parameters, weekly collection volume, and current listing distributions across the whole collection area.',
  'dataBasis.mapDescription': 'Exact locations of listings collected in the last 3 months, shown on a real street map and coloured by neighbourhood.',
  'dataBasis.searchConfig.heading': 'Search parameters',
  'dataBasis.searchConfig.radius': 'Search radius',
  'dataBasis.searchConfig.sizeRange': 'Size range',
  'dataBasis.searchConfig.propertyType': 'Property type',
  'dataBasis.searchConfig.elevator': 'Elevator required',
  'dataBasis.searchConfig.airConditioning': 'Air conditioning',
  'dataBasis.searchConfig.preservation': 'Preservation status',
  'dataBasis.searchConfig.center': 'Search centre (lat, lon)',
  'dataBasis.searchConfig.yes': 'Yes',
  'dataBasis.searchConfig.no': 'No',

  'charts.weekly-listing-volume.title': 'Weekly collected listing volume',
  'charts.weekly-listing-volume.yaxis': 'Listings collected',
  'charts.size-histogram.title': 'Listing size distribution (m²)',
  'charts.size-histogram.xaxis': 'Size bin (m²)',
  'charts.size-histogram.yaxis': 'Listings',
  'charts.rooms-distribution.title': 'Rooms distribution',
  'charts.rooms-distribution.xaxis': 'Rooms',
  'charts.rooms-distribution.yaxis': 'Listings',
  'charts.price-per-area-histogram-rent.title': 'Rent price per m² distribution',
  'charts.price-per-area-histogram-rent.xaxis': 'Rent price per m² per month (€)',
  'charts.price-per-area-histogram-rent.yaxis': 'Listings',
  'charts.price-per-area-histogram-sale.title': 'Sale price per m² distribution',
  'charts.price-per-area-histogram-sale.xaxis': 'Sale price per m² (€)',
  'charts.price-per-area-histogram-sale.yaxis': 'Listings',
  'charts.listing-locations-map.title': 'Collected listing locations',

  'tabs.pipelineHealth': 'Pipeline Health',
  'pipelineHealth.overallLabel': 'Overall status: {status}',
  'pipelineHealth.status.green': 'Green',
  'pipelineHealth.status.yellow': 'Yellow',
  'pipelineHealth.status.red': 'Red',
  'pipelineHealth.check.executionSuccess': 'Execution success',
  'pipelineHealth.check.executionDuration': 'Execution duration',
  'pipelineHealth.check.apiQuota': 'API quota',
  'pipelineHealth.check.awsCost': 'AWS cost',
  'pipelineHealth.notAvailable': 'Pipeline health data is not yet available.',

  // FEATURE-013: detail views — section titles, threshold captions, diagram
  // labels. Threshold captions mirror the exact backend rule constants
  // (health_checks.py) so the UI never drifts from the actual Ampel logic.
  'pipelineHealth.status.unknown': 'Unknown',
  'pipelineHealth.detail.executionSuccess.title': 'Execution success history',
  'pipelineHealth.detail.executionDuration.title': 'Execution duration history',
  'pipelineHealth.detail.apiQuota.title': 'API quota history',
  'pipelineHealth.detail.awsCost.title': 'AWS cost history',
  'pipelineHealth.threshold.executionSuccess': 'Red if the latest invocation failed; yellow if any of the last 5 invocations failed.',
  'pipelineHealth.threshold.executionDuration': 'Green under 60 seconds; yellow from 60 seconds; red from 120 seconds.',
  'pipelineHealth.threshold.apiQuota': 'Green under 80 requests/month; yellow from 80; red from 95 (quota: 100 requests/month).',
  'pipelineHealth.threshold.awsCost': 'Green under $2; yellow from $2; red from $5 month-to-date (excluding domain/registrar costs).',
  'pipelineHealth.diagram.title': 'Medallion pipeline',
  'pipelineHealth.diagram.bronze': 'Bronze (raw collection)',
  'pipelineHealth.diagram.silver': 'Silver (cleaned)',
  'pipelineHealth.diagram.gold': 'Gold (aggregated)',
  'pipelineHealth.diagram.observer': 'Pipeline Health (observer)',
  'pipelineHealth.diagram.source': 'Idealista API (data source)',
  'pipelineHealth.diagram.dashboard': 'Dashboard (data visualization)',
  'pipelineHealth.diagram.statusLabel': 'Status',
};

const de = {
  'app.title': 'Valencia Immobilienmarkt-Analyse',
  'app.subtitle': 'Wöchentliche Marktübersicht · Valencia Stadtzentrum',
  'app.themeToggleLabel': 'Dunkelmodus umschalten',
  'app.languageToggleLabel': 'Sprache ändern',

  'error.message': 'Die aktuellen Marktdaten konnten nicht geladen werden. Bitte überprüfe deine Verbindung und versuche es erneut.',
  'error.retryButton': 'Erneut versuchen',

  'status.loading': 'Marktdaten werden geladen…',
  'status.ready': 'Marktdaten geladen.',
  'status.error': 'Marktdaten konnten nicht geladen werden.',

  'kpi.medianRent': 'Median Miete, letzte 3 Monate (€/m²/Monat)',
  'kpi.medianSale': 'Median Kaufpreis, letzte 3 Monate (€/m²)',
  'kpi.grossYield': 'Implizite Bruttorendite',
  'kpi.listingCount': 'Anzahl Inserate',
  'kpi.lastUpdated': 'Zuletzt aktualisiert',

  'population.label': 'Auswahl:',
  'population.all': 'Alle Inserate',
  'population.filteredFallback': 'Gefilterte Wohnungen',
  'population.filteredPrefix': 'Wohnungen',
  'population.sizeGte': '≥{value} m²',
  'population.lift': 'Aufzug',
  'population.roomsGte': '≥{value} Zimmer',
  'population.bathroomsGte': '≥{value} Bäder',
  'population.floorNot': 'nicht Etage {value}',

  'filters.districts': 'Bezirke',
  'filters.neighborhoods': 'Stadtviertel',
  'filters.clear': 'Filter zurücksetzen',
  'filters.badgeAll': 'Alle',
  'filters.selectUpToDistricts': 'Bis zu 3 Bezirke auswählen',
  'filters.selectUpToNeighborhoods': 'Bis zu 3 Stadtviertel auswählen',
  'filters.noDataAvailable': 'Keine Daten verfügbar',

  'footer.dataUpdated': 'Daten zuletzt aktualisiert: —',
  'footer.sourceLink': 'Quellcode auf GitHub',

  'charts.price-time-series-rent.title': 'Mietpreis pro m² und Monat im Zeitverlauf nach Stadtviertel',
  'charts.price-time-series-rent.yaxis': 'Preis pro m² und Monat (€)',
  'charts.price-time-series-sale.title': 'Kaufpreis pro m² im Zeitverlauf nach Stadtviertel',
  'charts.price-time-series-sale.yaxis': 'Kaufpreis pro m² (€)',
  'charts.price-time-series-district-rent.title': 'Mietpreis pro m² und Monat im Zeitverlauf nach Bezirk',
  'charts.price-time-series-district-rent.yaxis': 'Preis pro m² und Monat (€)',
  'charts.price-time-series-district-sale.title': 'Kaufpreis pro m² im Zeitverlauf nach Bezirk',
  'charts.price-time-series-district-sale.yaxis': 'Kaufpreis pro m² (€)',
  'charts.rent-vs-sale-ratio.title': 'Miete vs. Kaufpreis pro m² nach Stadtviertel',
  'charts.rent-vs-sale-ratio.xaxis': 'Mietpreis pro m² und Monat (€)',
  'charts.rent-vs-sale-ratio.yaxis': 'Kaufpreis pro m² (€)',
  'charts.rent-vs-sale-ratio-time-series.title': 'Verhältnis Kauf-/Mietpreis im Zeitverlauf nach Stadtviertel',
  'charts.rent-vs-sale-ratio-time-series.yaxis': 'Kauf-/Mietpreis-Verhältnis',
  'charts.boxplot-by-neighborhood-rent.title': 'Verteilung Mietpreis pro m² nach Stadtviertel',
  'charts.boxplot-by-neighborhood-rent.yaxis': 'Mietpreis pro m² und Monat (€)',
  'charts.boxplot-by-neighborhood-sale.title': 'Verteilung Kaufpreis pro m² nach Stadtviertel',
  'charts.boxplot-by-neighborhood-sale.yaxis': 'Kaufpreis pro m² (€)',
  'charts.xaxis.date': 'Datum',

  'tabs.trendAnalysis': 'Trendanalyse',
  'tabs.dataBasis': 'Datenbasis',

  'dataBasis.intro': 'So wurden diese Daten erhoben: Suchparameter, wöchentliches Erhebungsvolumen und aktuelle Verteilung der Inserate im gesamten Erhebungsgebiet.',
  'dataBasis.mapDescription': 'Exakte Standorte der in den letzten 3 Monaten erfassten Inserate, dargestellt auf einer echten Straßenkarte und nach Stadtviertel eingefärbt.',
  'dataBasis.searchConfig.heading': 'Suchparameter',
  'dataBasis.searchConfig.radius': 'Suchradius',
  'dataBasis.searchConfig.sizeRange': 'Größenbereich',
  'dataBasis.searchConfig.propertyType': 'Immobilientyp',
  'dataBasis.searchConfig.elevator': 'Aufzug erforderlich',
  'dataBasis.searchConfig.airConditioning': 'Klimaanlage',
  'dataBasis.searchConfig.preservation': 'Erhaltungszustand',
  'dataBasis.searchConfig.center': 'Suchzentrum (Breite, Länge)',
  'dataBasis.searchConfig.yes': 'Ja',
  'dataBasis.searchConfig.no': 'Nein',

  'charts.weekly-listing-volume.title': 'Wöchentliches Erhebungsvolumen',
  'charts.weekly-listing-volume.yaxis': 'Erfasste Inserate',
  'charts.size-histogram.title': 'Verteilung der Wohnungsgröße (m²)',
  'charts.size-histogram.xaxis': 'Größenklasse (m²)',
  'charts.size-histogram.yaxis': 'Inserate',
  'charts.rooms-distribution.title': 'Verteilung der Zimmeranzahl',
  'charts.rooms-distribution.xaxis': 'Zimmer',
  'charts.rooms-distribution.yaxis': 'Inserate',
  'charts.price-per-area-histogram-rent.title': 'Verteilung Mietpreis pro m²',
  'charts.price-per-area-histogram-rent.xaxis': 'Mietpreis pro m² und Monat (€)',
  'charts.price-per-area-histogram-rent.yaxis': 'Inserate',
  'charts.price-per-area-histogram-sale.title': 'Verteilung Kaufpreis pro m²',
  'charts.price-per-area-histogram-sale.xaxis': 'Kaufpreis pro m² (€)',
  'charts.price-per-area-histogram-sale.yaxis': 'Inserate',
  'charts.listing-locations-map.title': 'Standorte erfasster Inserate',

  'tabs.pipelineHealth': 'Pipeline-Zustand',
  'pipelineHealth.overallLabel': 'Gesamtstatus: {status}',
  'pipelineHealth.status.green': 'Grün',
  'pipelineHealth.status.yellow': 'Gelb',
  'pipelineHealth.status.red': 'Rot',
  'pipelineHealth.check.executionSuccess': 'Ausführungserfolg',
  'pipelineHealth.check.executionDuration': 'Ausführungsdauer',
  'pipelineHealth.check.apiQuota': 'API-Kontingent',
  'pipelineHealth.check.awsCost': 'AWS-Kosten',
  'pipelineHealth.notAvailable': 'Pipeline-Zustandsdaten sind noch nicht verfügbar.',

  'pipelineHealth.status.unknown': 'Unbekannt',
  'pipelineHealth.detail.executionSuccess.title': 'Verlauf des Ausführungserfolgs',
  'pipelineHealth.detail.executionDuration.title': 'Verlauf der Ausführungsdauer',
  'pipelineHealth.detail.apiQuota.title': 'Verlauf des API-Kontingents',
  'pipelineHealth.detail.awsCost.title': 'Verlauf der AWS-Kosten',
  'pipelineHealth.threshold.executionSuccess': 'Rot, wenn die letzte Ausführung fehlgeschlagen ist; Gelb, wenn eine der letzten 5 Ausführungen fehlgeschlagen ist.',
  'pipelineHealth.threshold.executionDuration': 'Grün unter 60 Sekunden; Gelb ab 60 Sekunden; Rot ab 120 Sekunden.',
  'pipelineHealth.threshold.apiQuota': 'Grün unter 80 Anfragen/Monat; Gelb ab 80; Rot ab 95 (Kontingent: 100 Anfragen/Monat).',
  'pipelineHealth.threshold.awsCost': 'Grün unter 2 $; Gelb ab 2 $; Rot ab 5 $ (Monat bis heute, ohne Domain-/Registrar-Kosten).',
  'pipelineHealth.diagram.title': 'Medallion-Pipeline',
  'pipelineHealth.diagram.bronze': 'Bronze (Rohdaten)',
  'pipelineHealth.diagram.silver': 'Silver (bereinigt)',
  'pipelineHealth.diagram.gold': 'Gold (aggregiert)',
  'pipelineHealth.diagram.observer': 'Pipeline-Zustand (Beobachter)',
  'pipelineHealth.diagram.source': 'Idealista API (Datenquelle)',
  'pipelineHealth.diagram.dashboard': 'Dashboard (Datenvisualisierung)',
  'pipelineHealth.diagram.statusLabel': 'Status',
};

const es = {
  'app.title': 'Análisis Inmobiliario de Valencia',
  'app.subtitle': 'Resumen semanal del mercado · Centro de Valencia',
  'app.themeToggleLabel': 'Cambiar modo oscuro',
  'app.languageToggleLabel': 'Cambiar idioma',

  'error.message': 'No se pudieron cargar los últimos datos del mercado. Comprueba tu conexión e inténtalo de nuevo.',
  'error.retryButton': 'Reintentar',

  'status.loading': 'Cargando datos del mercado…',
  'status.ready': 'Datos del mercado cargados.',
  'status.error': 'No se pudieron cargar los datos del mercado.',

  'kpi.medianRent': 'Alquiler mediano, últimos 3 meses (€/m²/mes)',
  'kpi.medianSale': 'Venta mediana, últimos 3 meses (€/m²)',
  'kpi.grossYield': 'Rentabilidad bruta implícita',
  'kpi.listingCount': 'Total de anuncios',
  'kpi.lastUpdated': 'Última actualización',

  'population.label': 'Población:',
  'population.all': 'Todos los anuncios',
  'population.filteredFallback': 'Pisos filtrados',
  'population.filteredPrefix': 'Pisos',
  'population.sizeGte': '≥{value} m²',
  'population.lift': 'ascensor',
  'population.roomsGte': '≥{value} habitaciones',
  'population.bathroomsGte': '≥{value} baños',
  'population.floorNot': 'sin planta {value}',

  'filters.districts': 'Distritos',
  'filters.neighborhoods': 'Barrios',
  'filters.clear': 'Borrar filtros',
  'filters.badgeAll': 'Todos',
  'filters.selectUpToDistricts': 'Selecciona hasta 3 distritos',
  'filters.selectUpToNeighborhoods': 'Selecciona hasta 3 barrios',
  'filters.noDataAvailable': 'No hay datos disponibles',

  'footer.dataUpdated': 'Datos actualizados por última vez: —',
  'footer.sourceLink': 'Código fuente en GitHub',

  'charts.price-time-series-rent.title': 'Precio de alquiler por m² al mes a lo largo del tiempo por barrio',
  'charts.price-time-series-rent.yaxis': 'Precio por m² al mes (€)',
  'charts.price-time-series-sale.title': 'Precio de venta por m² a lo largo del tiempo por barrio',
  'charts.price-time-series-sale.yaxis': 'Precio de venta por m² (€)',
  'charts.price-time-series-district-rent.title': 'Precio de alquiler por m² al mes a lo largo del tiempo por distrito',
  'charts.price-time-series-district-rent.yaxis': 'Precio por m² al mes (€)',
  'charts.price-time-series-district-sale.title': 'Precio de venta por m² a lo largo del tiempo por distrito',
  'charts.price-time-series-district-sale.yaxis': 'Precio de venta por m² (€)',
  'charts.rent-vs-sale-ratio.title': 'Alquiler vs. precio de venta por m² por barrio',
  'charts.rent-vs-sale-ratio.xaxis': 'Precio de alquiler por m² al mes (€)',
  'charts.rent-vs-sale-ratio.yaxis': 'Precio de venta por m² (€)',
  'charts.rent-vs-sale-ratio-time-series.title': 'Ratio precio venta/alquiler a lo largo del tiempo por barrio',
  'charts.rent-vs-sale-ratio-time-series.yaxis': 'Ratio venta/alquiler',
  'charts.boxplot-by-neighborhood-rent.title': 'Distribución del precio de alquiler por m² por barrio',
  'charts.boxplot-by-neighborhood-rent.yaxis': 'Precio de alquiler por m² al mes (€)',
  'charts.boxplot-by-neighborhood-sale.title': 'Distribución del precio de venta por m² por barrio',
  'charts.boxplot-by-neighborhood-sale.yaxis': 'Precio de venta por m² (€)',
  'charts.xaxis.date': 'Fecha',

  'tabs.trendAnalysis': 'Análisis de tendencias',
  'tabs.dataBasis': 'Base de datos',

  'dataBasis.intro': 'Cómo se recopilaron estos datos: parámetros de búsqueda, volumen de recopilación semanal y distribuciones actuales de los anuncios en toda la zona de recopilación.',
  'dataBasis.mapDescription': 'Ubicaciones exactas de los anuncios recopilados en los últimos 3 meses, mostradas en un mapa real de calles y coloreadas por barrio.',
  'dataBasis.searchConfig.heading': 'Parámetros de búsqueda',
  'dataBasis.searchConfig.radius': 'Radio de búsqueda',
  'dataBasis.searchConfig.sizeRange': 'Rango de tamaño',
  'dataBasis.searchConfig.propertyType': 'Tipo de propiedad',
  'dataBasis.searchConfig.elevator': 'Ascensor requerido',
  'dataBasis.searchConfig.airConditioning': 'Aire acondicionado',
  'dataBasis.searchConfig.preservation': 'Estado de conservación',
  'dataBasis.searchConfig.center': 'Centro de búsqueda (lat, lon)',
  'dataBasis.searchConfig.yes': 'Sí',
  'dataBasis.searchConfig.no': 'No',

  'charts.weekly-listing-volume.title': 'Volumen semanal de anuncios recopilados',
  'charts.weekly-listing-volume.yaxis': 'Anuncios recopilados',
  'charts.size-histogram.title': 'Distribución del tamaño de los anuncios (m²)',
  'charts.size-histogram.xaxis': 'Rango de tamaño (m²)',
  'charts.size-histogram.yaxis': 'Anuncios',
  'charts.rooms-distribution.title': 'Distribución de habitaciones',
  'charts.rooms-distribution.xaxis': 'Habitaciones',
  'charts.rooms-distribution.yaxis': 'Anuncios',
  'charts.price-per-area-histogram-rent.title': 'Distribución del precio de alquiler por m²',
  'charts.price-per-area-histogram-rent.xaxis': 'Precio de alquiler por m² al mes (€)',
  'charts.price-per-area-histogram-rent.yaxis': 'Anuncios',
  'charts.price-per-area-histogram-sale.title': 'Distribución del precio de venta por m²',
  'charts.price-per-area-histogram-sale.xaxis': 'Precio de venta por m² (€)',
  'charts.price-per-area-histogram-sale.yaxis': 'Anuncios',
  'charts.listing-locations-map.title': 'Ubicaciones de los anuncios recopilados',

  'tabs.pipelineHealth': 'Estado del pipeline',
  'pipelineHealth.overallLabel': 'Estado general: {status}',
  'pipelineHealth.status.green': 'Verde',
  'pipelineHealth.status.yellow': 'Amarillo',
  'pipelineHealth.status.red': 'Rojo',
  'pipelineHealth.check.executionSuccess': 'Éxito de ejecución',
  'pipelineHealth.check.executionDuration': 'Duración de ejecución',
  'pipelineHealth.check.apiQuota': 'Cuota de la API',
  'pipelineHealth.check.awsCost': 'Coste de AWS',
  'pipelineHealth.notAvailable': 'Los datos de estado del pipeline aún no están disponibles.',

  'pipelineHealth.status.unknown': 'Desconocido',
  'pipelineHealth.detail.executionSuccess.title': 'Historial de éxito de ejecución',
  'pipelineHealth.detail.executionDuration.title': 'Historial de duración de ejecución',
  'pipelineHealth.detail.apiQuota.title': 'Historial de cuota de la API',
  'pipelineHealth.detail.awsCost.title': 'Historial de coste de AWS',
  'pipelineHealth.threshold.executionSuccess': 'Rojo si la última ejecución falló; amarillo si alguna de las últimas 5 ejecuciones falló.',
  'pipelineHealth.threshold.executionDuration': 'Verde por debajo de 60 segundos; amarillo a partir de 60 segundos; rojo a partir de 120 segundos.',
  'pipelineHealth.threshold.apiQuota': 'Verde por debajo de 80 solicitudes/mes; amarillo desde 80; rojo desde 95 (cuota: 100 solicitudes/mes).',
  'pipelineHealth.threshold.awsCost': 'Verde por debajo de 2 $; amarillo desde 2 $; rojo desde 5 $ en lo que va de mes (excluyendo costes de dominio/registrador).',
  'pipelineHealth.diagram.title': 'Pipeline Medallion',
  'pipelineHealth.diagram.bronze': 'Bronze (datos en bruto)',
  'pipelineHealth.diagram.silver': 'Silver (datos limpios)',
  'pipelineHealth.diagram.gold': 'Gold (datos agregados)',
  'pipelineHealth.diagram.observer': 'Estado del pipeline (observador)',
  'pipelineHealth.diagram.source': 'API de Idealista (fuente de datos)',
  'pipelineHealth.diagram.dashboard': 'Panel (visualización de datos)',
  'pipelineHealth.diagram.statusLabel': 'Estado',
};

const ar = {
  'app.title': 'تحليلات العقارات في بلنسية',
  'app.subtitle': 'لقطة أسبوعية للسوق · وسط مدينة بلنسية',
  'app.themeToggleLabel': 'تبديل الوضع الداكن',
  'app.languageToggleLabel': 'تغيير اللغة',

  'error.message': 'تعذّر تحميل أحدث بيانات السوق. يرجى التحقق من اتصالك والمحاولة مرة أخرى.',
  'error.retryButton': 'إعادة المحاولة',

  'status.loading': 'جارٍ تحميل بيانات السوق…',
  'status.ready': 'تم تحميل بيانات السوق.',
  'status.error': 'تعذر تحميل بيانات السوق.',

  'kpi.medianRent': 'الوسيط للإيجار، آخر 3 أشهر (€/م²/شهر)',
  'kpi.medianSale': 'الوسيط للبيع، آخر 3 أشهر (€/م²)',
  'kpi.grossYield': 'العائد الإجمالي الضمني',
  'kpi.listingCount': 'إجمالي الإعلانات',
  'kpi.lastUpdated': 'آخر تحديث',

  'population.label': 'الفئة:',
  'population.all': 'كل الإعلانات',
  'population.filteredFallback': 'شقق مُفلترة',
  'population.filteredPrefix': 'شقق',
  'population.sizeGte': '≥{value} م²',
  'population.lift': 'مصعد',
  'population.roomsGte': '≥{value} غرف',
  'population.bathroomsGte': '≥{value} حمّامات',
  'population.floorNot': 'ليس الطابق {value}',

  'filters.districts': 'المناطق',
  'filters.neighborhoods': 'الأحياء',
  'filters.clear': 'مسح الفلاتر',
  'filters.badgeAll': 'الكل',
  'filters.selectUpToDistricts': 'اختر حتى 3 مناطق',
  'filters.selectUpToNeighborhoods': 'اختر حتى 3 أحياء',
  'filters.noDataAvailable': 'لا توجد بيانات متاحة',

  'footer.dataUpdated': 'آخر تحديث للبيانات: —',
  'footer.sourceLink': 'المصدر على GitHub',

  'charts.price-time-series-rent.title': 'سعر الإيجار لكل م² شهريًا عبر الزمن حسب الحي',
  'charts.price-time-series-rent.yaxis': 'السعر لكل م² شهريًا (€)',
  'charts.price-time-series-sale.title': 'سعر البيع لكل م² عبر الزمن حسب الحي',
  'charts.price-time-series-sale.yaxis': 'سعر البيع لكل م² (€)',
  'charts.price-time-series-district-rent.title': 'سعر الإيجار لكل م² شهريًا عبر الزمن حسب المنطقة',
  'charts.price-time-series-district-rent.yaxis': 'السعر لكل م² شهريًا (€)',
  'charts.price-time-series-district-sale.title': 'سعر البيع لكل م² عبر الزمن حسب المنطقة',
  'charts.price-time-series-district-sale.yaxis': 'سعر البيع لكل م² (€)',
  'charts.rent-vs-sale-ratio.title': 'الإيجار مقابل سعر البيع لكل م² حسب الحي',
  'charts.rent-vs-sale-ratio.xaxis': 'سعر الإيجار لكل م² شهريًا (€)',
  'charts.rent-vs-sale-ratio.yaxis': 'سعر البيع لكل م² (€)',
  'charts.rent-vs-sale-ratio-time-series.title': 'نسبة سعر البيع/الإيجار عبر الزمن حسب الحي',
  'charts.rent-vs-sale-ratio-time-series.yaxis': 'نسبة البيع/الإيجار',
  'charts.boxplot-by-neighborhood-rent.title': 'توزيع سعر الإيجار لكل م² حسب الحي',
  'charts.boxplot-by-neighborhood-rent.yaxis': 'سعر الإيجار لكل م² شهريًا (€)',
  'charts.boxplot-by-neighborhood-sale.title': 'توزيع سعر البيع لكل م² حسب الحي',
  'charts.boxplot-by-neighborhood-sale.yaxis': 'سعر البيع لكل م² (€)',
  'charts.xaxis.date': 'التاريخ',

  'tabs.trendAnalysis': 'تحليل الاتجاهات',
  'tabs.dataBasis': 'قاعدة البيانات',

  'dataBasis.intro': 'كيف تم جمع هذه البيانات: معايير البحث، حجم الجمع الأسبوعي، وتوزيعات الإعلانات الحالية في منطقة الجمع بأكملها.',
  'dataBasis.mapDescription': 'المواقع الدقيقة للإعلانات التي تم جمعها خلال آخر 3 أشهر، معروضة على خريطة شوارع حقيقية وملوّنة حسب الحي.',
  'dataBasis.searchConfig.heading': 'معايير البحث',
  'dataBasis.searchConfig.radius': 'نطاق البحث',
  'dataBasis.searchConfig.sizeRange': 'نطاق المساحة',
  'dataBasis.searchConfig.propertyType': 'نوع العقار',
  'dataBasis.searchConfig.elevator': 'مصعد مطلوب',
  'dataBasis.searchConfig.airConditioning': 'تكييف الهواء',
  'dataBasis.searchConfig.preservation': 'حالة الصيانة',
  'dataBasis.searchConfig.center': 'مركز البحث (خط العرض، خط الطول)',
  'dataBasis.searchConfig.yes': 'نعم',
  'dataBasis.searchConfig.no': 'لا',

  'charts.weekly-listing-volume.title': 'حجم الإعلانات المجمّعة أسبوعيًا',
  'charts.weekly-listing-volume.yaxis': 'الإعلانات المجمّعة',
  'charts.size-histogram.title': 'توزيع مساحة الإعلانات (م²)',
  'charts.size-histogram.xaxis': 'فئة المساحة (م²)',
  'charts.size-histogram.yaxis': 'الإعلانات',
  'charts.rooms-distribution.title': 'توزيع عدد الغرف',
  'charts.rooms-distribution.xaxis': 'الغرف',
  'charts.rooms-distribution.yaxis': 'الإعلانات',
  'charts.price-per-area-histogram-rent.title': 'توزيع سعر الإيجار لكل م²',
  'charts.price-per-area-histogram-rent.xaxis': 'سعر الإيجار لكل م² شهريًا (€)',
  'charts.price-per-area-histogram-rent.yaxis': 'الإعلانات',
  'charts.price-per-area-histogram-sale.title': 'توزيع سعر البيع لكل م²',
  'charts.price-per-area-histogram-sale.xaxis': 'سعر البيع لكل م² (€)',
  'charts.price-per-area-histogram-sale.yaxis': 'الإعلانات',
  'charts.listing-locations-map.title': 'مواقع الإعلانات التي تم جمعها',

  'tabs.pipelineHealth': 'سلامة خط الأنابيب',
  'pipelineHealth.overallLabel': 'الحالة العامة: {status}',
  'pipelineHealth.status.green': 'أخضر',
  'pipelineHealth.status.yellow': 'أصفر',
  'pipelineHealth.status.red': 'أحمر',
  'pipelineHealth.check.executionSuccess': 'نجاح التنفيذ',
  'pipelineHealth.check.executionDuration': 'مدة التنفيذ',
  'pipelineHealth.check.apiQuota': 'حصة واجهة برمجة التطبيقات',
  'pipelineHealth.check.awsCost': 'تكلفة AWS',
  'pipelineHealth.notAvailable': 'بيانات سلامة خط الأنابيب غير متوفرة بعد.',

  'pipelineHealth.status.unknown': 'غير معروف',
  'pipelineHealth.detail.executionSuccess.title': 'سجل نجاح التنفيذ',
  'pipelineHealth.detail.executionDuration.title': 'سجل مدة التنفيذ',
  'pipelineHealth.detail.apiQuota.title': 'سجل حصة واجهة برمجة التطبيقات',
  'pipelineHealth.detail.awsCost.title': 'سجل تكلفة AWS',
  'pipelineHealth.threshold.executionSuccess': 'أحمر إذا فشل آخر تنفيذ؛ أصفر إذا فشل أي من آخر 5 عمليات تنفيذ.',
  'pipelineHealth.threshold.executionDuration': 'أخضر أقل من 60 ثانية؛ أصفر من 60 ثانية؛ أحمر من 120 ثانية.',
  'pipelineHealth.threshold.apiQuota': 'أخضر أقل من 80 طلبًا/شهريًا؛ أصفر من 80؛ أحمر من 95 (الحصة: 100 طلب/شهريًا).',
  'pipelineHealth.threshold.awsCost': 'أخضر أقل من 2 دولار؛ أصفر من 2 دولار؛ أحمر من 5 دولارات منذ بداية الشهر (باستثناء تكاليف النطاق/المسجل).',
  'pipelineHealth.diagram.title': 'خط أنابيب الميدالية',
  'pipelineHealth.diagram.bronze': 'البرونزية (بيانات خام)',
  'pipelineHealth.diagram.silver': 'الفضية (بيانات منظفة)',
  'pipelineHealth.diagram.gold': 'الذهبية (بيانات مجمعة)',
  'pipelineHealth.diagram.observer': 'سلامة خط الأنابيب (مراقب)',
  'pipelineHealth.diagram.source': 'واجهة برمجة Idealista (مصدر البيانات)',
  'pipelineHealth.diagram.dashboard': 'لوحة المعلومات (تصور البيانات)',
  'pipelineHealth.diagram.statusLabel': 'الحالة',
};

const tr = {
  'app.title': 'Valencia Emlak Analitiği',
  'app.subtitle': 'Haftalık piyasa görünümü · Valencia şehir merkezi',
  'app.themeToggleLabel': 'Karanlık modu değiştir',
  'app.languageToggleLabel': 'Dili değiştir',

  'error.message': 'En güncel piyasa verileri yüklenemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.',
  'error.retryButton': 'Tekrar dene',

  'status.loading': 'Piyasa verileri yükleniyor…',
  'status.ready': 'Piyasa verileri yüklendi.',
  'status.error': 'Piyasa verileri yüklenemedi.',

  'kpi.medianRent': 'Medyan kira, son 3 ay (€/m²/ay)',
  'kpi.medianSale': 'Medyan satış, son 3 ay (€/m²)',
  'kpi.grossYield': 'Zımni brüt getiri',
  'kpi.listingCount': 'Toplam ilan',
  'kpi.lastUpdated': 'Son güncelleme',

  'population.label': 'Popülasyon:',
  'population.all': 'Tüm ilanlar',
  'population.filteredFallback': 'Filtrelenmiş daireler',
  'population.filteredPrefix': 'Daireler',
  'population.sizeGte': '≥{value} m²',
  'population.lift': 'asansör',
  'population.roomsGte': '≥{value} oda',
  'population.bathroomsGte': '≥{value} banyo',
  'population.floorNot': '{value}. kat hariç',

  'filters.districts': 'İlçeler',
  'filters.neighborhoods': 'Mahalleler',
  'filters.clear': 'Filtreleri temizle',
  'filters.badgeAll': 'Tümü',
  'filters.selectUpToDistricts': 'En fazla 3 ilçe seçin',
  'filters.selectUpToNeighborhoods': 'En fazla 3 mahalle seçin',
  'filters.noDataAvailable': 'Veri bulunmuyor',

  'footer.dataUpdated': 'Veriler son güncelleme: —',
  'footer.sourceLink': "GitHub'da kaynak kodu",

  'charts.price-time-series-rent.title': 'Mahalleye göre zaman içinde m² başına aylık kira fiyatı',
  'charts.price-time-series-rent.yaxis': 'm² başına aylık fiyat (€)',
  'charts.price-time-series-sale.title': 'Mahalleye göre zaman içinde m² başına satış fiyatı',
  'charts.price-time-series-sale.yaxis': 'm² başına satış fiyatı (€)',
  'charts.price-time-series-district-rent.title': 'İlçeye göre zaman içinde m² başına aylık kira fiyatı',
  'charts.price-time-series-district-rent.yaxis': 'm² başına aylık fiyat (€)',
  'charts.price-time-series-district-sale.title': 'İlçeye göre zaman içinde m² başına satış fiyatı',
  'charts.price-time-series-district-sale.yaxis': 'm² başına satış fiyatı (€)',
  'charts.rent-vs-sale-ratio.title': 'Mahalleye göre m² başına kira ve satış fiyatı',
  'charts.rent-vs-sale-ratio.xaxis': 'm² başına aylık kira fiyatı (€)',
  'charts.rent-vs-sale-ratio.yaxis': 'm² başına satış fiyatı (€)',
  'charts.rent-vs-sale-ratio-time-series.title': 'Mahalleye göre zaman içinde satış/kira fiyat oranı',
  'charts.rent-vs-sale-ratio-time-series.yaxis': 'Satış/kira oranı',
  'charts.boxplot-by-neighborhood-rent.title': 'Mahalleye göre m² başına kira fiyatı dağılımı',
  'charts.boxplot-by-neighborhood-rent.yaxis': 'm² başına aylık kira fiyatı (€)',
  'charts.boxplot-by-neighborhood-sale.title': 'Mahalleye göre m² başına satış fiyatı dağılımı',
  'charts.boxplot-by-neighborhood-sale.yaxis': 'm² başına satış fiyatı (€)',
  'charts.xaxis.date': 'Tarih',

  'tabs.trendAnalysis': 'Trend Analizi',
  'tabs.dataBasis': 'Veri Tabanı',

  'dataBasis.intro': 'Bu veriler nasıl toplandı: arama parametreleri, haftalık toplama hacmi ve toplama alanının tamamındaki güncel ilan dağılımları.',
  'dataBasis.mapDescription': 'Son 3 ayda toplanan ilanların, gerçek bir sokak haritasında gösterilen ve mahalleye göre renklendirilen tam konumları.',
  'dataBasis.searchConfig.heading': 'Arama parametreleri',
  'dataBasis.searchConfig.radius': 'Arama yarıçapı',
  'dataBasis.searchConfig.sizeRange': 'Büyüklük aralığı',
  'dataBasis.searchConfig.propertyType': 'Emlak türü',
  'dataBasis.searchConfig.elevator': 'Asansör gerekli',
  'dataBasis.searchConfig.airConditioning': 'Klima',
  'dataBasis.searchConfig.preservation': 'Bakım durumu',
  'dataBasis.searchConfig.center': 'Arama merkezi (enlem, boylam)',
  'dataBasis.searchConfig.yes': 'Evet',
  'dataBasis.searchConfig.no': 'Hayır',

  'charts.weekly-listing-volume.title': 'Haftalık toplanan ilan hacmi',
  'charts.weekly-listing-volume.yaxis': 'Toplanan ilanlar',
  'charts.size-histogram.title': 'İlan büyüklüğü dağılımı (m²)',
  'charts.size-histogram.xaxis': 'Büyüklük aralığı (m²)',
  'charts.size-histogram.yaxis': 'İlanlar',
  'charts.rooms-distribution.title': 'Oda sayısı dağılımı',
  'charts.rooms-distribution.xaxis': 'Odalar',
  'charts.rooms-distribution.yaxis': 'İlanlar',
  'charts.price-per-area-histogram-rent.title': 'm² başına kira fiyatı dağılımı',
  'charts.price-per-area-histogram-rent.xaxis': 'm² başına aylık kira fiyatı (€)',
  'charts.price-per-area-histogram-rent.yaxis': 'İlanlar',
  'charts.price-per-area-histogram-sale.title': 'm² başına satış fiyatı dağılımı',
  'charts.price-per-area-histogram-sale.xaxis': 'm² başına satış fiyatı (€)',
  'charts.price-per-area-histogram-sale.yaxis': 'İlanlar',
  'charts.listing-locations-map.title': 'Toplanan ilan konumları',

  'tabs.pipelineHealth': 'Pipeline Sağlığı',
  'pipelineHealth.overallLabel': 'Genel durum: {status}',
  'pipelineHealth.status.green': 'Yeşil',
  'pipelineHealth.status.yellow': 'Sarı',
  'pipelineHealth.status.red': 'Kırmızı',
  'pipelineHealth.check.executionSuccess': 'Yürütme başarısı',
  'pipelineHealth.check.executionDuration': 'Yürütme süresi',
  'pipelineHealth.check.apiQuota': 'API kotası',
  'pipelineHealth.check.awsCost': 'AWS maliyeti',
  'pipelineHealth.notAvailable': 'Pipeline sağlığı verileri henüz mevcut değil.',

  'pipelineHealth.status.unknown': 'Bilinmiyor',
  'pipelineHealth.detail.executionSuccess.title': 'Yürütme başarısı geçmişi',
  'pipelineHealth.detail.executionDuration.title': 'Yürütme süresi geçmişi',
  'pipelineHealth.detail.apiQuota.title': 'API kotası geçmişi',
  'pipelineHealth.detail.awsCost.title': 'AWS maliyeti geçmişi',
  'pipelineHealth.threshold.executionSuccess': 'Son yürütme başarısız olduysa kırmızı; son 5 yürütmeden biri başarısız olduysa sarı.',
  'pipelineHealth.threshold.executionDuration': '60 saniyenin altında yeşil; 60 saniyeden itibaren sarı; 120 saniyeden itibaren kırmızı.',
  'pipelineHealth.threshold.apiQuota': 'Ayda 80 istekten az yeşil; 80\'den itibaren sarı; 95\'ten itibaren kırmızı (kota: ayda 100 istek).',
  'pipelineHealth.threshold.awsCost': '2 $\'ın altında yeşil; 2 $\'dan itibaren sarı; 5 $\'dan itibaren kırmızı (ay başından bugüne, alan adı/kayıt maliyetleri hariç).',
  'pipelineHealth.diagram.title': 'Medallion pipeline',
  'pipelineHealth.diagram.bronze': 'Bronz (ham veri)',
  'pipelineHealth.diagram.silver': 'Silver (temizlenmiş)',
  'pipelineHealth.diagram.gold': 'Gold (toplanmış)',
  'pipelineHealth.diagram.observer': 'Pipeline Sağlığı (gözlemci)',
  'pipelineHealth.diagram.source': 'Idealista API (veri kaynağı)',
  'pipelineHealth.diagram.dashboard': 'Gösterge paneli (veri görselleştirme)',
  'pipelineHealth.diagram.statusLabel': 'Durum',
};

const TRANSLATIONS = { en, de, es, ar, tr };

/**
 * Look up a translated string for `key` in `locale`, interpolating `params`
 * placeholders of the form `{name}`.
 *
 * Falls back to the English string when `locale` is unsupported or the key
 * is missing in that locale's dictionary (never throws, never returns
 * undefined) so a partially-translated locale still renders something
 * sensible instead of a blank UI.
 *
 * @param {string} locale - One of SUPPORTED_LOCALES.
 * @param {string} key - Flat translation key, e.g. 'kpi.medianRent'.
 * @param {Record<string, string|number>} [params] - `{name}` placeholders to interpolate.
 * @returns {string}
 */
export function t(locale, key, params = {}) {
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];
  const template = dict[key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
}

/**
 * @param {string} locale
 * @returns {boolean} Whether `locale` is written right-to-left.
 */
export function isRtl(locale) {
  return RTL_LOCALES.has(locale);
}

/**
 * Normalize an arbitrary stored/requested locale string to one of
 * SUPPORTED_LOCALES, falling back to DEFAULT_LOCALE.
 *
 * @param {string|null|undefined} locale
 * @returns {string}
 */
export function resolveLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

/**
 * List every translation key defined for a locale (falls back to the
 * English dictionary's keys for an unsupported locale, mirroring t()'s own
 * fallback behaviour). Exists so tests (and any future tooling) can assert
 * locale-completeness without reaching into this module's private
 * TRANSLATIONS map.
 *
 * @param {string} locale
 * @returns {string[]}
 */
export function localeKeys(locale) {
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];
  return Object.keys(dict);
}
