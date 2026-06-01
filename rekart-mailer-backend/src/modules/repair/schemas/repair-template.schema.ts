import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RepairTemplateDocument = RepairTemplate & Document;

export enum RepairTemplateStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Schema({
  timestamps: true,
  collection: 'repair_templates',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class RepairTemplate {
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
    enum: RepairTemplateStatus,
    default: RepairTemplateStatus.DRAFT,
    index: true,
  })
  status: RepairTemplateStatus;

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

export const RepairTemplateSchema = SchemaFactory.createForClass(RepairTemplate);

RepairTemplateSchema.index({ workspaceId: 1, workflowKey: 1, status: 1 });
RepairTemplateSchema.index({ workspaceId: 1, createdAt: -1 });
