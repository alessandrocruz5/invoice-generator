// Money math on BigInt scaled integers. Inputs are canonical '.'-decimal strings; outputs have exactly m places.
export const LIMITS = { items: 100, quantity: '1000000', rate: '1000000000' };

const UNSIGNED = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const QTY_PLACES = 4;
const RATE_PLACES = 4;
const FLAT_PLACES = 4;
const PCT_PLACES = 3;
const VAT_PCT = '12';

export function parseDecimal(str, maxPlaces) {
  if (typeof str !== 'string' || !UNSIGNED.test(str)) return null;
  const [int, frac = ''] = str.split('.');
  if (frac.length > maxPlaces) return null;
  return { value: BigInt((int || '0') + frac.padEnd(maxPlaces, '0')), places: maxPlaces };
}

export function roundHalfUp(value, fromPlaces, toPlaces) {
  if (toPlaces >= fromPlaces) return value * 10n ** BigInt(toPlaces - fromPlaces);
  const d = 10n ** BigInt(fromPlaces - toPlaces);
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const q = abs / d + ((abs % d) * 2n >= d ? 1n : 0n);
  return neg ? -q : q;
}

export function formatScaled(value, places) {
  const neg = value < 0n;
  const digits = (neg ? -value : value).toString().padStart(places + 1, '0');
  const body = places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  return neg ? `-${body}` : body;
}

function fracLength(str) {
  const i = typeof str === 'string' ? str.indexOf('.') : -1;
  return i === -1 ? 0 : str.length - i - 1;
}

// Signed canonical string -> bigint at `places`; '' or unparseable -> 0n.
function signedScaled(str, places) {
  if (typeof str !== 'string') return 0n;
  const neg = str.startsWith('-');
  const parsed = parseDecimal(neg ? str.slice(1) : str, places);
  if (!parsed) return 0n;
  return neg ? -parsed.value : parsed.value;
}

export function compareDecimal(a, b) {
  const la = fracLength(a);
  const lb = fracLength(b);
  const places = la > lb ? la : lb;
  const x = signedScaled(a, places);
  const y = signedScaled(b, places);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function isZero(str) {
  return signedScaled(str, fracLength(str)) === 0n;
}

function unsignedScaled(str, places) {
  return parseDecimal(str, places)?.value ?? 0n;
}

function flat(str, m) {
  return roundHalfUp(unsignedScaled(str, FLAT_PLACES), FLAT_PLACES, m);
}

// x (at m places) × pct / 100: x × pct is at m+3 places, and dividing by 100 makes it m+5.
function percentOf(x, pct, m) {
  return roundHalfUp(x * unsignedScaled(pct, PCT_PLACES), m + PCT_PLACES + 2, m);
}

export function computeTotals(doc, minorUnits) {
  const m = minorUnits;
  const f = doc.fields || {};
  const items = Array.isArray(doc.items) ? doc.items : [];
  const generic = doc.mode === 'generic';

  const amounts = items.map((it) =>
    roundHalfUp(unsignedScaled(it?.quantity, QTY_PLACES) * unsignedScaled(it?.unit_cost, RATE_PLACES), QTY_PLACES + RATE_PLACES, m),
  );
  const subtotal = amounts.reduce((sum, a) => sum + a, 0n);
  const discount =
    f.discounts === '%' ? percentOf(subtotal, doc.discounts, m) : f.discounts === true ? flat(doc.discounts, m) : 0n;
  const net = subtotal - discount;
  const vat = doc.mode === 'ph-vat' && doc.vat_treatment === 'vatable' ? percentOf(net, VAT_PCT, m) : 0n;
  const tax = !generic ? 0n : f.tax === '%' ? percentOf(net, doc.tax, m) : f.tax === true ? flat(doc.tax, m) : 0n;
  const shipping = generic && f.shipping === true ? flat(doc.shipping, m) : 0n;
  const total = net + vat + tax + shipping;
  const withholding = f.withholding === true ? percentOf(net, doc.withholding_rate, m) : 0n;
  const netPayable = total - withholding;
  const amountPaid = flat(doc.amount_paid, m);
  const balance = netPayable - amountPaid;

  const fmt = (v) => formatScaled(v, m);
  return {
    amounts: amounts.map(fmt),
    subtotal: fmt(subtotal),
    discount: fmt(discount),
    net: fmt(net),
    vat: fmt(vat),
    tax: fmt(tax),
    shipping: fmt(shipping),
    total: fmt(total),
    withholding: fmt(withholding),
    netPayable: fmt(netPayable),
    amountPaid: fmt(amountPaid),
    balance: fmt(balance),
  };
}
