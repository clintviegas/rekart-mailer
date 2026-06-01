import {
  brandingToDesignTokens,
  renderRekartEmailShell,
  type ComplianceOptions,
  type DesignTokens,
  type FooterOptions,
  type PerEmailOverrides,
  type TrackingOptions,
} from '../../repair/templates/repair-email-html.renderer';
import {
  formatDisplayMoney,
  MONEY_CELL_NOWRAP,
} from '../../../common/format-display-money';

// Re-use sell logo / mascot pipeline (fixes broken header logo + CID handling)
export {
  prepareBrandingLogoForEmail,
  prepareMascotForEmail,
  prepareSocialIconsForEmail,
  mergeInlineCidAttachments,
} from '../../sell/templates/email-html.renderer';

export type { DesignTokens, FooterOptions, PerEmailOverrides, TrackingOptions, ComplianceOptions };
export { brandingToDesignTokens };

const REKART_TOP_BAR = '#398ff7';
const REKART_NAVY = '#0B1426';
/** Light tints derived from header blue — never use workspace accent/cyan in body blocks */
const REKART_LIGHT_BG = '#eff6ff';
const REKART_LIGHT_BORDER = '#bfdbfe';
const REKART_ACCENT = '#398ff7';

const RENT_PROGRESS_STEPS = [
  { key: 'rent-request', label: 'Request' },
  { key: 'rent-agreement', label: 'Quote' },
  { key: 'rent-ready-pickup', label: 'Pickup' },
  { key: 'rent-dispatched', label: 'Dispatch' },
  { key: 'rent-handover', label: 'Handover' },
  { key: 'rent-return-reminder', label: 'Reminder' },
  { key: 'rent-return-received', label: 'Return' },
  { key: 'rent-closed', label: 'Done' },
];

type RentProgressState = 'pending' | 'completed' | 'current' | 'skipped';

function rentProgressStepsForEmail(fulfillmentMode?: string) {
  const mode = String(fulfillmentMode ?? '').toLowerCase();
  return RENT_PROGRESS_STEPS.filter((s) => {
    // Staff-only workflow step — never show "Reminder" on the customer progress bar.
    if (s.key === 'rent-return-reminder') return false;
    if (mode === 'pickup' && s.key === 'rent-dispatched') return false;
    if (mode === 'delivery' && s.key === 'rent-ready-pickup') return false;
    return true;
  });
}

function rentProgressStepIndex(workflowKey: string, steps: typeof RENT_PROGRESS_STEPS): number {
  const mappedKey =
    workflowKey === 'rent-return-reminder' ? 'rent-return-received' : workflowKey;
  const idx = steps.findIndex((s) => s.key === mappedKey);
  return idx >= 0 ? idx : 0;
}

function rentProgressVisualStates(
  workflowKey: string,
  steps: typeof RENT_PROGRESS_STEPS,
  fulfillmentMode?: string,
): RentProgressState[] {
  const mode = String(fulfillmentMode ?? '').toLowerCase();
  const activeIdx = rentProgressStepIndex(workflowKey, steps);
  return steps.map((step, i) => {
    if (mode === 'pickup' && step.key === 'rent-dispatched') return 'skipped';
    if (mode === 'delivery' && step.key === 'rent-ready-pickup') return 'skipped';
    if (i === activeIdx) return 'current';
    if (i < activeIdx) return 'completed';
    return 'pending';
  });
}

function rentProgressCellHtml(
  step: { label: string },
  index: number,
  state: RentProgressState,
  stepCount: number,
): string {
  const width = Math.floor(100 / stepCount);
  let dotContent = String(index + 1);
  let dotClass = 'progress-dot';
  let dotStyle = '';
  let stepClass = 'progress-step';

  switch (state) {
    case 'current':
      dotClass += ' active';
      stepClass += ' active';
      break;
    case 'completed':
      dotStyle = `background:#dbeafe;color:${REKART_TOP_BAR};`;
      break;
    case 'skipped':
      dotContent = '&#10005;';
      dotClass += ' skipped';
      stepClass += ' skipped';
      break;
    default:
      break;
  }

  return `
      <td align="center" style="width:${width}%;vertical-align:top;padding:0 2px;">
        <div class="${dotClass}" style="${dotStyle}">${dotContent}</div>
        <div class="${stepClass}">${step.label}</div>
      </td>`;
}

