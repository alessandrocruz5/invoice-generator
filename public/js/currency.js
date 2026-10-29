// Currency list, minor units, money formatting and user-number parsing. Pure: no DOM,
// nothing read from `navigator` (the caller passes the language in). Never does money
// arithmetic; amounts are canonical decimal strings with '.' as the mark.

export const COMMON_CURRENCIES = [
  'PHP', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'HKD', 'JPY', 'CNY', 'INR', 'AED', 'NZD', 'CHF',
];

// Used only when Intl.supportedValuesOf is missing (older browsers).
export const FALLBACK_CURRENCIES = [
  ...COMMON_CURRENCIES,
  'KRW', 'THB', 'MYR', 'IDR', 'VND', 'TWD', 'PKR', 'BDT', 'LKR', 'NPR',
  'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'ILS', 'TRY', 'EGP', 'ZAR', 'NGN',
  'KES', 'GHS', 'MAD', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'SEK',
  'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'UAH', 'RUB', 'ISK', 'KZT',
];

export const NUMBER_FORMATS = ['auto', 'en-US', 'en-GB', 'en-PH', 'de-DE', 'fr-FR', 'es-ES', 'ja-JP', 'en-IN'];
export const DEFAULT_CURRENCY = 'PHP';

function supportedCodes() {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('currency');
    } catch {
      // fall through to the hard-coded list
    }
  }
  return FALLBACK_CURRENCIES;
}

let displayNames;
function currencyName(code) {
  try {
    if (!displayNames) displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
    return displayNames.of(code) || code;
  } catch {
    return code;
  }
}

function labelFor(code) {
  const name = currencyName(code);
  return name === code ? code : `${code} — ${name}`;
}

export function currencyList() {
  const supported = new Set(supportedCodes());
  const common = COMMON_CURRENCIES.filter((c) => supported.has(c));
  const commonSet = new Set(common);
  const rest = [...supported].filter((c) => !commonSet.has(c)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    common: common.map((code) => ({ code, label: labelFor(code) })),
    all: rest.map((code) => ({ code, label: labelFor(code) })),
  };
}

export function isSupportedCurrency(code) {
  return typeof code === 'string' && supportedCodes().includes(code);
}

export function minorUnits(code) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

export function resolveLocale(setting, language) {
  return setting === 'auto' ? language || 'en-US' : setting;
}

function partOf(locale, sample, type) {
  const part = new Intl.NumberFormat(locale).formatToParts(sample).find((p) => p.type === type);
  return part ? part.value : '';
}

export function decimalMark(locale) {
  return partOf(locale, 1.5, 'decimal') || '.';
}

export function groupMark(locale) {
  return partOf(locale, 12345.6, 'group');
}

export function makeMoneyFormatter({ locale, currency, currencyDisplay }) {
  const m = minorUnits(currency);
  const cache = new Map();
  function forDigits(max) {
    let nf = cache.get(max);
    if (!nf) {
      nf = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay,
        minimumFractionDigits: m,
        maximumFractionDigits: max,
      });
      cache.set(max, nf);
    }
    return nf;
  }
  // Pass the canonical string, never a Number, so large values stay exact.
  return function format(decimalString, { maxFractionDigits } = {}) {
    return forDigits(Math.max(m, maxFractionDigits ?? m)).format(decimalString);
  };
}

export function roundingNote(code) {
  const m = minorUnits(code);
  if (m === 0) {
    const unit = code === 'JPY' ? 'yen' : currencyName(code).toLowerCase();
    return `${code} has no decimal places. Totals are rounded to whole ${unit}.`;
  }
  if (m > 2) return `${code} uses ${m} decimal places.`;
  return null;
}

const SPACE_BETWEEN_DIGITS = /\d[   ']\d/;

export function parseUserNumber(text, { decimalMark: dm, groupMark: gm, maxDecimals = Infinity } = {}) {
  const s = String(text ?? '').trim();
  if (s === '') return { ok: true, value: '' };

  // Never guess what a separator means: "1,500" must not silently become 1.5.
  if (gm && gm !== dm && s.includes(gm)) return { ok: false, error: 'thousands' };
  for (const ch of s) {
    if ((ch === ',' || ch === '.') && ch !== dm) return { ok: false, error: 'thousands' };
  }
  if (SPACE_BETWEEN_DIGITS.test(s)) return { ok: false, error: 'thousands' };

  const parts = s.split(dm);
  if (parts.length > 2) return { ok: false, error: 'format' };
  const [intPart, fracPart = ''] = parts;
  if (!/^[0-9]*$/.test(intPart) || !/^[0-9]*$/.test(fracPart)) return { ok: false, error: 'format' };
  if (intPart === '' && fracPart === '') return { ok: false, error: 'format' };
  if (fracPart.length > maxDecimals) return { ok: false, error: 'decimals' };

  const whole = intPart.replace(/^0+/, '') || '0';
  return { ok: true, value: fracPart === '' ? whole : `${whole}.${fracPart}` };
}

export function toDisplayNumber(canonical, dm) {
  if (canonical === '' || canonical == null) return '';
  return String(canonical).replace('.', dm);
}

export function isoSuffix(code) {
  return ` (${code})`;
}
