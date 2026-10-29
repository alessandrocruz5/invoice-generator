import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals } from '../public/js/calc.js';
import { minorUnits } from '../public/js/currency.js';
import { createDefaultDocument, labelFor } from '../public/js/state.js';
import { PH_FOOTER_NOT_BIR, PH_FOOTER_NO_INPUT_TAX } from '../public/js/copy.js';
import { buildDocDefinition, fitBox, pdfFilename, pdfMoneyFormatter } from '../public/js/pdf.js';

const item = (name, quantity, unit_cost) => ({ id: name || 'x', name, description: '', quantity, unit_cost });

function build(mutate = () => {}, { display = 'symbol', images } = {}) {
  const doc = createDefaultDocument({ today: '2026-10-28', language: 'en-US', makeId: () => 'id' });
  doc.items = [item('Design work', '1', '1500')];
  mutate(doc);
  const totals = computeTotals(doc, minorUnits(doc.currency));
  const money = pdfMoneyFormatter({ locale: 'en-US', currency: doc.currency, currencyDisplay: display });
  const formatters = { money, date: (iso) => iso, label: (k) => labelFor(doc, k), images: images ?? { logo: null, qr: null } };
  return { doc, totals, def: buildDocDefinition(doc, totals, formatters) };
}

const json = (def) => JSON.stringify(def);
const footerText = (def, page, count) => json(def.footer(page, count));
const itemsTable = (def) => def.content.find((c) => c.table?.headerRows === 1);

test('definition shape: page, margins, items table flags', () => {
  const { def } = build();
  assert.ok(Array.isArray(def.content));
  assert.equal(def.pageSize, 'LETTER'); // en-US default paper
  assert.equal(def.pageMargins, 40);
  const table = itemsTable(def).table;
  assert.equal(table.headerRows, 1);
  assert.equal(table.dontBreakRows, true);
});

test('paper follows settings', () => {
  assert.equal(build((d) => (d.settings.paper = 'A4')).def.pageSize, 'A4');
});

test('THB falls back to the code; PHP keeps the peso sign', () => {
  const thb = build((d) => (d.currency = 'THB'), { display: 'narrowSymbol' });
  assert.ok(json(thb.def).includes('THB'));
  assert.ok(!json(thb.def).includes('฿'));
  assert.ok(json(build().def).includes('₱'));
});

test('PH footer prints on the last page only', () => {
  const { def } = build();
  assert.ok(footerText(def, 2, 2).includes(PH_FOOTER_NOT_BIR));
  assert.ok(!footerText(def, 1, 2).includes(PH_FOOTER_NOT_BIR));
  assert.ok(footerText(def, 1, 1).includes(PH_FOOTER_NOT_BIR));
});

test('second footer line follows its own toggle', () => {
  const { def } = build((d) => (d.footer.not_valid_input_tax = true));
  assert.ok(footerText(def, 1, 1).includes(PH_FOOTER_NO_INPUT_TAX));
  assert.ok(!footerText(build().def, 1, 1).includes(PH_FOOTER_NO_INPUT_TAX));
});

test('PH footer is absent when switched off and in generic mode', () => {
  const off = build((d) => {
    d.footer.not_bir_invoice = false;
  });
  assert.ok(!footerText(off.def, 2, 2).includes(PH_FOOTER_NOT_BIR));
  const generic = build((d) => {
    d.mode = 'generic';
    d.footer.not_valid_input_tax = true;
  });
  const text = footerText(generic.def, 2, 2);
  assert.ok(!text.includes(PH_FOOTER_NOT_BIR));
  assert.ok(!text.includes(PH_FOOTER_NO_INPUT_TAX));
});

test('"Page X of Y" only when there is more than one page', () => {
  const { def } = build();
  assert.ok(footerText(def, 1, 2).includes('Page 1 of 2'));
  assert.ok(!footerText(def, 1, 1).includes('Page'));
});

test('fitBox converts px to pt and never upscales', () => {
  assert.deepEqual(fitBox({ width: 100, height: 100 }, { w: 120, h: 120 }), { width: 75, height: 75 });
  assert.deepEqual(fitBox({ width: 400, height: 200 }, { w: 120, h: 120 }), { width: 120, height: 60 });
  assert.deepEqual(fitBox({ width: 200, height: 400 }, { w: 120, h: 120 }), { width: 60, height: 120 });
  assert.equal(fitBox(null, { w: 120, h: 120 }), null);
  assert.equal(fitBox({ width: 0, height: 10 }, { w: 120, h: 120 }), null);
});

test('QR is fitted inside 120 x 120 pt and labelled', () => {
  const qr = 'data:image/png;base64,AAAA';
  const { def } = build((d) => (d.payment_qr = qr), { images: { logo: null, qr: { width: 400, height: 200 } } });
  const node = JSON.parse(json(def)).content.at(-1).columns[0].stack[0].stack;
  assert.equal(node[0].text, 'Scan to pay (InstaPay QR)');
  assert.deepEqual([node[1].image, node[1].width, node[1].height], [qr, 120, 60]);
});

test('logo falls back to fit when its size is unknown', () => {
  const logo = 'data:image/png;base64,AAAA';
  const { def } = build((d) => (d.logo = logo));
  const node = def.content[0].columns[0].stack[0];
  assert.deepEqual(node.fit, [150, 60]);
  assert.equal(node.width, undefined);
});

