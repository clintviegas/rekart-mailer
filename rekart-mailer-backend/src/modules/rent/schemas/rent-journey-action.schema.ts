import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum RentJourneyActionType {
  TRACK_CLICKED = 'track_clicked',
  REQUEST_PICKUP_CHOSEN = 'request_pickup_chosen',
  REQUEST_DELIVERY_CHOSEN = 'request_delivery_chosen',
  REQUEST_CONFIRMED = 'request_confirmed',
  REQUEST_DECLINED = 'request_declined',
  AGREEMENT_SIGNED = 'agreement_signed',
  AGREEMENT_DECLINED = 'agreement_declined',
  SUPPORT_REQUESTED = 'support_requested',
}

export type RentJourneyActionDocument = RentJourneyAction & Document;

@Schema({
  timestamps: true,
  collection: 'rent_journey_actions',
})
export class RentJourneyAction {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  workspaceId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  journeyId: Types.ObjectId;

  @Prop({ required: true })
  requestId: string;

  @Prop({ required: true, enum: Object.values(RentJourneyActionType) })
  action: RentJourneyActionType;

  @Prop({ default: 'rent-request' })
  stepKey: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ type: Date, default: () => new Date() })
  occurredAt: Date;
}

export const RentJourneyActionSchema =
  SchemaFactory.createForClass(RentJourneyAction);

RentJourneyActionSchema.index({ journeyId: 1, occurredAt: -1 });
RentJourneyActionSchema.index({ workspaceId: 1, action: 1, occurredAt: -1 });