function rentStepProgressHtml(workflowKey: string, fulfillmentMode?: string): string {
  const steps = rentProgressStepsForEmail(fulfillmentMode);
  const states = rentProgressVisualStates(workflowKey, steps, fulfillmentMode);
  const cells = steps
    .map((step, i) => rentProgressCellHtml(step, i, states[i], steps.length))
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="progress-wrap">
      <tr><td style="padding:20px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
      </td></tr>
    </table>`;
}
const FONT_BODY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, Helvetica, sans-serif";

const STEP_HEADINGS: Record<string, string> = {
  'rent-request': 'We received your rent request',
  'rent-agreement': 'Your rental quote is ready',
  'rent-ready-pickup': 'Your rental is ready for pickup',
  'rent-dispatched': 'Your rental is on the way',
  'rent-handover': 'Enjoy your rental',
  'rent-return-reminder': 'Return date coming up',
  'rent-return-received': 'We received your return',
  'rent-closed': 'Rental complete — thank you',
};

const STEP_BADGES: Record<string, string> = {
  'rent-request': 'RENT REQUEST',
  'rent-agreement': 'QUOTE & AGREEMENT',
  'rent-ready-pickup': 'READY FOR PICKUP',
  'rent-dispatched': 'OUT FOR DELIVERY',
  'rent-handover': 'HANDOVER COMPLETE',
  'rent-return-reminder': 'RETURN DUE',
  'rent-return-received': 'RETURN RECEIVED',
  'rent-closed': 'RENTAL CLOSED',
};

const STEP_BODY_TEXT: Record<string, string> = {
  'rent-request':
    'Review your request details and confirm pickup or delivery. Pricing will be shared after you confirm.',
  'rent-agreement':
    'Your quote includes item rates, rental dates, and pickup or delivery details. Review and accept to continue.',
  'rent-ready-pickup':
    'Your items are packed and ready. Collect them from the pickup location below.',
  'rent-dispatched':
    'Your rental has left our store and is heading to your delivery address.',
  'rent-handover':
    'Handover is complete. Keep your return date handy — details are below.',
  'rent-return-reminder':
    'Your rental return date is approaching. Please plan to return on time.',
  'rent-return-received':
    'We have checked in your returned items. Deposit settlement follows shortly.',
  'rent-closed':
    'Your rental journey is finished. Thank you for choosing Rekart.',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function field(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return v != null && String(v).trim() ? String(v) : '';
}

function googleMapsUrl(address: string): string {
  const q = address.trim();
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function resolvePickupAddress(data: Record<string, unknown>): string {
  return (
    field(data, 'pickupAddress') ||
    field(data, 'confirmedAddress') ||
    ''
  );
}

function resolvePickupLocationLabel(data: Record<string, unknown>): string {
  return field(data, 'pickupLocationLabel');
}

function resolveDeliveryAddress(data: Record<string, unknown>): string {
  return (
    field(data, 'deliveryAddress') ||
    field(data, 'confirmedAddress') ||
    field(data, 'customerAddress') ||
    ''
  );
}

function fulfillmentLabel(mode: string): string {
  if (mode === 'pickup') return 'Store pickup';
  if (mode === 'delivery') return 'Home delivery';
  return mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : '';
}

function rentHandoverTimingPhrase(mode: string): string {
  if (mode === 'pickup') return 'pickup when you collect the equipment';
  if (mode === 'delivery') return 'delivery when you receive the equipment';
  return 'pickup or delivery when you take handover of the equipment';
}

function rentPaymentTermsAlert(
  data: Record<string, unknown>,
  currency: string,
  deposit: number,
  rentalAmount: number,
): string {
  const mode = field(data, 'fulfillmentMode').toLowerCase();
  const handover = rentHandoverTimingPhrase(mode);
  const parts: string[] = [];
  if (deposit > 0) {
    parts.push(
      `<strong>Security deposit (${formatMoney(deposit, currency)}):</strong> Payable at ${handover}.`,
    );
  }
  if (rentalAmount > 0) {
    parts.push(
      `<strong>Rental fee (${formatMoney(rentalAmount, currency)}):</strong> Payable at ${handover}.`,
    );
  }
  if (!parts.length) return '';
  return alertBox(
    `<strong style="font-size:14px;">When to pay</strong><br/><span style="font-size:13px;line-height:1.65;">${parts.join('<br/>')}</span>`,
    'info',
  );
}

function rentalPeriodLabel(data: Record<string, unknown>): string {
  const start = field(data, 'rentalStartDate');
  const end = field(data, 'rentalEndDate') || field(data, 'returnDueDate');
  if (start && end) return `${start} → ${end}`;
  return field(data, 'rentalDuration');
}

function optionalStaffNote(data: Record<string, unknown>): string {
  const note = field(data, 'customMessage');
  if (!note) return '';
  return alertBox(escapeHtml(note), 'info');
}

function rentalSummaryCard(data: Record<string, unknown>): string {
  const mode = field(data, 'fulfillmentMode').toLowerCase();
  const rows: Array<[string, string]> = [
    ['Request ID', field(data, 'requestId')],
  ];
  const period = rentalPeriodLabel(data);
  if (period) rows.push(['Rental period', period]);
  if (mode) rows.push(['Fulfillment', fulfillmentLabel(mode)]);
  if (mode === 'pickup') {
    const label = resolvePickupLocationLabel(data);
    const addr = resolvePickupAddress(data);
    if (label) rows.push(['Pickup location', label]);
    if (addr) rows.push(['Address', addr]);
  } else if (mode === 'delivery') {
    const addr = resolveDeliveryAddress(data);
    if (addr) rows.push(['Delivery address', addr]);
  }
  return infoCard('Rental summary', rows);
}

/** Parse rate/qty for totals — never rewrite the stored string the user typed. */
function parseAmount(v: unknown): number {
  if (v == null || v === '') return 0;
  const s = String(v).trim().replace(/[^\d.-]/g, '');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function moneyFieldPresent(data: Record<string, unknown>, key: string): boolean {
  const v = data[key];
  return v != null && String(v).trim() !== '';
}

function formatMoney(amount: number, currency: string): string {
  return formatDisplayMoney(amount, currency);
}

function wrapClick(href: string, clickBase?: string): string {
  if (!href || href === '#') return href;
  if (!clickBase) return href;
  return `${clickBase}?url=${encodeURIComponent(href)}`;
}

function textStyle(extra = ''): string {
  return `margin:0;font-family:${FONT_BODY};${extra}`;
}

function infoCard(title: string, rows: Array<[string, string]>): string {
  const filtered = rows.filter(([, v]) => v.trim());
  if (!filtered.length) return '';
  const cells = filtered
    .map(
      ([label, value]) => `<tr>
        <td style="padding:12px 18px;font-family:${FONT_BODY};font-size:13px;color:#64748b;font-weight:500;width:38%;border-bottom:1px solid #f1f5f9;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:12px 18px;font-family:${FONT_BODY};font-size:14px;color:${REKART_NAVY};font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;vertical-align:top;">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin:0 0 20px;background:#ffffff;">
    <tr><td style="background:#f8fafc;padding:11px 18px;font-family:${FONT_BODY};font-size:10px;font-weight:800;color:${REKART_TOP_BAR};text-transform:uppercase;letter-spacing:0.12em;border-bottom:1px solid #e2e8f0;">${escapeHtml(title)}</td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tbody>${cells}</tbody></table></td></tr>
  </table>`;
}

interface RentalLine {
  name: string;
  qty: number;
  rate: number;
  lineTotal: number;
}

interface RentDiscountLine {
  description: string;
  amount: number;
}

function parseRentalLines(data: Record<string, unknown>): RentalLine[] {
  const items = data['rentalItems'];
  if (!Array.isArray(items)) return [];
  return items
    .map((item, i) => {
      const row = item as Record<string, unknown>;
      const qty = Math.max(1, Math.round(parseAmount(row.qty) || 1));
      const rate = parseAmount(row.rate);
      const name = String(row.name ?? `Item ${i + 1}`).trim();
      if (!name) return null;
      return { name, qty, rate, lineTotal: qty * rate };
    })
    .filter((x): x is RentalLine => x != null);
}

function parseRentDiscounts(data: Record<string, unknown>): RentDiscountLine[] {
  const raw = data['quoteDiscounts'];
  if (raw == null || raw === '') return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const description = String(r.description ?? r.label ?? r.name ?? '').trim();
        const amount = parseAmount(r.amount ?? r.discount);
        if (!description || amount <= 0) return null;
        return { description, amount };
      })
      .filter((x): x is RentDiscountLine => x != null);
  } catch {
    return [];
  }
}

/** Request email — item names and quantities only (no pricing). */
function rentalItemsQtyTable(data: Record<string, unknown>): string {
  const lines = parseRentalLines(data);
  if (!lines.length) {
    const summary = field(data, 'rentalItemsSummary');
    if (!summary) return '';
    return infoCard('Rental items', [['Items', summary]]);
  }

  const header = `<tr>
    <td style="padding:10px 14px;font-family:${FONT_BODY};font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;">Item</td>
    <td style="padding:10px 14px;font-family:${FONT_BODY};font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;text-align:center;width:64px;">Qty</td>
  </tr>`;

  const bodyRows = lines
    .map(
      (l) => `<tr>
        <td style="padding:12px 14px;font-family:${FONT_BODY};font-size:14px;color:${REKART_NAVY};font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(l.name)}</td>
        <td style="padding:12px 14px;font-family:${FONT_BODY};font-size:14px;color:#475569;text-align:center;border-bottom:1px solid #f1f5f9;">${l.qty}</td>
      </tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin:0 0 20px;background:#ffffff;">
    <tr><td style="background:#f8fafc;padding:11px 18px;font-family:${FONT_BODY};font-size:10px;font-weight:800;color:${REKART_TOP_BAR};text-transform:uppercase;letter-spacing:0.12em;border-bottom:1px solid #e2e8f0;">Rental items</td></tr>
    <tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tbody>${header}${bodyRows}</tbody></table></td></tr>
  </table>`;
}

function rentalItemsPricingTable(
  data: Record<string, unknown>,
  currency: string,
): { html: string; grandTotal: number } {
  const lines = parseRentalLines(data);
  if (!lines.length) {
    const summary = field(data, 'rentalItemsSummary');
    if (!summary) return { html: '', grandTotal: 0 };
    return {
      html: infoCard('Rental items', [['Items', summary]]),
      grandTotal: 0,
    };
  }

  const discounts = parseRentDiscounts(data);
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const grandTotal = Math.max(0, subtotal - discountTotal);

  const header = `<tr>
    <td style="padding:10px 14px;font-family:${FONT_BODY};font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;">Item</td>
    <td style="padding:10px 14px;font-family:${FONT_BODY};font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;text-align:center;width:48px;">Qty</td>
    <td style="padding:10px 14px;font-family:${FONT_BODY};font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;text-align:right;width:96px;">Rate</td>
    <td style="padding:10px 14px;font-family:${FONT_BODY};font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;text-align:right;width:100px;">Amount</td>
  </tr>`;

  const bodyRows = lines
    .map(
      (l) => `<tr>
        <td style="padding:12px 14px;font-family:${FONT_BODY};font-size:14px;color:${REKART_NAVY};font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(l.name)}</td>
        <td style="padding:12px 14px;font-family:${FONT_BODY};font-size:14px;color:#475569;text-align:center;border-bottom:1px solid #f1f5f9;">${l.qty}</td>
        <td style="padding:12px 14px;font-family:${FONT_BODY};font-size:14px;color:#475569;text-align:right;border-bottom:1px solid #f1f5f9;${MONEY_CELL_NOWRAP}">${escapeHtml(formatMoney(l.rate, currency))}</td>
        <td style="padding:12px 14px;font-family:${FONT_BODY};font-size:14px;color:${REKART_NAVY};font-weight:700;text-align:right;border-bottom:1px solid #f1f5f9;${MONEY_CELL_NOWRAP}">${escapeHtml(formatMoney(l.lineTotal, currency))}</td>
      </tr>`,
    )
    .join('');

  const summaryRows =
    discountTotal > 0
      ? `<tr>
        <td colspan="3" style="padding:12px 14px;font-family:${FONT_BODY};font-size:13px;font-weight:600;color:#64748b;text-align:left;border-top:1px solid #e2e8f0;">Subtotal</td>
        <td style="padding:12px 14px;font-family:${FONT_BODY};font-size:13px;font-weight:700;color:${REKART_NAVY};text-align:right;border-top:1px solid #e2e8f0;${MONEY_CELL_NOWRAP}">${escapeHtml(formatMoney(subtotal, currency))}</td>
      </tr>${discounts
        .map(
          (d) => `<tr>
        <td colspan="3" style="padding:10px 14px;font-family:${FONT_BODY};font-size:13px;color:#059669;text-align:left;">${escapeHtml(d.description)}</td>
        <td style="padding:10px 14px;font-family:${FONT_BODY};font-size:13px;font-weight:600;color:#059669;text-align:right;${MONEY_CELL_NOWRAP}">− ${escapeHtml(formatMoney(d.amount, currency))}</td>
      </tr>`,
        )
        .join('')}`
      : '';

  const totalLabel = discountTotal > 0 ? 'Total' : 'Estimated total';
  const totalRow = `<tr>
    <td colspan="3" style="padding:14px;font-family:${FONT_BODY};font-size:14px;font-weight:800;color:${REKART_NAVY};text-align:left;border-top:2px solid #e2e8f0;">${totalLabel}</td>
    <td style="padding:14px;font-family:${FONT_BODY};font-size:16px;font-weight:800;color:${REKART_NAVY};text-align:right;border-top:2px solid #e2e8f0;${MONEY_CELL_NOWRAP}">${escapeHtml(formatMoney(grandTotal, currency))}</td>
  </tr>`;

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin:0 0 20px;background:#ffffff;">
    <tr><td style="background:#f8fafc;padding:11px 18px;font-family:${FONT_BODY};font-size:10px;font-weight:800;color:${REKART_TOP_BAR};text-transform:uppercase;letter-spacing:0.12em;border-bottom:1px solid #e2e8f0;">Rental items &amp; pricing</td></tr>
    <tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tbody>${header}${bodyRows}${summaryRows}${totalRow}</tbody></table></td></tr>
  </table>`;

  return { html, grandTotal };
}

