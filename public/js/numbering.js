// Next document number: increment the last run of digits, keep zero padding, widen on overflow.
export function nextNumber(str) {
  if (typeof str !== 'string') return '';
  const runs = [...str.matchAll(/\d+/g)];
  if (runs.length === 0) return '';
  const last = runs[runs.length - 1];
  const digits = last[0];
  const next = (BigInt(digits) + 1n).toString().padStart(digits.length, '0');
  return str.slice(0, last.index) + next + str.slice(last.index + digits.length);
}
