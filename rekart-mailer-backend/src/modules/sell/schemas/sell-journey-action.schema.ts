import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SellJourneyActionDocument = SellJourneyAction & Document;

export enum JourneyActionType {
  MAIL_OPENED           = 'mail_opened',
  MAIL_CLICKED          = 'mail_clicked',
  TRACK_CLICKED         = 'track_clicked',
  RESCHEDULE_REQUESTED  = 'reschedule_requested',
  OFFER_ACCEPTED        = 'offer_accepted',
  OFFER_DECLINED        = 'offer_declined',
  REQUEST_RECEIVED_ACCEPTED = 'request_received_accepted',
  REQUEST_RECEIVED_DECLINED = 'request_received_declined',
  RECEIPT_VIEWED        = 'receipt_viewed',
  RATING_SUBMITTED      = 'rating_submitted',
  SUPPORT_REQUESTED     = 'support_requested',
  JOURNEY_AUTO_CLOSED   = 'journey_auto_closed',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'sell_journey_actions' })
export class SellJourneyAction {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId: Types.ObjectId;

  @Prop({ required: true, index: true })
  requestId: string;

  @Prop({ type: Types.ObjectId, ref: 'SellRequestJourney', required: true, index: true })
  journeyId: Types.ObjectId;

  @Prop({ required: true })
  step: string;

  @Prop({ required: true, enum: Object.values(JourneyActionType) })
  actionType: JourneyActionType;

  /** Any action-specific data: rating score, reschedule date, etc. */
  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ default: '' })
  ip: string;

  @Prop({ default: '' })
  userAgent: string;
}

export const SellJourneyActionSchema = SchemaFactory.createForClass(SellJourneyAction);
SellJourneyActionSchema.index({ journeyId: 1, createdAt: -1 });
SellJourneyActionSchema.index({ workspaceId: 1, createdAt: -1 });
// Covers getStaffNotifications: match by workspaceId + actionType filter + sort by createdAt
SellJourneyActionSchema.index({ workspaceId: 1, actionType: 1, createdAt: -1 });
