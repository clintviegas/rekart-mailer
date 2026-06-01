import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SellDeliveryLogDocument = SellDeliveryLog & Document;

export enum DeliveryStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  SUPPRESSED = 'suppressed',
}

@Schema({
  timestamps: true,
  collection: 'sell_delivery_logs',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class SellDeliveryLog {
  @Prop({ required: true, ref: 'Workspace', index: true })
  workspaceId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SellTemplate', default: null })
  templateId: Types.ObjectId | null;

  @Prop({ required: true, index: true })
  workflowKey: string;

  @Prop({ required: true })
  recipientEmail: string;

  /** RKTS request ID — extracted from dynamicFieldValues for indexed fast lookup */
  @Prop({ type: String, default: null, index: true })
  requestId: string | null;

  @Prop({ required: true })
  subject: string;

  @Prop({ type: String, default: null })
  provider: string | null;

  @Prop({
    type: String,
    enum: DeliveryStatus,
    default: DeliveryStatus.QUEUED,
    index: true,
  })
  status: DeliveryStatus;

  @Prop({ type: String, default: null })
  providerMessageId: string | null;

  @Prop({ type: String, default: null })
  errorMessage: string | null;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  @Prop({ required: true, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  dynamicFieldValues: Record<string, unknown>;

  // ── Suppression ────────────────────────────────────────────────────────────
  @Prop({ default: false })
  suppressed: boolean;

  @Prop({ type: String, default: null })
  suppressionReason: string | null;

  // ── Open tracking ──────────────────────────────────────────────────────────
  @Prop({ type: String, default: null, index: true })
  trackingToken: string | null;

  @Prop({ default: false })
  opened: boolean;

  @Prop({ default: 0 })
  openCount: number;

  @Prop({ type: Date, default: null })
  firstOpenedAt: Date | null;

  @Prop({ type: Date, default: null })
  lastOpenedAt: Date | null;

  // ── Click tracking ─────────────────────────────────────────────────────────
  @Prop({ default: false })
  clicked: boolean;

  @Prop({ default: 0 })
  clickCount: number;

  @Prop({ type: Date, default: null })
  firstClickedAt: Date | null;

  @Prop({ type: Date, default: null })
  lastClickedAt: Date | null;

  @Prop({ type: [String], default: [] })
  clickedLinks: string[];
}

export const SellDeliveryLogSchema = SchemaFactory.createForClass(SellDeliveryLog);

SellDeliveryLogSchema.index({ workspaceId: 1, createdAt: -1 });
SellDeliveryLogSchema.index({ workspaceId: 1, status: 1 });
SellDeliveryLogSchema.index({ workspaceId: 1, workflowKey: 1 });
SellDeliveryLogSchema.index({
  workspaceId: 1,
  requestId: 1,
  workflowKey: 1,
  createdAt: 1,
});
