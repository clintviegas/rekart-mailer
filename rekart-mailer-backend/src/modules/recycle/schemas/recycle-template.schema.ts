import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RecycleTemplateDocument = RecycleTemplate & Document;

export enum RecycleTemplateStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Schema({
  timestamps: true,
  collection: 'recycle_templates',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class RecycleTemplate {
  @Prop({ required: true, ref: 'Workspace', index: true })
  workspaceId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  workflowKey: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: 1 })
  version: number;

  @Prop({
    type: String,
    enum: RecycleTemplateStatus,
    default: RecycleTemplateStatus.DRAFT,
    index: true,
  })
  status: RecycleTemplateStatus;

  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({ required: true, trim: true })
  recipientEmail: string;

  @Prop({ type: Object, default: {} })
  dynamicFieldValues: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  previewSnapshot: Record<string, unknown>;

  @Prop({ type: String, default: null })
  htmlTemplate: string | null;

  @Prop({ required: true, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ required: true, ref: 'User' })
  updatedBy: Types.ObjectId;
}

export const RecycleTemplateSchema = SchemaFactory.createForClass(RecycleTemplate);

RecycleTemplateSchema.index({ workspaceId: 1, workflowKey: 1, status: 1 });
RecycleTemplateSchema.index({ workspaceId: 1, createdAt: -1 });
