/**
 * Conservative last-mile projection for values returned to an MCP client.
 * Unknown numeric values and text containing monetary-looking values are hidden.
 * Identifiers, dates, status fields and pagination/count metadata remain useful.
 */
const HIDDEN = '[hidden]';

const SAFE_NUMBER_KEYS = new Set([
  'id',
  'page',
  'current_page',
  'total_pages',
  'totalpages',
  'limit',
  'per_page',
  'perpage',
]);

const SAFE_STRING_KEYS = new Set([
  'id',
  'currency_id',
  'currency_code',
  'type',
  'status',
  'date',
  'created_at',
  'updated_at',
  'start',
  'end',
  'from',
  'to',
]);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const SAFE_DATE_KEY = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))?$/i;
const NUMERIC = /(?<![\p{L}\p{N}_])[-+]?(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:[.,]\d+)?(?![\p{L}\p{N}_])/gu;
const HAS_NUMERIC = /(?<![\p{L}\p{N}_])[-+]?(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:[.,]\d+)?(?![\p{L}\p{N}_])/u;
const CURRENCY =
  /(?:[$€£¥₹]|\b(?:USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD|SEK|NOK|DKK|PLN|CZK|BRL|INR)\b|\b(?:dollars?|euros?|pounds?|yen|francs?)\b)/iu;

function safeMetadataString(key: string, value: string): boolean {
  const normalizedKey = key.toLowerCase();
  if ((normalizedKey === 'id' || normalizedKey.endsWith('_id')) && /^\d+$/.test(value)) return true;
  if (normalizedKey === 'currency_code' && /^[A-Z]{3}$/.test(value)) return true;
  if (['type', 'status'].includes(normalizedKey) && !HAS_NUMERIC.test(value) && !CURRENCY.test(value)) return true;
  return SAFE_STRING_KEYS.has(normalizedKey) && (DATE_ONLY.test(value) || DATE_TIME.test(value));
}

function hideString(value: string, key: string): string {
  if (safeMetadataString(key, value)) return value;
  if (CURRENCY.test(value)) return HIDDEN;
  // CSV and prose are unstructured. Hide numeric tokens there rather than trying
  // to guess which column or phrase represents an amount.
  const dates: string[] = [];
  const withProtectedDates = value.replace(
    /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))?\b/gi,
    (date) => {
      const marker = `DATEPROTECTED${dates.length}END`;
      dates.push(date);
      return marker;
    },
  );
  return withProtectedDates
    .replace(NUMERIC, HIDDEN)
    .replace(/DATEPROTECTED(\d+)END/g, (_match, index: string) => dates[Number(index)]);
}

export function redactMonetaryOutput(value: unknown): unknown {
  const visit = (item: unknown, key = '', parentKey = '', seen = new WeakSet<object>()): unknown => {
    const normalizedKey = key.toLowerCase();
    const isPagination = parentKey.toLowerCase() === 'pagination';
    if (typeof item === 'number') {
      return SAFE_NUMBER_KEYS.has(normalizedKey) || (isPagination && ['total', 'count'].includes(normalizedKey))
        ? item
        : HIDDEN;
    }
    if (typeof item === 'string') return hideString(item, key);
    if (item === null || typeof item === 'boolean') return item;
    if (Array.isArray(item)) {
      if (seen.has(item)) return HIDDEN;
      seen.add(item);
      return item.map((entry) => visit(entry, key, parentKey, seen));
    }
    if (typeof item === 'object') {
      const record = item as Record<string, unknown>;
      if (seen.has(record)) return HIDDEN;
      seen.add(record);
      return Object.fromEntries(
        Object.entries(record).map(([childKey, child]) => {
          const safeKey =
            SAFE_DATE_KEY.test(childKey) || (!HAS_NUMERIC.test(childKey) && !CURRENCY.test(childKey))
              ? childKey
              : HIDDEN;
          return [safeKey, visit(child, childKey, key, seen)];
        }),
      );
    }
    return HIDDEN;
  };
  return visit(value);
}

/** Redacts free text and fails closed on non-text native content (for example images). */
export function redactTextOutput(value: string): string {
  return hideString(value, '');
}

/** Keeps the numeric database ID at the start of autocomplete labels. */
export function redactCompletionOutput(value: string): string {
  const match = value.match(/^(\d+)(\s+)(.*)$/s);
  return match ? `${match[1]}${match[2]}${redactTextOutput(match[3])}` : redactTextOutput(value);
}
