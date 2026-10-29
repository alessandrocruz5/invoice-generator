// Renders the editable sheet and syncs the sidebar. DOM only through createElement and textContent.
// Every editable control carries data-path (a dot path into the document) and data-kind; main.js binds them.
// Region builders take ctx = { doc, view, invalid }.
import { MODES, VAT_TREATMENTS, totalsRows } from './modes.js';
import { currencyList, NUMBER_FORMATS, roundingNote, toDisplayNumber, isoSuffix } from './currency.js';
import { DEFAULT_LABELS, MAX_CUSTOM_FIELDS, ITEM_UNITS } from './state.js';
import { LIMITS, isZero } from './calc.js';
import { WITHHOLDING_PRESETS, CUSTOM_PRESET, helperText } from './withholding.js';
import { PH_FOOTER_NOT_BIR, PH_FOOTER_NO_INPUT_TAX, FORM_2307_NOTE, QR_LABEL } from './copy.js';

const NUMERIC_KINDS = new Set(['qty', 'rate', 'percent', 'money']);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ---- paths -----------------------------------------------------------------------------------------

export function idFor(path) {
  return `f-${path.replace(/\./g, '-')}`;
}

function segments(path) {
  const parts = path.split('.');
  if (parts.some((p) => p === '' || UNSAFE_KEYS.has(p))) throw new Error(`Bad path: ${path}`);
  return parts.map((p) => (/^\d+$/.test(p) ? Number.parseInt(p, 10) : p));
}

export function getPath(obj, path) {
  let cur = obj;
  for (const key of segments(path)) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

export function setPath(obj, path, value) {
  const keys = segments(path);
  const last = keys.pop();
  let cur = obj;
  for (const key of keys) {
    if (cur[key] === null || typeof cur[key] !== 'object') throw new Error(`Bad path: ${path}`);
    cur = cur[key];
  }
  cur[last] = value;
}

// ---- element helpers ---------------------------------------------------------------------------------

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'text') node.textContent = value;
    else if (name === 'value') node.value = value;
    else if (name === 'checked' || name === 'disabled' || name === 'hidden') node[name] = Boolean(value);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  node.append(...children);
  return node;
}

function bound(tag, path, kind, attrs) {
  return h(tag, { id: idFor(path), 'data-path': path, 'data-kind': kind, ...attrs });
}

// A value input. Numeric kinds show the raw invalid text when there is one, so typing is never rewritten.
function field(ctx, path, kind, attrs = {}) {
  let value = getPath(ctx.doc, path) ?? '';
  if (NUMERIC_KINDS.has(kind)) {
    value = ctx.invalid.has(path) ? ctx.invalid.get(path).raw : toDisplayNumber(value, ctx.view.decimalMark);
    attrs = { inputmode: 'decimal', ...attrs };
  }
  return bound('input', path, kind, { type: 'text', autocomplete: 'off', class: 'field', value, ...attrs });
}

function area(ctx, path, attrs = {}) {
  return bound('textarea', path, 'text', { class: 'field grow', rows: 1, value: getPath(ctx.doc, path) ?? '', ...attrs });
}

function labelField(ctx, key, attrs = {}) {
  return bound('input', `labels.${key}`, 'label', {
    type: 'text',
    autocomplete: 'off',
    class: 'field label',
    value: ctx.view.label(key) ?? '',
    'aria-label': `${DEFAULT_LABELS[key] ?? key} label`,
    ...attrs,
  });
}

// A checkbox bound to a boolean path, wrapped in its label. `text` is the label's visible content.
function checkbox(ctx, path, text, attrs = {}) {
  return h('label', { class: 'check' }, [
    bound('input', path, 'check', { type: 'checkbox', checked: getPath(ctx.doc, path) === true, ...attrs }),
    h('span', { text }),
  ]);
}

// A select bound to a string path. options: [{ id, label }]. A placeholder is an extra disabled option with value ''.
function selectField(ctx, path, options, attrs = {}, placeholder = null) {
  const choices = options.map((o) => h('option', { value: o.id, text: o.label }));
  if (placeholder) choices.unshift(h('option', { value: '', text: placeholder, disabled: true }));
  const el = bound('select', path, 'select', { class: 'field', ...attrs });
  el.append(...choices);
  el.value = getPath(ctx.doc, path) ?? '';
  return el;
}

function datalist(id, options) {
  return h('datalist', { id }, options.map((value) => h('option', { value })));
}

