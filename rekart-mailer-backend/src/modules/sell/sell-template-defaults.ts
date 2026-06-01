import { JOURNEY_WORKFLOW_STEPS } from './schemas/sell-request-journey.schema';

/** Optional emails not in the main linear journey funnel (no public action tokens). */
export const EXTRA_SELL_WORKFLOW_KEYS = [
  'device-reship',
  'request-received-reminder',
  'pickup-scheduled-reminder',
  'offer-ready-reminder',
] as const;

export const ALL_SELL_TEMPLATE_WORKFLOW_KEYS = [
  ...JOURNEY_WORKFLOW_STEPS,
  ...EXTRA_SELL_WORKFLOW_KEYS,
] as const;

export type SellTemplateWorkflowKey = (typeof ALL_SELL_TEMPLATE_WORKFLOW_KEYS)[number];

/** Seeded when no published template exists — subject supports {{placeholders}} from journey dynamicData. */
export const SELL_PUBLISHED_TEMPLATE_DEFAULTS: Record<
  SellTemplateWorkflowKey,
  {
    name: string;
    subject: string;
    sampleDynamicFields: Record<string, string>;
  }
> = {
  'request-received': {
    name: 'Request received (default)',
    subject: "We've received your sell request — #{{requestId}}",
    sampleDynamicFields: {
      deviceName: 'iPhone 15 Pro',
      requestId: 'TEMPLATE',
    },
  },
  'pickup-scheduled': {
    name: 'Pickup scheduled (default)',
    subject: 'Your pickup is scheduled — {{pickupDate}} {{pickupTime}}',
    sampleDynamicFields: {
      pickupDate: '15/05/26',
      pickupTime: '2:00–5:00 PM',
      pickupAddress: 'Business Bay, Dubai',
      agentName: 'Field Agent',
      agentPhone: '+971 50 000 0000',
    },
  },
  'inspection-underway': {
    name: 'Inspection underway (default)',
    subject: "We're inspecting your {{deviceName}} — update inside",
    sampleDynamicFields: {
      deviceName: 'iPhone 15 Pro',
      inspectorName: 'Inspector',
    },
  },
  'offer-ready': {
    name: 'Offer ready (default)',
    subject: 'Your offer for #{{requestId}} is ready',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      finalOffer: '2400',
    },
  },
  'payment-sent': {
    name: 'Payment sent (default)',
    subject: 'Payment sent for #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      paidAmount: '2400',
    },
  },
  completed: {
    name: 'Journey completed (default)',
    subject: 'Thank you — your sell request #{{requestId}} is complete',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      deviceName: 'iPhone 15 Pro',
    },
  },
  'device-reship': {
    name: 'Return shipment (default)',
    subject: 'Your item is on its way back — {{reshipCourier}} · {{reshipTracking}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      deviceName: 'iPhone 15 Pro',
      reshipCourier: 'Courier',
      reshipTracking: 'TRACK123',
      reshipTrackingUrl: 'https://example.com/track/TRACK123',
    },
  },

  // ── Automated reminder emails (sent by scheduler 24h after original) ────────
  'request-received-reminder': {
    name: 'Request received — Reminder',
    subject: 'Reminder: Please confirm your sell request — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      deviceName: 'iPhone 15 Pro',
    },
  },
  'pickup-scheduled-reminder': {
    name: 'Pickup scheduled — Reminder',
    subject: 'Reminder: Your pickup is coming up — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      pickupDate: '15/05/26',
      pickupTime: '2:00–5:00 PM',
      pickupAddress: 'Business Bay, Dubai',
    },
  },
  'offer-ready-reminder': {
    name: 'Offer ready — Reminder',
    subject: 'Reminder: Your offer is waiting — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      finalOffer: '2400',
      deviceName: 'iPhone 15 Pro',
    },
  },
};