function ctaRow(
  buttons: Array<{ label: string; href: string; style?: 'primary' | 'success' | 'secondary' | 'danger' }>,
  clickBase?: string,
): string {
  const valid = buttons.filter((b) => b.href && b.href !== '#');
  if (!valid.length) return '';

  const colPct = Math.floor(100 / valid.length);
  const cells = valid
    .map((b) => {
      const href = wrapClick(b.href, clickBase);
      const style = b.style ?? 'primary';
      const fillColor =
        style === 'success' ? '#16a34a'
        : style === 'danger' ? '#dc2626'
        : style === 'secondary' ? '#f8fafc'
        : REKART_TOP_BAR;
      const textColor = style === 'secondary' ? '#475569' : '#ffffff';
      const anchorStyle =
        style === 'secondary'
          ? 'background:#f8fafc;color:#475569;border:2px solid #e2e8f0;'
          : style === 'danger'
            ? 'background:#ffffff;color:#dc2626;border:2px solid #fecaca;'
            : `background:${fillColor};color:${textColor};border:none;`;
      return `<td align="center" valign="middle" width="${colPct}%" style="padding:4px;">
        <a href="${href}" class="cta-btn cta-${style}" style="${anchorStyle}text-decoration:none;display:inline-block;width:100%;box-sizing:border-box;padding:14px 22px;border-radius:10px;font-family:${FONT_BODY};font-size:14px;font-weight:700;text-align:center;min-height:48px;line-height:1.3;">${escapeHtml(b.label)}</a>
      </td>`;
    })
    .join('');

  return `<table role="presentation" class="cta-button-table" cellpadding="0" cellspacing="0" align="center" width="100%" style="width:100%;max-width:480px;margin:24px auto 8px;border-collapse:separate;border-spacing:10px;"><tr>${cells}</tr></table>`;
}

