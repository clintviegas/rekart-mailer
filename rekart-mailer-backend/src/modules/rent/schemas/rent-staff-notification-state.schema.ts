import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RentStaffNotificationStateDocument = RentStaffNotificationState &
  Document;

@Schema({ timestamps: true, collection: 'rent_staff_notification_states' })
export class RentStaffNotificationState {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  lastReadAt: Date;
}

export const RentStaffNotificationStateSchema = SchemaFactory.createForClass(
  RentStaffNotificationState,
);
RentStaffNotificationStateSchema.index(
  { userId: 1, workspaceId: 1 },
  { unique: true },
);
