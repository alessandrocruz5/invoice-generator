// Which characters the bundled Roboto can draw in the PDF. Pure: no DOM.
export const COVERED_SYMBOLS = '₱€£¥₹₩₫₪₺₽₦₼';

const EXTRA_CODE_POINTS = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x00d7]);
const COVERED = new Set(Array.from(COVERED_SYMBOLS, (c) => c.codePointAt(0)));

export function isPdfSafeChar(ch) {
  if (typeof ch !== 'string' || ch === '') return false;
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x20 && cp <= 0x7e) ||
    cp === 0x09 || cp === 0x0a || cp === 0x0d ||
    (cp >= 0x00a0 && cp <= 0x00ff) || // Latin-1
    (cp >= 0x0100 && cp <= 0x024f) || // Latin Extended-A/B
    (cp >= 0x0300 && cp <= 0x036f) || // combining marks
    (cp >= 0x0370 && cp <= 0x03ff) || // Greek
    (cp >= 0x0400 && cp <= 0x04ff) || // Cyrillic
    (cp >= 0x1ea0 && cp <= 0x1ef9) || // Vietnamese
    EXTRA_CODE_POINTS.has(cp) ||
    COVERED.has(cp)
  );
}

// Rule 1: fr-FR's narrow no-break space is missing from the font; bidi marks are invisible noise.
export function sanitizeForPdf(str) {
  return String(str ?? '').replace(/ /g, ' ').replace(/[‎‏]/g, '');
}

export function findUnsupportedChars(text) {
  const seen = new Set();
  const out = [];
  for (const ch of sanitizeForPdf(text)) {
    if (!isPdfSafeChar(ch) && !seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
}

// Rule 2: a symbol the font cannot draw falls back to the ISO-code formatting.
export function symbolOrCode(formatted, reformatAsCode) {
  const s = sanitizeForPdf(formatted);
  for (const ch of s) {
    if (!isPdfSafeChar(ch)) return sanitizeForPdf(reformatAsCode());
  }
  return s;
}
