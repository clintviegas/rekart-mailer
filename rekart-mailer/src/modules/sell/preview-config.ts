// ────────────────────────────────────────────────────────────────────────────
//  SELL workflow live email preview — metadata-driven template engine
//  Each workflow defines WHAT to show; the renderer is a pure data consumer.
// ────────────────────────────────────────────────────────────────────────────

import { formatDateDDMMYY } from "@/lib/date-format";

// ── Field / value types ───────────────────────────────────────────────────────
export type PreviewFieldFormat = "text" | "currency" | "date" | "badge";

export interface PreviewFieldRef {
  key: string;
  label: string;
  format?: PreviewFieldFormat;
  currencySymbol?: string;
  fallback: string;
}

// ── Block type interfaces ─────────────────────────────────────────────────────

export interface InfoTableBlock {
  type: "info-table";
  title?: string;
  rows: PreviewFieldRef[];
}

export interface HighlightBlock {
  type: "highlight";
  label: string;
  fieldKey: string;
  fallback: string;
  format?: "currency" | "date" | "text";
  currencySymbol?: string;
  /** emerald = success/positive, amber = warning, indigo = neutral */
  accent?: "indigo" | "emerald" | "amber";
  /** Template string: "via {{paymentMethod}}" — keys resolved from values */
  sublineTemplate?: string;
  /** Keys used in the subline template */
  sublineKeys?: string[];
}

export interface TextBodyBlock {
  type: "text-body";
  content: (vals: Record<string, string>) => string;
  style?: "default" | "address" | "note";
}

export interface CtaButton {
  text: string;
  urlKey?: string;
  fallbackUrl?: string;
  /** mailto: support for email links */
  emailKey?: string;
  variant: "primary" | "success" | "outline" | "danger";
}

export interface CtaGroupBlock {
  type: "cta-group";
  buttons: CtaButton[];
}

export interface TagRowBlock {
  type: "tag-row";
  label?: string;
  tags: PreviewFieldRef[];
}

export interface AlertBlock {
  type: "alert";
  variant: "warning" | "info" | "success";
  icon: "clock" | "check" | "info" | "shield";
  title: (vals: Record<string, string>) => string;
  body?: (vals: Record<string, string>) => string;
}

export interface DeviceCardBlock {
  type: "device-card";
  fields: {
    name: { key: string; fallback: string };
    brand?: { key: string; fallback: string };
    condition?: { key: string; fallback: string };
  };
}

export type AnyPreviewBlock =
  | InfoTableBlock
  | HighlightBlock
  | TextBodyBlock
  | CtaGroupBlock
  | TagRowBlock
  | AlertBlock
  | DeviceCardBlock;

// ── Template interface ────────────────────────────────────────────────────────
export interface PreviewTemplate {
  stepId: string;
  greeting: (vals: Record<string, string>) => string;
  bodyText: (vals: Record<string, string>) => string;
  blocks: AnyPreviewBlock[];
}

// ── Polished fallback values ──────────────────────────────────────────────────
// Shown when a field hasn't been filled yet. Always look realistic.
export const PREVIEW_FALLBACKS: Record<string, string> = {
  // Common
  customerName: "Sarah Johnson",
  requestId: "RKTS47914",
  deviceName: "iPhone 14 Pro",
  deviceBrand: "Apple",
  condition: "Good",
  trackUrl: "#",

  // Request Received
  estimatedPriceMin: "400",
  estimatedPriceMax: "600",
  requestDate: "13/05/26",

  // Pickup Scheduled
  pickupDate: "15/05/26",
  pickupTimeSlot: "12:00 PM – 3:00 PM",
  agentName: "Amit Kumar",
  agentContact: "+91 98765 43210",
  pickupAddress: "123 Main Street, Andheri West, Mumbai 400053",

  // Inspection Underway
  inspectionStartDate: "13/05/26",
  estimatedCompletion: "Within 2 business hours",
  inspectorName: "Priya Verma",
  inspectionCenter: "Rekart Hub — Andheri West",

  // Offer Ready
  finalOffer: "17000",
  originalEstimate: "18500",
  offerExpiresAt: "20/05/26",
  offerNotes: "Minor screen wear noted — ₹1,500 deduction applied.",
  acceptUrl: "#",
  declineUrl: "#",

  // Payment Sent
  paymentAmount: "17000",
  paymentMethod: "Bank Transfer (NEFT)",
  transactionId: "UTIB000123456789",
  paymentDate: "13/05/26",
  bankName: "HDFC Bank",
  accountLast4: "4321",
  receiptUrl: "#",

  // Device Collected
  collectionDate: "13/05/26",
  collectedBy: "Sanjay Mehta (Field Agent)",
  deviceConditionOnArrival: "As Described",
  trackingId: "WH-2024-0087",
  collectionNotes:
    "Item collected in perfect condition. Thank you for your cooperation.",

  // Completed
  finalAmount: "17000",
  completionDate: "13/05/26",
  feedbackUrl: "#",
  supportEmail: "support@rekart.io",
  closingMessage:
    "Thank you for choosing Rekart. We look forward to serving you again!",
};

