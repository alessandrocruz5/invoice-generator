// Validation rules (SPEC §7). Pure: a document plus context in, { errors, warnings } out. No DOM.
import { LIMITS, compareDecimal, isZero, parseDecimal } from './calc.js';
import { compareIso, isIsoDate } from './dates.js';
import { modeConfig } from './modes.js';
import { findUnsupportedChars } from './pdf-glyphs.js';
import { isBlankItem, labelFor } from './state.js';
import { isValidTin } from './tin.js';

const TAX_ID_LABEL = /\b(tax|vat|abn|gst|tin|ein|ust|siret|nif|nip|uid)\b/i;
const PERCENT_MAX = '100';
const RATE_MESSAGE = 'Enter a rate from 0 to 100.';
const TIN_MESSAGE = 'Enter a TIN like 123-456-789-000 or 123-456-789-00000.';

const issue = (field, message) => ({ field, message });
const text = (v) => (typeof v === 'string' ? v : '');
const blank = (v) => text(v).trim() === '';

// Empty or a canonical number within 0-100.
function outOfRange(value) {
  if (value === '' || value == null) return false;
  return parseDecimal(value, 3) === null || compareDecimal(value, PERCENT_MAX) > 0;
}

function decimalsMessage(path, doc) {
  const f = doc.fields || {};
  const pct = (path === 'discounts' && f.discounts === '%') || (path === 'tax' && f.tax === '%') || path === 'withholding_rate';
  return pct ? 'Up to 3 decimals.' : 'Up to 4 decimals.';
}

function invalidMessage(path, error, doc) {
  if (error === 'thousands') return 'Remove thousands separators.';
  if (error === 'decimals') return decimalsMessage(path, doc);
  return 'Enter a number.';
}

function itemErrors(doc, invalid) {
  const errors = [];
  const items = Array.isArray(doc.items) ? doc.items : [];
  const rows = items.map((it, i) => ({ it: it ?? {}, i })).filter(({ it }) => !isBlankItem(it));

  if (!rows.some(({ it }) => !blank(it.name))) errors.push(issue('items.0.name', 'Add at least one line item.'));

  for (const { it, i } of rows) {
    if (blank(it.name)) errors.push(issue(`items.${i}.name`, 'Enter an item name.'));

    const qtyPath = `items.${i}.quantity`;
    if (!invalid.has(qtyPath)) {
      const qty = text(it.quantity);
      if (qty === '' || isZero(qty)) errors.push(issue(qtyPath, 'Enter a quantity above 0.'));
      else if (compareDecimal(qty, LIMITS.quantity) > 0) errors.push(issue(qtyPath, 'Quantity can be at most 1,000,000.'));
    }

    const ratePath = `items.${i}.unit_cost`;
    if (!invalid.has(ratePath) && compareDecimal(text(it.unit_cost), LIMITS.rate) > 0) {
      errors.push(issue(ratePath, 'Rate can be at most 1,000,000,000.'));
    }
  }

  if (items.length > LIMITS.items) errors.push(issue(null, 'You can add up to 100 items.'));
  return errors;
}

// Everything the user typed that ends up on the PDF.
function pdfText(doc) {
  const parts = [
    doc.from, doc.to, doc.ship_to, doc.seller_tin, doc.client_tin, doc.number,
    doc.payment_terms, doc.purchase_order, doc.bir_invoice_no, doc.notes, doc.terms, doc.payment_details,
  ];
  for (const cf of Array.isArray(doc.custom_fields) ? doc.custom_fields : []) parts.push(cf?.label, cf?.value);
  for (const it of Array.isArray(doc.items) ? doc.items : []) parts.push(it?.name, it?.description);
  if (doc.labels && typeof doc.labels === 'object') parts.push(...Object.values(doc.labels));
  return parts.filter((p) => typeof p === 'string').join('\n');
}