function alertBox(text: string, variant: 'info' | 'warning' | 'success' = 'info'): string {
  const colors = {
    info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
    success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  }[variant];
  return `<div style="background:${colors.bg};border:1px solid ${colors.border};border-radius:10px;padding:14px 16px;margin:0 0 20px;font-family:${FONT_BODY};font-size:13px;line-height:1.6;color:${colors.text};">${text}</div>`;
}

function highlightBox(label: string, value: string, sub?: string, accentColor = REKART_ACCENT): string {
  if (!value.trim()) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${REKART_LIGHT_BORDER};border-radius:14px;background:${REKART_LIGHT_BG};overflow:hidden;">
    <tr><td style="padding:18px;text-align:center;font-family:${FONT_BODY};">
      <p style="${textStyle(`font-size:10px;font-weight:800;color:${accentColor};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;`)}">${escapeHtml(label)}</p>
      <p style="${textStyle(`font-size:28px;font-weight:800;color:${REKART_NAVY};line-height:1;`)}">${escapeHtml(value)}</p>
      ${sub ? `<p style="${textStyle('font-size:12px;color:#64748b;margin-top:8px;')}">${escapeHtml(sub)}</p>` : ''}
    </td></tr>
  </table>`;
}

function greeting(data: Record<string, unknown>, ov: PerEmailOverrides): string {
  const name = field(data, 'customerName');
  const raw =
    ov.customGreetingText?.trim() ||
    `Hi ${name || 'there'},`;
  return raw.endsWith(',') ? raw : `${raw},`;
}

function buildRentRequestBody(
  data: Record<string, unknown>,
  ov: PerEmailOverrides,
  clickBase?: string,
): string {
  const currency = field(data, 'currency') || 'AED';
  const requestId = field(data, 'requestId');
  const itemsTable = rentalItemsQtyTable(data);

  const lines = [
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:16px;')}">${escapeHtml(greeting(data, ov))}</p>`,
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:20px;')}">Thank you for your rent request <strong style="color:${REKART_NAVY};">#${escapeHtml(requestId)}</strong>. Review the details below and confirm pickup or delivery — our team will share pricing after you confirm.</p>`,
    optionalStaffNote(data),
    alertBox(
      'Tap <strong>Confirm</strong> to verify dates, items, and pickup or delivery. Tap <strong>Decline</strong> if you no longer need this rental.',
      'info',
    ),
  ];

  if (itemsTable) lines.push(itemsTable);

  lines.push(
    infoCard('Request details', [
      ['Request ID', requestId],
      ['Request date', field(data, 'requestDate')],
      ['Phone', field(data, 'customerPhone')],
      ['Address on file', field(data, 'customerAddress')],
      ['Currency', currency],
    ]),
    ctaRow(
      [
        { label: 'Confirm request', href: field(data, 'confirmUrl'), style: 'success' },
        { label: 'Decline', href: field(data, 'declineUrl'), style: 'danger' },
      ],
      clickBase,
    ),
  );

  return lines.filter(Boolean).join('\n');
}