function actionButton(action, text, attrs = {}) {
  return h('button', { type: 'button', 'data-action': action, text, ...attrs });
}

function tinField(ctx, path, ariaLabel) {
  return bound('input', path, 'tin', {
    type: 'text',
    class: 'field tin',
    inputmode: 'numeric',
    autocomplete: 'off',
    value: getPath(ctx.doc, path) ?? '',
    'aria-label': ariaLabel,
    placeholder: '000-000-000-00000',
  });
}

// Textareas grow with their content; nothing scrolls inside the sheet. The element must be in the document.
export function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// ---- sheet regions ------------------------------------------------------------------------------------

function header(ctx) {
  const { config } = ctx.view;
  return h('div', { class: 'sheet-header' }, [
    logoSlot(ctx),
    h('div', { class: 'title-block' }, [
      labelField(ctx, 'header', { class: 'field label title', list: 'dl-title', 'aria-label': 'Title' }),
      datalist('dl-title', config.titlePresets),
      h('div', { class: 'number-line' }, [
        h('span', { class: 'hash', 'aria-hidden': 'true', text: '#' }),
        field(ctx, 'number', 'text', {
          class: 'field number',
          'aria-label': 'Number',
          title: "Numbers aren't checked across devices. Keep your own sequence.",
        }),
      ]),
    ]),
  ]);
}

function fromBlock(ctx) {
  const { config } = ctx.view;
  const children = [area(ctx, 'from', { 'aria-label': 'From', placeholder: 'Who is this from?' })];
  if (config.show.tins) {
    children.push(
      h('div', { class: 'tin-line' }, [
        h('span', { class: 'tin-prefix', text: config.sellerTinPrefix }),
        tinField(ctx, 'seller_tin', 'Seller TIN'),
      ]),
    );
  }
  return h('div', { class: 'block from-block' }, children);
}

function partiesBlock(ctx) {
  const { show } = ctx.view.config;
  const children = [labelField(ctx, 'to_title'), area(ctx, 'to', { 'aria-label': 'Bill To', placeholder: 'Who is this to?' })];
  if (show.tins) {
    children.push(
      h('div', { class: 'tin-line' }, [
        labelField(ctx, 'client_tin_title', { class: 'field label short' }),
        tinField(ctx, 'client_tin', 'Client TIN'),
      ]),
    );
  }
  if (show.shipTo) {
    children.push(
      h('div', { class: 'ship-to' }, [
        labelField(ctx, 'ship_to_title'),
        area(ctx, 'ship_to', { 'aria-label': 'Ship To', placeholder: '(optional)' }),
      ]),
    );
  }
  return h('div', { class: 'block parties' }, children);
}

function metaRow(ctx, labelKey, path, kind, attrs = {}) {
  return h('div', { class: 'meta-row' }, [
    labelField(ctx, labelKey),
    field(ctx, path, kind, { 'aria-label': DEFAULT_LABELS[labelKey], ...attrs }),
  ]);
}

function customFields(ctx) {
  const list = Array.isArray(ctx.doc.custom_fields) ? ctx.doc.custom_fields : [];
  const presets = ctx.view.config.customFieldPresets;
  const rows = list.map((_, i) =>
    h('div', { class: 'meta-row custom-row' }, [
      field(ctx, `custom_fields.${i}.label`, 'text', {
        class: 'field label',
        'aria-label': `Custom field ${i + 1} label`,
        placeholder: 'Label',
        list: presets.length ? 'dl-custom' : undefined,
        maxlength: 100,
      }),
      field(ctx, `custom_fields.${i}.value`, 'text', { 'aria-label': `Custom field ${i + 1} value`, maxlength: 500 }),
      actionButton('remove-custom', '×', {
        id: `a-remove-custom-${i}`,
        class: 'icon remove',
        'data-index': i,
        'aria-label': `Remove custom field ${i + 1}`,
      }),
    ]),
  );
  const add = actionButton('add-custom', '+ Custom field', {
    id: 'a-add-custom',
    class: 'add',
    disabled: list.length >= MAX_CUSTOM_FIELDS,
  });
  const children = [...rows, add];
  if (presets.length) children.push(datalist('dl-custom', presets));
  return h('div', { class: 'custom-fields' }, children);
}

