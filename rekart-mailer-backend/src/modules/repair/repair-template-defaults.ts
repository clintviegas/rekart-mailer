import { REPAIR_JOURNEY_WORKFLOW_STEPS } from './schemas/repair-request-journey.schema';

/** Reminder emails (scheduler) — not in the main linear funnel. */
export const EXTRA_REPAIR_WORKFLOW_KEYS = [
  'booking-confirmed-reminder',
  'pickup-scheduled-reminder',
  'quote-ready-reminder',
  'device-ready-reminder',
] as const;

/** Ad-hoc return-without-repair emails (staff-triggered after customer requests return). */
export const ADHOC_RETURN_REPAIR_WORKFLOW_KEYS = [
  'device-return-unrepaired',
  'device-return-unrepaired-complete',
] as const;

/** Courier dispatch email after customer chooses courier delivery (before completion). */
export const COURIER_DISPATCH_REPAIR_WORKFLOW_KEYS = [
  'courier-dispatched',
] as const;

export const ALL_REPAIR_TEMPLATE_WORKFLOW_KEYS = [
  ...REPAIR_JOURNEY_WORKFLOW_STEPS,
  ...EXTRA_REPAIR_WORKFLOW_KEYS,
  ...ADHOC_RETURN_REPAIR_WORKFLOW_KEYS,
  ...COURIER_DISPATCH_REPAIR_WORKFLOW_KEYS,
] as const;

export type RepairTemplateWorkflowKey = (typeof ALL_REPAIR_TEMPLATE_WORKFLOW_KEYS)[number];

export const REPAIR_PUBLISHED_TEMPLATE_DEFAULTS: Record<
  RepairTemplateWorkflowKey,
  {
    name: string;
    subject: string;
    sampleDynamicFields: Record<string, string>;
  }
> = {
  'booking-confirmed': {
    name: 'Booking confirmed (default)',
    subject: 'Your repair booking is confirmed — #{{requestId}}',
    sampleDynamicFields: {
      deviceName: 'iPhone 15 Pro',
      requestId: 'TEMPLATE',
      issueDescription: 'Screen not responding',
    },
  },
  'pickup-scheduled': {
    name: 'Pickup scheduled (default)',
    subject: 'Pickup scheduled — {{pickupDate}} {{pickupTime}}',
    sampleDynamicFields: {
      pickupDate: '15/05/26',
      pickupTime: '2:00–5:00 PM',
      pickupAddress: 'Business Bay, Dubai',
      agentName: 'Field Agent',
      agentPhone: '+971 50 000 0000',
    },
  },
  'device-received': {
    name: 'Device received (default)',
    subject: 'We received your device — #{{requestId}}',
    sampleDynamicFields: {
      deviceName: 'iPhone 15 Pro',
      receivedAt: '15/05/26',
    },
  },
  diagnosing: {
    name: 'Diagnosing (default)',
    subject: 'Diagnosis in progress for your {{deviceName}}',
    sampleDynamicFields: {
      deviceName: 'iPhone 15 Pro',
      technicianName: 'Technician',
      estimatedDiagnosisDate: '16/05/26',
    },
  },
  'quote-ready': {
    name: 'Quote ready (default)',
    subject: 'Your repair quote for #{{requestId}} is ready',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      quoteAmount: '450',
      repairSummary: 'Mic is not working and speaker too',
    },
  },
  'repair-in-progress': {
    name: 'Repair in progress (default)',
    subject: 'Repair started — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      estimatedCompletionDate: '18/05/26',
    },
  },
  'device-ready': {
    name: 'Device ready (default)',
    subject: 'Your device is ready — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      deviceName: 'iPhone 15 Pro',
      readyDate: '20/05/26',
      collectionAddress: 'Shop 13, Souq Musalla, Meena Bazaar, Bur Dubai',
      collectionHours: '10:00 AM–9:00 PM',
      collectFromStoreUrl: 'https://example.com/collect',
      courierDeliveryUrl: 'https://example.com/courier',
    },
  },
  'device-returned': {
    name: 'Device returned (default)',
    subject: 'Thank you — repair #{{requestId}} is complete',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      deviceName: 'iPhone 15 Pro',
    },
  },
  'booking-confirmed-reminder': {
    name: 'Booking confirmed — Reminder',
    subject:
      'Reminder: Please confirm your repair booking — #{{requestId}}',
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
  'quote-ready-reminder': {
    name: 'Quote ready — Reminder',
    subject: 'Reminder: Your repair quote is waiting — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      quoteAmount: '450',
      deviceName: 'iPhone 15 Pro',
    },
  },
  'device-ready-reminder': {
    name: 'Device ready — Reminder',
    subject: 'Reminder: Your device is ready for collection — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      deviceName: 'iPhone 15 Pro',
      readyDate: '20/05/26',
      collectionAddress: 'Shop 13, Souq Musalla, Meena Bazaar, Bur Dubai',
      collectionHours: '10:00 AM–9:00 PM',
      collectFromStoreUrl: 'https://example.com/collect',
      courierDeliveryUrl: 'https://example.com/courier',
    },
  },
  'device-return-unrepaired': {
    name: 'Device return without repair (default)',
    subject: 'We are returning your device — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      deviceName: 'iPhone 15 Pro',
      returnMethod: 'Courier to your address',
      courierName: 'Aramex',
      trackingNumber: 'AWB123456789',
      trackingUrl: 'https://www.aramex.com/track',
      expectedReturnDate: '20/05/26',
    },
  },
  'device-return-unrepaired-complete': {
    name: 'Device return complete (default)',
    subject: 'Your device has been returned — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      deviceName: 'iPhone 15 Pro',
      returnedDate: '20/05/26',
    },
  },
  'courier-dispatched': {
    name: 'Courier dispatched (default)',
    subject: 'Your repaired device is on the way — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      deviceName: 'iPhone 15 Pro',
      deliveryAddress: 'Business Bay, Dubai',
      courierName: 'Aramex',
      trackingNumber: 'AWB123456789',
      trackingUrl: 'https://www.aramex.com/track',
    },
  },
};
