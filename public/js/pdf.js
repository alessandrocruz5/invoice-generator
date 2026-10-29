// PDF document definition for pdfmake. Pure: no DOM, no pdfmake import; money comes from `totals`.
// The lazy pdfmake loader and download() live at the bottom; their DOM access is inside function bodies.
import { makeMoneyFormatter, isoSuffix } from './currency.js';
import { sanitizeForPdf, symbolOrCode } from './pdf-glyphs.js';
import { modeConfig, totalsRows } from './modes.js';
import { labelFor, isBlankItem } from './state.js';
import { PH_FOOTER_NOT_BIR, PH_FOOTER_NO_INPUT_TAX, FORM_2307_NOTE, QR_LABEL } from './copy.js';

const MARGIN = 40;
const LOGO_BOX = { w: 150, h: 60 };
const QR_BOX = { w: 120, h: 120 };
const PX_TO_PT = 0.75;
const MINUS = '−';
const FILENAME_UNSAFE = /[/\\:*?"<>|]/g;
const MAX_RATE_DECIMALS = 4;

const t = (s) => sanitizeForPdf(s);
const filled = (s) => typeof s === 'string' && s.trim() !== '';

export function pdfMoneyFormatter({ locale, currency, currencyDisplay }) {
  const symbolFmt = makeMoneyFormatter({ locale, currency, currencyDisplay });
  const codeFmt = makeMoneyFormatter({ locale, currency, currencyDisplay: 'code' });
  return (decimalString, opts) => symbolOrCode(symbolFmt(decimalString, opts), () => codeFmt(decimalString, opts));
}

function titleCase(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, space, ch) => space + ch.toUpperCase());
}

export function pdfFilename(title, number) {
  const name = [titleCase(title).trim(), String(number ?? '').trim()].filter(Boolean).join(' ');
  return `${name.replace(FILENAME_UNSAFE, '-')}.pdf`;
}

// `natural` is the image's size in CSS px; the result is in pt (0.75 pt per px), scaled down to fit `box`, never up.
export function fitBox(natural, box) {
  const w = Number(natural?.width) * PX_TO_PT;
  const h = Number(natural?.height) * PX_TO_PT;
  if (!(w > 0) || !(h > 0)) return null;
  if (w <= box.w && h <= box.h) return { width: w, height: h };
  if (w / box.w >= h / box.h) return { width: box.w, height: (h * box.w) / w };
  return { width: (w * box.h) / h, height: box.h };
}

function image(dataUrl, natural, box) {
  const size = fitBox(natural, box);
  return size ? { image: dataUrl, width: size.width, height: size.height } : { image: dataUrl, fit: [box.w, box.h] };
}

function typedDecimals(str) {
  const i = typeof str === 'string' ? str.indexOf('.') : -1;
  return i === -1 ? 0 : str.length - i - 1;
}

function metaRows(doc, config, label, date) {
  const rows = [
    [label('date_title'), date(doc.date)],
    [label('payment_terms_title'), doc.payment_terms],
    [label('due_date_title'), date(doc.due_date)],
    [label('purchase_order_title'), doc.purchase_order],
  ];
  if (config.show.birInvoiceNo) rows.push([label('bir_invoice_title'), doc.bir_invoice_no]);
  for (const f of Array.isArray(doc.custom_fields) ? doc.custom_fields : []) rows.push([f?.label, f?.value]);
  return rows
    .filter(([, value]) => filled(value))
    .map(([name, value]) => [{ text: t(name), bold: true }, { text: t(value), alignment: 'right' }]);
}

function itemsTable(doc, totals, label, money) {
  const right = { alignment: 'right' };
  const body = [
    [
      { text: t(label('item_header')), bold: true },
      { text: t(label('quantity_header')), bold: true, ...right },
      { text: t(label('unit_cost_header')), bold: true, ...right },
      { text: t(label('amount_header')), bold: true, ...right },
    ],
  ];
  // Keep the original index: totals.amounts is aligned with doc.items, so never filter first.
  doc.items.forEach((item, i) => {
    if (isBlankItem(item)) return;
    const name = { text: t(item.name), bold: true };
    body.push([
      filled(item.description) ? { stack: [name, { text: t(item.description), fontSize: 9, color: '#444444' }] } : name,
      { text: t(item.quantity), ...right },
      { text: money(item.unit_cost, { maxFractionDigits: Math.min(MAX_RATE_DECIMALS, typedDecimals(item.unit_cost)) }), ...right },
      { text: money(totals.amounts[i]), ...right },
    ]);
  });
  return {
    table: { headerRows: 1, dontBreakRows: true, widths: ['*', 60, 90, 90], body },
    layout: 'lightHorizontalLines',
    margin: [0, 16, 0, 12],
  };
}

function totalsStack(doc, totals, label, money, currency) {
  const rows = totalsRows(doc, totals, label).map((r) => {
    const size = r.emphasis ? 12 : 10;
    const name = { text: t(r.label + (r.iso ? isoSuffix(currency) : '')), bold: r.emphasis, fontSize: size };
    if (r.value === null) return { columns: [name], margin: [0, 2, 0, 2] };
    const value = (r.negative ? MINUS : '') + t(money(r.value));
    return {
      columns: [{ ...name, width: '*' }, { text: value, alignment: 'right', bold: r.emphasis, fontSize: size, width: 'auto' }],
      columnGap: 8,
      margin: [0, 2, 0, 2],
    };
  });
  return { stack: rows, unbreakable: true };
}