function metaBlock(ctx) {
  const rows = [
    metaRow(ctx, 'date_title', 'date', 'date', { type: 'date' }),
    metaRow(ctx, 'payment_terms_title', 'payment_terms', 'text', { placeholder: 'Net 30' }),
    metaRow(ctx, 'due_date_title', 'due_date', 'date', { type: 'date' }),
    metaRow(ctx, 'purchase_order_title', 'purchase_order', 'text'),
  ];
  if (ctx.view.config.show.birInvoiceNo) rows.push(metaRow(ctx, 'bir_invoice_title', 'bir_invoice_no', 'text'));
  return h('div', { class: 'block meta' }, [...rows, customFields(ctx)]);
}

// ---- images ---------------------------------------------------------------------------------------------

// Add button or image with ×, plus the hidden file input and the (initially empty) inline error. main.js handles
// the pick, remove and upload events; `target` is the document key ('logo' or 'payment_qr').
function imageUpload(ctx, target, { addText, alt, removeLabel, caption = null }) {
  const src = ctx.doc[target];
  const children = [];
  if (typeof src === 'string' && src !== '') {
    children.push(
      h('div', { class: 'image-row' }, [
        h('img', { class: `image image-${target}`, src, alt }),
        actionButton('remove-image', '×', {
          id: `a-remove-${target}`,
          class: 'icon remove',
          'data-target': target,
          'aria-label': removeLabel,
        }),
      ]),
    );
    if (caption) children.push(h('p', { class: 'image-caption', text: caption }));
  } else {
    children.push(actionButton('pick-image', addText, { id: `a-pick-${target}`, class: 'add left', 'data-target': target }));
  }
  children.push(
    h('input', { type: 'file', id: `up-${target}`, 'data-upload': target, accept: 'image/png,image/jpeg', hidden: true, tabindex: '-1' }),
    h('p', { id: `err-${target}`, class: 'upload-error', role: 'alert' }),
  );
  return children;
}

function logoSlot(ctx) {
  return h(
    'div',
    { id: 'logo-slot', class: 'logo-slot' },
    imageUpload(ctx, 'logo', { addText: '+ Add your logo', alt: 'Logo', removeLabel: 'Remove logo' }),
  );
}

// ---- items -----------------------------------------------------------------------------------------------

function itemRow(ctx, i, amountText) {
  return h('div', { class: 'item' }, [
    field(ctx, `items.${i}.name`, 'text', { class: 'field item-name', 'aria-label': `Item ${i + 1} name`, maxlength: 200 }),
    area(ctx, `items.${i}.description`, {
      class: 'field grow item-desc',
      'aria-label': `Item ${i + 1} description`,
      placeholder: 'Description (optional)',
      maxlength: 1000,
    }),
    field(ctx, `items.${i}.quantity`, 'qty', { class: 'field num item-qty', 'aria-label': `Item ${i + 1} quantity` }),
    selectField(ctx, `items.${i}.unit`, ITEM_UNITS, { class: 'field item-unit', 'aria-label': `Item ${i + 1} unit` }),
    field(ctx, `items.${i}.unit_cost`, 'rate', { class: 'field num item-rate', 'aria-label': `Item ${i + 1} rate` }),
    h('span', { class: 'item-amount', 'data-computed': `amount-${i}`, text: amountText }),
    actionButton('remove-item', '×', {
      id: `a-remove-item-${i}`,
      class: 'icon remove item-remove',
      'data-index': i,
      'aria-label': `Remove item ${i + 1}`,
    }),
  ]);
}

function itemsSection(ctx, computed) {
  const { doc } = ctx;
  const columnLabel = (key, cls) => labelField(ctx, key, { class: `field label ${cls}` });
  return h('section', { id: 'items-section', class: 'items-section', 'aria-label': 'Items' }, [
    h('div', { class: 'items-head' }, [
      columnLabel('item_header', 'col-item'),
      columnLabel('quantity_header', 'col-qty num'),
      columnLabel('unit_header', 'col-unit'),
      columnLabel('unit_cost_header', 'col-rate num'),
      columnLabel('amount_header', 'col-amount num'),
    ]),
    ...doc.items.map((_, i) => itemRow(ctx, i, computed[`amount-${i}`])),
    actionButton('add-item', '+ Line item', { id: 'a-add-item', class: 'add left', disabled: doc.items.length >= LIMITS.items }),
  ]);
}

// ---- totals ----------------------------------------------------------------------------------------------

