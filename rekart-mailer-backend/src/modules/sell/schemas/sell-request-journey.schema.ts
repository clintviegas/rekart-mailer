import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SellRequestJourneyDocument = SellRequestJourney & Document;

// ── Workflow step keys (using hyphens to match existing SELL system) ──────────
export const JOURNEY_WORKFLOW_STEPS = [
  'request-received',
  'pickup-scheduled',
  'inspection-underway',
  'offer-ready',
  'payment-sent',
  'completed',
] as const;

export type JourneyWorkflowStep = (typeof JOURNEY_WORKFLOW_STEPS)[number];

export const JOURNEY_STEP_LABELS: Record<JourneyWorkflowStep, string> = {
  'request-received':    'Request Received',
  'pickup-scheduled':    'Pickup Scheduled',
  'inspection-underway': 'Inspection Underway',
  'offer-ready':         'Offer Ready',
  'payment-sent':        'Payment Sent',
  'completed':           'Completed',
};

export enum JourneyCurrency {
  AED = 'AED',
  INR = 'INR',
  USD = 'USD',
  SAR = 'SAR',
}

export enum JourneyStatus {
  ACTIVE         = 'active',
  COMPLETED      = 'completed',
  CANCELLED      = 'cancelled',
  OFFER_DECLINED = 'offer_declined',
  /** Customer declined confirmation on step 1 (Request Received) — staff may resend or cancel */
  REQUEST_DECLINED = 'request_declined',
  /** Reminder sent + 24 h with no customer action on request email */
  NO_CUSTOMER_ACTION = 'no_customer_action',
}

// ── Per-step record (embedded) ────────────────────────────────────────────────
@Schema({ _id: false })
export class JourneySentStep {
  @Prop({ required: true }) stepKey: string;
  @Prop({ required: true }) sentAt: Date;
  @Prop({ type: String, default: null }) deliveryLogId: string | null;
  /** queued | sent | failed | suppressed */
  @Prop({ default: 'queued' }) deliveryStatus: string;
  @Prop({ type: String, default: null }) subject: string | null;
}
const JourneySentStepSchema = SchemaFactory.createForClass(JourneySentStep);

// ── Main journey document ────────────────────────────────────────────────────
@Schema({
  timestamps: true,
  collection: 'sell_request_journeys',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class SellRequestJourney {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  workspaceId: Types.ObjectId;

  /** Unique per workspace — RKTS + 5-digit numeric e.g. RKTS47914 */
  @Prop({ required: true })
  requestId: string;

  @Prop({ required: true, index: true })
  customerEmail: string;

  @Prop({ required: true })
  customerName: string;

  @Prop({ default: JourneyCurrency.AED, enum: Object.values(JourneyCurrency) })
  currency: string;

  /** The workflow step to be actioned next */
  @Prop({ default: 'request-received' })
  currentStep: string;

  /** Steps that have been successfully sent */
  @Prop({ type: [String], default: [] })
  completedSteps: string[];

  /** Shared dynamic field values persisted across all steps */
  @Prop({ type: Object, default: {} })
  dynamicData: Record<string, unknown>;

  /** Record of every step send attempt */
  @Prop({ type: [JourneySentStepSchema], default: [] })
  sentSteps: JourneySentStep[];

  /**
   * Increments each time `offer-ready` is sent/resent. Customer action tokens include
   * this version so old offer links expire when a revised offer goes out.
   */
  @Prop({ type: Number, default: 0 })
  offerGeneration: number;

  /**
   * Increments each time `request-received` is sent/resent. Customer confirm/decline
   * links include this version so older emails stop working after a resend.
   */
  @Prop({ type: Number, default: 0 })
  requestAckGeneration: number;

  @Prop({
    default: JourneyStatus.ACTIVE,
    enum: Object.values(JourneyStatus),
    index: true,
  })
  status: string;

  /** Files attached to this journey (uploaded at create time or later) */
  @Prop({
    type: [{
      storedFilename: String,
      originalName:   String,
      mimeType:       String,
      size:           Number,
      url:            String,
      uploadedAt:     { type: Date, default: Date.now },
    }],
    default: [],
  })
  attachments: Array<{
    storedFilename: string;
    originalName:   string;
    mimeType:       string;
    size:           number;
    url:            string;
    uploadedAt:     Date;
  }>;

  @Prop({ type: Types.ObjectId })
  createdBy: Types.ObjectId;

  /**
   * Internal staff notes — private, never exposed in customer-facing emails.
   * Stored as an array so history is preserved (newest first).
   */
  @Prop({
    type: [{
      text:      { type: String, required: true },
      createdBy: { type: Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: () => new Date() },
    }],
    default: [],
  })
  staffNotes: Array<{
    text:      string;
    createdBy: Types.ObjectId;
    createdAt: Date;
  }>;

  /**
   * ISO datetime when the current offer expires. Set when offer-ready is dispatched
   * with an offerExpiryDays config. null = no expiry.
   */
  @Prop({ type: Date, default: null })
  offerExpiresAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const SellRequestJourneySchema =
  SchemaFactory.createForClass(SellRequestJourney);

// requestId is unique per workspace
SellRequestJourneySchema.index({ workspaceId: 1, requestId: 1 }, { unique: true });
SellRequestJourneySchema.index({ workspaceId: 1, customerEmail: 1 });
SellRequestJourneySchema.index({ workspaceId: 1, createdAt: -1 });

// Supports status-filtered list views and stats aggregation
SellRequestJourneySchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

// Supports funnel queries (completedStep filter in findAll + analytics)
SellRequestJourneySchema.index({ workspaceId: 1, completedSteps: 1 });

// Supports revised-offer filter: offerGeneration > 1
SellRequestJourneySchema.index({ workspaceId: 1, offerGeneration: 1 });

// Supports sparse filter for reship-closed journeys
SellRequestJourneySchema.index(
  { workspaceId: 1, 'dynamicData.closedByReship': 1 },
  { sparse: true },
);

// Supports reminderDue filter + getStats count
SellRequestJourneySchema.index(
  { workspaceId: 1, 'dynamicData.reminderDue': 1, status: 1 },
  { sparse: true },
);