function buildRentAgreementBody(
  data: Record<string, unknown>,
  ov: PerEmailOverrides,
  clickBase?: string,
): string {
  const currency = field(data, 'currency') || 'AED';
  const { html: itemsTable, grandTotal } = rentalItemsPricingTable(data, currency);
  const rentalAmount = parseAmount(data['rentalAmount']) || grandTotal;
  const deposit = parseAmount(data['securityDeposit']);
  const agreementRows: Array<[string, string]> = [
    ['Rental start', field(data, 'rentalStartDate')],
    ['Return due', field(data, 'returnDueDate') || field(data, 'rentalEndDate')],
  ];
  const mode = field(data, 'fulfillmentMode').toLowerCase();
  if (deposit > 0) {
    agreementRows.unshift([
      'Security deposit',
      `${formatMoney(deposit, currency)} — due at ${rentHandoverTimingPhrase(mode)}`,
    ]);
  }
  if (rentalAmount > 0) {
    agreementRows.push([
      'Rental fee',
      `${formatMoney(rentalAmount, currency)} — due at ${rentHandoverTimingPhrase(mode)}`,
    ]);
  }

  const revN = Number(data['agreementGeneration'] ?? 0);
  const reviseType = String(data['quoteReviseType'] ?? '').trim();
  const declineReason = String(data['quoteDeclineReason'] ?? '').trim();
  const declineNote = String(data['quoteDeclineNote'] ?? '').trim();

  let headerCallout = '';
  if (reviseType === 'after_reason' && declineReason) {
    headerCallout = alertBox(
      `<strong style="font-size:14px;">Revised quote after your feedback</strong><br/><span style="font-size:13px;line-height:1.55;">You told us: &ldquo;${escapeHtml(declineReason)}&rdquo;.${declineNote ? ` ${escapeHtml(declineNote)}` : ''} Based on that, here is an updated quote.</span>`,
      'info',
    );
  } else if (reviseType === 'final_offer') {
    headerCallout = alertBox(
      `<strong style="font-size:14px;">Our best offer</strong><br/><span style="font-size:13px;line-height:1.55;">We cannot reduce the price further. You can accept this quote to proceed with your rental, or decline if you do not wish to continue.</span>`,
      'warning',
    );
  } else if (revN > 1) {
    headerCallout = alertBox(
      `<strong style="font-size:14px;">Revised quote</strong><br/><span style="font-size:13px;line-height:1.5;">This is an updated amount. The buttons below apply only to this version &mdash; earlier links are no longer valid.</span>`,
      'info',
    );
  }

  const acceptHref = field(data, 'acceptUrl') || field(data, 'agreementUrl');
  const declineHref = field(data, 'declineUrl');
  const ctaButtons = [
    { label: 'Review & accept quote', href: acceptHref, style: 'primary' as const },
    ...(declineHref
      ? [{ label: 'Decline', href: declineHref, style: 'danger' as const }]
      : []),
  ];

  const footerNote =
    reviseType === 'final_offer'
      ? alertBox(
          'This is our best price for your rental. Accept to proceed, or decline if you prefer not to continue.',
          'warning',
        )
      : alertBox(
          'Acceptance is required before we prepare your rental for pickup or delivery.',
          'warning',
        );

  return [
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:16px;')}">${escapeHtml(greeting(data, ov))}</p>`,
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:20px;')}">Your rental quote for request <strong style="color:${REKART_NAVY};">#${escapeHtml(field(data, 'requestId'))}</strong> is ready. Review pricing, dates, and pickup or delivery below, then accept to continue.</p>`,
    headerCallout,
    optionalStaffNote(data),
    rentalSummaryCard(data),
    itemsTable,
    rentalAmount > 0
      ? highlightBox(
          'Quote total',
          formatMoney(rentalAmount, currency),
          rentalPeriodLabel(data)
            ? `Period: ${rentalPeriodLabel(data)} · Full payment due at ${rentHandoverTimingPhrase(mode)}`
            : `Full payment due at ${rentHandoverTimingPhrase(mode)}`,
        )
      : '',
    rentPaymentTermsAlert(data, currency, deposit, rentalAmount),
    infoCard('Quote details', agreementRows),
    ctaRow(ctaButtons, clickBase),
    footerNote,
  ].filter(Boolean).join('\n');
}

