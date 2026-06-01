import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  RecycleJourneyAction,
  RecycleJourneyActionDocument,
  JourneyActionType,
} from './schemas/recycle-journey-action.schema';
import {
  RecycleRequestJourney,
  RecycleJourneyStatus,
  RECYCLE_JOURNEY_WORKFLOW_STEPS,
  RecycleJourneyWorkflowStep,
} from './schemas/recycle-request-journey.schema';
import { RecyclePublicActionTokenService, ActionTokenPayload } from './recycle-public-action-token.service';
import { createResponse } from '../../common/utils/api-response';
import { isValidCustomerPreferredPickupDate, normalizePickUpAddress } from '../../common/date-format';
import { isValidRecycleReturnPaymentMethod } from './recycle-payment-methods';
import { isValidQuoteDeclineReason } from './recycle-quote-decline-reasons';
import {
  Recycle_PICKUP_TIME_WINDOW_SELECT_OPTIONS,
  isRecyclePickupTimeAny,
  isValidRecyclePickupTimeWindowSelection,
} from './recycle-pickup-time-windows';

export interface ActionContext {
  ip: string;
  userAgent: string;
}

@Injectable()
export class RecyclePublicActionService {
  private readonly logger = new Logger(RecyclePublicActionService.name);

  constructor(
    @InjectModel(RecycleJourneyAction.name)
    private readonly actionModel: Model<RecycleJourneyActionDocument>,
    @InjectModel(RecycleRequestJourney.name)
    private readonly journeyModel: Model<any>,
    private readonly tokenService: RecyclePublicActionTokenService,
  ) {}

  // ─── Token helpers ─────────────────────────────────────────────────────────

  private decodeToken(token: string): ActionTokenPayload {
    const payload = this.tokenService.verify(token);
    if (!payload) throw new BadRequestException('Invalid or tampered action token');
    return payload;
  }

  private async resolveJourney(jid: string) {
    const journey = await this.journeyModel
      .findById(new Types.ObjectId(jid))
      .select(
        'requestId customerName customerEmail currency currentStep status completedSteps workspaceId sentSteps dynamicData quoteGeneration requestAckGeneration',
      )
      .lean();
    if (!journey) throw new NotFoundException('Journey not found');
    return journey;
  }

  /** Live offer revision on journey doc (tokens must match this). */
  private effectiveOfferGeneration(journey: {
    quoteGeneration?: number;
    completedSteps?: string[];
  }): number {
    const stored = journey.quoteGeneration;
    if (typeof stored === 'number' && stored > 0) return stored;
    if (journey.completedSteps?.includes('quote-ready')) return 1;
    return 0;
  }

  private async logAction(
    payload: ActionTokenPayload,
    actionType: JourneyActionType,
    extra: Record<string, unknown>,
    ctx: ActionContext,
  ): Promise<RecycleJourneyActionDocument> {
    return this.actionModel.create({
      workspaceId: new Types.ObjectId(payload.wid),
      requestId:   payload.rid,
      journeyId:   new Types.ObjectId(payload.jid),
      step:        payload.step,
      actionType,
      payload:     extra,
      ip:          ctx.ip,
      userAgent:   ctx.userAgent,
    });
  }

  // ─── Track ─────────────────────────────────────────────────────────────────

  async handleTrack(token: string, ctx: ActionContext) {
    const p       = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);

    await this.logAction(p, JourneyActionType.TRACK_CLICKED, {}, ctx);
    this.logger.log(`[Action] Track clicked — ${journey.requestId}`);