function textBlock(title, text) {
  return { stack: [{ text: t(title), bold: true, margin: [0, 0, 0, 2] }, { text: t(text) }], margin: [0, 0, 0, 10] };
}

function qrBlock(doc, images) {
  if (!doc.payment_qr) return null;
  return {
    stack: [{ text: t(QR_LABEL), bold: true, margin: [0, 0, 0, 4] }, image(doc.payment_qr, images?.qr, QR_BOX)],
    margin: [0, 0, 0, 10],
  };
}

function footerFor(doc, config) {
  const lines = [];
  if (config.show.footer && doc.footer?.not_bir_invoice) lines.push(PH_FOOTER_NOT_BIR);
  if (config.show.footer && doc.footer?.not_valid_input_tax) lines.push(PH_FOOTER_NO_INPUT_TAX);
  return lines;
}

export function buildDocDefinition(state, totals, formatters) {
  const doc = state;
  const { money, date, images = {} } = formatters;
  const label = formatters.label || ((key) => labelFor(doc, key));
  const config = modeConfig(doc.mode);
  const title = label('header');

  const from = [];
  if (filled(doc.from)) from.push({ text: t(doc.from) });
  if (config.show.tins && config.sellerTinPrefix && filled(doc.seller_tin)) {
    from.push({ text: t(`${config.sellerTinPrefix} ${doc.seller_tin}`), margin: [0, 2, 0, 0] });
  }

  const billTo = [{ text: t(label('to_title')), bold: true, margin: [0, 0, 0, 2] }];
  if (filled(doc.to)) billTo.push({ text: t(doc.to) });
  if (config.show.tins && filled(doc.client_tin)) {
    billTo.push({ text: t(`${label('client_tin_title')} ${doc.client_tin}`), margin: [0, 2, 0, 0] });
  }
  if (config.show.shipTo && filled(doc.ship_to)) {
    billTo.push({ text: t(label('ship_to_title')), bold: true, margin: [0, 8, 0, 2] }, { text: t(doc.ship_to) });
  }

  const meta = metaRows(doc, config, label, date);
  const metaColumn = meta.length
    ? { width: 220, table: { widths: ['auto', '*'], body: meta }, layout: 'noBorders' }
    : { width: 220, text: '' };

  const notes = [filled(doc.notes) ? doc.notes : '', doc.fields?.withholding && doc.form_2307_note ? FORM_2307_NOTE : '']
    .filter(Boolean)
    .join('\n');
  const left = [];
  if (notes) left.push(textBlock(label('notes_title'), notes));
  if (filled(doc.terms)) left.push(textBlock(label('terms_title'), doc.terms));
  if (filled(doc.payment_details)) left.push(textBlock(label('payment_title'), doc.payment_details));
  const qr = qrBlock(doc, images);
  if (qr) left.push(qr);

  const footerLines = footerFor(doc, config);
  const small = { fontSize: 7.5, color: '#444444' };

  const content = [
    {
      columns: [
        // Wrapped in a stack: an image's own `width` would otherwise become the column width.
        doc.logo ? { width: '*', stack: [image(doc.logo, images.logo, LOGO_BOX)] } : { width: '*', text: '' },
        {
          width: 'auto',
          stack: [
            { text: t(title), fontSize: 22, bold: true, alignment: 'right' },
            { text: t(`# ${doc.number}`), alignment: 'right' },
          ],
        },
      ],
    },
    { stack: from, margin: [0, 12, 0, 12] },
    { columns: [{ width: '*', stack: billTo }, metaColumn], columnGap: 20 },
    itemsTable(doc, totals, label, money),
    { columns: [{ width: '*', stack: left }, { width: 200, ...totalsStack(doc, totals, label, money, doc.currency) }], columnGap: 20 },
  ];

  return {
    info: { title: t(`${title} ${doc.number}`) },
    pageSize: doc.settings?.paper === 'LETTER' ? 'LETTER' : 'A4',
    pageMargins: MARGIN,
    defaultStyle: { fontSize: 10 },
    content,
    footer: (currentPage, pageCount) => {
      const stack = [];
      if (pageCount > 1) stack.push({ text: `Page ${currentPage} of ${pageCount}`, alignment: 'center', ...small });
      if (currentPage === pageCount) for (const line of footerLines) stack.push({ text: t(line), alignment: 'center', ...small });
      return stack.length ? { stack, margin: [MARGIN, 4, MARGIN, 0] } : { text: '' };
    },
  };
}

// ---- lazy load and download --------------------------------------------------------------------------

const LOAD_ERROR = 'Could not load the PDF tool. Check your connection and try again.';
let pdfMakePromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(LOAD_ERROR));
    document.head.appendChild(el);
  });
}

// Fetched on the first download only. vfs_fonts.js registers itself with the global pdfMake when it runs.
export function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = loadScript('vendor/pdfmake/pdfmake.min.js')
      .then(() => loadScript('vendor/pdfmake/vfs_fonts.js'))
      .then(() => globalThis.pdfMake)
      .catch(() => {
        pdfMakePromise = null;
        throw new Error(LOAD_ERROR);
      });
  }
  return pdfMakePromise;
}

export async function downloadPdf(def, filename) {
  const pdfMake = await loadPdfMake();
  await pdfMake.createPdf(def).download(filename);
}
