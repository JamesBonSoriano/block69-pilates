// Makes a receipt as a real PDF file, styled like a shop receipt: one narrow
// (80 mm) strip, centred text, dashed lines, a bold total and "Thank you".
// Where it's used: the two download routes
//   /account/payments/<payment id>/pdf   (the client's own payment)
//   /admin/receipt/<booking id>/pdf      (admins)
// and the on-screen receipt (src/components/receipt/ReceiptSheet.tsx) shows
// the SAME ReceiptData, so the page, the printout and the PDF match.
//
// Library: pdf-lib (small, plain JavaScript, works on the server without a
// browser). Its built-in fonts (Helvetica) only know Western letters, so the
// peso sign is written "PHP" in the PDF, and any letter the font can't draw
// becomes "?" instead of breaking the download.
// This file must not import anything from our own code: the unit tests
// (tests/unit/receipt-pdf.test.mjs) load it directly with Node.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Everything a receipt shows, already in words (amounts are pesos).
export type ReceiptData = {
  cafe: { name: string; address: string; email: string };
  receiptNo: string; // e.g. "R69-3F9A1C2D"
  bookingNo: string; // e.g. "B69-77AB01CD"
  datePaid: string; // e.g. "Oct 26, 2026, 9:14 AM"
  client: { name: string; email: string | null; contact: string | null };
  classLines: string[]; // e.g. ["Mindful Mat Pilates", "Thursday, October 29 · 9:00 – 9:50 AM"]
  items: { label: string; note: string | null; amount: number }[]; // a voucher is a minus amount
  total: number;
  payments: { method: string; reference: string | null; amount: number }[];
  status: string; // e.g. "Paid"
};

// The receipt's size and spacing, in PDF points (72 points = 1 inch).
const PAGE_WIDTH = 226.77; // 80 mm, a shop receipt roll
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Colours: the site's brown, the main text colour and the grey for notes.
const BROWN = rgb(0x5b / 255, 0x3f / 255, 0x2e / 255);
const INK = rgb(0x2e / 255, 0x2a / 255, 0x24 / 255);
const MUTED = rgb(0x56 / 255, 0x5d / 255, 0x59 / 255);

// One line of the receipt, worked out before drawing (so the page can be
// exactly as tall as the receipt).
type Line =
  | { kind: "center"; text: string; font: PDFFont; size: number; color: typeof INK }
  | { kind: "left"; text: string; font: PDFFont; size: number; color: typeof INK }
  | { kind: "pair"; left: string; right: string; font: PDFFont; size: number; color: typeof INK }
  | { kind: "dash" }
  | { kind: "gap"; height: number };

// Makes the receipt PDF.
// Takes: the receipt data.
// Gives back: the PDF file's bytes (ready to send as a download).
export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${data.cafe.name} receipt ${data.receiptNo}`);
  pdf.setAuthor(data.cafe.name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Cleans text so the font can draw every letter (see the top of the file).
  const clean = cleaner(regular);
  const lines: Line[] = [];
  const center = (text: string, font = regular, size = 8, color = INK) => {
    for (const part of wrap(clean(text), font, size, CONTENT_WIDTH)) lines.push({ kind: "center", text: part, font, size, color });
  };
  const left = (text: string, font = regular, size = 8, color = INK) => {
    for (const part of wrap(clean(text), font, size, CONTENT_WIDTH)) lines.push({ kind: "left", text: part, font, size, color });
  };
  // A label on the left and a value on the right (the value wraps under itself)
  const pair = (label: string, value: string, font = regular, size = 8, color = INK) => {
    const labelText = clean(label);
    const room = CONTENT_WIDTH - font.widthOfTextAtSize(labelText, size) - 8;
    wrap(clean(value), font, size, room).forEach((part, n) =>
      lines.push({ kind: "pair", left: n === 0 ? labelText : "", right: part, font, size, color }),
    );
  };
  const gap = (height: number) => lines.push({ kind: "gap", height });
  const dash = () => {
    gap(3);
    lines.push({ kind: "dash" });
    gap(5);
  };

  // ---- Top: the cafe ----
  center(data.cafe.name, bold, 14, BROWN);
  center("MAT PILATES + CAFE", regular, 6.5, MUTED);
  gap(3);
  if (data.cafe.address) center(data.cafe.address, regular, 7.5, MUTED);
  if (data.cafe.email) center(data.cafe.email, regular, 7.5, MUTED);
  dash();

  // ---- Numbers, date, client, class ----
  center("OFFICIAL RECEIPT", bold, 9, BROWN);
  gap(3);
  pair("Receipt no.", data.receiptNo);
  pair("Booking no.", data.bookingNo);
  pair("Date paid", data.datePaid);
  pair("Client", data.client.name);
  if (data.client.email) pair("", data.client.email, regular, 7.5, MUTED);
  if (data.client.contact) pair("", data.client.contact, regular, 7.5, MUTED);
  gap(3);
  left("Class", bold, 8);
  for (const line of data.classLines) left(line, regular, 8);
  dash();

  // ---- Items ----
  for (const item of data.items) {
    // The label wraps to leave room for the amount on the right
    const amount = peso(item.amount);
    const room = CONTENT_WIDTH - regular.widthOfTextAtSize(amount, 8) - 8;
    wrap(clean(item.label), regular, 8, room).forEach((part, n) =>
      lines.push({ kind: "pair", left: part, right: n === 0 ? amount : "", font: regular, size: 8, color: INK }),
    );
    if (item.note) left(item.note, regular, 7, MUTED);
    gap(2);
  }
  dash();

  // ---- Total, payment, status ----
  pair("TOTAL", peso(data.total), bold, 11, BROWN);
  gap(4);
  for (const payment of data.payments) {
    pair("Payment", `${payment.method}${data.payments.length > 1 ? ` (${peso(payment.amount)})` : ""}`);
    if (payment.reference) pair("Reference", payment.reference, regular, 7.5);
  }
  pair("Status", data.status.toUpperCase(), bold, 8.5, BROWN);
  dash();

  // ---- Bottom ----
  center("Thank you!", bold, 10, BROWN);
  center(`See you on the mat at ${data.cafe.name}.`, regular, 7, MUTED);
  center("Card and bank details are never stored.", regular, 6.5, MUTED);

  // The page is exactly as tall as the lines (plus the margins)
  const height = lines.reduce((sum, line) => sum + lineHeight(line), 0) + MARGIN * 2;
  const page = pdf.addPage([PAGE_WIDTH, height]);
  let y = height - MARGIN;
  for (const line of lines) {
    y -= lineHeight(line);
    drawLine(page, line, y);
  }
  return pdf.save();
}

// The download's file name.
// Takes: the receipt number, e.g. "R69-3F9A1C2D".
// Gives back: e.g. "Block69-Receipt-R69-3F9A1C2D.pdf" (only safe letters).
export function receiptFileName(receiptNo: string): string {
  return `Block69-Receipt-${receiptNo.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}

