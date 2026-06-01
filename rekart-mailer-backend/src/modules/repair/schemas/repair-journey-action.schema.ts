import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RepairJourneyActionDocument = RepairJourneyAction & Document;

export enum JourneyActionType {
  MAIL_OPENED = 'mail_opened',
  MAIL_CLICKED = 'mail_clicked',
  TRACK_CLICKED = 'track_clicked',
  RESCHEDULE_REQUESTED = 'reschedule_requested',
  QUOTE_ACCEPTED = 'quote_accepted',
  QUOTE_DECLINED = 'quote_declined',
  BOOKING_CONFIRMED_ACCEPTED = 'booking_confirmed_accepted',
  BOOKING_CONFIRMED_DECLINED = 'booking_confirmed_declined',
  RATING_SUBMITTED = 'rating_submitted',
  SUPPORT_REQUESTED = 'support_requested',
  RETURN_DEVICE_REQUESTED = 'return_device_requested',
  RETURN_MODE_STORE_SELECTED = 'return_mode_store_selected',
  RETURN_MODE_COURIER_SELECTED = 'return_mode_courier_selected',
  JOURNEY_AUTO_CLOSED = 'journey_auto_closed',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'repair_journey_actions',
})
export class RepairJourneyAction {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId: Types.ObjectId;

  @Prop({ required: true, index: true })
  requestId: string;

  @Prop({ type: Types.ObjectId, ref: 'RepairRequestJourney', required: true, index: true })
  journeyId: Types.ObjectId;

  @Prop({ required: true })
  step: string;

  @Prop({ required: true, enum: Object.values(JourneyActionType) })
  actionType: JourneyActionType;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ default: '' })
  ip: string;

  @Prop({ default: '' })
  userAgent: string;
}

export const RepairJourneyActionSchema = SchemaFactory.createForClass(RepairJourneyAction);
RepairJourneyActionSchema.index({ journeyId: 1, createdAt: -1 });
RepairJourneyActionSchema.index({ workspaceId: 1, createdAt: -1 });
RepairJourneyActionSchema.index({ workspaceId: 1, actionType: 1, createdAt: -1 });