function rentPaymentMethodLabel(data: Record<string, unknown>): string {
  return String(data['paymentMethod'] ?? '').trim();
}

function buildRentReadyPickupBody(data: Record<string, unknown>, ov: PerEmailOverrides, clickBase?: string): string {
  const currency = field(data, 'currency') || 'AED';
  const { html: itemsTable } = rentalItemsPricingTable(data, currency);
  const pickupAddress = resolvePickupAddress(data);
  const pickupLabel = resolvePickupLocationLabel(data);
  const mapsUrl = googleMapsUrl(pickupAddress);
  const pickupRows: Array<[string, string]> = [];
  if (pickupLabel) pickupRows.push(['Location', pickupLabel]);
  if (pickupAddress) pickupRows.push(['Address', pickupAddress]);
  pickupRows.push(
    ['Pickup date', field(data, 'pickupDate') || field(data, 'rentalStartDate')],
    ['Pickup time', field(data, 'pickupTime')],
    ['Contact', field(data, 'pickupContact') || field(data, 'customerPhone')],
  );
  return [
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:16px;')}">${escapeHtml(greeting(data, ov))}</p>`,
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:20px;')}">Great news — your rental for request <strong style="color:${REKART_NAVY};">#${escapeHtml(field(data, 'requestId'))}</strong> is packed and ready for collection.</p>`,
    optionalStaffNote(data),
    itemsTable,
    infoCard('Pickup details', pickupRows),
    mapsUrl
      ? ctaRow(
          [{ label: 'Open pickup location in Google Maps', href: mapsUrl, style: 'primary' }],
          clickBase,
        )
      : '',
    alertBox('Please bring a valid ID and this email when collecting your rental. Payment is collected at handover.', 'success'),
  ].filter(Boolean).join('\n');
}

