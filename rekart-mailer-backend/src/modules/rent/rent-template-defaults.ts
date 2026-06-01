import { RENT_JOURNEY_WORKFLOW_STEPS } from './schemas/rent-request-journey.schema';

export const ALL_RENT_TEMPLATE_WORKFLOW_KEYS = [
  ...RENT_JOURNEY_WORKFLOW_STEPS,
] as const;

export type RentTemplateWorkflowKey = (typeof ALL_RENT_TEMPLATE_WORKFLOW_KEYS)[number];

export const RENT_PUBLISHED_TEMPLATE_DEFAULTS: Record<
  RentTemplateWorkflowKey,
  {
    name: string;
    subject: string;
    sampleDynamicFields: Record<string, string>;
  }
> = {
  'rent-request': {
    name: 'Rent request received (default)',
    subject: 'We received your rent request — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'RKRT65592',
      customerName: 'Rahul Sharma',
      customerPhone: '+971 50 123 4567',
      customerAddress: 'Marina Walk, Dubai',
      requestDate: '22/05/26',
      rentalItemsSummary: 'MacBook Pro ×1, Projector ×1',
      currency: 'AED',
    },
  },
  'rent-agreement': {
    name: 'Quote & agreement (default)',
    subject: 'Your rental quote is ready — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'RKRT65592',
      customerName: 'Rahul Sharma',
      fulfillmentMode: 'pickup',
      rentalStartDate: '01/06/26',
      rentalEndDate: '08/06/26',
      rentalDuration: '8 days',
      pickupLocationLabel: 'Business Bay Store',
      confirmedAddress: 'Business Bay, Dubai',
      rentalAmount: '2300',
      securityDeposit: '500',
      currency: 'AED',
    },
  },
  'rent-ready-pickup': {
    name: 'Ready for pickup (default)',
    subject: 'Your rental is ready for pickup — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'RKRT65592',
      customerName: 'Rahul Sharma',
      pickupLocationLabel: 'Business Bay Store',
      pickupAddress: 'Business Bay, Dubai',
      pickupDate: '01/06/26',
      pickupTime: '10:00 AM – 6:00 PM',
      customerPhone: '+971 50 123 4567',
      currency: 'AED',
    },
  },
  'rent-dispatched': {
    name: 'Rental dispatched (default)',
    subject: 'Your rental is on the way — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'RKRT65592',
      customerName: 'Rahul Sharma',
      courierName: 'Aramex',
      trackingNumber: 'TRK123456',
      trackingUrl: 'https://www.aramex.com/track',
      estimatedDelivery: '02/06/26',
      confirmedAddress: 'Marina Walk, Dubai',
      fulfillmentMode: 'delivery',
      currency: 'AED',
    },
  },
  'rent-handover': {
    name: 'Rental handover (default)',
    subject: 'Enjoy your rental — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'RKRT65592',
      customerName: 'Rahul Sharma',
      rentalAmount: '2300',
      securityDeposit: '500',
      returnDueDate: '08/06/26',
      handoverDate: '01/06/26',
      paymentMethod: 'Online (UPI / Card)',
      currency: 'AED',
    },
  },
  'rent-return-reminder': {
    name: 'Return reminder (default)',
    subject: 'Reminder: return due soon — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'RKRT65592',
      customerName: 'Rahul Sharma',
      returnDueDate: '08/06/26',
      rentalEndDate: '08/06/26',
      fulfillmentMode: 'pickup',
      currency: 'AED',
    },
  },
  'rent-return-received': {
    name: 'Return received (default)',
    subject: 'We received your return — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'RKRT65592',
      customerName: 'Rahul Sharma',
      receivedAt: '08/06/26',
      returnCondition: 'Good — no issues noted',
      currency: 'AED',
    },
  },
  'rent-closed': {
    name: 'Rental closed (default)',
    subject: 'Your rent journey is complete — #{{requestId}}',
    sampleDynamicFields: {
      requestId: 'RKRT65592',
      customerName: 'Rahul Sharma',
      depositRefund: '500',
      depositDeduction: '0',
      closureNotes: 'Deposit refunded in full.',
      currency: 'AED',
    },
  },
};
