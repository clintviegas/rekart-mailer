import type { RentAgreementData } from "@/services/rent-public-action.service";
import type { RentRequestJourney } from "@/types/rent";
import { formatDateDDMMYY, formatDateTimeDDMMYY } from "@/lib/date-format";
import {
  RENT_AGREEMENT_COLORS as C,
  resolveRekartLogoDataUri,
} from "@/lib/rent-agreement-design";
import { formatDisplayMoney } from "@/lib/format-display-money";
import {
  buildRentQuoteBreakdown,
  formatRentQuoteMoney,
} from "@/lib/rent-quote-breakdown";
import {
  rentDepositAndPaymentSection,
  rentPaymentScheduleRows,
} from "@/lib/rent-payment-terms";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(amount: string | undefined, currency: string | undefined): string {
  return formatDisplayMoney(amount ?? "", currency);
}

function fmtDate(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  return formatDateDDMMYY(s) || s;
}

function kvRow(label: string, value: string, note?: string): string {
  const noteHtml = note
    ? `<span class="kv-note">${escapeHtml(note)}</span>`
    : "";
  return `
    <div class="kv-row">
      <span class="kv-label">${escapeHtml(label)}</span>
      <span class="kv-value">${escapeHtml(value)}${noteHtml}</span>
    </div>`;
}

function buildPaymentScheduleHtml(
  data: RentAgreementData,
  depositFmt: string,
  rentalFmt: string,
): string {
  const rows = rentPaymentScheduleRows(data.fulfillmentMode, depositFmt, rentalFmt);
  if (!rows.length) return "";

  const items = rows
    .map(
      (row) => `
      <li class="pay-item">
        <strong>${escapeHtml(row.label)}${row.amount ? ` · ${escapeHtml(row.amount)}` : ""}</strong>
        <span>${escapeHtml(row.due)}</span>
      </li>`,
    )
    .join("");

  return `
    <div class="payment-schedule">
      <p class="payment-schedule-title">When to pay</p>
      <ul class="payment-schedule-list">${items}</ul>
    </div>`;
}

function buildQuotePricingTableHtml(data: RentAgreementData): string {
  const quote = buildRentQuoteBreakdown(
    data.rentalItems,
    data.quoteDiscounts,
    data.rentalAmount,
  );
  if (!quote.lines.length) return "";

  const currency = data.currency;
  const fmt = (amount: number) =>
    amount > 0
      ? escapeHtml(formatRentQuoteMoney(amount, currency))
      : "—";
  const showPricing = quote.lines.some((line) => line.rate > 0) || quote.subtotal > 0;

  const bodyRows = quote.lines
    .map(
      (line, idx) => `
      <tr class="${idx % 2 === 0 ? "row-even" : "row-odd"}">
        <td>${escapeHtml(line.name)}</td>
        <td class="num center">${line.qty}</td>
        ${showPricing ? `<td class="num">${line.rate > 0 ? fmt(line.rate) : "—"}</td>` : ""}
        ${showPricing ? `<td class="num strong">${line.lineTotal > 0 ? fmt(line.lineTotal) : "—"}</td>` : ""}
      </tr>`,
    )
    .join("");

  const colspan = showPricing ? 3 : 1;
  const summaryRows: string[] = [];

  if (showPricing && quote.discountTotal > 0) {
    summaryRows.push(`
      <tr class="totals-row">
        <td colspan="${colspan}" class="totals-label">Subtotal</td>
        <td class="num strong">${fmt(quote.subtotal)}</td>
      </tr>`);
    for (const discount of quote.discounts) {
      summaryRows.push(`
      <tr class="discount-row">
        <td colspan="${colspan}" class="discount-label">${escapeHtml(discount.description)}</td>
        <td class="num discount-value">− ${fmt(discount.amount)}</td>
      </tr>`);
    }
  }

  if (showPricing && quote.total > 0) {
    summaryRows.push(`
      <tr class="grand-total-row">
        <td colspan="${colspan}" class="grand-total-label">${quote.discountTotal > 0 ? "Quote total" : "Estimated total"}</td>
        <td class="num grand-total-value">${fmt(quote.total)}</td>
      </tr>`);
  }

  const header = showPricing
    ? `<thead><tr>
        <th>Item</th>
        <th class="center">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Amount</th>
      </tr></thead>`
    : `<thead><tr><th>Item</th><th class="center">Qty</th></tr></thead>`;

  return `
    <table class="items-table">
      ${header}
      <tbody>${bodyRows}${summaryRows.join("")}</tbody>
    </table>`;
}

