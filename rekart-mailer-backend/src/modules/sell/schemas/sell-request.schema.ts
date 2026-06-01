import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SellRequestDocument = SellRequest & Document;

export enum SellWorkflowStatus {
  REQUEST_RECEIVED = 'request_received',
  PICKUP_SCHEDULED = 'pickup_scheduled',
  INSPECTION_UNDERWAY = 'inspection_underway',
  OFFER_READY = 'offer_ready',
  PAYMENT_SENT = 'payment_sent',
  DEVICE_COLLECTED = 'device_collected',
  COMPLETED = 'completed',
}

@Schema({
  timestamps: true,
  collection: 'sell_requests',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class SellRequest {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Workspace', index: true })
  workspaceId: Types.ObjectId;

  /**
   * Human-readable unique ID — RKTS + 5 numeric digits.
   * Example: RKTS47914
   * This is the permanent identifier for the entire customer journey.
   */
  @Prop({ type: String, required: true, unique: true, trim: true, index: true })
  requestId: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  customerEmail: string;

  @Prop({
    type: String,
    enum: SellWorkflowStatus,
    default: SellWorkflowStatus.REQUEST_RECEIVED,
    index: true,
  })
  workflowStatus: SellWorkflowStatus;

  /** Merged field values across all completed workflow stages */
  @Prop({ type: Object, default: {} })
  dynamicFieldValues: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const SellRequestSchema = SchemaFactory.createForClass(SellRequest);

SellRequestSchema.index({ workspaceId: 1, customerEmail: 1 });
SellRequestSchema.index({ workspaceId: 1, requestId: 1 }, { unique: true });
SellRequestSchema.index({ workspaceId: 1, workflowStatus: 1 });
