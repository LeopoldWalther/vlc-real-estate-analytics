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

  'kpi.medianRent': 'Median rent (€/m²/mo)',
  'kpi.medianSale': 'Median sale (€/m²)',
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

  'kpi.medianRent': 'Median Miete (€/m²/Monat)',
  'kpi.medianSale': 'Median Kaufpreis (€/m²)',
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

  'kpi.medianRent': 'Alquiler mediano (€/m²/mes)',
  'kpi.medianSale': 'Venta mediana (€/m²)',
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

  'kpi.medianRent': 'الوسيط للإيجار (€/م²/شهر)',
  'kpi.medianSale': 'الوسيط للبيع (€/م²)',
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

  'kpi.medianRent': 'Medyan kira (€/m²/ay)',
  'kpi.medianSale': 'Medyan satış (€/m²)',
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
