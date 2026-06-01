import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  SellJourneyAction,
  SellJourneyActionDocument,
  JourneyActionType,
} from './schemas/sell-journey-action.schema';
import {
  SellRequestJourney,
  JourneyStatus,
  JOURNEY_WORKFLOW_STEPS,
  JourneyWorkflowStep,
} from './schemas/sell-request-journey.schema';
import { SellPublicActionTokenService, ActionTokenPayload } from './sell-public-action-token.service';
import { createResponse } from '../../common/utils/api-response';
import { isValidCustomerPreferredPickupDate } from '../../common/date-format';
import {
  SELL_PICKUP_TIME_WINDOW_SELECT_OPTIONS,
  isSellPickupTimeAny,
  isValidSellPickupTimeWindowSelection,
} from './sell-pickup-time-windows';

export interface ActionContext {
  ip: string;
  userAgent: string;
}

@Injectable()
export class SellPublicActionService {
  private readonly logger = new Logger(SellPublicActionService.name);

  constructor(
    @InjectModel(SellJourneyAction.name)
    private readonly actionModel: Model<SellJourneyActionDocument>,
    @InjectModel(SellRequestJourney.name)
    private readonly journeyModel: Model<any>,
    private readonly tokenService: SellPublicActionTokenService,
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
        'requestId customerName customerEmail currency currentStep status completedSteps workspaceId sentSteps dynamicData offerGeneration requestAckGeneration',
      )
      .lean();
    if (!journey) throw new NotFoundException('Journey not found');
    return journey;
  }

  /** Live offer revision on journey doc (tokens must match this). */
  private effectiveOfferGeneration(journey: {
    offerGeneration?: number;
    completedSteps?: string[];
  }): number {
    const stored = journey.offerGeneration;
    if (typeof stored === 'number' && stored > 0) return stored;
    if (journey.completedSteps?.includes('offer-ready')) return 1;
    return 0;
  }

  private async logAction(
    payload: ActionTokenPayload,
    actionType: JourneyActionType,
    extra: Record<string, unknown>,
    ctx: ActionContext,
  ): Promise<SellJourneyActionDocument> {
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

  // ─── Offer ─────────────────────────────────────────────────────────────────

  async handleOfferDecision(token: string, decision: 'accept' | 'decline', ctx: ActionContext) {
    const p       = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);

    const jGen = this.effectiveOfferGeneration(journey);
    const tGen =
      typeof p.offerGen === 'number'
        ? p.offerGen
        : jGen;

    if (journey.status === JourneyStatus.CANCELLED || journey.status === JourneyStatus.COMPLETED) {
      const d = (journey.dynamicData ?? {}) as Record<string, string>;
      const offerAmount = d.finalOffer ?? d.offerAmount;
      const note =
        journey.status === JourneyStatus.COMPLETED
          ? 'This sell request is already complete. Thank you for choosing Rekart!'
          : 'This request was cancelled. Contact us if you need a new quote.';
      return createResponse(
        {
          requestId: journey.requestId,
          customerName: journey.customerName,
          currency: journey.currency,
          deviceName: d.deviceName,
          decision,
          offerAmount,
          alreadyProcessed: true,
        },
        note,
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      const d = (journey.dynamicData ?? {}) as Record<string, string>;
      return createResponse(
        {
          requestId: journey.requestId,
          customerName: journey.customerName,
          currency: journey.currency,
          deviceName: d.deviceName,
          decision,
          offerAmount: d.finalOffer ?? d.offerAmount,
          alreadyProcessed: true,
        },
        'This offer link is outdated. Please open the latest email from us for the current offer.',
      );
    }

    if (journey.status === JourneyStatus.OFFER_DECLINED) {
      const d = (journey.dynamicData ?? {}) as Record<string, string>;
      const offerAmount = d.finalOffer ?? d.offerAmount;
      const note =
        decision === 'accept'
          ? 'This offer is no longer available. If you changed your mind, contact our team — we’re happy to help.'
          : 'You’ve already responded to this offer. Our team will reach out with options.';
      return createResponse(
        {
          requestId: journey.requestId,
          customerName: journey.customerName,
          currency: journey.currency,
          deviceName: d.deviceName,
          decision,
          offerAmount,
          alreadyProcessed: true,
        },
        note,
      );
    }

    const actionType =
      decision === 'accept'
        ? JourneyActionType.OFFER_ACCEPTED
        : JourneyActionType.OFFER_DECLINED;

    // Atomic guard: only proceed if the offer hasn't already been actioned for
    // this generation. Prevents duplicate processing on concurrent double-clicks.
    const atomicFilter = {
      _id:             new Types.ObjectId(p.jid),
      offerGeneration: jGen,
      // If already accepted for this gen, block both paths; accepted → no re-decline
      'dynamicData.offerAcceptedGeneration': { $ne: jGen },
    };

    if (decision === 'decline') {
      const result = await this.journeyModel.updateOne(
        atomicFilter,
        {
          $set: {
            status: JourneyStatus.OFFER_DECLINED,
            currentStep: 'offer-ready',
            'dynamicData.offerAcceptedByCustomer': false,
          },
          $unset: {
            'dynamicData.offerAcceptedAt': '',
            'dynamicData.offerAcceptedGeneration': '',
          },
          $push: {
            'dynamicData.offerRoundHistory': {
              generation: jGen,
              at: new Date().toISOString(),
              kind: 'customer_declined',
            },
          },
        },
      );
      if (result.modifiedCount === 0) {
        // Already actioned by a concurrent request — treat as already-processed
        const d = (journey.dynamicData ?? {}) as Record<string, string>;
        return createResponse(
          { requestId: journey.requestId, customerName: journey.customerName, currency: journey.currency, deviceName: d.deviceName, decision, offerAmount: d.finalOffer ?? d.offerAmount, alreadyProcessed: true },
          'Your response has already been recorded.',
        );
      }
    } else {
      const result = await this.journeyModel.updateOne(
        atomicFilter,
        {
          $set: {
            currentStep: 'payment-sent',
            status: JourneyStatus.ACTIVE,
            'dynamicData.offerAcceptedByCustomer': true,
            'dynamicData.offerAcceptedAt': new Date(),
            'dynamicData.offerAcceptedGeneration': jGen,
          },
          $push: {
            'dynamicData.offerRoundHistory': {
              generation: jGen,
              at: new Date().toISOString(),
              kind: 'customer_accepted',
            },
          },
        },
      );
      if (result.modifiedCount === 0) {
        const d = (journey.dynamicData ?? {}) as Record<string, string>;
        return createResponse(
          { requestId: journey.requestId, customerName: journey.customerName, currency: journey.currency, deviceName: d.deviceName, decision, offerAmount: d.finalOffer ?? d.offerAmount, alreadyProcessed: true },
          'Your response has already been recorded.',
        );
      }
    }

    await this.logAction(p, actionType, { decision, offerGeneration: jGen }, ctx);
    this.logger.log(`[Action] Offer ${decision}d — ${journey.requestId}`);

    const d = (journey.dynamicData ?? {}) as Record<string, string>;
    const offerAmount = d.finalOffer ?? d.offerAmount;

    return createResponse(
      {
        requestId:    journey.requestId,
        customerName: journey.customerName,
        currency:     journey.currency,
        deviceName:   d.deviceName,
        decision,
        offerAmount,
        alreadyProcessed: false,
      },
      decision === 'accept'
        ? 'Offer accepted! Our team will process your payment soon.'
        : 'Offer declined. Our team will reach out to discuss alternatives.',
    );
  }

  // ─── Request received — schedule pickup / decline ─────────────────────────

  private buildRequestAckPayload(
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
    return {
      requestId: journey.requestId,
      customerName: journey.customerName,
      deviceName: String(dd['deviceName'] ?? '').trim() || undefined,
      decision: opts.decision,
      alreadyProcessed: opts.alreadyProcessed,
      preferredPickupTimeSlot: slot || undefined,
      preferredPickupDate: date || undefined,
      customerPreferredPickupTimeAny: dd['customerPreferredPickupTimeAny'] === true,
      timeWindowOptions: [...SELL_PICKUP_TIME_WINDOW_SELECT_OPTIONS],
    };
  }

  private async validateRequestAckToken(token: string, decision: 'accept' | 'decline') {
    const p = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);

    const expectedAction =
      decision === 'accept'
        ? JourneyActionType.REQUEST_RECEIVED_ACCEPTED
        : JourneyActionType.REQUEST_RECEIVED_DECLINED;
    if (p.action !== expectedAction) {
      throw new BadRequestException('This link does not match that action.');
    }
    if (p.step !== 'request-received') {
      throw new BadRequestException('Invalid step for this action.');
    }

    const jGen =
      typeof journey.requestAckGeneration === 'number'
        ? journey.requestAckGeneration
        : 0;
    const tGen =
      typeof p.requestAckGen === 'number' ? p.requestAckGen : jGen;

    return { p, journey, jGen, tGen };
  }

  /** GET — show schedule-pickup form; does not record acceptance until customer submits. */
  async handleRequestAcceptView(token: string, ctx: ActionContext) {
    void ctx;
    const { journey, jGen, tGen } = await this.validateRequestAckToken(token, 'accept');
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;

    if (
      journey.status === JourneyStatus.CANCELLED ||
      journey.status === JourneyStatus.COMPLETED
    ) {
      const note =
        journey.status === JourneyStatus.COMPLETED
          ? 'This sell request is already complete. Thank you for choosing Rekart!'
          : 'This request was cancelled. Contact us if you need help.';
      return {
        ...createResponse(
          this.buildRequestAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          note,
        ),
      };
    }

    const reqIdx = JOURNEY_WORKFLOW_STEPS.indexOf('request-received');
    const progressedPastRequest = (journey.completedSteps ?? []).some((s: string) => {
      const i = JOURNEY_WORKFLOW_STEPS.indexOf(s as JourneyWorkflowStep);
      return i !== -1 && i > reqIdx;
    });
    if (progressedPastRequest) {
      return {
        ...createResponse(
          this.buildRequestAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          'This request has already moved forward. Contact us if you need anything.',
        ),
      };
    }

    if (jGen > 0 && tGen !== jGen) {
      return {
        ...createResponse(
          this.buildRequestAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          'This link is outdated. Please open the latest email from us to confirm or decline.',
        ),
      };
    }

    if (jGen <= 0) {
      return {
        ...createResponse(
          this.buildRequestAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
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
          this.buildRequestAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          'Your pickup request is already on file. Thank you!',
        ),
      };
    }

    return {
      ...createResponse(
        this.buildRequestAckPayload(journey, { decision: 'accept', alreadyProcessed: false }),
        'Choose your preferred pickup date and time window and confirm below.',
      ),
    };
  }

  /** POST — record schedule pickup with customer-preferred time window. */
  async handleRequestAcceptSubmit(
    token: string,
    preferredPickupTimeSlot: string,
    preferredPickupDate: string,
    ctx: ActionContext,
  ) {
    const slot = preferredPickupTimeSlot?.trim() ?? '';
    const date = preferredPickupDate?.trim() ?? '';
    if (!isValidSellPickupTimeWindowSelection(slot)) {
      throw new BadRequestException('Please select a valid pickup time window.');
    }
    if (!isValidCustomerPreferredPickupDate(date)) {
      throw new BadRequestException('Please select a valid pickup date (today or later).');
    }

    const { p, journey, jGen, tGen } = await this.validateRequestAckToken(token, 'accept');
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
    const anyTime = isSellPickupTimeAny(slot);

    if (
      journey.status === JourneyStatus.CANCELLED ||
      journey.status === JourneyStatus.COMPLETED
    ) {
      return {
        ...createResponse(
          this.buildRequestAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
          journey.status === JourneyStatus.COMPLETED
            ? 'This sell request is already complete.'
            : 'This request was cancelled.',
        ),
      };
    }

    if (jGen > 0 && tGen !== jGen) {
      return {
        ...createResponse(
          this.buildRequestAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
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
          this.buildRequestAckPayload(journey, { decision: 'accept', alreadyProcessed: true }),
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
        status: JourneyStatus.ACTIVE,
        'dynamicData.requestAckByCustomer': true,
        'dynamicData.requestAckAcceptedGen': jGen,
        'dynamicData.requestAckAcceptedAt': new Date(),
        'dynamicData.requestAckDeclined': false,
        'dynamicData.reminderDue': false,
        'dynamicData.customerPreferredPickupTimeSlot': slot,
        'dynamicData.customerPreferredPickupTimeAny': anyTime,
        'dynamicData.customerPreferredPickupDate': date,
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
          this.buildRequestAckPayload(refreshed, { decision: 'accept', alreadyProcessed: true }),
          'Your pickup request is already on file. Thank you!',
        ),
      };
    }

    await this.logAction(
      p,
      JourneyActionType.REQUEST_RECEIVED_ACCEPTED,
      { decision: 'accept', requestAckGeneration: jGen, preferredPickupTimeSlot: slot, preferredPickupDate: date, anyTime },
      ctx,
    );
    this.logger.log(`[Action] Request schedule pickup — ${journey.requestId} (${date}, ${slot})`);

    const refreshed = await this.resolveJourney(p.jid);
    return {
      ...createResponse(
        this.buildRequestAckPayload(refreshed, { decision: 'accept', alreadyProcessed: false }),
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
      return this.handleRequestAcceptView(token, ctx);
    }

    const { p, journey, jGen, tGen } = await this.validateRequestAckToken(token, decision);
    const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;

    const baseResponse = (alreadyProcessed: boolean) =>
      createResponse(
        this.buildRequestAckPayload(journey, { decision, alreadyProcessed }),
        '',
      );

    if (
      journey.status === JourneyStatus.CANCELLED ||
      journey.status === JourneyStatus.COMPLETED
    ) {
      const note =
        journey.status === JourneyStatus.COMPLETED
          ? 'This sell request is already complete. Thank you for choosing Rekart!'
          : 'This request was cancelled. Contact us if you need help.';
      const r = baseResponse(true);
      return { ...r, message: note };
    }

    const reqIdx = JOURNEY_WORKFLOW_STEPS.indexOf('request-received');
    const progressedPastRequest = (journey.completedSteps ?? []).some((s: string) => {
      const i = JOURNEY_WORKFLOW_STEPS.indexOf(s as JourneyWorkflowStep);
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
        JourneyActionType.REQUEST_RECEIVED_DECLINED,
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
      journey.status === JourneyStatus.REQUEST_DECLINED &&
      dd['requestAckDeclined'] === true &&
      declinedGen !== null &&
      declinedGen === jGen;

    if (alreadyDeclinedForRound) {
      await this.logAction(
        p,
        JourneyActionType.REQUEST_RECEIVED_DECLINED,
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
        status: JourneyStatus.REQUEST_DECLINED,
        currentStep: 'request-received',
        'dynamicData.requestAckByCustomer': false,
        'dynamicData.requestAckDeclined': true,
        'dynamicData.requestAckDeclinedGen': jGen,
        'dynamicData.requestAckDeclinedAt': new Date(),
        'dynamicData.reminderDue': false,
      },
      $unset: {
        'dynamicData.requestAckAcceptedGen': '',
        'dynamicData.requestAckAcceptedAt': '',
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
      JourneyActionType.REQUEST_RECEIVED_DECLINED,
      { decision, requestAckGeneration: jGen },
      ctx,
    );
    this.logger.log(`[Action] Request declined — ${journey.requestId}`);

    const r = baseResponse(false);
    return {
      ...r,
      message: 'We’ve noted that you’re not continuing from this email. Our team may reach out.',
    };
  }

  // ─── Receipt ───────────────────────────────────────────────────────────────

  async handleReceipt(token: string, ctx: ActionContext) {
    const p       = this.decodeToken(token);
    const journey = await this.resolveJourney(p.jid);

    await this.logAction(p, JourneyActionType.RECEIPT_VIEWED, {}, ctx);
    this.logger.log(`[Action] Receipt viewed — ${journey.requestId}`);

    const d = (journey.dynamicData ?? {}) as Record<string, string>;
    return createResponse(
      {
        requestId:        journey.requestId,
        customerName:     journey.customerName,
        currency:         journey.currency,
        paidAmount:       d.paidAmount || d.paymentAmount,
        paymentReference: d.paymentReference || d.transactionId,
        paymentMethod:    d.paymentMethod || d.payoutMethod,
        bankNote:         d.bankNote,
        accountDetails:   d.accountDetails,
        paymentDate:      d.paymentDate,
        deviceName:       d.deviceName,
      },
      'Receipt loaded',
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
