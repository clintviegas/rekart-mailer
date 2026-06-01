import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RentRequestJourney,
  RentRequestJourneyDocument,
  RentJourneyStatus,
} from './schemas/rent-request-journey.schema';
import {
  RentJourneyAction,
  RentJourneyActionDocument,
  RentJourneyActionType,
} from './schemas/rent-journey-action.schema';
import { RentPublicActionTokenService } from './rent-public-action-token.service';
import { createResponse } from '../../common/utils/api-response';
import { SubmitRentRequestConfirmDto } from './dto/submit-rent-request-confirm.dto';
import { SubmitRentAgreementDeclineDto } from './dto/submit-rent-agreement-decline.dto';
import { SubmitRentAgreementAcceptDto } from './dto/submit-rent-agreement-accept.dto';
import { isValidRentQuoteDeclineReason } from './rent-quote-decline-reasons';
import { isRentAgreementAccepted } from './rent-agreement-status';
import { applyRentReturnDueFields } from './rent-return-due.util';
import {
  computeRentItemChanges,
  hasRentItemChanges,
  type RentItemLine,
} from './rent-item-diff';
import { WorkspaceBrandingService } from '../workspace/workspace-branding.service';
import {
  findBusinessLocation,
  resolveBusinessLocations,
} from '../workspace/business-locations.util';

@Injectable()
export class RentPublicActionService {
  private readonly logger = new Logger(RentPublicActionService.name);

  constructor(
    @InjectModel(RentRequestJourney.name)
    private readonly journeyModel: Model<RentRequestJourneyDocument>,
    @InjectModel(RentJourneyAction.name)
    private readonly actionModel: Model<RentJourneyActionDocument>,
    private readonly tokenService: RentPublicActionTokenService,
    private readonly brandingService: WorkspaceBrandingService,
  ) {}

  async getTrackPage(token: string) {
    const payload = this.tokenService.verify(token);
    if (!payload) throw new BadRequestException('Invalid or expired link');

    const journey = await this.journeyModel.findById(payload.jid).lean();
    if (!journey) throw new NotFoundException('Request not found');

    await this.recordAction(journey, RentJourneyActionType.TRACK_CLICKED, payload.step);

    return createResponse(
      {
        requestId: journey.requestId,
        customerName: journey.customerName,
        currentStep: journey.currentStep,
        status: journey.status,
        completedSteps: journey.completedSteps,
        fulfillmentMode: journey.dynamicData?.fulfillmentMode ?? null,
        rentalItems: journey.dynamicData?.rentalItems ?? [],
        currency: journey.currency,
      },
      'Track data fetched',
    );
  }

  /** GET — rent request confirm form */
  async getRequestConfirmView(token: string) {
    const { journey, jGen, tGen } = await this.validateRequestAckToken(token, 'confirm');
    const dd = journey.dynamicData ?? {};

    if (this.alreadyConfirmed(dd, jGen)) {
      return createResponse(
        await this.buildConfirmPayload(journey, true),
        'Your rental request is already confirmed. Our team will follow up shortly.',
      );
    }

    if (this.isDeclinedForGen(dd, jGen)) {
      return createResponse(
        await this.buildConfirmPayload(journey, true),
        'You declined this request. Contact us if you changed your mind.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        await this.buildConfirmPayload(journey, true),
        'This link is outdated. Please use the latest email from us.',
      );
    }

    return createResponse(
      await this.buildConfirmPayload(journey, false),
      'Review your items and confirm or update them below.',
    );
  }

