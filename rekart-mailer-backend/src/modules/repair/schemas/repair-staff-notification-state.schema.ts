import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RepairStaffNotificationStateDocument = RepairStaffNotificationState &
  Document;

/**
 * Per-user, per-workspace cursor for journey "staff" notifications (high-signal
 * customer email actions). Alerts with action.createdAt <= lastReadAt are read.
 */
@Schema({ timestamps: true, collection: 'repair_staff_notification_states' })
export class RepairStaffNotificationState {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  lastReadAt: Date;
}

export const RepairStaffNotificationStateSchema = SchemaFactory.createForClass(
  RepairStaffNotificationState,
);
RepairStaffNotificationStateSchema.index(
  { userId: 1, workspaceId: 1 },
  { unique: true },
);
