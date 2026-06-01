import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { WorkspacePlan, WorkspaceStatus } from '../../../common/utils/enums';

export type WorkspaceDocument = Workspace & Document;

@Schema({
  timestamps: true,
  collection: 'workspaces',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['__v'];
      return ret;
    },
  },
})
export class Workspace {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true, ref: 'User' })
  ownerId: Types.ObjectId;

  @Prop({
    type: String,
    enum: WorkspacePlan,
    default: WorkspacePlan.FREE,
  })
  plan: WorkspacePlan;

  @Prop({
    type: String,
    enum: WorkspaceStatus,
    default: WorkspaceStatus.ACTIVE,
  })
  status: WorkspaceStatus;

  @Prop({ default: 0 })
  emailsSentThisMonth: number;

  @Prop({ default: 0 })
  subscribersCount: number;

  @Prop({ type: Object, default: {} })
  settings: Record<string, unknown>;

  @Prop({
    type: {
      emailsPerMonth: { type: Number, default: 1000 },
      subscribers: { type: Number, default: 500 },
      teamMembers: { type: Number, default: 1 },
    },
    default: {
      emailsPerMonth: 1000,
      subscribers: 500,
      teamMembers: 1,
    },
  })
  planLimits: {
    emailsPerMonth: number;
    subscribers: number;
    teamMembers: number;
  };
}

export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);

WorkspaceSchema.index({ slug: 1 }, { unique: true });
WorkspaceSchema.index({ ownerId: 1 });
