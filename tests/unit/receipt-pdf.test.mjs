// Unit test for the PDF receipt (src/lib/receipt-pdf.ts).
// Run with: npm run test:unit
//
// What it proves:
//   - it makes a real one-page PDF, 80 mm wide like a shop receipt
//   - long text (references, emails) and letters Helvetica can't draw
//     (the peso sign, emoji) don't break it
//   - amounts are written "PHP 550.00" (minus for a voucher)
//   - the file name is Block69-Receipt-<receipt no>.pdf, with only safe letters

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { buildReceiptPdf, peso, receiptFileName } from '../../src/lib/receipt-pdf.ts';

// A receipt with everything in it.
const receipt = {
  cafe: { name: 'Block 69 Cafe', address: '444 Kamagong St., Comembo, Taguig City', email: 'block69cafe@gmail.com' },
  receiptNo: 'R69-3F9A1C2D',
  bookingNo: 'B69-77AB01CD',
  datePaid: 'Oct 26, 2026, 9:14 AM',
  client: { name: 'Ana Cruz 🌿', email: 'ana.cruz.with.a.very.long.email.address@gmail.com', contact: '09171234567' },
  classLines: ['Mindful Mat Pilates', 'Thursday, October 29 · 9:00 – 9:50 AM'],
  items: [
    { label: 'Mindful Mat Pilates class fee', note: 'Includes an upsized Iced Matcha', amount: 500 },
    { label: 'Mat rental', note: 'Donated to feed stray animals', amount: 50 },
    { label: 'Voucher HALF-ABC123', note: 'Class fee only', amount: -250 },
  ],
  total: 300,
  payments: [{ method: 'GCash', reference: 'cs_test_aVeryLongPayMongoCheckoutReferenceWithNoSpaces1234567890', amount: 300 }],
  status: 'Paid ₱',
};

test('makes a one-page PDF, 80 mm wide', async () => {
  const bytes = await buildReceiptPdf(receipt);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const { width, height } = pdf.getPage(0).getSize();
  assert.ok(Math.abs(width - 226.77) < 0.1, `width ${width}`);
  assert.ok(height > 300 && height < 900, `height ${height}`);
  assert.equal(pdf.getTitle(), 'Block 69 Cafe receipt R69-3F9A1C2D');
});

test('pesos as PHP with two decimals', () => {
  assert.equal(peso(550), 'PHP 550.00');
  assert.equal(peso(-250), '-PHP 250.00');
  assert.equal(peso(1050.5), 'PHP 1,050.50');
});

test('file name', () => {
  assert.equal(receiptFileName('R69-3F9A1C2D'), 'Block69-Receipt-R69-3F9A1C2D.pdf');
  assert.equal(receiptFileName('R69-"x/../y'), 'Block69-Receipt-R69-xy.pdf');
});