// Pesos for the PDF, e.g. 550 -> "PHP 550.00", -250 -> "-PHP 250.00".
// Takes: the amount. Gives back: the text.
export function peso(amount: number): string {
  const text = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}PHP ${text}`;
}

// How much height one line takes.
// Takes: the line. Gives back: points.
function lineHeight(line: Line): number {
  if (line.kind === "gap") return line.height;
  if (line.kind === "dash") return 1;
  return line.size * 1.35;
}

// Draws one line at height y (measured from the bottom of the page).
// Takes: the page, the line and y. Gives back: nothing.
function drawLine(page: PDFPage, line: Line, y: number): void {
  if (line.kind === "gap") return;
  if (line.kind === "dash") {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.6,
      color: MUTED,
      dashArray: [3, 2],
    });
    return;
  }
  // Text sits a little above the bottom of its line
  const baseline = y + line.size * 0.3;
  if (line.kind === "center") {
    const width = line.font.widthOfTextAtSize(line.text, line.size);
    page.drawText(line.text, { x: (PAGE_WIDTH - width) / 2, y: baseline, size: line.size, font: line.font, color: line.color });
  } else if (line.kind === "left") {
    page.drawText(line.text, { x: MARGIN, y: baseline, size: line.size, font: line.font, color: line.color });
  } else {
    if (line.left) page.drawText(line.left, { x: MARGIN, y: baseline, size: line.size, font: line.font, color: line.color });
    const width = line.font.widthOfTextAtSize(line.right, line.size);
    page.drawText(line.right, { x: PAGE_WIDTH - MARGIN - width, y: baseline, size: line.size, font: line.font, color: line.color });
  }
}

// Makes a text cleaner for one font.
// Takes: the font. Gives back: a function that swaps the peso sign for
// "PHP ", fancy minus / dashes for plain ones, and any letter the font
// can't draw for "?".
function cleaner(font: PDFFont): (text: string) => string {
  const known = new Set(font.getCharacterSet());
  return (text) =>
    [...text.replace(/₱/g, "PHP ").replace(/−/g, "-").replace(/\s+/g, " ").trim()]
      .map((char) => (known.has(char.codePointAt(0) ?? 0) ? char : "?"))
      .join("");
}

// Splits text into lines that fit a width (long words are cut too).
// Takes: the text, the font, the size and the width in points.
// Gives back: the lines (at least one, maybe "").
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= maxWidth;
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const tryLine = current ? `${current} ${word}` : word;
    if (fits(tryLine)) {
      current = tryLine;
      continue;
    }
    if (current) lines.push(current);
    // A word wider than the whole line (e.g. a long reference): cut it
    let rest = word;
    while (!fits(rest) && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  lines.push(current);
  return lines;
}
