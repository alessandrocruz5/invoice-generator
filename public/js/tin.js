// TIN masking and validation. Pure: no DOM.
const TIN_RE = /^\d{3}-\d{3}-\d{3}-(?:\d{3}|\d{5})$/;

export function tinDigits(str) {
  return typeof str === 'string' ? str.replace(/\D/g, '') : '';
}

export function formatTin(input) {
  const d = tinDigits(input).slice(0, 14);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)];
  return parts.filter((p) => p !== '').join('-');
}

export function isValidTin(str) {
  if (str === '' || str == null) return true;
  return typeof str === 'string' && TIN_RE.test(str);
}