function buildRentDispatchedBody(data: Record<string, unknown>, ov: PerEmailOverrides, clickBase?: string): string {
  const currency = field(data, 'currency') || 'AED';
  const { html: itemsTable } = rentalItemsPricingTable(data, currency);
  const deliveryAddress = resolveDeliveryAddress(data);
  const btns: Array<{ label: string; href: string; style?: 'primary' | 'success' | 'secondary' | 'danger' }> = [];
  if (field(data, 'trackingUrl')) {
    btns.push({ label: 'Track delivery', href: field(data, 'trackingUrl'), style: 'primary' });
  }
  return [
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:16px;')}">${escapeHtml(greeting(data, ov))}</p>`,
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:20px;')}">Your rental for request <strong style="color:${REKART_NAVY};">#${escapeHtml(field(data, 'requestId'))}</strong> is on its way to you.</p>`,
    optionalStaffNote(data),
    itemsTable,
    infoCard('Delivery details', [
      ['Courier', field(data, 'courierName')],
      ['Tracking number', field(data, 'trackingNumber')],
      ['Estimated delivery', field(data, 'estimatedDelivery')],
      ['Delivery address', deliveryAddress],
    ]),
    btns.length ? ctaRow(btns, clickBase) : '',
    alertBox('Someone should be available at the delivery address to receive the items.', 'info'),
  ].filter(Boolean).join('\n');
}

function buildRentHandoverBody(data: Record<string, unknown>, ov: PerEmailOverrides, clickBase?: string): string {
  const currency = field(data, 'currency') || 'AED';
  const { html: itemsTable, grandTotal } = rentalItemsPricingTable(data, currency);
  const rentalAmount = parseAmount(data['rentalAmount']) || grandTotal;
  const deposit = parseAmount(data['securityDeposit']);
  const paymentMethod = rentPaymentMethodLabel(data);
  const handoverRows: Array<[string, string]> = [
    ['Return due date', field(data, 'returnDueDate') || field(data, 'rentalEndDate')],
    ['Handover date', field(data, 'handoverDate')],
  ];
  if (paymentMethod) handoverRows.unshift(['Payment method', paymentMethod]);
  if (deposit > 0) handoverRows.unshift(['Security deposit held', formatMoney(deposit, currency)]);
  return [
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:16px;')}">${escapeHtml(greeting(data, ov))}</p>`,
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:20px;')}">Handover is complete for request <strong style="color:${REKART_NAVY};">#${escapeHtml(field(data, 'requestId'))}</strong>. Enjoy your rental!</p>`,
    optionalStaffNote(data),
    itemsTable,
    rentalAmount > 0
      ? highlightBox(
          'Amount paid',
          formatMoney(rentalAmount, currency),
          paymentMethod ? `via ${paymentMethod}` : undefined,
          '#16a34a',
        )
      : '',
    infoCard('Handover summary', handoverRows),
    alertBox(
      `Please return your rental by <strong>${escapeHtml(field(data, 'returnDueDate') || field(data, 'rentalEndDate') || 'the due date')}</strong>.`,
      'info',
    ),
    paymentMethod
      ? alertBox(
          `Payment for this rental was received via <strong>${escapeHtml(paymentMethod)}</strong> at handover.`,
          'success',
        )
      : '',
  ].filter(Boolean).join('\n');
}

function buildRentReturnReminderBody(data: Record<string, unknown>, ov: PerEmailOverrides, clickBase?: string): string {
  const currency = field(data, 'currency') || 'AED';
  const { html: itemsTable } = rentalItemsPricingTable(data, currency);
  const mode = field(data, 'fulfillmentMode').toLowerCase();
  const returnHint =
    mode === 'pickup'
      ? 'Return the items to the same pickup location unless our team advises otherwise.'
      : mode === 'delivery'
        ? 'Our team will arrange collection or share return instructions — reply if you need help.'
        : 'Please return the items on or before the due date.';
  return [
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:16px;')}">${escapeHtml(greeting(data, ov))}</p>`,
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:20px;')}">Your rental return for request <strong style="color:${REKART_NAVY};">#${escapeHtml(field(data, 'requestId'))}</strong> is due soon.</p>`,
    optionalStaffNote(data),
    itemsTable,
    highlightBox('Return due', field(data, 'returnDueDate') || field(data, 'rentalEndDate'), rentalPeriodLabel(data) || undefined, '#d97706'),
    alertBox(`${returnHint} Late returns may affect your security deposit.`, 'warning'),
  ].filter(Boolean).join('\n');
}

function buildRentReturnReceivedBody(data: Record<string, unknown>, ov: PerEmailOverrides): string {
  const currency = field(data, 'currency') || 'AED';
  const { html: itemsTable } = rentalItemsPricingTable(data, currency);
  return [
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:16px;')}">${escapeHtml(greeting(data, ov))}</p>`,
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:20px;')}">We have received your return for request <strong style="color:${REKART_NAVY};">#${escapeHtml(field(data, 'requestId'))}</strong>. Thank you!</p>`,
    optionalStaffNote(data),
    itemsTable,
    infoCard('Return check-in', [
      ['Received at', field(data, 'receivedAt')],
      ['Condition', field(data, 'returnCondition')],
    ]),
    alertBox('We will process your deposit settlement and email you once it is complete.', 'info'),
  ].filter(Boolean).join('\n');
}