// ── Value resolver ────────────────────────────────────────────────────────────
/**
 * Merges raw form values over the fallback pool.
 * Result: every key is always populated with something readable.
 */
export function resolveAllValues(
  rawValues: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = { ...PREVIEW_FALLBACKS };
  for (const [key, val] of Object.entries(rawValues)) {
    if (val !== undefined && val !== null && val !== "" && val !== false) {
      result[key] = String(val);
    }
  }
  return result;
}

/** Returns the set of field keys the user has actually filled in */
export function getRealFields(rawValues: Record<string, unknown>): Set<string> {
  const set = new Set<string>();
  for (const [key, val] of Object.entries(rawValues)) {
    if (val !== undefined && val !== null && val !== "" && val !== false) {
      set.add(key);
    }
  }
  return set;
}

/** Resolves {{key}} tokens in a template string using the values map */
export function resolveTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => values[key] ?? `{{${key}}}`
  );
}

/** Formats a resolved string value for display */
export function formatFieldValue(
  value: string,
  format?: PreviewFieldFormat,
  currencySymbol = "₹"
): string {
  if (!format || format === "text" || format === "badge") return value;

  if (format === "currency") {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return `${currencySymbol}\u00A0${num.toLocaleString("en-IN")}`;
  }

  if (format === "date") {
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value.trim())) return value.trim();
    const formatted = formatDateDDMMYY(value);
    if (formatted) return formatted;
    return value;
  }

  return value;
}