test('pdfFilename title-cases and replaces unsafe characters', () => {
  assert.equal(pdfFilename('BILLING STATEMENT', 'BS-0007'), 'Billing Statement BS-0007.pdf');
  assert.equal(pdfFilename('Invoice', 'A/B:1'), 'Invoice A-B-1.pdf');
  assert.equal(pdfFilename('INVOICE', 'a\\b*c?d"e<f>g|h'), 'Invoice a-b-c-d-e-f-g-h.pdf');
});

test('empty optional parts leave no label behind', () => {
  for (const mode of ['ph-nonvat', 'generic']) {
    const { def } = build((d) => {
      d.mode = mode;
    });
    const text = json(def);
    for (const gone of ['Ship To', 'PO Number', 'BIR Invoice No.', 'Discount', 'Amount Paid', 'Less: Withholding Tax', 'Net Amount Payable', 'Form 2307', 'Notes', 'Terms', 'Payment Details']) {
      assert.ok(!text.includes(gone), `${mode}: ${gone}`);
    }
  }
});

test('filled optional parts do appear', () => {
  const { def } = build((d) => {
    d.mode = 'generic';
    d.ship_to = 'Dock 4';
    d.purchase_order = 'PO-9';
    d.fields.shipping = true;
    d.shipping = '10';
    d.amount_paid = '100';
    d.notes = 'Thanks';
    d.custom_fields = [{ label: 'ABN', value: '12 345' }, { label: 'Empty', value: '' }];
  });
  const text = json(def);
  for (const shown of ['Ship To', 'Dock 4', 'PO Number', 'PO-9', 'Shipping', 'Amount Paid', 'Notes', 'Thanks', 'ABN', '12 345']) {
    assert.ok(text.includes(shown), shown);
  }
  assert.ok(!text.includes('Empty'));
});

test('withholding adds the Form 2307 note, minus-prefixed row and net payable', () => {
  const { def } = build((d) => {
    d.fields.withholding = true;
    d.withholding_rate = '5';
  });
  const text = json(def);
  assert.ok(text.includes('Kindly issue BIR Form 2307 for the tax withheld.'));
  assert.ok(text.includes('Less: Withholding Tax (5%)'));
  assert.ok(text.includes('−₱75.00'));
  assert.ok(text.includes('Net Amount Payable (PHP)'));
  const off = build((d) => {
    d.fields.withholding = true;
    d.withholding_rate = '5';
    d.form_2307_note = false;
  });
  assert.ok(!json(off.def).includes('Form 2307'));
});

test('totals are one unbreakable stack with Balance Due emphasised', () => {
  const { def } = build();
  const right = def.content.at(-1).columns[1];
  assert.equal(right.unbreakable, true);
  const last = right.stack.at(-1).columns;
  assert.equal(last[0].text, 'Balance Due (PHP)');
  assert.equal(last[0].bold, true);
  assert.equal(last[0].fontSize, 12);
});

test('a renamed label shows up', () => {
  const { def } = build((d) => (d.labels.to_title = 'Client'));
  assert.ok(json(def).includes('Client'));
  assert.ok(!json(def).includes('Bill To'));
});

test('seller and client TIN lines use the mode prefix; generic prints none', () => {
  const fill = (d) => {
    d.seller_tin = '123-456-789-00000';
    d.client_tin = '987-654-321-000';
  };
  const ph = json(build(fill).def);
  assert.ok(ph.includes('Non-VAT Reg. TIN 123-456-789-00000'));
  assert.ok(ph.includes('TIN 987-654-321-000'));
  const vat = json(build((d) => { fill(d); d.mode = 'ph-vat'; }).def);
  assert.ok(vat.includes('VAT Reg. TIN 123-456-789-00000'));
  const generic = json(build((d) => { fill(d); d.mode = 'generic'; }).def);
  assert.ok(!generic.includes('123-456-789-00000'));
  assert.ok(!generic.includes('987-654-321-000'));
});

test('items keep their original index: a blank row before a priced one', () => {
  const { def } = build((d) => {
    d.items = [item('', '1', '0'), item('Consulting', '2', '100')];
  });
  const body = itemsTable(def).table.body;
  assert.equal(body.length, 2); // header + one item
  assert.equal(body[1][0].text, 'Consulting');
  assert.ok(body[1][3].text.includes('200.00'));
});

test('rate keeps typed decimals up to 4, amount keeps the currency places', () => {
  const { def } = build((d) => {
    d.items = [item('Widget', '3', '0.3333')];
  });
  const row = itemsTable(def).table.body[1];
  assert.ok(row[2].text.includes('0.3333'));
  assert.ok(row[3].text.includes('1.00'));
});

test('description prints under the name', () => {
  const { def } = build((d) => {
    d.items = [{ ...item('Logo', '1', '10'), description: 'Three concepts' }];
  });
  const cell = itemsTable(def).table.body[1][0];
  assert.equal(cell.stack[0].text, 'Logo');
  assert.equal(cell.stack[1].text, 'Three concepts');
});

test('user text is sanitised: U+202F becomes U+00A0', () => {
  const { def } = build((d) => (d.notes = 'a\u202fb'));
  assert.ok(!json(def).includes('\u202f'));
  assert.ok(json(def).includes('a\u00a0b'));
});

test('metadata title and no tool branding', () => {
  const { def } = build();
  assert.equal(def.info.title, 'BILLING STATEMENT BS-0001');
  assert.ok(!json(def).includes('Billing Statement Generator'));
});

test('module imports cleanly without a DOM', () => {
  assert.equal(typeof globalThis.document, 'undefined');
});