export function validate(doc, ctx = {}) {
  const { totals } = ctx;
  const invalid = ctx.invalid instanceof Map ? ctx.invalid : new Map();
  const historyNumbers = Array.isArray(ctx.historyNumbers) ? ctx.historyNumbers : [];
  const mode = modeConfig(doc.mode);
  const f = doc.fields || {};
  const errors = [];
  const warnings = [];

  // Required fields.
  if (blank(doc.from)) errors.push(issue('from', 'From is required.'));
  if (blank(doc.to)) errors.push(issue('to', 'Bill To is required.'));
  if (blank(doc.number)) errors.push(issue('number', 'Number is required.'));
  if (!isIsoDate(doc.date)) errors.push(issue('date', 'Date is required.'));

  errors.push(...itemErrors(doc, invalid));

  // Text that failed to parse.
  for (const [path, { error }] of invalid) errors.push(issue(path, invalidMessage(path, error, doc)));

  // Percent ranges.
  if (f.discounts === '%' && !invalid.has('discounts') && outOfRange(doc.discounts)) errors.push(issue('discounts', RATE_MESSAGE));
  if (!mode.isPh && f.tax === '%' && !invalid.has('tax') && outOfRange(doc.tax)) errors.push(issue('tax', RATE_MESSAGE));
  if (f.withholding === true && !invalid.has('withholding_rate')) {
    if (blank(doc.withholding_rate) || outOfRange(doc.withholding_rate)) errors.push(issue('withholding_rate', RATE_MESSAGE));
  }

  if (totals) {
    if (compareDecimal(totals.discount, totals.subtotal) > 0) errors.push(issue('discounts', 'Discount is more than the subtotal.'));
  }

  if (isIsoDate(doc.date) && isIsoDate(doc.due_date) && compareIso(doc.due_date, doc.date) < 0) {
    errors.push(issue('due_date', "Due date can't be before the date."));
  }

  if (totals && compareDecimal(totals.amountPaid, totals.netPayable) > 0) {
    errors.push(issue('amount_paid', 'Amount paid is more than the amount payable.'));
  }

  if (mode.isPh) {
    if (!blank(doc.seller_tin) && !isValidTin(doc.seller_tin)) errors.push(issue('seller_tin', TIN_MESSAGE));
    if (!blank(doc.client_tin) && !isValidTin(doc.client_tin)) errors.push(issue('client_tin', TIN_MESSAGE));
  }

  // Warnings.
  if (mode.isPh) {
    if (blank(doc.seller_tin)) {
      warnings.push(issue('seller_tin', 'Add your TIN. Clients need it to withhold tax and issue Form 2307.'));
    }
    if (/invoice/i.test(labelFor(doc, 'header') ?? '')) {
      warnings.push(
        issue(
          'labels.header',
          'In the Philippines, only BIR-registered invoices should be called Invoice. Keep Billing Statement unless this goes to a client abroad.',
        ),
      );
    }
  } else if (f.tax === '%' || f.tax === true) {
    const fields = Array.isArray(doc.custom_fields) ? doc.custom_fields : [];
    if (!fields.some((cf) => TAX_ID_LABEL.test(text(cf?.label)))) {
      warnings.push(issue(null, 'Tax-registered? Add your tax ID as a custom field.'));
    }
  }

  if (historyNumbers.includes(text(doc.number).trim())) warnings.push(issue('number', 'You already used this number.'));

  // U+2212 is in Roboto and prints fine; pdf-glyphs.js just doesn't list it.
  const unsupported = findUnsupportedChars(pdfText(doc)).filter((ch) => ch !== '\u2212');
  if (unsupported.length) warnings.push(issue(null, `Some characters (like ${unsupported[0]}) won't appear in the PDF.`));

  const named = Array.isArray(doc.items) && doc.items.some((it) => !blank(it?.name));
  if (totals && named && isZero(totals.balance)) warnings.push(issue(null, 'This document totals zero.'));

  return { errors, warnings };
}