  /** POST — save customer confirm (items + optional message only) */
  async submitRequestConfirm(token: string, dto: SubmitRentRequestConfirmDto) {
    const { journey, jGen, tGen } = await this.validateRequestAckToken(token, 'confirm');
    const dd = journey.dynamicData ?? {};

    if (this.alreadyConfirmed(dd, jGen)) {
      return createResponse(
        await this.buildConfirmPayload(journey, true),
        'Your rental request is already confirmed.',
      );
    }

    if (this.isDeclinedForGen(dd, jGen)) {
      throw new BadRequestException(
        'You declined this request. Please use the latest email from us if our team sent a new one.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      throw new BadRequestException(
        'This link is outdated. Please use the latest email from us.',
      );
    }

    const branding = await this.brandingService.getRaw(String(journey.workspaceId));
    const storedLocations = branding?.businessLocationsByCurrency ?? {};

    let confirmedAddress = '';
    let addressMode: string;
    let pickupLocationId: string | undefined;
    let pickupLocationLabel: string | undefined;

    if (dto.fulfillmentMode === 'pickup') {
      const location = findBusinessLocation(
        journey.currency,
        dto.pickupLocationId,
        storedLocations,
      );
      if (!location) {
        throw new BadRequestException('Please select a pickup location.');
      }
      confirmedAddress = location.address;
      addressMode = 'pickup';
      pickupLocationId = location.id;
      pickupLocationLabel = location.label;
    } else {
      const savedAddress = String(dd.customerAddress ?? '').trim();
      if (dto.addressMode === 'saved' && !savedAddress) {
        throw new BadRequestException(
          'No address on file — please choose a different address.',
        );
      }
      if (dto.addressMode === 'different' && !dto.deliveryAddress?.trim()) {
        throw new BadRequestException('Please enter your delivery address.');
      }
      addressMode = dto.addressMode ?? 'saved';
      confirmedAddress =
        addressMode === 'different'
          ? dto.deliveryAddress!.trim()
          : savedAddress;
    }

    const start = new Date(`${dto.rentalStartDate}T00:00:00`);
    const end = new Date(`${dto.rentalEndDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Please enter valid rental dates.');
    }
    if (end < start) {
      throw new BadRequestException('End date cannot be before start date.');
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const rentalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);

    const existingItems = (Array.isArray(dd.rentalItems) ? dd.rentalItems : [])
      .map((i) => {
        const row = i as Record<string, unknown>;
        return {
          name: String(row.name ?? '').trim(),
          qty: Math.max(1, Math.round(Number(row.qty) || 1)),
        };
      })
      .filter((i) => i.name);

    const originalItems: RentItemLine[] = (
      Array.isArray(dd.originalRentalItems) ? dd.originalRentalItems : existingItems
    )
      .map((i) => {
        const row = i as Record<string, unknown>;
        return {
          name: String(row.name ?? '').trim(),
          qty: Math.max(1, Math.round(Number(row.qty) || 1)),
        };
      })
      .filter((i) => i.name);

    const items = dto.rentalItems.map((i) => ({
      name: i.name.trim(),
      qty: Math.max(1, Math.round(i.qty)),
    }));

    const message = dto.customerMessage?.trim() || '';
    const customerItemChanges = computeRentItemChanges(originalItems, items);

    const dynamicData = {
      ...dd,
      originalRentalItems: originalItems,
      requestAckByCustomer: true,
      requestAckConfirmedGen: jGen,
      requestConfirmedAt: new Date().toISOString(),
      requestAckDeclined: false,
      fulfillmentMode: dto.fulfillmentMode,
      fulfillmentConfirmedAt: new Date().toISOString(),
      rentalStartDate: dto.rentalStartDate,
      rentalEndDate: dto.rentalEndDate,
      rentalDuration: `${rentalDays} day${rentalDays === 1 ? '' : 's'}`,
      rentalDurationDays: rentalDays,
      addressMode,
      confirmedAddress,
      deliveryAddress:
        dto.fulfillmentMode === 'delivery' && addressMode === 'different'
          ? dto.deliveryAddress?.trim()
          : undefined,
      pickupLocationId,
      pickupLocationLabel,
      rentalItems: items,
      customerRentalItems: items,
      customerMessage: message,
      itemsNotes: message,
      customerItemChanges,
    };

    await this.journeyModel.updateOne(
      { _id: journey._id },
      {
        $set: {
          dynamicData: applyRentReturnDueFields(dynamicData),
          currentStep: 'rent-agreement',
        },
      },
    );

    await this.recordAction(
      journey,
      RentJourneyActionType.REQUEST_CONFIRMED,
      'rent-request',
      {
        itemCount: items.length,
        customerMessage: message || null,
        requestAckGeneration: jGen,
        customerItemChanges,
        itemsChanged: hasRentItemChanges(customerItemChanges),
        fulfillmentMode: dto.fulfillmentMode,
        rentalStartDate: dto.rentalStartDate,
        rentalEndDate: dto.rentalEndDate,
        addressMode,
        pickupLocationId: pickupLocationId ?? null,
        pickupLocationLabel: pickupLocationLabel ?? null,
      },
    );

    this.logger.log(`[Action] Rent request confirmed — ${journey.requestId}`);

    const refreshed = await this.journeyModel.findById(journey._id).lean();
    return createResponse(
      await this.buildConfirmPayload(refreshed!, false),
      'Thank you — we received your confirmation. Our team will send you a quote shortly.',
    );
  }

  /** GET — rent request decline view */
  async getRequestDeclineView(token: string) {
    const { journey, jGen, tGen } = await this.validateRequestAckToken(token, 'decline');
    const dd = journey.dynamicData ?? {};

    if (this.isDeclinedForGen(dd, jGen)) {
      return createResponse(
        this.buildDeclinePayload(journey, true),
        'We already recorded your decline. Our team may reach out with options.',
      );
    }

    if (this.alreadyConfirmed(dd, jGen)) {
      return createResponse(
        this.buildDeclinePayload(journey, true),
        'You already confirmed this request. Contact us if you need to change anything.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        this.buildDeclinePayload(journey, true),
        'This link is outdated. Please use the latest email from us.',
      );
    }

    return createResponse(
      this.buildDeclinePayload(journey, false),
      'Tap below to decline this rental request.',
    );
  }

  /** POST — record decline (no reason required) */
  async submitRequestDecline(token: string, reason?: string) {
    const trimmed = reason?.trim() ?? '';

    const { journey, jGen, tGen } = await this.validateRequestAckToken(token, 'decline');
    const dd = journey.dynamicData ?? {};

    if (this.isDeclinedForGen(dd, jGen)) {
      return createResponse(
        this.buildDeclinePayload(journey, true),
        'We already recorded your decline.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      throw new BadRequestException(
        'This link is outdated. Please use the latest email from us.',
      );
    }

    const dynamicData = {
      ...dd,
      requestAckByCustomer: false,
      requestAckDeclined: true,
      requestAckDeclinedGen: jGen,
      requestDeclinedAt: new Date().toISOString(),
      declineReason: trimmed || 'Declined by customer',
      requestAckConfirmedGen: undefined,
      requestConfirmedAt: undefined,
    };

    await this.journeyModel.updateOne(
      { _id: journey._id },
      {
        $set: {
          dynamicData: {
            ...dynamicData,
            requestAckConfirmedGen: undefined,
            requestConfirmedAt: undefined,
          },
          currentStep: 'rent-request',
        },
      },
    );

    await this.recordAction(
      journey,
      RentJourneyActionType.REQUEST_DECLINED,
      'rent-request',
      { reason: trimmed || 'Declined by customer', requestAckGeneration: jGen },
    );

    this.logger.log(`[Action] Rent request declined — ${journey.requestId}`);

    const refreshed = await this.journeyModel.findById(journey._id).lean();
    return createResponse(
      this.buildDeclinePayload(refreshed!, false),
      'Your request has been declined. Contact us if you change your mind.',
    );
  }

  /** Legacy one-click pickup (old emails) */
  async confirmFulfillment(token: string, mode: 'pickup' | 'delivery') {
    const payload = this.tokenService.verify(token);
    if (!payload) throw new BadRequestException('Invalid or expired link');
    if (payload.step !== 'rent-request') {
      throw new BadRequestException('This link is not valid for this action');
    }

    const expectedAction =
      mode === 'pickup'
        ? RentJourneyActionType.REQUEST_PICKUP_CHOSEN
        : RentJourneyActionType.REQUEST_DELIVERY_CHOSEN;

    if (payload.action !== expectedAction) {
      throw new BadRequestException('Invalid action for this link');
    }

    const journey = await this.journeyModel.findById(payload.jid);
    if (!journey) throw new NotFoundException('Request not found');

    const ackGen = Number(journey.dynamicData?.requestAckGeneration ?? 0);
    if (payload.requestAckGen != null && payload.requestAckGen !== ackGen) {
      throw new BadRequestException(
        'This link is from an older email. Please use the latest email.',
      );
    }

    const existingMode = String(journey.dynamicData?.fulfillmentMode ?? '').toLowerCase();
    if (existingMode === 'pickup' || existingMode === 'delivery') {
      return createResponse(
        {
          requestId: journey.requestId,
          customerName: journey.customerName,
          fulfillmentMode: existingMode,
          alreadyProcessed: true,
        },
        `You already chose ${existingMode}.`,
      );
    }

    const dynamicData = {
      ...(journey.dynamicData ?? {}),
      fulfillmentMode: mode,
      fulfillmentConfirmedAt: new Date().toISOString(),
      requestAckByCustomer: true,
    };

    await this.journeyModel.updateOne(
      { _id: journey._id },
      { $set: { dynamicData } },
    );

    await this.recordAction(journey, expectedAction, 'rent-request', { mode });

    return createResponse(
      {
        requestId: journey.requestId,
        customerName: journey.customerName,
        fulfillmentMode: mode,
        alreadyProcessed: false,
      },
      mode === 'pickup'
        ? 'Pickup selected — we will notify you when your item is ready.'
        : 'Delivery selected — we will dispatch your rental to your address.',
    );
  }

  async signAgreement(token: string, dto: SubmitRentAgreementAcceptDto) {
    return this.submitAgreementAccept(token, dto);
  }

  private assertValidAgreementSignature(dto: SubmitRentAgreementAcceptDto): void {
    const image = String(dto.signatureImage ?? '').trim();
    if (!image.startsWith('data:image/png;base64,')) {
      throw new BadRequestException('Please draw your signature before submitting.');
    }
    const b64 = image.slice('data:image/png;base64,'.length);
    if (b64.length < 100 || b64.length > 140_000) {
      throw new BadRequestException('Invalid signature image. Please sign again.');
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(b64)) {
      throw new BadRequestException('Invalid signature format.');
    }
    if (dto.consentGiven !== true) {
      throw new BadRequestException('Electronic signature consent is required.');
    }
  }

  /** GET — review quote before accepting */
  async getAgreementAcceptView(token: string) {
    const { journey, jGen, tGen } = await this.validateAgreementToken(token, 'accept');
    const dd = journey.dynamicData ?? {};

    if (isRentAgreementAccepted(dd)) {
      return createResponse(
        await this.buildAgreementViewPayload(journey, true),
        'Agreement already signed. Our staff will proceed with your rental.',
      );
    }

    if (this.isAgreementDeclinedForGen(dd, jGen)) {
      return createResponse(
        await this.buildAgreementViewPayload(journey, true),
        'You declined this quote. Contact us if you changed your mind.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        await this.buildAgreementViewPayload(journey, true),
        'This link is outdated. Please use the latest email from us.',
      );
    }

    return createResponse(
      {
        ...(await this.buildAgreementViewPayload(journey, false)),
      },
      'Review your rental quote below, then open the agreement to sign electronically.',
    );
  }

  /** POST — accept / sign agreement with e-signature */
  async submitAgreementAccept(token: string, dto: SubmitRentAgreementAcceptDto) {
    this.assertValidAgreementSignature(dto);
    const { journey, jGen: rawGen, tGen } = await this.validateAgreementToken(token, 'accept');
    const dd = journey.dynamicData ?? {};
    const jGen = rawGen > 0 ? rawGen : 1;

    if (isRentAgreementAccepted(dd)) {
      return createResponse(
        await this.buildAgreementViewPayload(journey, true),
        'Agreement already signed.',
      );
    }

    if (this.isAgreementDeclinedForGen(dd, jGen)) {
      throw new BadRequestException(
        'You declined this quote. Please use the latest email from us if our team sent a revised quote.',
      );
    }

    if (rawGen > 0 && tGen !== rawGen) {
      throw new BadRequestException(
        'This link is outdated. Please use the latest email from us.',
      );
    }

    const signedAt = new Date().toISOString();
    const dynamicData: Record<string, unknown> = {
      ...(journey.dynamicData ?? {}),
      agreementSigned: true,
      agreementSignedAt: signedAt,
      agreementSignedGen: jGen,
      agreementDeclined: false,
      agreementSignerName: dto.signerName.trim(),
      agreementSignedDateDisplay: dto.signedDate.trim(),
      agreementSignatureImage: dto.signatureImage.trim(),
      agreementEsignConsent: true,
      agreementSignatureMethod: 'electronic_drawn',
    };
    if (Number(journey.dynamicData?.agreementGeneration ?? 0) <= 0) {
      dynamicData.agreementGeneration = jGen;
    }
    delete dynamicData.agreementDeclinedGen;

    await this.journeyModel.updateOne(
      { _id: journey._id },
      { $set: { dynamicData } },
    );

    const signedJourney = {
      ...(typeof journey.toObject === 'function' ? journey.toObject() : journey),
      dynamicData,
    };

    await this.recordAction(
      journey,
      RentJourneyActionType.AGREEMENT_SIGNED,
      'rent-agreement',
      {
        agreementGeneration: jGen,
        signerName: dto.signerName.trim(),
        signedDate: dto.signedDate.trim(),
      },
    );

    return createResponse(
      await this.buildAgreementViewPayload(signedJourney, true),
      'Agreement signed successfully. Our team will prepare your rental.',
    );
  }

  /** GET — decline form */
  async getAgreementDeclineView(token: string) {
    const { journey, jGen, tGen } = await this.validateAgreementToken(token, 'decline');
    const dd = journey.dynamicData ?? {};

    if (isRentAgreementAccepted(dd)) {
      return createResponse(
        this.buildAgreementPayload(journey, true),
        'You already accepted this quote.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      return createResponse(
        this.buildAgreementPayload(journey, true),
        'This link is outdated. Please use the latest email from us.',
      );
    }

    if (this.isAgreementDeclinedForGen(dd, jGen)) {
      return createResponse(
        {
          ...this.buildAgreementPayload(journey, true),
          quoteDeclineReason: String(dd.quoteDeclineReason ?? ''),
          quoteDeclineNote: String(dd.quoteDeclineNote ?? ''),
        },
        'You already declined this quote. Our team may send a revised quote.',
      );
    }

    return createResponse(
      this.buildAgreementPayload(journey, false),
      'Tell us why you are declining — this helps us send a better revised quote.',
    );
  }

  /** POST — decline quote with reason + optional note */
  async submitAgreementDecline(token: string, dto: SubmitRentAgreementDeclineDto) {
    const reason = dto.declineReason?.trim() ?? '';
    if (!isValidRentQuoteDeclineReason(reason)) {
      throw new BadRequestException('Please provide a decline reason (at least 3 characters).');
    }

    const { journey, jGen, tGen } = await this.validateAgreementToken(token, 'decline');
    const dd = journey.dynamicData ?? {};
    const customerNote = dto.customerNote?.trim() ?? '';

    if (isRentAgreementAccepted(dd)) {
      return createResponse(
        this.buildAgreementPayload(journey, true),
        'You already accepted this quote.',
      );
    }

    if (jGen > 0 && tGen !== jGen) {
      throw new BadRequestException(
        'This link is outdated. Please use the latest email from us.',
      );
    }

    if (this.isAgreementDeclinedForGen(dd, jGen)) {
      return createResponse(
        {
          ...this.buildAgreementPayload(journey, true),
          quoteDeclineReason: String(dd.quoteDeclineReason ?? reason),
          quoteDeclineNote: String(dd.quoteDeclineNote ?? customerNote),
        },
        'Your response has already been recorded.',
      );
    }

    const dynamicData: Record<string, unknown> = {
      ...(journey.dynamicData ?? {}),
      agreementDeclined: true,
      agreementDeclinedGen: jGen,
      agreementDeclinedAt: new Date().toISOString(),
      quoteDeclineReason: reason,
      agreementSigned: false,
    };
    if (customerNote) {
      dynamicData.quoteDeclineNote = customerNote;
    } else {
      delete dynamicData.quoteDeclineNote;
    }
    delete dynamicData.agreementSignedAt;
    delete dynamicData.agreementSignedGen;

    const quoteReviseType = String(dd.quoteReviseType ?? '').trim();
    const isFinalOfferDecline = quoteReviseType === 'final_offer';
    if (isFinalOfferDecline) {
      dynamicData.finalOfferDeclinedClosed = true;
      dynamicData.closedReason = 'final_offer_declined';
      dynamicData.closedAt = new Date().toISOString();
      delete dynamicData.finalOfferResumePending;
      delete dynamicData.finalOfferResumeLocked;
    }

    await this.journeyModel.updateOne(
      { _id: journey._id },
      {
        $set: {
          dynamicData,
          currentStep: 'rent-agreement',
          ...(isFinalOfferDecline ? { status: RentJourneyStatus.CANCELLED } : {}),
        },
      },
    );

    await this.recordAction(
      journey,
      RentJourneyActionType.AGREEMENT_DECLINED,
      'rent-agreement',
      {
        agreementGeneration: jGen,
        declineReason: reason,
        quoteReviseType,
        finalOfferClosed: isFinalOfferDecline,
        ...(customerNote ? { customerNote } : {}),
      },
    );

    this.logger.log(
      `[Action] Agreement declined — ${journey.requestId}: ${reason}${isFinalOfferDecline ? ' (final offer — closed)' : ''}`,
    );

    return createResponse(
      {
        ...this.buildAgreementPayload(journey, false),
        quoteDeclineReason: reason,
        quoteDeclineNote: customerNote,
      },
      isFinalOfferDecline
        ? 'Thank you — we have closed this rental request. Contact us if you change your mind.'
        : 'Thank you — we recorded your feedback. Our team may send a revised quote.',
    );
  }

  private async validateAgreementToken(token: string, decision: 'accept' | 'decline') {
    const payload = this.tokenService.verify(token);
    if (!payload) throw new BadRequestException('Invalid or expired link');
    if (payload.step !== 'rent-agreement') {
      throw new BadRequestException('This link is not valid for this action');
    }

    const expected =
      decision === 'accept'
        ? RentJourneyActionType.AGREEMENT_SIGNED
        : RentJourneyActionType.AGREEMENT_DECLINED;

    if (payload.action !== expected) {
      throw new BadRequestException('Invalid action for this link');
    }

    const journey = await this.journeyModel.findById(payload.jid);
    if (!journey) throw new NotFoundException('Request not found');

    const jGen = Number(journey.dynamicData?.agreementGeneration ?? 0);
    const tGen = payload.agreementGen ?? jGen;
    return { payload, journey, jGen, tGen };
  }

  private isAgreementSignedForGen(dd: Record<string, unknown>, gen: number): boolean {
    return (
      dd.agreementSigned === true &&
      Number(dd.agreementSignedGen ?? 0) > 0 &&
      Number(dd.agreementSignedGen ?? 0) === gen
    );
  }

  private isAgreementDeclinedForGen(dd: Record<string, unknown>, gen: number): boolean {
    return (
      dd.agreementDeclined === true &&
      Number(dd.agreementDeclinedGen ?? 0) > 0 &&
      Number(dd.agreementDeclinedGen ?? 0) === gen
    );
  }

  private async buildAgreementViewPayload(
    journey: RentRequestJourneyDocument | Record<string, unknown>,
    alreadyProcessed: boolean,
  ) {
    const branding = await this.brandingService.getRaw(
      String((journey as RentRequestJourneyDocument).workspaceId),
    );
    return {
      ...this.buildAgreementPayload(journey, alreadyProcessed),
      companyName: String(branding?.companyName ?? '').trim(),
    };
  }

  private buildAgreementPayload(
    journey: RentRequestJourneyDocument | Record<string, unknown>,
    alreadyProcessed: boolean,
  ) {
    const doc = journey as RentRequestJourneyDocument;
    const dd = doc.dynamicData ?? {};
    const items = Array.isArray(dd.rentalItems) ? dd.rentalItems : [];

    const out: Record<string, unknown> = {
      requestId: doc.requestId,
      customerName: doc.customerName,
      currency: doc.currency,
      alreadyProcessed,
      rentalItems: items,
      rentalAmount: String(dd.rentalAmount ?? dd.rentalTotal ?? ''),
      securityDeposit: String(dd.securityDeposit ?? ''),
      rentalStartDate: String(dd.rentalStartDate ?? ''),
      rentalEndDate: String(dd.rentalEndDate ?? dd.returnDueDate ?? ''),
      returnDueDate: String(dd.returnDueDate ?? dd.rentalEndDate ?? ''),
      fulfillmentMode: String(dd.fulfillmentMode ?? ''),
      confirmedAddress: String(dd.confirmedAddress ?? dd.customerAddress ?? ''),
      quoteReviseType: String(dd.quoteReviseType ?? ''),
      quoteDiscounts:
        dd.quoteDiscounts != null && dd.quoteDiscounts !== ''
          ? typeof dd.quoteDiscounts === 'string'
            ? dd.quoteDiscounts
            : JSON.stringify(dd.quoteDiscounts)
          : '',
    };

    if (dd.agreementSigned === true) {
      out.agreementSignerName = String(dd.agreementSignerName ?? doc.customerName ?? '');
      out.agreementSignedDateDisplay = String(dd.agreementSignedDateDisplay ?? '');
      out.agreementSignedAt = String(dd.agreementSignedAt ?? '');
      out.agreementSignatureImage = String(dd.agreementSignatureImage ?? '');
    }

    return out;
  }

  private async validateRequestAckToken(token: string, decision: 'confirm' | 'decline') {
    const payload = this.tokenService.verify(token);
    if (!payload) throw new BadRequestException('Invalid or expired link');
    if (payload.step !== 'rent-request') {
      throw new BadRequestException('This link is not valid for this action');
    }

    const expected =
      decision === 'confirm'
        ? RentJourneyActionType.REQUEST_CONFIRMED
        : RentJourneyActionType.REQUEST_DECLINED;

    if (payload.action !== expected) {
      throw new BadRequestException('Invalid action for this link');
    }

    const journey = await this.journeyModel.findById(payload.jid);
    if (!journey) throw new NotFoundException('Request not found');
    const jGen = Number(journey.dynamicData?.requestAckGeneration ?? 0);
    const tGen = payload.requestAckGen ?? jGen;
    return { payload, journey, jGen, tGen };
  }

  private alreadyConfirmed(dd: Record<string, unknown>, gen: number): boolean {
    const confirmedGen = Number(dd.requestAckConfirmedGen ?? 0);
    return dd.requestAckByCustomer === true && confirmedGen > 0 && confirmedGen === gen;
  }

  private isDeclinedForGen(dd: Record<string, unknown>, gen: number): boolean {
    const declinedGen = Number(dd.requestAckDeclinedGen ?? 0);
    return dd.requestAckDeclined === true && declinedGen > 0 && declinedGen === gen;
  }

  private async buildConfirmPayload(
    journey: RentRequestJourneyDocument | Record<string, unknown>,
    alreadyProcessed: boolean,
  ) {
    const doc = journey as RentRequestJourneyDocument;
    const dd = doc.dynamicData ?? {};
    const items = Array.isArray(dd.customerRentalItems)
      ? dd.customerRentalItems
      : Array.isArray(dd.rentalItems)
        ? dd.rentalItems
        : [];

    const branding = await this.brandingService.getRaw(String(doc.workspaceId));
    const pickupLocations = resolveBusinessLocations(
      doc.currency,
      branding?.businessLocationsByCurrency,
    );

    return {
      requestId: doc.requestId,
      customerName: doc.customerName,
      currency: doc.currency,
      alreadyProcessed,
      rentalItems: items,
      customerMessage: dd.customerMessage ?? dd.itemsNotes ?? '',
      customerAddress: String(dd.customerAddress ?? ''),
      fulfillmentMode: (dd.fulfillmentMode as string) ?? null,
      rentalStartDate: String(dd.rentalStartDate ?? ''),
      rentalEndDate: String(dd.rentalEndDate ?? ''),
      addressMode: (dd.addressMode as 'saved' | 'different' | 'pickup') ?? 'saved',
      confirmedAddress: String(dd.confirmedAddress ?? dd.customerAddress ?? ''),
      pickupLocations,
      selectedPickupLocationId: String(dd.pickupLocationId ?? ''),
    };
  }

  private buildDeclinePayload(
    journey: RentRequestJourneyDocument | Record<string, unknown>,
    alreadyProcessed: boolean,
  ) {
    const dd = (journey as RentRequestJourneyDocument).dynamicData ?? {};
    return {
      requestId: (journey as RentRequestJourneyDocument).requestId,
      customerName: (journey as RentRequestJourneyDocument).customerName,
      currency: (journey as RentRequestJourneyDocument).currency,
      alreadyProcessed,
      rentalItems: Array.isArray(dd.rentalItems) ? dd.rentalItems : [],
    };
  }

  private async recordAction(
    journey: Pick<RentRequestJourneyDocument, 'workspaceId' | 'requestId'> & { _id: Types.ObjectId | unknown },
    action: RentJourneyActionType,
    stepKey: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.actionModel.create({
      workspaceId: journey.workspaceId as Types.ObjectId,
      journeyId: new Types.ObjectId(String(journey._id)),
      requestId: journey.requestId,
      action,
      stepKey,
      metadata,
      occurredAt: new Date(),
    });
  }
}
