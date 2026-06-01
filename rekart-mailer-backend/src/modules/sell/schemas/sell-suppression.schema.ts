import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SellSuppressionDocument = SellSuppression & Document;

export enum SuppressionReason {
  UNSUBSCRIBED = 'unsubscribed',
  BOUNCED = 'bounced',
  COMPLAINT = 'complaint',
  MANUAL = 'manual',
}

@Schema({
  timestamps: true,
  collection: 'sell_suppression_list',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class SellSuppression {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Workspace', index: true })
  workspaceId: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({
    type: String,
    enum: SuppressionReason,
    required: true,
    default: SuppressionReason.MANUAL,
  })
  reason: SuppressionReason;

  @Prop({ type: String, default: 'manual' })
  source: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;
}

export const SellSuppressionSchema = SchemaFactory.createForClass(SellSuppression);

// unique email per workspace
SellSuppressionSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
SellSuppressionSchema.index({ workspaceId: 1, reason: 1 });
SellSuppressionSchema.index({ workspaceId: 1, createdAt: -1 });
