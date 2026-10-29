// Per-mode config and the ordered totals rows shared by the editor and the PDF. No math here: values come from `totals`.
import { isZero } from './calc.js';

export const MODES = [
  { id: 'ph-nonvat', label: 'PH – Non-VAT' },
  { id: 'ph-vat', label: 'PH – VAT-registered' },
  { id: 'generic', label: 'Generic' },
];
export const DEFAULT_MODE = 'ph-nonvat';
export const VAT_TREATMENTS = [
  { id: 'vatable', label: 'VATable 12%' },
  { id: 'zero-rated', label: 'Zero-rated sale' },
  { id: 'exempt', label: 'VAT-exempt sale' },
];

const PH_TITLES = ['BILLING STATEMENT', 'STATEMENT OF ACCOUNT'];
const GENERIC_TITLES = ['INVOICE', 'TAX INVOICE', 'BILLING STATEMENT'];
const GENERIC_CUSTOM = ['Tax ID', 'VAT No.', 'ABN', 'Supply date', 'Service period'];

export function modeConfig(mode) {
  const id = MODES.some((m) => m.id === mode) ? mode : DEFAULT_MODE;
  const isPh = id !== 'generic';
  return {
    id,
    isPh,
    defaultTitle: isPh ? 'BILLING STATEMENT' : 'INVOICE',
    titlePresets: isPh ? [...PH_TITLES] : [...GENERIC_TITLES],
    sellerTinPrefix: id === 'ph-nonvat' ? 'Non-VAT Reg. TIN' : id === 'ph-vat' ? 'VAT Reg. TIN' : null,
    numberPrefix: isPh ? 'BS-' : '',
    firstNumber: isPh ? 'BS-0001' : '1',
    show: {
      tins: isPh,
      birInvoiceNo: isPh,
      footer: isPh,
      vat: id === 'ph-vat',
      vatExemptNote: id === 'ph-nonvat',
      tax: !isPh,
      shipping: !isPh,
      shipTo: !isPh,
    },
    customFieldPresets: isPh ? [] : [...GENERIC_CUSTOM],
  };
}

const row = (key, label, value, extra = {}) => ({
  key,
  label,
  value,
  negative: false,
  iso: false,
  emphasis: false,
  ...extra,
});

export function totalsRows(doc, totals, label) {
  const mode = modeConfig(doc.mode).id;
  const f = doc.fields || {};
  const rows = [row('subtotal', label('subtotal_title'), totals.subtotal)];

  if (f.discounts !== false && f.discounts !== undefined) {
    const pct = f.discounts === '%' ? ` (${doc.discounts}%)` : '';
    rows.push(row('discount', `${label('discounts_title')}${pct}`, totals.discount, { negative: true }));
  }

  if (mode === 'ph-vat') {
    const text =
      doc.vat_treatment === 'zero-rated'
        ? 'Zero-rated sale'
        : doc.vat_treatment === 'exempt'
          ? 'VAT-exempt sale'
          : label('vat_title');
    rows.push(row('vat', text, totals.vat));
  } else if (mode === 'ph-nonvat' && doc.vat_exempt_note === true) {
    rows.push(row('vatExemptNote', 'VAT-exempt sale', null));
  }

  if (mode === 'generic') {
    if (f.tax !== false && f.tax !== undefined) {
      const pct = f.tax === '%' ? ` (${doc.tax}%)` : '';
      rows.push(row('tax', `${label('tax_title')}${pct}`, totals.tax));
    }
    if (f.shipping) rows.push(row('shipping', label('shipping_title'), totals.shipping));
  }

  rows.push(row('total', label('total_title'), totals.total, { iso: true }));

  if (f.withholding) {
    rows.push(
      row('withholding', `${label('withholding_title')} (${doc.withholding_rate}%)`, totals.withholding, { negative: true }),
    );
    rows.push(row('netPayable', label('net_payable_title'), totals.netPayable, { iso: true }));
  }

  if (!isZero(totals.amountPaid)) rows.push(row('amountPaid', label('amount_paid_title'), totals.amountPaid));

  rows.push(row('balance', label('balance_title'), totals.balance, { iso: true, emphasis: true }));
  return rows;
}