// Rows that carry an editable label: totals row key -> label key.
const ROW_LABEL_KEYS = {
  subtotal: 'subtotal_title',
  discount: 'discounts_title',
  vat: 'vat_title',
  tax: 'tax_title',
  shipping: 'shipping_title',
  total: 'total_title',
  withholding: 'withholding_title',
  netPayable: 'net_payable_title',
  amountPaid: 'amount_paid_title',
  balance: 'balance_title',
};

// The rows the PDF prints, plus Amount Paid always: it is an input, so it can't appear only once it is non-zero.
function editorRows(doc, view) {
  const rows = totalsRows(doc, view.totals, view.label);
  if (!rows.some((r) => r.key === 'amountPaid')) {
    const at = rows.findIndex((r) => r.key === 'balance');
    rows.splice(at, 0, {
      key: 'amountPaid',
      label: view.label('amount_paid_title'),
      value: view.totals.amountPaid,
      negative: false,
      iso: false,
      emphasis: false,
    });
  }
  return rows;
}

function valueText(view, row) {
  if (row.value === null) return '';
  const text = view.fmt(row.value);
  return row.negative && !isZero(row.value) ? `−${text}` : text;
}

// A row's label is "<label text><suffix>", e.g. "Discount" + " (10%)". The suffix is computed text.
function suffixOf(row, labelText) {
  return row.label.startsWith(labelText) ? row.label.slice(labelText.length) : '';
}

// Every computed text on the sheet, keyed by its data-computed name.
function computedTexts(doc, view) {
  const texts = {};
  view.totals.amounts.forEach((amount, i) => {
    texts[`amount-${i}`] = view.fmt(amount);
  });
  for (const row of editorRows(doc, view)) {
    texts[row.key] = valueText(view, row);
    const labelKey = ROW_LABEL_KEYS[row.key];
    if (labelKey) texts[`${row.key}-suffix`] = suffixOf(row, view.label(labelKey) ?? '');
  }
  return texts;
}

function totalsRow(ctx, row, computed) {
  const { doc, view } = ctx;
  const labelKey = ROW_LABEL_KEYS[row.key];
  // The zero-rated and exempt VAT labels, and the exempt note, are fixed text, not editable labels.
  const fixedLabel = row.key === 'vatExemptNote' || (row.key === 'vat' && doc.vat_treatment !== 'vatable');
  const children = [];
  if (fixedLabel || !labelKey) {
    children.push(h('span', { class: 'row-label', text: row.label }));
  } else {
    children.push(labelField(ctx, labelKey, { class: 'field label row-label' }));
    children.push(h('span', { class: 'suffix', 'data-computed': `${row.key}-suffix`, text: computed[`${row.key}-suffix`] }));
  }
  if (row.iso) children.push(h('span', { class: 'suffix iso', text: isoSuffix(doc.currency) }));
  if (row.key === 'amountPaid') {
    children.push(field(ctx, 'amount_paid', 'money', { class: 'field num row-input', 'aria-label': 'Amount paid', placeholder: '0' }));
  } else if (row.value !== null) {
    children.push(h('span', { class: 'row-value', 'data-computed': row.key, text: computed[row.key] }));
  }
  return h('div', { class: `t-row${row.emphasis ? ' emphasis' : ''}`, 'data-row': row.key }, children);
}

function segmentButton(key, value, text, current) {
  return actionButton('adjust', text, {
    id: `a-mode-${key}-${value === '%' ? 'pct' : value}`,
    class: 'seg',
    'data-field': key,
    'data-value': value,
    'aria-pressed': String(current === value),
  });
}

function offButton(key, label) {
  return actionButton('adjust', '×', {
    id: `a-off-${key}`,
    class: 'icon remove',
    'data-field': key,
    'data-value': 'off',
    'aria-label': `Remove ${label}`,
  });
}

// Controls under a discount or tax row: percent/flat toggle, the value, and ×.
function percentOrFlatControls(ctx, key, name) {
  const current = ctx.doc.fields[key] === '%' ? '%' : 'flat';
  const percent = current === '%';
  return h('div', { class: 'row-controls', role: 'group', 'aria-label': `${name} settings` }, [
    segmentButton(key, '%', '%', current),
    segmentButton(key, 'flat', 'Flat', current),
    // The value lives at the document key of the same name (discounts, tax).
    fieldValue(ctx, key, percent ? 'percent' : 'money', percent ? `${name} percent` : `${name} amount`),
    offButton(key, name.toLowerCase()),
  ]);
}