function buildRentClosedBody(data: Record<string, unknown>, ov: PerEmailOverrides): string {
  const currency = field(data, 'currency') || 'AED';
  const { html: itemsTable, grandTotal } = rentalItemsPricingTable(data, currency);
  const deposit = parseAmount(data['securityDeposit']);
  const refund = parseAmount(data['depositRefund']);
  const deduction = parseAmount(data['depositDeduction']);
  const hasRefundField = moneyFieldPresent(data, 'depositRefund');
  const hasDeductionField = moneyFieldPresent(data, 'depositDeduction');
  const closureNote = field(data, 'closureNotes') || field(data, 'customMessage');

  const returnRows: Array<[string, string]> = [
    ['Received at', field(data, 'receivedAt')],
    ['Return condition', field(data, 'returnCondition')],
  ].filter(([, v]) => v.trim()) as Array<[string, string]>;

  const settlementRows: Array<[string, string]> = [];
  if (deposit > 0) {
    settlementRows.push(['Security deposit held', formatMoney(deposit, currency)]);
  }
  if (hasRefundField) {
    settlementRows.push(['Deposit refund', formatMoney(refund, currency)]);
  }
  if (hasDeductionField) {
    settlementRows.push(['Deposit deduction', formatMoney(deduction, currency)]);
  }
  if (grandTotal > 0) {
    settlementRows.push(['Rental total', formatMoney(grandTotal, currency)]);
  }
  if (closureNote) settlementRows.push(['Notes', closureNote]);

  const paymentMethod = rentPaymentMethodLabel(data);
  if (paymentMethod) {
    settlementRows.push(['Payment method', paymentMethod]);
  }

  return [
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:16px;')}">${escapeHtml(greeting(data, ov))}</p>`,
    `<p style="${textStyle('font-size:15px;line-height:1.65;color:#475569;margin-bottom:20px;')}">Your rental journey for request <strong style="color:${REKART_NAVY};">#${escapeHtml(field(data, 'requestId'))}</strong> is now complete. Thank you for renting with Rekart!</p>`,
    optionalStaffNote(data),
    itemsTable,
    returnRows.length ? infoCard('Return summary', returnRows) : '',
    settlementRows.length ? infoCard('Final settlement', settlementRows) : '',
    alertBox('We hope to serve you again soon!', 'success'),
  ].filter(Boolean).join('\n');
}

const BODY_BUILDERS: Record<string, (data: Record<string, unknown>, ov: PerEmailOverrides, clickBase?: string) => string> = {
  'rent-request': buildRentRequestBody,
  'rent-agreement': buildRentAgreementBody,
  'rent-ready-pickup': buildRentReadyPickupBody,
  'rent-dispatched': buildRentDispatchedBody,
  'rent-handover': buildRentHandoverBody,
  'rent-return-reminder': buildRentReturnReminderBody,
  'rent-return-received': buildRentReturnReceivedBody,
  'rent-closed': buildRentClosedBody,
};

export function renderRentEmailHtml(
  workflowKey: string,
  dynamicValues: Record<string, unknown>,
  opts: {
    workspaceName?: string;
    logoUrl?: string;
    mascotSrc?: string;
    socialIconSrcs?: Record<string, string>;
    subject?: string;
    designTokens?: Partial<DesignTokens>;
    footer?: FooterOptions;
    perEmailOverrides?: PerEmailOverrides;
    tracking?: TrackingOptions;
    compliance?: ComplianceOptions;
  } = {},
): string {
  const ov: PerEmailOverrides = { ...(opts.perEmailOverrides ?? {}) };
  const heading = STEP_HEADINGS[workflowKey] ?? opts.subject ?? 'Rental update';
  const badge = STEP_BADGES[workflowKey] ?? 'RENT UPDATE';
  const bodyText =
    STEP_BODY_TEXT[workflowKey] ??
    `Request #${field(dynamicValues, 'requestId') || '—'} — please review the details below.`;
  const clickBase = opts.tracking?.clickBaseUrl;
  const fulfillmentMode = field(dynamicValues, 'fulfillmentMode');
  const stepProgressBlock = rentStepProgressHtml(workflowKey, fulfillmentMode);

  const builder = BODY_BUILDERS[workflowKey];
  const contentBlocks = builder
    ? builder(dynamicValues, ov, clickBase)
    : `<p style="${textStyle('font-size:15px;color:#475569;')}">Rental update for request <strong>#${escapeHtml(field(dynamicValues, 'requestId'))}</strong>.</p>`;

  return renderRekartEmailShell({
    journeyLabel: 'Rent Journey',
    subject: opts.subject ?? heading,
    stepBadge: badge,
    heroHeadline: heading,
    bodyText,
    contentBlocks,
    stepProgressHtml: stepProgressBlock,
    mascotSrc: opts.mascotSrc,
    mascotAlt: 'Rekart mascot',
    workspaceName: opts.workspaceName,
    logoUrl: opts.logoUrl,
    designTokens: {
      ...(opts.designTokens ?? {}),
      primaryColor: REKART_TOP_BAR,
      accentColor: REKART_ACCENT,
      secondaryColor: REKART_LIGHT_BG,
    },
    footer: opts.footer,
    perEmailOverrides: ov,
    tracking: opts.tracking,
    compliance: opts.compliance,
    socialIconSrcs: opts.socialIconSrcs,
  });
}
