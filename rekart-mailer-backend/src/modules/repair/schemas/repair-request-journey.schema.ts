import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RepairRequestJourneyDocument = RepairRequestJourney & Document;

export const REPAIR_JOURNEY_WORKFLOW_STEPS = [
  'booking-confirmed',
  'pickup-scheduled',
  'device-received',
  'diagnosing',
  'quote-ready',
  'repair-in-progress',
  'device-ready',
  'device-returned',
] as const;

export type RepairJourneyWorkflowStep = (typeof REPAIR_JOURNEY_WORKFLOW_STEPS)[number];

export const REPAIR_JOURNEY_STEP_LABELS: Record<RepairJourneyWorkflowStep, string> = {
  'booking-confirmed': 'Booking Confirmed',
  'pickup-scheduled': 'Pickup Scheduled',
  'device-received': 'Device Received',
  diagnosing: 'Diagnosing',
  'quote-ready': 'Quote Ready',
  'repair-in-progress': 'Repair In Progress',
  'device-ready': 'Device Ready',
  'device-returned': 'Device Returned',
};

export enum RepairJourneyCurrency {
  AED = 'AED',
  INR = 'INR',
  USD = 'USD',
  SAR = 'SAR',
}

export enum RepairJourneyStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  QUOTE_DECLINED = 'quote_declined',
  BOOKING_DECLINED = 'booking_declined',
  /** Reminder sent + 24 h with no customer action on booking email */
  NO_CUSTOMER_ACTION = 'no_customer_action',
  /** Customer chose to return device without repair (from final quote) */
  DEVICE_RETURN_REQUESTED = 'device_return_requested',
}

@Schema({ _id: false })
export class RepairJourneySentStep {
  @Prop({ required: true }) stepKey: string;
  @Prop({ required: true }) sentAt: Date;
  @Prop({ type: String, default: null }) deliveryLogId: string | null;
  @Prop({ default: 'queued' }) deliveryStatus: string;
  @Prop({ type: String, default: null }) subject: string | null;
}
const RepairJourneySentStepSchema = SchemaFactory.createForClass(RepairJourneySentStep);

@Schema({
  timestamps: true,
  collection: 'repair_request_journeys',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class RepairRequestJourney {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  workspaceId: Types.ObjectId;

  @Prop({ required: true })
  requestId: string;

  @Prop({ required: true, index: true })
  customerEmail: string;

  @Prop({ required: true })
  customerName: string;

  @Prop({ default: RepairJourneyCurrency.AED, enum: Object.values(RepairJourneyCurrency) })
  currency: string;

  @Prop({ default: 'booking-confirmed' })
  currentStep: string;

  @Prop({ type: [String], default: [] })
  completedSteps: string[];

  @Prop({ type: Object, default: {} })
  dynamicData: Record<string, unknown>;

  @Prop({ type: [RepairJourneySentStepSchema], default: [] })
  sentSteps: RepairJourneySentStep[];

  @Prop({ type: Number, default: 0 })
  quoteGeneration: number;

  @Prop({ type: Number, default: 0 })
  bookingAckGeneration: number;

  @Prop({
    default: RepairJourneyStatus.ACTIVE,
    enum: Object.values(RepairJourneyStatus),
    index: true,
  })
  status: string;

  @Prop({
    type: [
      {
        storedFilename: String,
        originalName: String,
        mimeType: String,
        size: Number,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  attachments: Array<{
    storedFilename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    uploadedAt: Date;
  }>;

  @Prop({ type: Types.ObjectId })
  createdBy: Types.ObjectId;

  @Prop({
    type: [
      {
        text: { type: String, required: true },
        createdBy: { type: Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  })
  staffNotes: Array<{
    text: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
  }>;

  @Prop({ type: Date, default: null })
  quoteExpiresAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const RepairRequestJourneySchema =
  SchemaFactory.createForClass(RepairRequestJourney);

RepairRequestJourneySchema.index({ workspaceId: 1, requestId: 1 }, { unique: true });
RepairRequestJourneySchema.index({ workspaceId: 1, customerEmail: 1 });
RepairRequestJourneySchema.index({ workspaceId: 1, createdAt: -1 });
RepairRequestJourneySchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
RepairRequestJourneySchema.index({ workspaceId: 1, completedSteps: 1 });
RepairRequestJourneySchema.index({ workspaceId: 1, quoteGeneration: 1 });
RepairRequestJourneySchema.index(
  { workspaceId: 1, 'dynamicData.reminderDue': 1, status: 1 },
  { sparse: true },
);