function fieldValue(ctx, path, kind, ariaLabel) {
  return field(ctx, path, kind, { class: 'field num control-input', 'aria-label': ariaLabel, placeholder: '0' });
}

function shippingControls(ctx) {
  return h('div', { class: 'row-controls', role: 'group', 'aria-label': 'Shipping settings' }, [
    fieldValue(ctx, 'shipping', 'money', 'Shipping amount'),
    offButton('shipping', 'shipping'),
  ]);
}

function withholdingControls(ctx) {
  const { doc } = ctx;
  const presets = [...WITHHOLDING_PRESETS.map((p) => ({ id: p.id, label: p.label })), { id: CUSTOM_PRESET, label: 'Custom rate' }];
  return h('div', { class: 'row-controls withholding-controls', role: 'group', 'aria-label': 'Withholding settings' }, [
    selectField(ctx, 'withholding_preset', presets, { 'aria-label': 'Withholding preset', 'aria-describedby': 'withholding-help' }, 'Choose a rate…'),
    fieldValue(ctx, 'withholding_rate', 'percent', 'Withholding rate (%)'),
    h('span', { class: 'unit', 'aria-hidden': 'true', text: '%' }),
    offButton('withholding', 'withholding'),
    h('p', { id: 'withholding-help', class: 'help-text', hidden: helperText(doc.withholding_preset) === null, text: helperText(doc.withholding_preset) ?? '' }),
  ]);
}

function vatControls(ctx) {
  return h('div', { class: 'row-controls', role: 'group', 'aria-label': 'VAT settings' }, [
    selectField(ctx, 'vat_treatment', VAT_TREATMENTS, { 'aria-label': 'VAT treatment' }),
  ]);
}

function adderButtons(ctx) {
  const { doc, view } = ctx;
  const { show } = view.config;
  const off = (key) => doc.fields[key] === false;
  const add = (key, value, text) =>
    actionButton('adjust', text, { id: `a-add-${key}`, class: 'add', 'data-field': key, 'data-value': value });
  const buttons = [];
  if (off('discounts')) buttons.push(add('discounts', '%', '+ Discount'));
  if (show.tax && off('tax')) buttons.push(add('tax', '%', '+ Tax'));
  if (show.shipping && off('shipping')) buttons.push(add('shipping', 'on', '+ Shipping'));
  if (off('withholding')) buttons.push(add('withholding', 'on', '+ Withholding'));
  return buttons;
}

function totalsSection(ctx, computed) {
  const { doc, view } = ctx;
  const children = [];
  for (const row of editorRows(doc, view)) {
    children.push(totalsRow(ctx, row, computed));
    if (row.key === 'discount') children.push(percentOrFlatControls(ctx, 'discounts', 'Discount'));
    else if (row.key === 'tax') children.push(percentOrFlatControls(ctx, 'tax', 'Tax'));
    else if (row.key === 'shipping') children.push(shippingControls(ctx));
    else if (row.key === 'withholding') children.push(withholdingControls(ctx));
    else if (row.key === 'vat') children.push(vatControls(ctx));
  }
  if (view.config.show.vatExemptNote) {
    children.push(checkbox(ctx, 'vat_exempt_note', "Show 'VAT-exempt sale' (8% filers)"));
  }
  const adders = adderButtons(ctx);
  if (adders.length) children.push(h('div', { class: 'adders' }, adders));
  return h('div', { id: 'totals-section', class: 'totals-section' }, children);
}

// Keeps the withholding preset select and its helper text in step with the document without a rebuild,
// because typing a custom rate switches the preset to "custom" while the rate input has focus.
function syncWithholding(form, doc) {
  const select = form.querySelector(`#${idFor('withholding_preset')}`);
  if (select && select.value !== doc.withholding_preset) select.value = doc.withholding_preset;
  const help = form.querySelector('#withholding-help');
  if (help) {
    const text = helperText(doc.withholding_preset) ?? '';
    if (help.textContent !== text) help.textContent = text;
    help.hidden = text === '';
  }
}

// ---- notes, payment, footer ------------------------------------------------------------------------------