export function buildSignedRentAgreementHtml(
  data: RentAgreementData,
  logoSrc = "/rekart-logo.png",
): string {
  const lessor = escapeHtml(String(data.companyName ?? "").trim() || "Rekart");
  const renter = escapeHtml(String(data.customerName ?? "Customer").trim());
  const requestId = escapeHtml(String(data.requestId ?? "").trim());
  const currency = escapeHtml(String(data.currency ?? "").trim());
  const signerName = escapeHtml(
    String(data.agreementSignerName ?? data.customerName ?? "").trim(),
  );
  const signedDate = escapeHtml(
    String(data.agreementSignedDateDisplay ?? "").trim() || fmtDate(new Date().toISOString()),
  );
  const signedAt = data.agreementSignedAt
    ? escapeHtml(formatDateTimeDDMMYY(data.agreementSignedAt))
    : "";
  const signatureImg = String(data.agreementSignatureImage ?? "").trim();
  const quote = buildRentQuoteBreakdown(
    data.rentalItems,
    data.quoteDiscounts,
    data.rentalAmount,
  );
  const quoteItems = quote.lines;
  const fulfillment =
    String(data.fulfillmentMode ?? "").toLowerCase() === "pickup"
      ? "Pickup"
      : String(data.fulfillmentMode ?? "").toLowerCase() === "delivery"
        ? "Delivery"
        : "As agreed";
  const address = String(data.confirmedAddress ?? "").trim();
  const safeLogo = logoSrc.replace(/"/g, "&quot;");
  const quoteTableHtml = buildQuotePricingTableHtml(data);
  const hasQuoteTable = quoteItems.length > 0;
  const depositFmt = formatMoney(data.securityDeposit, data.currency);
  const rentalFmt = formatMoney(String(quote.total || data.rentalAmount), data.currency);
  const paymentRows = rentPaymentScheduleRows(data.fulfillmentMode, depositFmt, rentalFmt);
  const depositDue = paymentRows.find((r) => r.label.startsWith("Security"))?.due;
  const rentalDue = paymentRows.find((r) => r.label.startsWith("Rental"))?.due;
  const paymentScheduleHtml = buildPaymentScheduleHtml(data, depositFmt, rentalFmt);

  const signatureBlock = signatureImg
    ? `<img src="${signatureImg}" alt="Signature" class="signature-img" />`
    : `<p class="signature-fallback">Signature on file</p>`;

  const summaryRows = [
    kvRow("Rental period", `${fmtDate(data.rentalStartDate)} → ${fmtDate(data.returnDueDate || data.rentalEndDate)}`),
    kvRow("Quote total", rentalFmt, rentalDue),
    kvRow("Security deposit", depositFmt, depositDue),
    kvRow("Fulfillment", fulfillment),
    ...(address ? [kvRow("Address", address)] : []),
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rental Agreement — ${requestId}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px 16px 40px;
      background: ${C.pageBg};
      color: ${C.text};
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-card {
      max-width: 760px;
      margin: 0 auto;
      background: ${C.white};
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 24px 60px -28px rgba(57, 143, 247, 0.45), 0 8px 24px -12px rgba(15, 23, 42, 0.12);
      border: 1px solid ${C.lightBorder};
    }
    .top-bar {
      background: linear-gradient(135deg, ${C.topBar} 0%, ${C.topBarDark} 100%);
      padding: 18px 28px;
    }
    .top-bar-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .logo {
      height: 44px;
      width: auto;
      max-width: 168px;
      display: block;
      filter: brightness(0) invert(1);
    }
    .journey-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.95);
      white-space: nowrap;
    }
    .doc-hero {
      padding: 28px 28px 8px;
      background: linear-gradient(180deg, ${C.lightBgAlt} 0%, ${C.white} 100%);
      border-bottom: 1px solid ${C.lightBorder};
    }
    .doc-hero h1 {
      margin: 0 0 12px;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${C.text};
      text-align: center;
    }
    .meta-chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }
    .chip {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: ${C.lightBg};
      border: 1px solid ${C.lightBorder};
      color: ${C.muted};
    }
    .chip.signed {
      background: ${C.signedBg};
      border-color: ${C.signedBorder};
      color: #047857;
    }
    .doc-body { padding: 8px 28px 28px; }
    .parties-box {
      margin: 20px 0 24px;
      padding: 16px 18px;
      border-radius: 12px;
      background: ${C.lightBg};
      border: 1px solid ${C.lightBorder};
      font-size: 13px;
      color: ${C.text};
    }
    .parties-box strong { color: ${C.accent}; }
    .section {
      margin-bottom: 18px;
      padding: 18px 18px 16px;
      border-radius: 12px;
      background: ${C.lightBgAlt};
      border: 1px solid ${C.lightBorder};
    }
    .section h2 {
      margin: 0 0 12px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${C.accent};
    }
    .section p {
      margin: 0;
      font-size: 13px;
      color: #334155;
    }
    .kv-grid { display: grid; gap: 0; }
    .kv-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid ${C.lightBorder};
      font-size: 13px;
    }
    .kv-row:last-child { border-bottom: 0; padding-bottom: 0; }
    .kv-label { color: ${C.muted}; font-weight: 500; }
    .kv-value { color: ${C.text}; font-weight: 700; text-align: right; max-width: 62%; }
    .kv-note { display: block; margin-top: 3px; font-size: 11px; font-weight: 500; color: ${C.muted}; }
    .payment-schedule {
      margin-top: 14px;
      padding: 14px 16px;
      border-radius: 12px;
      background: ${C.lightBg};
      border: 1px solid ${C.lightBorder};
    }
    .payment-schedule-title {
      margin: 0 0 10px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: ${C.accent};
    }
    .payment-schedule-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pay-item {
      padding: 10px 12px;
      border-radius: 10px;
      background: ${C.white};
      border: 1px solid ${C.lightBorder};
      margin-bottom: 8px;
      font-size: 12px;
      color: #334155;
    }
    .pay-item:last-child { margin-bottom: 0; }
    .pay-item strong { display: block; color: ${C.text}; margin-bottom: 3px; }
    .pay-item span { color: ${C.muted}; line-height: 1.45; }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      border-radius: 8px;
      overflow: hidden;
    }
    .items-table th {
      background: ${C.lightBg};
      color: ${C.accent};
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid ${C.lightBorder};
    }
    .items-table td {
      padding: 10px 12px;
      border-bottom: 1px solid ${C.lightBorder};
      color: #334155;
    }
    .items-table td.num { text-align: right; white-space: nowrap; }
    .items-table td.center { text-align: center; }
    .items-table td.strong { font-weight: 700; color: ${C.text}; }
    .items-table th.num, .items-table th.center { text-align: right; }
    .items-table th.center { text-align: center; }
    .totals-row td, .grand-total-row td { border-top: 1px solid ${C.lightBorder}; }
    .totals-label, .grand-total-label {
      padding-top: 12px !important;
      font-weight: 600;
      color: ${C.muted};
      text-align: left !important;
    }
    .grand-total-label { font-weight: 800; color: ${C.text}; }
    .grand-total-value { font-size: 15px !important; font-weight: 800 !important; color: ${C.text} !important; }
    .discount-label { color: #059669 !important; font-weight: 500; text-align: left !important; }
    .discount-value { color: #059669 !important; font-weight: 700 !important; }
    .row-even td { background: ${C.white}; }
    .row-odd td { background: ${C.lightBgAlt}; }
    .sign-box {
      margin-top: 8px;
      padding: 20px 18px;
      border-radius: 12px;
      background: linear-gradient(135deg, ${C.signedBg} 0%, ${C.lightBgAlt} 100%);
      border: 1px solid ${C.signedBorder};
    }
    .sign-box h2 {
      margin: 0 0 12px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #047857;
    }
    .sign-row { margin: 6px 0; font-size: 13px; color: ${C.text}; }
    .signature-img {
      max-height: 80px;
      max-width: 300px;
      display: block;
      margin-top: 12px;
      padding: 8px 12px;
      background: ${C.white};
      border-radius: 8px;
      border: 1px solid ${C.lightBorder};
    }
    .signature-fallback {
      margin: 12px 0 0;
      font-style: italic;
      color: ${C.muted};
      font-size: 13px;
    }
    .footer {
      margin-top: 4px;
      padding: 16px 28px 22px;
      border-top: 1px solid ${C.lightBorder};
      background: ${C.lightBgAlt};
      text-align: center;
      font-size: 11px;
      color: ${C.muted};
    }
    .footer a { color: ${C.accent}; text-decoration: none; font-weight: 600; }
    @media print {
      body { padding: 0; background: #fff; }
      .doc-card { box-shadow: none; border-radius: 0; border: 0; max-width: 100%; }
    }
    @media (max-width: 520px) {
      .top-bar { padding: 14px 16px; }
      .doc-hero, .doc-body { padding-left: 16px; padding-right: 16px; }
      .kv-row { flex-direction: column; gap: 4px; }
      .kv-value { text-align: left; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="doc-card">
    <header class="top-bar">
      <div class="top-bar-inner">
        <img src="${safeLogo}" alt="Rekart" class="logo" />
        <span class="journey-label">Rent Journey</span>
      </div>
    </header>

    <div class="doc-hero">
      <h1>Equipment Rental Agreement</h1>
      <div class="meta-chips">
        <span class="chip">Request #${requestId}</span>
        ${currency ? `<span class="chip">${currency}</span>` : ""}
        ${signedAt ? `<span class="chip signed">Signed ${signedAt}</span>` : ""}
      </div>
    </div>

    <div class="doc-body">
      <div class="parties-box">
        This Rental Agreement (&ldquo;Agreement&rdquo;) is entered into electronically between
        <strong>${lessor}</strong> (&ldquo;Lessor&rdquo;) and <strong>${renter}</strong> (&ldquo;Renter&rdquo;).
      </div>

      <section class="section">
        <h2>1. Rental summary</h2>
        <div class="kv-grid">${summaryRows}</div>
        ${paymentScheduleHtml}
      </section>

      ${
        hasQuoteTable
          ? `<section class="section">
        <h2>2. Quote breakdown</h2>
        ${quoteTableHtml}
      </section>`
          : ""
      }

      <section class="section">
        <h2>${hasQuoteTable ? "3" : "2"}. Renter obligations</h2>
        <p>Renter shall use the equipment only for lawful purposes, keep it in good condition, not sub-rent or transfer without Lessor&apos;s written consent, and return all items by the agreed return date in the same condition, ordinary wear excepted.</p>
      </section>

      <section class="section">
        <h2>${hasQuoteTable ? "4" : "3"}. Deposit &amp; payment</h2>
        <p>${escapeHtml(rentDepositAndPaymentSection(data.fulfillmentMode))}</p>
      </section>

      <section class="section">
        <h2>${hasQuoteTable ? "5" : "4"}. Loss, damage &amp; liability</h2>
        <p>Renter is responsible for loss, theft, or damage to rented equipment from pickup/delivery until return acceptance. Lessor&apos;s liability is limited to the extent permitted under applicable law in the UAE and India.</p>
      </section>

      <section class="section">
        <h2>${hasQuoteTable ? "6" : "5"}. Electronic signature</h2>
        <p>Renter confirms they have read this Agreement, agree to its terms, and consent to electronic signing under applicable laws in the UAE and India, including where simple electronic signatures are recognised for commercial agreements of this nature.</p>
      </section>

      <div class="sign-box">
        <h2>Electronic signature</h2>
        <p class="sign-row"><strong>Signed by:</strong> ${signerName}</p>
        <p class="sign-row"><strong>Date:</strong> ${signedDate}${signedAt ? ` · ${signedAt}` : ""}</p>
        ${signatureBlock}
      </div>
    </div>

    <footer class="footer">
      Electronically signed copy for your records · Request #${requestId}<br />
      <a href="https://rekart.ae">rekart.ae</a> · <a href="mailto:hello@rekart.ae">hello@rekart.ae</a>
    </footer>
  </div>
</body>
</html>`;
}

async function buildHtmlWithLogo(data: RentAgreementData): Promise<string> {
  const logoSrc = await resolveRekartLogoDataUri();
  return buildSignedRentAgreementHtml(data, logoSrc);
}

export async function downloadSignedRentAgreement(data: RentAgreementData): Promise<void> {
  const html = await buildHtmlWithLogo(data);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const requestId = String(data.requestId ?? "agreement").replace(/[^\w-]+/g, "-");
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Rent-Agreement-${requestId}-signed.html`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function printSignedRentAgreement(data: RentAgreementData): Promise<void> {
  const html = await buildHtmlWithLogo(data);
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    await downloadSignedRentAgreement(data);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
  };
}

export function canDownloadSignedRentAgreement(data: RentAgreementData): boolean {
  return Boolean(
    (data.alreadyProcessed ||
      String(data.agreementSignerName ?? "").trim() ||
      String(data.agreementSignatureImage ?? "").trim()) &&
      (String(data.agreementSignerName ?? "").trim() ||
        String(data.agreementSignatureImage ?? "").trim()),
  );
}

export function rentAgreementDataFromJourney(
  journey: RentRequestJourney,
  companyName?: string,
): RentAgreementData {
  const dd = journey.dynamicData ?? {};
  const items = Array.isArray(dd.rentalItems)
    ? (dd.rentalItems as Array<{ name: string; qty: number; rate?: number | string }>)
    : [];

  return {
    requestId: journey.requestId,
    customerName: journey.customerName,
    currency: journey.currency,
    alreadyProcessed: true,
    rentalItems: items,
    rentalAmount: String(dd.rentalAmount ?? dd.rentalTotal ?? ""),
    securityDeposit: String(dd.securityDeposit ?? ""),
    rentalStartDate: String(dd.rentalStartDate ?? ""),
    rentalEndDate: String(dd.rentalEndDate ?? dd.returnDueDate ?? ""),
    returnDueDate: String(dd.returnDueDate ?? dd.rentalEndDate ?? ""),
    fulfillmentMode: String(dd.fulfillmentMode ?? ""),
    confirmedAddress: String(dd.confirmedAddress ?? dd.customerAddress ?? ""),
    companyName: companyName?.trim() || undefined,
    agreementSignerName: String(dd.agreementSignerName ?? ""),
    agreementSignedDateDisplay: String(dd.agreementSignedDateDisplay ?? ""),
    agreementSignedAt: String(dd.agreementSignedAt ?? ""),
    agreementSignatureImage: String(dd.agreementSignatureImage ?? ""),
    quoteDiscounts:
      dd.quoteDiscounts != null && dd.quoteDiscounts !== ""
        ? typeof dd.quoteDiscounts === "string"
          ? dd.quoteDiscounts
          : JSON.stringify(dd.quoteDiscounts)
        : undefined,
  };
}