// ── All 7 workflow preview templates ─────────────────────────────────────────
export const PREVIEW_TEMPLATES: PreviewTemplate[] = [
  // ── 1. Request Received ────────────────────────────────────────────────────
  {
    stepId: "request-received",
    greeting: (v) => `Hi ${v.customerName},`,
    bodyText: (v) =>
      `We've received your sell request for your ${v.deviceName} and our team is reviewing it. You'll hear from us shortly to schedule a convenient pickup.`,
    blocks: [
      {
        type: "device-card",
        fields: {
          name: { key: "deviceName", fallback: PREVIEW_FALLBACKS.deviceName },
          brand: { key: "deviceBrand", fallback: PREVIEW_FALLBACKS.deviceBrand },
          condition: { key: "condition", fallback: PREVIEW_FALLBACKS.condition },
        },
      },
      {
        type: "info-table",
        title: "Request Details",
        rows: [
          {
            key: "requestId",
            label: "Request ID",
            fallback: PREVIEW_FALLBACKS.requestId,
          },
          {
            key: "estimatedPriceMin",
            label: "Est. value (min)",
            format: "currency",
            currencySymbol: "₹",
            fallback: PREVIEW_FALLBACKS.estimatedPriceMin,
          },
          {
            key: "estimatedPriceMax",
            label: "Est. value (max)",
            format: "currency",
            currencySymbol: "₹",
            fallback: PREVIEW_FALLBACKS.estimatedPriceMax,
          },
          {
            key: "requestDate",
            label: "Submitted On",
            fallback: PREVIEW_FALLBACKS.requestDate,
          },
        ],
      },
      {
        type: "cta-group",
        buttons: [
          {
            text: "Track Your Request →",
            urlKey: "trackUrl",
            fallbackUrl: PREVIEW_FALLBACKS.trackUrl,
            variant: "primary",
          },
        ],
      },
    ],
  },

  // ── 2. Pickup Scheduled ────────────────────────────────────────────────────
  {
    stepId: "pickup-scheduled",
    greeting: (v) => `Hi ${v.customerName},`,
    bodyText: (v) =>
      `Your pickup has been confirmed. Our agent ${v.agentName} will arrive during the time slot below. Please ensure someone is available at the address to hand over the item.`,
    blocks: [
      {
        type: "highlight",
        label: "Scheduled Pickup",
        fieldKey: "pickupDate",
        fallback: PREVIEW_FALLBACKS.pickupDate,
        format: "date",
        accent: "indigo",
        sublineTemplate: "{{pickupTimeSlot}}",
        sublineKeys: ["pickupTimeSlot"],
      },
      {
        type: "info-table",
        title: "Agent Details",
        rows: [
          {
            key: "agentName",
            label: "Agent Name",
            fallback: PREVIEW_FALLBACKS.agentName,
          },
          {
            key: "agentContact",
            label: "Contact",
            fallback: PREVIEW_FALLBACKS.agentContact,
          },
        ],
      },
      {
        type: "text-body",
        content: (v) => v.pickupAddress,
        style: "address",
      },
      {
        type: "cta-group",
        buttons: [
          {
            text: "View Pickup Details →",
            urlKey: "trackUrl",
            fallbackUrl: PREVIEW_FALLBACKS.trackUrl,
            variant: "primary",
          },
        ],
      },
    ],
  },

  // ── 3. Inspection Underway ─────────────────────────────────────────────────
  {
    stepId: "inspection-underway",
    greeting: (v) => `Hi ${v.customerName},`,
    bodyText: (v) =>
      `Your ${v.deviceName} is currently undergoing a detailed quality inspection at our ${v.inspectionCenter} facility. We'll update you as soon as the assessment is complete.`,
    blocks: [
      {
        type: "info-table",
        title: "Inspection Details",
        rows: [
          {
            key: "requestId",
            label: "Request ID",
            fallback: PREVIEW_FALLBACKS.requestId,
          },
          {
            key: "inspectionStartDate",
            label: "Started On",
            fallback: PREVIEW_FALLBACKS.inspectionStartDate,
          },
          {
            key: "inspectorName",
            label: "Inspector",
            fallback: PREVIEW_FALLBACKS.inspectorName,
          },
          {
            key: "inspectionCenter",
            label: "Location",
            fallback: PREVIEW_FALLBACKS.inspectionCenter,
          },
        ],
      },
      {
        type: "alert",
        variant: "info",
        icon: "clock",
        title: (v) => `Estimated completion: ${v.estimatedCompletion}`,
        body: () =>
          "We'll notify you immediately once the inspection report is ready.",
      },
      {
        type: "cta-group",
        buttons: [
          {
            text: "Check Status →",
            urlKey: "trackUrl",
            fallbackUrl: PREVIEW_FALLBACKS.trackUrl,
            variant: "primary",
          },
        ],
      },
    ],
  },

  // ── 4. Offer Ready ─────────────────────────────────────────────────────────
  {
    stepId: "offer-ready",
    greeting: (v) => `Hi ${v.customerName},`,
    bodyText: (v) =>
      `We've completed the inspection of your ${v.deviceName} and are pleased to present your final offer. Please review and respond before the deadline.`,
    blocks: [
      {
        type: "highlight",
        label: "Your Final Offer",
        fieldKey: "finalOffer",
        fallback: PREVIEW_FALLBACKS.finalOffer,
        format: "currency",
        currencySymbol: "₹",
        accent: "emerald",
      },
      {
        type: "info-table",
        title: "Offer Breakdown",
        rows: [
          {
            key: "deviceName",
            label: "Item",
            fallback: PREVIEW_FALLBACKS.deviceName,
          },
          {
            key: "originalEstimate",
            label: "Initial Estimate",
            format: "currency",
            currencySymbol: "₹",
            fallback: PREVIEW_FALLBACKS.originalEstimate,
          },
          {
            key: "offerExpiresAt",
            label: "Valid Until",
            fallback: PREVIEW_FALLBACKS.offerExpiresAt,
          },
        ],
      },
      {
        type: "alert",
        variant: "warning",
        icon: "clock",
        title: (v) => `Offer expires on ${v.offerExpiresAt}`,
        body: () =>
          "Accept or decline before the deadline to secure your payout.",
      },
      {
        type: "text-body",
        content: (v) => v.offerNotes,
        style: "note",
      },
      {
        type: "cta-group",
        buttons: [
          {
            text: "✓  Accept Offer",
            urlKey: "acceptUrl",
            fallbackUrl: PREVIEW_FALLBACKS.acceptUrl,
            variant: "success",
          },
          {
            text: "Decline",
            urlKey: "declineUrl",
            fallbackUrl: PREVIEW_FALLBACKS.declineUrl,
            variant: "outline",
          },
        ],
      },
    ],
  },

  // ── 5. Payment Sent ────────────────────────────────────────────────────────
  {
    stepId: "payment-sent",
    greeting: (v) => `Hi ${v.customerName},`,
    bodyText: () =>
      `Great news! Your payment has been processed and is on its way to your account. Please find the transaction details below.`,
    blocks: [
      {
        type: "highlight",
        label: "Amount Transferred",
        fieldKey: "paymentAmount",
        fallback: PREVIEW_FALLBACKS.paymentAmount,
        format: "currency",
        currencySymbol: "₹",
        accent: "emerald",
        sublineTemplate: "via {{paymentMethod}}",
        sublineKeys: ["paymentMethod"],
      },
      {
        type: "info-table",
        title: "Payment Details",
        rows: [
          {
            key: "transactionId",
            label: "Transaction ID",
            fallback: PREVIEW_FALLBACKS.transactionId,
          },
          {
            key: "paymentDate",
            label: "Payment Date",
            fallback: PREVIEW_FALLBACKS.paymentDate,
          },
          {
            key: "bankName",
            label: "Bank",
            fallback: PREVIEW_FALLBACKS.bankName,
          },
          {
            key: "accountLast4",
            label: "Account (Last 4)",
            fallback: PREVIEW_FALLBACKS.accountLast4,
          },
        ],
      },
      {
        type: "alert",
        variant: "success",
        icon: "check",
        title: () => "Payment Confirmed",
        body: () =>
          "Funds typically arrive within 1–2 business days depending on your bank.",
      },
      {
        type: "cta-group",
        buttons: [
          {
            text: "Download Receipt →",
            urlKey: "receiptUrl",
            fallbackUrl: PREVIEW_FALLBACKS.receiptUrl,
            variant: "primary",
          },
        ],
      },
    ],
  },

  // ── 6. Item Collected ────────────────────────────────────────────────────
  {
    stepId: "device-collected",
    greeting: (v) => `Hi ${v.customerName},`,
    bodyText: (v) =>
      `Your ${v.deviceName} has been successfully collected by our team and is on its way to our facility for processing.`,
    blocks: [
      {
        type: "info-table",
        title: "Collection Summary",
        rows: [
          {
            key: "collectionDate",
            label: "Collected On",
            fallback: PREVIEW_FALLBACKS.collectionDate,
          },
          {
            key: "collectedBy",
            label: "Collected By",
            fallback: PREVIEW_FALLBACKS.collectedBy,
          },
          {
            key: "deviceConditionOnArrival",
            label: "Item condition",
            fallback: PREVIEW_FALLBACKS.deviceConditionOnArrival,
          },
          {
            key: "trackingId",
            label: "Internal Tracking",
            fallback: PREVIEW_FALLBACKS.trackingId,
          },
        ],
      },
      {
        type: "text-body",
        content: (v) => v.collectionNotes,
        style: "note",
      },
      {
        type: "cta-group",
        buttons: [
          {
            text: "View Request →",
            urlKey: "trackUrl",
            fallbackUrl: PREVIEW_FALLBACKS.trackUrl,
            variant: "primary",
          },
        ],
      },
    ],
  },

  // ── 7. Completed ───────────────────────────────────────────────────────────
  {
    stepId: "completed",
    greeting: (v) => `Hi ${v.customerName},`,
    bodyText: () =>
      `Your sell request has been successfully completed. Here's a summary of your transaction. It's been a pleasure doing business with you!`,
    blocks: [
      {
        type: "highlight",
        label: "Total Payout",
        fieldKey: "finalAmount",
        fallback: PREVIEW_FALLBACKS.finalAmount,
        format: "currency",
        currencySymbol: "₹",
        accent: "emerald",
      },
      {
        type: "info-table",
        title: "Transaction Summary",
        rows: [
          {
            key: "requestId",
            label: "Request ID",
            fallback: PREVIEW_FALLBACKS.requestId,
          },
          {
            key: "completionDate",
            label: "Completed On",
            fallback: PREVIEW_FALLBACKS.completionDate,
          },
        ],
      },
      {
        type: "alert",
        variant: "success",
        icon: "check",
        title: () => "Transaction Complete!",
        body: () =>
          "Thank you for choosing Rekart. We hope to serve you again.",
      },
      {
        type: "text-body",
        content: (v) => v.closingMessage,
        style: "note",
      },
      {
        type: "cta-group",
        buttons: [
          {
            text: "⭐  Rate Your Experience",
            urlKey: "feedbackUrl",
            fallbackUrl: PREVIEW_FALLBACKS.feedbackUrl,
            variant: "primary",
          },
          {
            text: "Contact Support",
            emailKey: "supportEmail",
            fallbackUrl: `mailto:${PREVIEW_FALLBACKS.supportEmail}`,
            variant: "outline",
          },
        ],
      },
    ],
  },
];

export function getPreviewTemplate(stepId: string): PreviewTemplate {
  return (
    PREVIEW_TEMPLATES.find((t) => t.stepId === stepId) ?? PREVIEW_TEMPLATES[0]
  );
}