function notesSection(ctx) {
  const { doc } = ctx;
  const children = [
    labelField(ctx, 'notes_title'),
    area(ctx, 'notes', { 'aria-label': 'Notes' }),
    labelField(ctx, 'terms_title'),
    area(ctx, 'terms', { 'aria-label': 'Terms' }),
  ];
  if (doc.fields.withholding === true) {
    children.push(checkbox(ctx, 'form_2307_note', `Add “${FORM_2307_NOTE}”`));
  }
  return h('div', { id: 'notes-section', class: 'notes-section' }, children);
}

function paymentSection(ctx) {
  return h('div', { id: 'payment-section', class: 'payment-section' }, [
    labelField(ctx, 'payment_title'),
    area(ctx, 'payment_details', {
      'aria-label': 'Payment details',
      placeholder: 'Bank, account name and number, GCash or Maya number',
    }),
    ...imageUpload(ctx, 'payment_qr', {
      addText: '+ Add QR image',
      alt: 'Payment QR code',
      removeLabel: 'Remove QR image',
      caption: QR_LABEL,
    }),
  ]);
}

// PH modes only: each line is printed on the document when its box is checked.
function footerSection(ctx) {
  const children = [];
  if (ctx.view.config.show.footer) {
    const line = (path, text, offText) =>
      checkbox(ctx, path, getPath(ctx.doc, path) === true ? text : offText);
    children.push(
      line('footer.not_bir_invoice', PH_FOOTER_NOT_BIR, "Add the 'not a BIR invoice' line"),
      line('footer.not_valid_input_tax', PH_FOOTER_NO_INPUT_TAX, "Add the 'not valid for claim of input tax' line"),
    );
  }
  return h('div', { id: 'sheet-footer', class: 'sheet-footer' }, children);
}

// Rebuilds the whole sheet.
export function renderSheet(form, doc, view, invalid) {
  const ctx = { doc, view, invalid };
  const computed = computedTexts(doc, view);
  form.replaceChildren(
    header(ctx),
    fromBlock(ctx),
    h('div', { class: 'sheet-columns' }, [partiesBlock(ctx), metaBlock(ctx)]),
    itemsSection(ctx, computed),
    h('div', { class: 'sheet-bottom' }, [
      h('div', { class: 'sheet-bottom-left' }, [notesSection(ctx), paymentSection(ctx)]),
      totalsSection(ctx, computed),
    ]),
    footerSection(ctx),
  );
  for (const el of form.querySelectorAll('textarea')) autoGrow(el);
}

// Updates computed text only (amount cells and totals) through textContent, never rebuilding controls.
export function updateComputed(form, doc, view) {
  const texts = computedTexts(doc, view);
  for (const el of form.querySelectorAll('[data-computed]')) {
    const text = texts[el.dataset.computed];
    if (text !== undefined && el.textContent !== text) el.textContent = text;
  }
  syncWithholding(form, doc);
}

// ---- sidebar ------------------------------------------------------------------------------------------

function option(value, text) {
  return h('option', { value, text });
}

function fillOnce(select, build) {
  if (select && select.options.length === 0) select.append(...build());
}

function localeText(code) {
  if (code === 'auto') return 'Browser default';
  try {
    return `${code} (${new Intl.NumberFormat(code).format('1234.56')})`;
  } catch {
    return code;
  }
}

// Builds the option lists on first call, then syncs every setting control with the document.
export function renderSidebar(sidebarEl, doc, view) {
  const select = (name) => sidebarEl.querySelector(`select[data-setting="${name}"]`);

  fillOnce(select('mode'), () => MODES.map((m) => option(m.id, m.label)));
  fillOnce(select('currency'), () => {
    const { common, all } = currencyList();
    return [
      h('optgroup', { label: 'Common' }, common.map((c) => option(c.code, c.label))),
      h('optgroup', { label: 'All currencies' }, all.map((c) => option(c.code, c.label))),
    ];
  });
  fillOnce(select('locale'), () => NUMBER_FORMATS.map((code) => option(code, localeText(code))));

  const values = { mode: view.config.id, currency: doc.currency, locale: doc.settings.locale, paper: doc.settings.paper };
  for (const [name, value] of Object.entries(values)) {
    const el = select(name);
    if (el && el.value !== value) el.value = value;
  }
  for (const radio of sidebarEl.querySelectorAll('input[data-setting="currencyDisplay"]')) {
    radio.checked = radio.value === doc.settings.currencyDisplay;
  }

  const note = sidebarEl.querySelector('#currency-note');
  if (note) {
    const text = roundingNote(doc.currency);
    note.textContent = text ?? '';
    note.hidden = text === null;
  }
}