    return createResponse(
      {
        requestId:   journey.requestId,
        customerName: journey.customerName,
        currentStep: journey.currentStep,
        completedSteps: journey.completedSteps ?? [],
        currency:    journey.currency,
      },
      'Journey status fetched',
    );
  }

  // ─── Reschedule ────────────────────────────────────────────────────────────

  async handleRescheduleView(token: string, ctx: ActionContext) {
    const p       = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);

    return createResponse(
      {
        requestId:   journey.requestId,
        customerName: journey.customerName,
        currentStep: journey.currentStep,
        dynamicData: {
          pickupDate:    (journey.dynamicData as any)?.pickupDate,
          pickupTime:    (journey.dynamicData as any)?.pickupTime,
          pickupAddress: (journey.dynamicData as any)?.pickupAddress,
        },
      },
      'Reschedule info loaded',
    );
  }

  async handleRescheduleSubmit(
    token: string,
    body: { preferredDate?: string; preferredTime?: string; note?: string },
    ctx: ActionContext,
  ) {
    const p       = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);

    await this.logAction(p, JourneyActionType.RESCHEDULE_REQUESTED, body, ctx);
    this.logger.log(`[Action] Reschedule requested — ${journey.requestId}`);

    return createResponse(
      { requestId: journey.requestId },
      'Reschedule request submitted. Our team will confirm shortly.',
    );
  }

  // ─── Quote offer ───────────────────────────────────────────────────────────

  private quoteAmountFromJourney(journey: { dynamicData?: Record<string, unknown> }) {
    const d = (journey.dynamicData ?? {}) as Record<string, string>;
    return d.finalOffer ?? d.offerAmount ?? d.quoteAmount;
  }

  private buildQuoteActionPayload(
    journey: {
      requestId: string;
      customerName: string;
      currency: string;
      dynamicData?: Record<string, unknown>;
    },
    extra: Record<string, unknown> = {},
  ) {
    const d = (journey.dynamicData ?? {}) as Record<string, string>;
    return {
      requestId: journey.requestId,
      customerName: journey.customerName,
      currency: journey.currency,
      deviceName: d.deviceName,
      quoteAmount: this.quoteAmountFromJourney(journey),
      offerAmount: this.quoteAmountFromJourney(journey),
      preferredPaymentMethod: d.preferredPaymentMethod,
      RecycleSummary: d.RecycleSummary,
      quoteDeclineReason: d.quoteDeclineReason,
      ...extra,
    };
  }

  private async validateQuoteToken(token: string) {
    const p = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);
    const jGen = this.effectiveOfferGeneration(journey);
    const tGen = typeof p.quoteGen === 'number' ? p.quoteGen : jGen;
    return { p, journey, jGen, tGen };
  }

  /** GET — load quote details; does not accept until customer submits payment preference. */
  async handleOfferAcceptView(token: string, ctx: ActionContext) {
    const { p, journey, jGen, tGen } = await this.validateQuoteToken(token);
    const d = (journey.dynamicData ?? {}) as Record<string, unknown>;

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      const note =
        journey.status === RecycleJourneyStatus.COMPLETED
          ? 'This Recycle request is already complete. Thank you for choosing Rekart!'
          : 'This request was cancelled. Contact us if you need a new quote.';
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision: 'accept',
          alreadyProcessed: true,
        }),
        note,
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision: 'accept',
          alreadyProcessed: true,
        }),
        'This offer link is outdated. Please open the latest email from us for the current offer.',
      );
    }

    if (journey.status === RecycleJourneyStatus.QUOTE_DECLINED) {
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision: 'accept',
          alreadyProcessed: true,
        }),
        'This offer is no longer available. If you changed your mind, contact our team — we’re happy to help.',
      );
    }

    if (Number(d['quoteAcceptedGeneration'] ?? 0) === jGen && d['quoteAcceptedByCustomer'] === true) {
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision: 'accept',
          alreadyProcessed: true,
        }),
        'Your quote acceptance is already recorded. Our team will proceed with the Recycle.',
      );
    }

    return createResponse(
      this.buildQuoteActionPayload(journey, {
        decision: 'accept',
        alreadyProcessed: false,
      }),
      'Review your quote and choose how you would like to pay when your device is returned.',
    );
  }

  /** POST — accept quote with preferred payment method at return. */
  async handleOfferAcceptSubmit(
    token: string,
    preferredPaymentMethod: string,
    ctx: ActionContext,
  ) {
    if (!isValidRecycleReturnPaymentMethod(preferredPaymentMethod)) {
      throw new BadRequestException('Please select a valid payment method.');
    }

    const { p, journey, jGen, tGen } = await this.validateQuoteToken(token);
    const d = (journey.dynamicData ?? {}) as Record<string, string>;

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision: 'accept',
          alreadyProcessed: true,
          preferredPaymentMethod: d.preferredPaymentMethod ?? preferredPaymentMethod,
        }),
        journey.status === RecycleJourneyStatus.COMPLETED
          ? 'This Recycle request is already complete.'
          : 'This request was cancelled.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision: 'accept',
          alreadyProcessed: true,
        }),
        'This offer link is outdated. Please open the latest email from us.',
      );
    }

    if (journey.status === RecycleJourneyStatus.QUOTE_DECLINED) {
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision: 'accept',
          alreadyProcessed: true,
        }),
        'This offer is no longer available. Contact our team if you changed your mind.',
      );
    }

    const ddCheck = (journey.dynamicData ?? {}) as Record<string, unknown>;
    if (
      journey.status === RecycleJourneyStatus.DEVICE_RETURN_REQUESTED ||
      ddCheck['returnDeviceRequested'] === true
    ) {
      return createResponse(
        this.buildQuoteActionPayload(journey, { decision: 'accept', alreadyProcessed: true }),
        'You requested device return. This quote can no longer be accepted.',
      );
    }

    const atomicFilter = {
      _id: new Types.ObjectId(p.jid),
      quoteGeneration: jGen,
      'dynamicData.quoteAcceptedGeneration': { $ne: jGen },
    };

    const result = await this.journeyModel.updateOne(atomicFilter, {
      $set: {
        currentStep: 'recycle-in-progress',
        status: RecycleJourneyStatus.ACTIVE,
        'dynamicData.quoteAcceptedByCustomer': true,
        'dynamicData.quoteAcceptedAt': new Date(),
        'dynamicData.quoteAcceptedGeneration': jGen,
        'dynamicData.preferredPaymentMethod': preferredPaymentMethod,
      },
      $push: {
        'dynamicData.quoteRoundHistory': {
          generation: jGen,
          at: new Date().toISOString(),
          kind: 'customer_accepted',
          preferredPaymentMethod,
        },
      },
    });

    if (result.modifiedCount === 0) {
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision: 'accept',
          alreadyProcessed: true,
          preferredPaymentMethod: d.preferredPaymentMethod ?? preferredPaymentMethod,
        }),
        'Your response has already been recorded.',
      );
    }

    await this.logAction(
      p,
      JourneyActionType.QUOTE_ACCEPTED,
      { decision: 'accept', quoteGeneration: jGen, preferredPaymentMethod },
      ctx,
    );
    this.logger.log(`[Action] Quote accepted — ${journey.requestId} (${preferredPaymentMethod})`);

    return createResponse(
      this.buildQuoteActionPayload(journey, {
        decision: 'accept',
        alreadyProcessed: false,
        preferredPaymentMethod,
      }),
      'Quote accepted! We will start the Recycle and collect payment when your device is returned.',
    );
  }

  async handleOfferDeclineView(token: string, ctx: ActionContext) {
    const { journey, jGen, tGen } = await this.validateQuoteToken(token);
    const decision = 'decline' as const;
    const d = (journey.dynamicData ?? {}) as Record<string, unknown>;

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      const note =
        journey.status === RecycleJourneyStatus.COMPLETED
          ? 'This Recycle request is already complete.'
          : 'This request was cancelled.';
      return createResponse(
        this.buildQuoteActionPayload(journey, { decision, alreadyProcessed: true }),
        note,
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        this.buildQuoteActionPayload(journey, { decision, alreadyProcessed: true }),
        'This offer link is outdated. Please open the latest email from us.',
      );
    }

    if (
      journey.status === RecycleJourneyStatus.QUOTE_DECLINED &&
      Number(d['quoteAcceptedGeneration'] ?? 0) !== jGen
    ) {
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision,
          alreadyProcessed: true,
          quoteDeclineReason: String(d['quoteDeclineReason'] ?? ''),
        }),
        'You’ve already declined this quote. Our team will follow up.',
      );
    }

    return createResponse(
      this.buildQuoteActionPayload(journey, { decision, alreadyProcessed: false }),
      'Please tell us why you are declining so we can improve our offer.',
    );
  }

  async handleOfferDeclineSubmit(token: string, declineReason: string, ctx: ActionContext) {
    if (!isValidQuoteDeclineReason(declineReason)) {
      throw new BadRequestException('Please provide a decline reason (at least 3 characters).');
    }

    const { p, journey, jGen, tGen } = await this.validateQuoteToken(token);
    const decision = 'decline' as const;
    const trimmedReason = declineReason.trim();

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      return createResponse(
        this.buildQuoteActionPayload(journey, { decision, alreadyProcessed: true }),
        'This request is no longer open.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        this.buildQuoteActionPayload(journey, { decision, alreadyProcessed: true }),
        'This offer link is outdated.',
      );
    }

    const atomicFilter = {
      _id: new Types.ObjectId(p.jid),
      quoteGeneration: jGen,
      'dynamicData.quoteAcceptedGeneration': { $ne: jGen },
    };

    const result = await this.journeyModel.updateOne(atomicFilter, {
      $set: {
        status: RecycleJourneyStatus.QUOTE_DECLINED,
        currentStep: 'quote-ready',
        'dynamicData.quoteAcceptedByCustomer': false,
        'dynamicData.quoteDeclineReason': trimmedReason,
        'dynamicData.quoteDeclinedAt': new Date(),
      },
      $unset: {
        'dynamicData.quoteAcceptedAt': '',
        'dynamicData.quoteAcceptedGeneration': '',
        'dynamicData.preferredPaymentMethod': '',
      },
      $push: {
        'dynamicData.quoteRoundHistory': {
          generation: jGen,
          at: new Date().toISOString(),
          kind: 'customer_declined',
          declineReason: trimmedReason,
        },
      },
    });

    if (result.modifiedCount === 0) {
      const d = (journey.dynamicData ?? {}) as Record<string, string>;
      return createResponse(
        this.buildQuoteActionPayload(journey, {
          decision,
          alreadyProcessed: true,
          quoteDeclineReason: d.quoteDeclineReason ?? trimmedReason,
        }),
        'Your response has already been recorded.',
      );
    }

    await this.logAction(
      p,
      JourneyActionType.QUOTE_DECLINED,
      { decision, quoteGeneration: jGen, declineReason: trimmedReason },
      ctx,
    );
    this.logger.log(`[Action] Quote declined — ${journey.requestId}: ${trimmedReason}`);

    return createResponse(
      this.buildQuoteActionPayload(journey, {
        decision,
        alreadyProcessed: false,
        quoteDeclineReason: trimmedReason,
      }),
      'Thank you — we’ve recorded your feedback. Our team may send a revised quote.',
    );
  }

  async handleReturnDeviceView(token: string, ctx: ActionContext) {
    const p = this.decodeToken(token);
    if (p.action !== JourneyActionType.RETURN_DEVICE_REQUESTED) {
      throw new BadRequestException('This link does not match that action.');
    }
    const journey = await this.resolveJourney(p.jid);
    const jGen = this.effectiveOfferGeneration(journey);
    const tGen = typeof p.quoteGen === 'number' ? p.quoteGen : jGen;
    const d = (journey.dynamicData ?? {}) as Record<string, unknown>;

    if (journey.status === RecycleJourneyStatus.DEVICE_RETURN_REQUESTED || d['returnDeviceRequested'] === true) {
      return createResponse(
        this.buildQuoteActionPayload(journey, { decision: 'decline', alreadyProcessed: true }),
        'We already have your return request. Our team will arrange to send your device back.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        this.buildQuoteActionPayload(journey, { alreadyProcessed: true }),
        'This link is outdated. Please use the latest email from us.',
      );
    }

    return createResponse(
      this.buildQuoteActionPayload(journey, { alreadyProcessed: false }),
      'Confirm that you want your device returned without proceeding with the Recycle.',
    );
  }

  async handleReturnDeviceSubmit(token: string, ctx: ActionContext) {
    const p = this.decodeToken(token);
    if (p.action !== JourneyActionType.RETURN_DEVICE_REQUESTED) {
      throw new BadRequestException('This link does not match that action.');
    }
    const journey = await this.resolveJourney(p.jid);
    const jGen = this.effectiveOfferGeneration(journey);
    const tGen = typeof p.quoteGen === 'number' ? p.quoteGen : jGen;

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        this.buildQuoteActionPayload(journey, { alreadyProcessed: true }),
        'This link is outdated.',
      );
    }

    const result = await this.journeyModel.updateOne(
      {
        _id: new Types.ObjectId(p.jid),
        quoteGeneration: jGen,
        'dynamicData.returnDeviceRequested': { $ne: true },
      },
      {
        $set: {
          status: RecycleJourneyStatus.DEVICE_RETURN_REQUESTED,
          currentStep: 'quote-ready',
          'dynamicData.returnDeviceRequested': true,
          'dynamicData.returnDeviceRequestedAt': new Date(),
        },
        $push: {
          'dynamicData.quoteRoundHistory': {
            generation: jGen,
            at: new Date().toISOString(),
            kind: 'return_device_requested',
          },
        },
      },
    );

    if (result.modifiedCount === 0) {
      return createResponse(
        this.buildQuoteActionPayload(journey, { alreadyProcessed: true }),
        'Your return request is already recorded.',
      );
    }

    await this.logAction(
      p,
      JourneyActionType.RETURN_DEVICE_REQUESTED,
      { quoteGeneration: jGen },
      ctx,
    );
    this.logger.log(`[Action] Return device requested — ${journey.requestId}`);

    return createResponse(
      this.buildQuoteActionPayload(journey, { alreadyProcessed: false }),
      'Return request confirmed. We will arrange to send your device back and email you the details.',
    );
  }

  /** @deprecated */
  async handleOfferDecline(token: string, ctx: ActionContext) {
    return this.handleOfferDeclineView(token, ctx);
  }

  /** @deprecated Use handleOfferAcceptView / handleOfferAcceptSubmit / handleOfferDeclineSubmit */
  async handleOfferDecision(token: string, decision: 'accept' | 'decline', ctx: ActionContext) {
    if (decision === 'accept') {
      return this.handleOfferAcceptView(token, ctx);
    }
    return this.handleOfferDeclineView(token, ctx);
  }

  // ─── Booking confirmed — schedule pickup / decline ─────────────────────────

  private buildBookingAckPayload(
    journey: {
      requestId: string;
      customerName: string;
      dynamicData?: Record<string, unknown>;
    },
    opts: { decision: 'accept' | 'decline'; alreadyProcessed: boolean },
  ) {
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
    const slot = String(dd['customerPreferredPickupTimeSlot'] ?? '').trim();
    const date = String(dd['customerPreferredPickupDate'] ?? '').trim();
    const requestPickupAddress = String(dd['requestPickupAddress'] ?? dd['pickupAddress'] ?? '').trim();
    const confirmedPickupAddress = String(dd['pickupAddress'] ?? '').trim();
    return {
      requestId: journey.requestId,
      customerName: journey.customerName,
      deviceName: String(dd['deviceName'] ?? dd['recycleItemsSummary'] ?? '').trim() || undefined,
      recycleItemsSummary: String(dd['recycleItemsSummary'] ?? '').trim() || undefined,
      pickupAddress: requestPickupAddress || confirmedPickupAddress || undefined,
      confirmedPickupAddress: confirmedPickupAddress || undefined,
      pickupAddressSameAsRequest:
        dd['pickupAddressSameAsRequest'] === true
          ? true
          : dd['pickupAddressSameAsRequest'] === false
            ? false
            : undefined,
      decision: opts.decision,
      alreadyProcessed: opts.alreadyProcessed,
      preferredPickupTimeSlot: slot || undefined,
      preferredPickupDate: date || undefined,
      customerPreferredPickupTimeAny: dd['customerPreferredPickupTimeAny'] === true,
      timeWindowOptions: [...Recycle_PICKUP_TIME_WINDOW_SELECT_OPTIONS],
    };
  }

  private async validateBookingAckToken(token: string, decision: 'accept' | 'decline') {
    const p = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);

    const expectedAction =
      decision === 'accept'
        ? JourneyActionType.RECYCLE_REQUEST_ACCEPTED
        : JourneyActionType.RECYCLE_REQUEST_DECLINED;
    if (p.action !== expectedAction) {
      throw new BadRequestException('This link does not match that action.');
    }
    if (p.step !== 'recycle-request') {
      throw new BadRequestException('Invalid step for this action.');
    }

    const jGen =
      typeof journey.requestAckGeneration === 'number'
        ? journey.requestAckGeneration
        : 0;
    const tGen =
      typeof p.bookingAckGen === 'number' ? p.bookingAckGen : jGen;

    return { p, journey, jGen, tGen };
  }

  /** GET — show schedule-pickup form; does not record acceptance until customer submits. */
  async handleBookingAcceptView(token: string, ctx: ActionContext) {
    void ctx;
    const { p, journey, jGen, tGen } = await this.validateBookingAckToken(token, 'accept');
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      const note =
        journey.status === RecycleJourneyStatus.COMPLETED
          ? 'This Recycle request is already complete. Thank you for choosing Rekart!'
          : 'This request was cancelled. Contact us if you need help.';
      return {
        ...createResponse(
          this.buildBookingAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          note,
        ),
      };
    }

    const reqIdx = RECYCLE_JOURNEY_WORKFLOW_STEPS.indexOf('recycle-request');
    const progressedPastRequest = (journey.completedSteps ?? []).some((s: string) => {
      const i = RECYCLE_JOURNEY_WORKFLOW_STEPS.indexOf(s as RecycleJourneyWorkflowStep);
      return i !== -1 && i > reqIdx;
    });
    if (progressedPastRequest) {
      return {
        ...createResponse(
          this.buildBookingAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          'This request has already moved forward. Contact us if you need anything.',
        ),
      };
    }

    if (jGen > 0 && tGen !== jGen) {
      return {
        ...createResponse(
          this.buildBookingAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          'This link is outdated. Please open the latest email from us to confirm or decline.',
        ),
      };
    }

    if (jGen <= 0) {
      return {
        ...createResponse(
          this.buildBookingAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          'Thank you — your response has been noted.',
        ),
      };
    }

    const ackGen = dd['requestAckAcceptedGen'];
    const acceptedGen =
      typeof ackGen === 'number' && ackGen > 0 ? ackGen : null;
    const alreadyAccepted =
      dd['requestAckByCustomer'] === true &&
      acceptedGen !== null &&
      acceptedGen === jGen;

    if (alreadyAccepted) {
      return {
        ...createResponse(
          this.buildBookingAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          'Your pickup request is already on file. Thank you!',
        ),
      };
    }

    return {
      ...createResponse(
        this.buildBookingAckPayload(journey, { decision: 'accept', alreadyProcessed: false }),
        'Choose your preferred pickup date, time window, and address — then confirm below.',
      ),
    };
  }

  /** POST — record schedule pickup with customer-preferred time window. */
  async handleBookingAcceptSubmit(
    token: string,
    preferredPickupTimeSlot: string,
    preferredPickupDate: string,
    pickupAddressChoice: 'same' | 'different',
    alternatePickupAddress: string | undefined,
    ctx: ActionContext,
  ) {
    const slot = preferredPickupTimeSlot?.trim() ?? '';
    const date = preferredPickupDate?.trim() ?? '';
    if (!isValidRecyclePickupTimeWindowSelection(slot)) {
      throw new BadRequestException('Please select a valid pickup time window.');
    }
    if (!isValidCustomerPreferredPickupDate(date)) {
      throw new BadRequestException('Please select a valid pickup date (today or later).');
    }

    const { p, journey, jGen, tGen } = await this.validateBookingAckToken(token, 'accept');
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
    const anyTime = isRecyclePickupTimeAny(slot);

    const requestPickupAddress = String(dd['pickupAddress'] ?? '').trim();
    const choice = pickupAddressChoice === 'different' ? 'different' : 'same';
    let confirmedPickupAddress = requestPickupAddress;
    let sameAsRequest = true;

    if (choice === 'different') {
      const alt = alternatePickupAddress?.trim() ?? '';
      if (alt.length < 5) {
        throw new BadRequestException('Please enter the pickup address (at least 5 characters).');
      }
      confirmedPickupAddress = alt;
      sameAsRequest = false;
    } else if (!requestPickupAddress) {
      throw new BadRequestException(
        'No address was saved on this request. Please choose a different address and enter pickup details.',
      );
    }

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      return {
        ...createResponse(
          this.buildBookingAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          journey.status === RecycleJourneyStatus.COMPLETED
            ? 'This Recycle request is already complete.'
            : 'This request was cancelled.',
        ),
      };
    }

    if (jGen > 0 && tGen !== jGen) {
      return {
        ...createResponse(
          this.buildBookingAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          'This link is outdated. Please open the latest email from us.',
        ),
      };
    }

    const ackGen = dd['requestAckAcceptedGen'];
    const acceptedGen =
      typeof ackGen === 'number' && ackGen > 0 ? ackGen : null;
    const alreadyAccepted =
      dd['requestAckByCustomer'] === true &&
      acceptedGen !== null &&
      acceptedGen === jGen;

    if (alreadyAccepted) {
      return {
        ...createResponse(
          this.buildBookingAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          'Your pickup request is already on file. Thank you!',
        ),
      };
    }

    const ackAtomicFilter = {
      _id: new Types.ObjectId(p.jid),
      requestAckGeneration: jGen,
      'dynamicData.requestAckAcceptedGen': { $ne: jGen },
    };

    const result = await this.journeyModel.updateOne(ackAtomicFilter, {
      $set: {
        status: RecycleJourneyStatus.ACTIVE,
        'dynamicData.requestAckByCustomer': true,
        'dynamicData.requestAckAcceptedGen': jGen,
        'dynamicData.bookingAckAcceptedAt': new Date(),
        'dynamicData.requestAckDeclined': false,
        'dynamicData.reminderDue': false,
        'dynamicData.customerPreferredPickupTimeSlot': slot,
        'dynamicData.customerPreferredPickupTimeAny': anyTime,
        'dynamicData.customerPreferredPickupDate': date,
        'dynamicData.pickupAddress': confirmedPickupAddress,
        'dynamicData.pickupAddressSameAsRequest': sameAsRequest,
        ...(sameAsRequest || !requestPickupAddress
          ? {}
          : { 'dynamicData.requestPickupAddress': requestPickupAddress }),
      },
      $unset: {
        'dynamicData.requestAckDeclinedGen': '',
        'dynamicData.requestAckDeclinedAt': '',
      },
    });

    if (result.modifiedCount === 0) {
      const refreshed = await this.resolveJourney(p.jid);
      return {
        ...createResponse(
          this.buildBookingAckPayload(refreshed, { decision: 'accept', alreadyProcessed: true }),
          'Your pickup request is already on file. Thank you!',
        ),
      };
    }

    await this.logAction(
      p,
      JourneyActionType.RECYCLE_REQUEST_ACCEPTED,
      { decision: 'accept', requestAckGeneration: jGen, preferredPickupTimeSlot: slot, preferredPickupDate: date, anyTime, pickupAddressSameAsRequest: sameAsRequest },
      ctx,
    );
    this.logger.log(`[Action] Booking schedule pickup — ${journey.requestId} (${date}, ${slot})`);

    const refreshed = await this.resolveJourney(p.jid);
    return {
      ...createResponse(
        this.buildBookingAckPayload(refreshed, { decision: 'accept', alreadyProcessed: false }),
        anyTime
          ? 'Thank you — we’ve received your pickup request. Our team will confirm a time that works for you.'
          : 'Thank you — we’ve received your pickup request. Our team will contact you to confirm pickup details.',
      ),
    };
  }

  async handleRequestReceivedDecision(
    token: string,
    decision: 'accept' | 'decline',
    ctx: ActionContext,
  ) {
    if (decision === 'accept') {
      return this.handleBookingAcceptView(token, ctx);
    }

    const { p, journey, jGen, tGen } = await this.validateBookingAckToken(token, decision);
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;

    const baseResponse = (alreadyProcessed: boolean) =>
      createResponse(
        this.buildBookingAckPayload(journey, { decision, alreadyProcessed }),
        '',
      );

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      const note =
        journey.status === RecycleJourneyStatus.COMPLETED
          ? 'This Recycle request is already complete. Thank you for choosing Rekart!'
          : 'This request was cancelled. Contact us if you need help.';
      const r = baseResponse(true);
      return { ...r, message: note };
    }

    const reqIdx = RECYCLE_JOURNEY_WORKFLOW_STEPS.indexOf('recycle-request');
    const progressedPastRequest = (journey.completedSteps ?? []).some((s: string) => {
      const i = RECYCLE_JOURNEY_WORKFLOW_STEPS.indexOf(s as RecycleJourneyWorkflowStep);
      return i !== -1 && i > reqIdx;
    });
    if (progressedPastRequest) {
      const r = baseResponse(true);
      return {
        ...r,
        message:
          'This request has already moved forward. Contact us if you need anything.',
      };
    }

    if (jGen > 0 && tGen !== jGen) {
      const r = baseResponse(true);
      return {
        ...r,
        message:
          'This link is outdated. Please open the latest email from us to confirm or decline.',
      };
    }

    if (jGen <= 0) {
      await this.logAction(
        p,
        JourneyActionType.RECYCLE_REQUEST_DECLINED,
        { decision, requestAckGeneration: jGen, legacy: true },
        ctx,
      );
      const r = baseResponse(true);
      return {
        ...r,
        message: 'Thank you — your response has been noted.',
      };
    }

    const ackGen = dd['requestAckAcceptedGen'];
    const acceptedGen =
      typeof ackGen === 'number' && ackGen > 0 ? ackGen : null;
    const alreadyAccepted =
      dd['requestAckByCustomer'] === true &&
      acceptedGen !== null &&
      acceptedGen === jGen;

    if (alreadyAccepted) {
      const r = baseResponse(true);
      return {
        ...r,
        message:
          'You’ve already requested a pickup from this email. Contact us if you need to change anything.',
      };
    }

    const decGen = dd['requestAckDeclinedGen'];
    const declinedGen =
      typeof decGen === 'number' && decGen > 0 ? decGen : null;
    const alreadyDeclinedForRound =
      journey.status === RecycleJourneyStatus.REQUEST_DECLINED &&
      dd['requestAckDeclined'] === true &&
      declinedGen !== null &&
      declinedGen === jGen;

    if (alreadyDeclinedForRound) {
      await this.logAction(
        p,
        JourneyActionType.RECYCLE_REQUEST_DECLINED,
        { decision, requestAckGeneration: jGen, duplicate: true },
        ctx,
      );
      const r = baseResponse(true);
      return {
        ...r,
        message: 'We’ve already recorded your response. Our team may reach out with options.',
      };
    }

    const ackAtomicFilter = {
      _id: new Types.ObjectId(p.jid),
      requestAckGeneration: jGen,
      'dynamicData.requestAckAcceptedGen': { $ne: jGen },
    };

    const result = await this.journeyModel.updateOne(ackAtomicFilter, {
      $set: {
        status: RecycleJourneyStatus.REQUEST_DECLINED,
        currentStep: 'recycle-request',
        'dynamicData.requestAckByCustomer': false,
        'dynamicData.requestAckDeclined': true,
        'dynamicData.requestAckDeclinedGen': jGen,
        'dynamicData.requestAckDeclinedAt': new Date(),
        'dynamicData.reminderDue': false,
      },
      $unset: {
        'dynamicData.requestAckAcceptedGen': '',
        'dynamicData.bookingAckAcceptedAt': '',
        'dynamicData.customerPreferredPickupTimeSlot': '',
        'dynamicData.customerPreferredPickupTimeAny': '',
        'dynamicData.customerPreferredPickupDate': '',
      },
    });

    if (result.modifiedCount === 0) {
      const r = baseResponse(true);
      return { ...r, message: 'Your response has already been recorded.' };
    }

    await this.logAction(
      p,
      JourneyActionType.RECYCLE_REQUEST_DECLINED,
      { decision, requestAckGeneration: jGen },
      ctx,
    );
    this.logger.log(`[Action] Booking declined — ${journey.requestId}`);

    const r = baseResponse(false);
    return {
      ...r,
      message: 'We’ve noted that you’re not continuing from this email. Our team may reach out.',
    };
  }

  // ─── Device ready — return mode (collect / courier) ─────────────────────────

  private buildReturnModePayload(
    journey: {
      requestId: string;
      customerName: string;
      currency?: string;
      dynamicData?: Record<string, unknown>;
    },
    opts: {
      mode?: 'store' | 'courier';
      alreadyProcessed: boolean;
    },
  ) {
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
    const storedMode = String(dd['returnMode'] ?? '').trim().toLowerCase();
    const mode =
      opts.mode ??
      (storedMode === 'courier' ? 'courier' : storedMode === 'store' ? 'store' : undefined);
    return {
      requestId: journey.requestId,
      customerName: journey.customerName,
      currency: String(journey.currency ?? '').trim() || undefined,
      deviceName: String(dd['deviceName'] ?? '').trim() || undefined,
      readyDate: String(dd['readyDate'] ?? '').trim() || undefined,
      collectionAddress: normalizePickUpAddress(String(dd['collectionAddress'] ?? '')) || undefined,
      collectionHours: String(dd['collectionHours'] ?? '').trim() || undefined,
      pickupAddress: String(dd['pickupAddress'] ?? '').trim() || undefined,
      deliveryAddress: String(dd['deliveryAddress'] ?? '').trim() || undefined,
      returnMode: mode,
      alreadyProcessed: opts.alreadyProcessed,
    };
  }

  private async validateReturnModeToken(token: string, expectedMode: 'store' | 'courier') {
    const p = this.decodeToken(token);
    const expectedAction =
      expectedMode === 'store'
        ? JourneyActionType.RETURN_MODE_STORE_SELECTED
        : JourneyActionType.RETURN_MODE_COURIER_SELECTED;
    if (p.action !== expectedAction) {
      throw new BadRequestException('This link does not match that action.');
    }
    if (p.step !== 'device-ready') {
      throw new BadRequestException('Invalid step for this action.');
    }
    const journey = await this.resolveJourney(p.jid);
    return { p, journey };
  }

  private existingReturnMode(
    dd: Record<string, unknown>,
  ): 'store' | 'courier' | null {
    const mode = String(dd['returnMode'] ?? '').trim().toLowerCase();
    if (mode === 'store' || mode === 'courier') return mode;
    return null;
  }

  async handleReturnModeStoreView(token: string, ctx: ActionContext) {
    const { p, journey } = await this.validateReturnModeToken(token, 'store');
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
    const existing = this.existingReturnMode(dd);

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      const note =
        journey.status === RecycleJourneyStatus.COMPLETED
          ? 'This Recycle request is already complete.'
          : 'This request was cancelled.';
      return createResponse(
        this.buildReturnModePayload(journey, { mode: 'store', alreadyProcessed: true }),
        note,
      );
    }

    if (!journey.completedSteps?.includes('device-ready')) {
      return createResponse(
        this.buildReturnModePayload(journey, { mode: 'store', alreadyProcessed: true }),
        'This link is not active yet. Please wait for our device ready email.',
      );
    }

    if (existing) {
      return createResponse(
        this.buildReturnModePayload(journey, { mode: existing, alreadyProcessed: true }),
        existing === 'store'
          ? 'You already chose to collect from our store. Our team will follow up.'
          : 'You already chose courier delivery. Please use the courier link if you need to update your address.',
      );
    }

    await this.logAction(p, JourneyActionType.MAIL_CLICKED, { returnModeChoice: 'store' }, ctx);

    return createResponse(
      this.buildReturnModePayload(journey, { mode: 'store', alreadyProcessed: false }),
      'Confirm that you will collect your device from our store.',
    );
  }

  async handleReturnModeStoreSubmit(token: string, ctx: ActionContext) {
    const { p, journey } = await this.validateReturnModeToken(token, 'store');
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
    const existing = this.existingReturnMode(dd);

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      return createResponse(
        this.buildReturnModePayload(journey, { mode: 'store', alreadyProcessed: true }),
        'This request is no longer open.',
      );
    }

    if (existing) {
      return createResponse(
        this.buildReturnModePayload(journey, { mode: existing, alreadyProcessed: true }),
        'Your return preference has already been recorded.',
      );
    }

    const result = await this.journeyModel.updateOne(
      {
        _id: new Types.ObjectId(p.jid),
        $or: [
          { 'dynamicData.returnMode': { $exists: false } },
          { 'dynamicData.returnMode': '' },
          { 'dynamicData.returnMode': null },
        ],
      },
      {
        $set: {
          'dynamicData.returnMode': 'store',
          'dynamicData.returnModeSelectedAt': new Date().toISOString(),
        },
        $unset: { 'dynamicData.deliveryAddress': '' },
      },
    );

    if (result.modifiedCount === 0) {
      const refreshed = await this.resolveJourney(p.jid);
      const mode = this.existingReturnMode((refreshed.dynamicData ?? {}) as Record<string, unknown>);
      return createResponse(
        this.buildReturnModePayload(refreshed, { mode: mode ?? 'store', alreadyProcessed: true }),
        'Your return preference has already been recorded.',
      );
    }

    await this.logAction(
      p,
      JourneyActionType.RETURN_MODE_STORE_SELECTED,
      { returnMode: 'store' },
      ctx,
    );
    this.logger.log(`[Action] Return mode store — ${journey.requestId}`);

    return createResponse(
      this.buildReturnModePayload(journey, { mode: 'store', alreadyProcessed: false }),
      'Thank you — we will expect you at our store. Our team will follow up with any pickup details.',
    );
  }

  async handleReturnModeCourierView(token: string, ctx: ActionContext) {
    const { p, journey } = await this.validateReturnModeToken(token, 'courier');
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
    const existing = this.existingReturnMode(dd);

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      const note =
        journey.status === RecycleJourneyStatus.COMPLETED
          ? 'This Recycle request is already complete.'
          : 'This request was cancelled.';
      return createResponse(
        this.buildReturnModePayload(journey, { mode: 'courier', alreadyProcessed: true }),
        note,
      );
    }

    if (!journey.completedSteps?.includes('device-ready')) {
      return createResponse(
        this.buildReturnModePayload(journey, { mode: 'courier', alreadyProcessed: true }),
        'This link is not active yet. Please wait for our device ready email.',
      );
    }

    if (existing === 'store') {
      return createResponse(
        this.buildReturnModePayload(journey, { mode: 'store', alreadyProcessed: true }),
        'You already chose to collect from our store. Contact us if you need to switch to courier delivery.',
      );
    }

    if (existing === 'courier') {
      return createResponse(
        this.buildReturnModePayload(journey, { mode: 'courier', alreadyProcessed: true }),
        'You already chose courier delivery. Our team will dispatch your device and share tracking details.',
      );
    }

    await this.logAction(p, JourneyActionType.MAIL_CLICKED, { returnModeChoice: 'courier' }, ctx);

    return createResponse(
      this.buildReturnModePayload(journey, { mode: 'courier', alreadyProcessed: false }),
      'Enter the address where we should send your device.',
    );
  }

  async handleReturnModeCourierSubmit(token: string, deliveryAddress: string, ctx: ActionContext) {
    const trimmed = String(deliveryAddress ?? '').trim();
    if (trimmed.length < 5) {
      throw new BadRequestException('Please enter a valid delivery address (at least 5 characters).');
    }

    const { p, journey } = await this.validateReturnModeToken(token, 'courier');
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
    const existing = this.existingReturnMode(dd);

    if (
      journey.status === RecycleJourneyStatus.CANCELLED ||
      journey.status === RecycleJourneyStatus.COMPLETED
    ) {
      return createResponse(
        this.buildReturnModePayload(journey, { mode: 'courier', alreadyProcessed: true }),
        'This request is no longer open.',
      );
    }

    if (existing) {
      return createResponse(
        this.buildReturnModePayload(journey, { mode: existing, alreadyProcessed: true }),
        'Your return preference has already been recorded.',
      );
    }

    const result = await this.journeyModel.updateOne(
      {
        _id: new Types.ObjectId(p.jid),
        $or: [
          { 'dynamicData.returnMode': { $exists: false } },
          { 'dynamicData.returnMode': '' },
          { 'dynamicData.returnMode': null },
        ],
      },
      {
        $set: {
          'dynamicData.returnMode': 'courier',
          'dynamicData.returnModeSelectedAt': new Date().toISOString(),
          'dynamicData.deliveryAddress': trimmed,
        },
      },
    );

    if (result.modifiedCount === 0) {
      const refreshed = await this.resolveJourney(p.jid);
      const mode = this.existingReturnMode((refreshed.dynamicData ?? {}) as Record<string, unknown>);
      return createResponse(
        this.buildReturnModePayload(refreshed, { mode: mode ?? 'courier', alreadyProcessed: true }),
        'Your return preference has already been recorded.',
      );
    }

    await this.logAction(
      p,
      JourneyActionType.RETURN_MODE_COURIER_SELECTED,
      { returnMode: 'courier', deliveryAddress: trimmed },
      ctx,
    );
    this.logger.log(`[Action] Return mode courier — ${journey.requestId}`);

    return createResponse(
      this.buildReturnModePayload(
        {
          ...journey,
          dynamicData: {
            ...(journey.dynamicData ?? {}),
            returnMode: 'courier',
            deliveryAddress: trimmed,
          },
        },
        { mode: 'courier', alreadyProcessed: false },
      ),
      'Thank you — we will arrange courier delivery to the address you provided.',
    );
  }

  // ─── Rating ────────────────────────────────────────────────────────────────

  async handleRatingView(token: string, ctx: ActionContext) {
    const p       = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);
    return createResponse(
      { requestId: journey.requestId, customerName: journey.customerName },
      'Rating page loaded',
    );
  }

  async handleRatingSubmit(
    token: string,
    body: { rating: number; feedback?: string },
    ctx: ActionContext,
  ) {
    const p       = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);

    const rating = Math.min(5, Math.max(1, Number(body.rating) || 1));

    await this.logAction(p, JourneyActionType.RATING_SUBMITTED, { rating, feedback: body.feedback ?? '' }, ctx);
    this.logger.log(`[Action] Rating submitted ${rating}/5 — ${journey.requestId}`);

    // Persist rating back to journey dynamicData
    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(p.jid) },
      { $set: { 'dynamicData.customerRating': rating } },
    );

    return createResponse(
      { requestId: journey.requestId, rating },
      'Thank you for your feedback!',
    );
  }

  // ─── Support ───────────────────────────────────────────────────────────────

  async handleSupport(token: string, ctx: ActionContext) {
    const p       = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);

    await this.logAction(p, JourneyActionType.SUPPORT_REQUESTED, {}, ctx);
    this.logger.log(`[Action] Support requested — ${journey.requestId}`);

    return createResponse(
      { requestId: journey.requestId, customerName: journey.customerName },
      'Support request logged. Our team will contact you shortly.',
    );
  }

  // ─── Dashboard: list actions for a journey ─────────────────────────────────

  /**
   * Returns the action log for a journey.
   * workspaceId is asserted so no cross-workspace data leaks (IDOR prevention).
   */
  async getJourneyActions(journeyId: string, workspaceId: string) {
    const actions = await this.actionModel
      .find({
        journeyId:   new Types.ObjectId(journeyId),
        workspaceId: new Types.ObjectId(workspaceId),
      })
      .sort({ createdAt: 1 })
      .lean();
    return createResponse(actions, 'Actions fetched');
  }
}
