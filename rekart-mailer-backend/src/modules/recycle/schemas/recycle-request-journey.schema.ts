import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RecycleRequestJourneyDocument = RecycleRequestJourney & Document;

export const RECYCLE_JOURNEY_WORKFLOW_STEPS = [
  'recycle-request',
  'pickup-scheduled',
  'devices-collected',
  'certificate-issued',
] as const;

export type RecycleJourneyWorkflowStep = (typeof RECYCLE_JOURNEY_WORKFLOW_STEPS)[number];

export const RECYCLE_JOURNEY_STEP_LABELS: Record<RecycleJourneyWorkflowStep, string> = {
  'recycle-request': 'Recycle Request',
  'pickup-scheduled': 'Pickup Scheduled',
  'devices-collected': 'Devices Collected',
  'certificate-issued': 'Certificate Issued',
};

export enum RecycleJourneyCurrency {
  AED = 'AED',
  INR = 'INR',
  USD = 'USD',
  SAR = 'SAR',
}

export enum RecycleJourneyStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REQUEST_DECLINED = 'request_declined',
  QUOTE_DECLINED = 'quote_declined',
  DEVICE_RETURN_REQUESTED = 'device_return_requested',
  NO_CUSTOMER_ACTION = 'no_customer_action',
}

@Schema({ _id: false })
export class RecycleJourneySentStep {
  @Prop({ required: true }) stepKey: string;
  @Prop({ required: true }) sentAt: Date;
  @Prop({ type: String, default: null }) deliveryLogId: string | null;
  @Prop({ default: 'queued' }) deliveryStatus: string;
  @Prop({ type: String, default: null }) subject: string | null;
}
const RecycleJourneySentStepSchema = SchemaFactory.createForClass(RecycleJourneySentStep);

@Schema({
  timestamps: true,
  collection: 'recycle_request_journeys',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class RecycleRequestJourney {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  workspaceId: Types.ObjectId;

  @Prop({ required: true })
  requestId: string;

  @Prop({ required: true, index: true })
  customerEmail: string;

  @Prop({ required: true })
  customerName: string;

  @Prop({ default: RecycleJourneyCurrency.AED, enum: Object.values(RecycleJourneyCurrency) })
  currency: string;

  @Prop({ default: 'recycle-request' })
  currentStep: string;

  @Prop({ type: [String], default: [] })
  completedSteps: string[];

  @Prop({ type: Object, default: {} })
  dynamicData: Record<string, unknown>;

  @Prop({ type: [RecycleJourneySentStepSchema], default: [] })
  sentSteps: RecycleJourneySentStep[];

  @Prop({ type: Number, default: 0 })
  requestAckGeneration: number;

  @Prop({ type: Number, default: 0 })
  quoteGeneration: number;

  @Prop({
    default: RecycleJourneyStatus.ACTIVE,
    enum: Object.values(RecycleJourneyStatus),
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

  createdAt: Date;
  updatedAt: Date;
}

export const RecycleRequestJourneySchema =
  SchemaFactory.createForClass(RecycleRequestJourney);

RecycleRequestJourneySchema.index({ workspaceId: 1, requestId: 1 }, { unique: true });
RecycleRequestJourneySchema.index({ workspaceId: 1, customerEmail: 1 });
RecycleRequestJourneySchema.index({ workspaceId: 1, createdAt: -1 });
RecycleRequestJourneySchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
RecycleRequestJourneySchema.index({ workspaceId: 1, completedSteps: 1 });
RecycleRequestJourneySchema.index(
  { workspaceId: 1, 'dynamicData.reminderDue': 1, status: 1 },
  { sparse: true },
);
