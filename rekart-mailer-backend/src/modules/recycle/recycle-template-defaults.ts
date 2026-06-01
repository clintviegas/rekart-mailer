import { RECYCLE_JOURNEY_WORKFLOW_STEPS } from './schemas/recycle-request-journey.schema';

export const EXTRA_RECYCLE_WORKFLOW_KEYS = [
  'recycle-request-reminder',
  'pickup-scheduled-reminder',
] as const;

export const ADHOC_RETURN_RECYCLE_WORKFLOW_KEYS = [] as const;

export const COURIER_DISPATCH_RECYCLE_WORKFLOW_KEYS = [] as const;

export const ALL_RECYCLE_TEMPLATE_WORKFLOW_KEYS = [
  ...RECYCLE_JOURNEY_WORKFLOW_STEPS,
  ...EXTRA_RECYCLE_WORKFLOW_KEYS,
  ...ADHOC_RETURN_RECYCLE_WORKFLOW_KEYS,
  ...COURIER_DISPATCH_RECYCLE_WORKFLOW_KEYS,
] as const;

export type RecycleTemplateWorkflowKey = (typeof ALL_RECYCLE_TEMPLATE_WORKFLOW_KEYS)[number];

export const RECYCLE_PUBLISHED_TEMPLATE_DEFAULTS: Record<
  RecycleTemplateWorkflowKey,
  {
    name: string;
    subject: string;
    sampleDynamicFields: Record<string, string>;
  }
> = {
  'recycle-request': {
    name: 'Recycle request (default)',
    subject: 'Confirm your e-waste pickup request — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      collectionMode: 'listed',
      recycleItemsSummary: 'MacBook Pro ×1, Dell Monitor ×2',
      pickupAddress: 'Business Bay, Dubai',
      collectionNotes: 'Ground floor reception',
    },
  },
  'pickup-scheduled': {
    name: 'Pickup scheduled (default)',
    subject: 'Pickup scheduled — {{pickupDate}} {{pickupTime}}',
    sampleDynamicFields: {
      pickupDate: '15/05/26',
      pickupTime: '2:00–5:00 PM',
      pickupAddress: 'Business Bay, Dubai',
      recycleItemsSummary: 'MacBook Pro ×1, Dell Monitor ×2',
      agentName: 'Field Agent',
      agentPhone: '+971 50 000 0000',
    },
  },
  'devices-collected': {
    name: 'Devices collected (default)',
    subject: 'Devices collected — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      collectedDate: '16/05/26',
      collectedBy: 'Field Agent',
      actualItemsSummary: 'MacBook Pro ×1, Dell Monitor ×2',
      actualTotalQty: '3',
    },
  },
  'certificate-issued': {
    name: 'Certificate issued (default)',
    subject: 'Your recycling certificate — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      certificateNumber: 'RC-2026-00123',
      certificateIssuedDate: '17/05/26',
      certificateUrl: 'https://example.com/certificate.pdf',
    },
  },
  'recycle-request-reminder': {
    name: 'Recycle request — Reminder',
    subject: 'Reminder: Please confirm your recycling request — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'TEMPLATE',
      recycleItemsSummary: 'MacBook Pro ×1',
    },
  },
  'pickup-scheduled-reminder': {
    name: 'Pickup scheduled — Reminder',
    subject: 'Reminder: Pickup tomorrow — {{pickupDate}}',
    sampleDynamicFields: {
      pickupDate: '16/05/26',
      pickupTime: '2:00–5:00 PM',
      pickupAddress: 'Business Bay, Dubai',
    },
  },
};
