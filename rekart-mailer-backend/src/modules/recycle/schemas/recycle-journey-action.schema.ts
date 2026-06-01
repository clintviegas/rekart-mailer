import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RecycleJourneyActionDocument = RecycleJourneyAction & Document;

export enum JourneyActionType {
  MAIL_OPENED = 'mail_opened',
  MAIL_CLICKED = 'mail_clicked',
  TRACK_CLICKED = 'track_clicked',
  RESCHEDULE_REQUESTED = 'reschedule_requested',
  RECYCLE_REQUEST_ACCEPTED = 'recycle_request_accepted',
  RECYCLE_REQUEST_DECLINED = 'recycle_request_declined',
  QUOTE_ACCEPTED = 'quote_accepted',
  QUOTE_DECLINED = 'quote_declined',
  RETURN_DEVICE_REQUESTED = 'return_device_requested',
  RETURN_MODE_STORE_SELECTED = 'return_mode_store_selected',
  RETURN_MODE_COURIER_SELECTED = 'return_mode_courier_selected',
  RATING_SUBMITTED = 'rating_submitted',
  SUPPORT_REQUESTED = 'support_requested',
  JOURNEY_AUTO_CLOSED = 'journey_auto_closed',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'recycle_journey_actions',
})
export class RecycleJourneyAction {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId: Types.ObjectId;

  @Prop({ required: true, index: true })
  requestId: string;

  @Prop({ type: Types.ObjectId, ref: 'RecycleRequestJourney', required: true, index: true })
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

export const RecycleJourneyActionSchema = SchemaFactory.createForClass(RecycleJourneyAction);
RecycleJourneyActionSchema.index({ journeyId: 1, createdAt: -1 });
RecycleJourneyActionSchema.index({ workspaceId: 1, createdAt: -1 });
RecycleJourneyActionSchema.index({ workspaceId: 1, actionType: 1, createdAt: -1 });
