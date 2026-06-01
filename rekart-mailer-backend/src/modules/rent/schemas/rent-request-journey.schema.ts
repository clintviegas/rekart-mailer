import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RentRequestJourneyDocument = RentRequestJourney & Document;

export const RENT_JOURNEY_WORKFLOW_STEPS = [
  'rent-request',
  'rent-agreement',
  'rent-ready-pickup',
  'rent-dispatched',
  'rent-handover',
  'rent-return-reminder',
  'rent-return-received',
  'rent-closed',
] as const;

export type RentJourneyWorkflowStep = (typeof RENT_JOURNEY_WORKFLOW_STEPS)[number];

export const RENT_JOURNEY_STEP_LABELS: Record<RentJourneyWorkflowStep, string> = {
  'rent-request': 'Rent Request',
  'rent-agreement': 'Quote & Agreement',
  'rent-ready-pickup': 'Ready for Pickup',
  'rent-dispatched': 'Dispatched',
  'rent-handover': 'Handover',
  'rent-return-reminder': 'Return Reminder',
  'rent-return-received': 'Return Received',
  'rent-closed': 'Closed',
};

export enum RentJourneyCurrency {
  AED = 'AED',
  INR = 'INR',
  USD = 'USD',
  SAR = 'SAR',
}

export enum RentJourneyStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Schema({ _id: false })
export class RentJourneySentStep {
  @Prop({ required: true }) stepKey: string;
  @Prop({ required: true }) sentAt: Date;
  @Prop({ type: String, default: null }) deliveryLogId: string | null;
  @Prop({ default: 'queued' }) deliveryStatus: string;
  @Prop({ type: String, default: null }) subject: string | null;
}
const RentJourneySentStepSchema = SchemaFactory.createForClass(RentJourneySentStep);

@Schema({
  timestamps: true,
  collection: 'rent_request_journeys',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class RentRequestJourney {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  workspaceId: Types.ObjectId;

  /** Unique per workspace — RKRT + 5-digit numeric e.g. RKRT47914 */
  @Prop({ required: true })
  requestId: string;

  @Prop({ required: true, index: true })
  customerEmail: string;

  @Prop({ required: true })
  customerName: string;

  @Prop({ default: RentJourneyCurrency.AED, enum: Object.values(RentJourneyCurrency) })
  currency: string;

  @Prop({ default: 'rent-request' })
  currentStep: string;

  @Prop({ type: [String], default: [] })
  completedSteps: string[];

  @Prop({ type: Object, default: {} })
  dynamicData: Record<string, unknown>;

  @Prop({ type: [RentJourneySentStepSchema], default: [] })
  sentSteps: RentJourneySentStep[];

  @Prop({
    default: RentJourneyStatus.ACTIVE,
    enum: Object.values(RentJourneyStatus),
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

export const RentRequestJourneySchema =
  SchemaFactory.createForClass(RentRequestJourney);

RentRequestJourneySchema.index({ workspaceId: 1, requestId: 1 }, { unique: true });
RentRequestJourneySchema.index({ workspaceId: 1, customerEmail: 1 });
RentRequestJourneySchema.index({ workspaceId: 1, createdAt: -1 });
RentRequestJourneySchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
RentRequestJourneySchema.index({ workspaceId: 1, completedSteps: 1 });
