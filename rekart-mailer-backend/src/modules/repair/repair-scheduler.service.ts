import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RepairRequestJourneyDocument,
  RepairJourneyStatus,
  RepairRequestJourney,
} from './schemas/repair-request-journey.schema';
import {
  RepairJourneyAction,
  RepairJourneyActionDocument,
  JourneyActionType,
} from './schemas/repair-journey-action.schema';
import { RepairJourneysService } from './repair-journeys.service';

// ── Reminder sequence ─────────────────────────────────────────────────────────
//
//  Booking confirmed: reminder at 24 h, auto-close 24 h after reminder if still no action
//  Quote-ready: reminder at 72 h, final at 168 h (1 week), auto-close 24 h after final
//  Other steps: Reminder 1/2/3 at 24 h / 72 h / 144 h, auto-close at 168 h
//
// Each journey tracks how many reminders have been sent per step in dynamicData:
//   rrReminderCount  — booking-confirmed (0–1 only)
//   puReminderCount  — pickup-scheduled (0–3)
//   orReminderCount  — quote-ready (0–3, resets when offer gen changes)
//   orReminderGen    — which offer generation the count applies to
// ─────────────────────────────────────────────────────────────────────────────

const BOOKING_CONFIRMED_REMINDER_H = 24;
const BOOKING_CONFIRMED_MAX_REMINDERS = 1;
const NO_ACTION_CLOSE_AFTER_REMINDER_H = 24;

const REMINDER_THRESHOLDS_H = [24, 72, 144] as const; // hours per reminder (1-indexed)
const AUTO_CLOSE_THRESHOLD_H = 168;                    // 7 days — journey closed

const QUOTE_REMINDER_THRESHOLDS_H = [72, 168] as const;
const QUOTE_MAX_REMINDERS = 2;
const QUOTE_AUTO_CLOSE_AFTER_FINAL_REMINDER_H = 24;

type ReminderN = 1 | 2 | 3;

@Injectable()
export class RepairSchedulerService {
  private readonly logger = new Logger(RepairSchedulerService.name);

  constructor(
    @InjectModel(RepairRequestJourney.name)
    private readonly journeyModel: Model<RepairRequestJourneyDocument>,
    @InjectModel(RepairJourneyAction.name)
    private readonly actionModel: Model<RepairJourneyActionDocument>,
    private readonly journeysService: RepairJourneysService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private hoursAgo(h: number): Date {
    return new Date(Date.now() - h * 3_600_000);
  }

  /** Returns the original sentAt for the given step from sentSteps array. */
  private stepSentAt(
    journey: RepairRequestJourneyDocument,
    stepKey: string,
  ): Date | null {
    const sentSteps = (journey.sentSteps ?? []) as Array<{ stepKey: string; sentAt: Date }>;
    const found = [...sentSteps].reverse().find((s) => s.stepKey === stepKey);
    if (!found) return null;
    return found.sentAt instanceof Date ? found.sentAt : new Date(found.sentAt);
  }

  /** Which reminder (1, 2, 3) is due given hours elapsed since original email? */
  private whichReminderDue(
    sentAt: Date,
    reminderCount: number,
  ): ReminderN | null {
    if (reminderCount >= REMINDER_THRESHOLDS_H.length) return null;
    const threshold = REMINDER_THRESHOLDS_H[reminderCount];
    const elapsed   = (Date.now() - sentAt.getTime()) / 3_600_000;
    return elapsed >= threshold ? ((reminderCount + 1) as ReminderN) : null;
  }

  /** Whether the journey has crossed the auto-close threshold. */
  private isAutoCloseDue(sentAt: Date): boolean {
    return Date.now() - sentAt.getTime() >= AUTO_CLOSE_THRESHOLD_H * 3_600_000;
  }

  private whichQuoteReminderDue(
    sentAt: Date,
    reminderCount: number,
  ): 1 | 2 | null {
    if (reminderCount >= QUOTE_MAX_REMINDERS) return null;
    const threshold = QUOTE_REMINDER_THRESHOLDS_H[reminderCount];
    const elapsed = (Date.now() - sentAt.getTime()) / 3_600_000;
    return elapsed >= threshold ? ((reminderCount + 1) as 1 | 2) : null;
  }

  private isQuoteAutoCloseDue(sentAt: Date, reminderCount: number): boolean {
    if (reminderCount < QUOTE_MAX_REMINDERS) return false;
    const finalReminderAt =
      sentAt.getTime() + QUOTE_REMINDER_THRESHOLDS_H[QUOTE_MAX_REMINDERS - 1] * 3_600_000;
    return (
      Date.now() - finalReminderAt >=
      QUOTE_AUTO_CLOSE_AFTER_FINAL_REMINDER_H * 3_600_000
    );
  }

  // ── Job 1: Booking-confirmed — single reminder at 24 h ───────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async requestReceivedReminder(): Promise<void> {
    await this.sendBookingConfirmedReminders();
    await this.autoCloseBookingConfirmedNoAction();
  }

  private async sendBookingConfirmedReminders(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status:       RepairJourneyStatus.ACTIVE,
        currentStep:  'booking-confirmed',
        completedSteps: 'booking-confirmed',
        'dynamicData.bookingAckByCustomer': { $ne: true },
        $or: [
          { 'dynamicData.rrReminderCount': { $lt: BOOKING_CONFIRMED_MAX_REMINDERS } },
          { 'dynamicData.rrReminderCount': { $exists: false } },
        ],
      })
      .lean();

    for (const d of journeys) {
      const journey = d as unknown as RepairRequestJourneyDocument;
      const dd      = (d as unknown as Record<string, unknown>)['dynamicData'] as Record<string, unknown> ?? {};
      const sentAt  = this.stepSentAt(journey, 'booking-confirmed');
      if (!sentAt) continue;

      const reminderCount = Number(dd['rrReminderCount'] ?? 0);
      if (reminderCount >= BOOKING_CONFIRMED_MAX_REMINDERS) continue;

      const elapsed = (Date.now() - sentAt.getTime()) / 3_600_000;
      if (elapsed < BOOKING_CONFIRMED_REMINDER_H) continue;

      // Surface on dashboard "Reminder Due" tab until the reminder email goes out
      if (dd['reminderDue'] !== true) {
        await this.journeyModel.updateOne(
          { _id: journey._id },
          { $set: { 'dynamicData.reminderDue': true } },
        );
      }

      const which = 1 as const;
      const guard = await this.journeyModel.updateOne(
        { _id: journey._id, 'dynamicData.rrReminderCount': dd['rrReminderCount'] ?? { $exists: false } },
        { $set: { 'dynamicData.rrReminderCount': which, 'dynamicData.reminderDue': false, 'dynamicData.rrReminderSentAt': new Date() } },
      );
      if (guard.modifiedCount === 0) continue;

      try {
        await this.journeysService.sendReminderEmail(journey, 'booking-confirmed', which);
        this.logger.log(`[Scheduler] BC Reminder 1/1 → ${journey.requestId as string}`);
      } catch (err) {
        await this.journeyModel.updateOne(
          { _id: journey._id },
          {
            $set: {
              'dynamicData.rrReminderCount': reminderCount,
              'dynamicData.reminderDue': true,
            },
          },
        );
        this.logger.error(`[Scheduler] BC reminder failed: ${(err as Error).message}`);
      }
    }
  }

  /** 24 h after the reminder email — close if customer still took no action. */
  private async autoCloseBookingConfirmedNoAction(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status: RepairJourneyStatus.ACTIVE,
        currentStep: 'booking-confirmed',
        'dynamicData.bookingAckByCustomer': { $ne: true },
        'dynamicData.rrReminderCount': { $gte: BOOKING_CONFIRMED_MAX_REMINDERS },
        'dynamicData.rrReminderSentAt': { $exists: true },
        'dynamicData.rrAutoClosedAt': { $exists: false },
      })
      .lean();

    for (const d of journeys) {
      const journey = d as unknown as RepairRequestJourneyDocument;
      const dd =
        ((d as unknown as Record<string, unknown>)['dynamicData'] as Record<string, unknown>) ??
        {};
      const sentAtRaw = dd['rrReminderSentAt'];
      if (!sentAtRaw) continue;
      const reminderSentAt =
        sentAtRaw instanceof Date ? sentAtRaw : new Date(String(sentAtRaw));
      if (Number.isNaN(reminderSentAt.getTime())) continue;

      const elapsed = (Date.now() - reminderSentAt.getTime()) / 3_600_000;
      if (elapsed < NO_ACTION_CLOSE_AFTER_REMINDER_H) continue;

      await this.autoCloseNoCustomerAction(
        journey,
        'booking-confirmed',
        'rrAutoClosedAt',
        RepairJourneyStatus.NO_CUSTOMER_ACTION,
      );
    }
  }

  // ── Job 2: Pickup-scheduled reminders (3×) + auto-close ──────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async pickupScheduledReminder(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status:       RepairJourneyStatus.ACTIVE,
        currentStep:  'pickup-scheduled',
        completedSteps: 'pickup-scheduled',
        $or: [
          { 'dynamicData.puReminderCount': { $lt: 3 } },
          { 'dynamicData.puReminderCount': { $exists: false } },
          { 'dynamicData.puAutoClosedAt':  { $exists: false } },
        ],
      })
      .lean();

    for (const d of journeys) {
      const journey = d as unknown as RepairRequestJourneyDocument;
      const dd      = (d as unknown as Record<string, unknown>)['dynamicData'] as Record<string, unknown> ?? {};
      const sentAt  = this.stepSentAt(journey, 'pickup-scheduled');
      if (!sentAt) continue;

      const reminderCount = Number(dd['puReminderCount'] ?? 0);

      if (reminderCount >= 3 && this.isAutoCloseDue(sentAt) && !dd['puAutoClosedAt']) {
        await this.autoClose(journey, 'pickup-scheduled', 'puAutoClosedAt', RepairJourneyStatus.CANCELLED);
        continue;
      }

      const which = this.whichReminderDue(sentAt, reminderCount);
      if (!which) continue;

      const guard = await this.journeyModel.updateOne(
        { _id: journey._id, 'dynamicData.puReminderCount': dd['puReminderCount'] ?? { $exists: false } },
        { $set: { 'dynamicData.puReminderCount': which } },
      );
      if (guard.modifiedCount === 0) continue;

      try {
        await this.journeysService.sendReminderEmail(journey, 'pickup-scheduled', which);
        this.logger.log(`[Scheduler] PU Reminder ${which}/3 → ${journey.requestId as string}`);
      } catch (err) {
        await this.journeyModel.updateOne(
          { _id: journey._id },
          { $set: { 'dynamicData.puReminderCount': reminderCount } },
        );
        this.logger.error(`[Scheduler] PU reminder failed: ${(err as Error).message}`);
      }
    }
  }

  // ── Job 3: Quote-ready reminders (72 h + 1 week) + auto-close ────────────

  @Cron(CronExpression.EVERY_HOUR)
  async offerReadyReminder(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status:       RepairJourneyStatus.ACTIVE,
        currentStep:  'quote-ready',
        completedSteps: 'quote-ready',
        'dynamicData.quoteAcceptedByCustomer': { $ne: true },
        $or: [
          { 'dynamicData.orReminderCount': { $lt: QUOTE_MAX_REMINDERS } },
          { 'dynamicData.orReminderCount': { $exists: false } },
          { 'dynamicData.orAutoClosedAt':  { $exists: false } },
        ],
      })
      .lean();

    for (const d of journeys) {
      const journey    = d as unknown as RepairRequestJourneyDocument;
      const dd         = (d as unknown as Record<string, unknown>)['dynamicData'] as Record<string, unknown> ?? {};
      const currentGen = Number((d as unknown as Record<string, unknown>)['quoteGeneration'] ?? 1);
      const sentAt     = this.stepSentAt(journey, 'quote-ready');
      if (!sentAt) continue;

      const savedGen = Number(dd['orReminderGen'] ?? 0);
      const reminderCount = savedGen === currentGen ? Number(dd['orReminderCount'] ?? 0) : 0;

      if (
        reminderCount >= QUOTE_MAX_REMINDERS &&
        this.isQuoteAutoCloseDue(sentAt, reminderCount) &&
        !dd['orAutoClosedAt']
      ) {
        await this.autoClose(journey, 'quote-ready', 'orAutoClosedAt', RepairJourneyStatus.QUOTE_DECLINED);
        continue;
      }

      const which = this.whichQuoteReminderDue(sentAt, reminderCount);
      if (!which) continue;

      const guard = await this.journeyModel.updateOne(
        {
          _id: journey._id,
          quoteGeneration: currentGen,
          'dynamicData.orReminderCount': dd['orReminderCount'] ?? { $exists: false },
        },
        {
          $set: {
            'dynamicData.orReminderCount': which,
            'dynamicData.orReminderGen':   currentGen,
          },
        },
      );
      if (guard.modifiedCount === 0) continue;

      try {
        await this.journeysService.sendReminderEmail(journey, 'quote-ready', which);
        this.logger.log(`[Scheduler] OR Reminder ${which}/${QUOTE_MAX_REMINDERS} → ${journey.requestId as string} (gen ${currentGen})`);
      } catch (err) {
        await this.journeyModel.updateOne(
          { _id: journey._id },
          { $set: { 'dynamicData.orReminderCount': reminderCount } },
        );
        this.logger.error(`[Scheduler] OR reminder failed: ${(err as Error).message}`);
      }
    }
  }

  // ── Job 4: Device-ready reminders (3×) ───────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async deviceReadyReminder(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status: RepairJourneyStatus.ACTIVE,
        currentStep: 'device-ready',
        completedSteps: 'device-ready',
        $or: [
          { 'dynamicData.drReminderCount': { $lt: 3 } },
          { 'dynamicData.drReminderCount': { $exists: false } },
        ],
      })
      .lean();

    for (const d of journeys) {
      const journey = d as unknown as RepairRequestJourneyDocument;
      const dd =
        ((d as unknown as Record<string, unknown>)['dynamicData'] as Record<string, unknown>) ??
        {};
      const sentAt = this.stepSentAt(journey, 'device-ready');
      if (!sentAt) continue;

      const reminderCount = Number(dd['drReminderCount'] ?? 0);
      const which = this.whichReminderDue(sentAt, reminderCount);
      if (!which) continue;

      const guard = await this.journeyModel.updateOne(
        {
          _id: journey._id,
          'dynamicData.drReminderCount': dd['drReminderCount'] ?? { $exists: false },
        },
        { $set: { 'dynamicData.drReminderCount': which } },
      );
      if (guard.modifiedCount === 0) continue;

      try {
        await this.journeysService.sendReminderEmail(journey, 'device-ready', which);
        this.logger.log(
          `[Scheduler] DR Reminder ${which}/3 → ${journey.requestId as string}`,
        );
      } catch (err) {
        await this.journeyModel.updateOne(
          { _id: journey._id },
          { $set: { 'dynamicData.drReminderCount': reminderCount } },
        );
        this.logger.error(`[Scheduler] DR reminder failed: ${(err as Error).message}`);
      }
    }
  }

  // ── Job 5: Quote expiry (manual quoteExpiresAt field) ────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async offerExpiryCheck(): Promise<void> {
    const now = new Date();

    const expiredJourneys = await this.journeyModel
      .find({
        status:         RepairJourneyStatus.ACTIVE,
        quoteExpiresAt: { $lt: now, $ne: null },
        completedSteps: 'quote-ready',
      })
      .select('_id requestId workspaceId quoteGeneration')
      .lean();

    if (expiredJourneys.length === 0) return;
    this.logger.log(`[Scheduler] Expiring ${expiredJourneys.length} offers`);

    for (const journey of expiredJourneys) {
      try {
        await this.journeyModel.updateOne(
          { _id: journey._id, status: RepairJourneyStatus.ACTIVE },
          {
            $set: {
              status:                                RepairJourneyStatus.QUOTE_DECLINED,
              currentStep:                           'quote-ready',
              'dynamicData.quoteExpired': true,
              'dynamicData.quoteExpiredAt': now,
              'dynamicData.quoteAcceptedByCustomer': false,
            },
          },
        );

        await this.actionModel.create({
          workspaceId: journey.workspaceId,
          requestId:   journey.requestId,
          journeyId:   journey._id,
          step:        'quote-ready',
          actionType:  JourneyActionType.QUOTE_DECLINED,
          payload:     { reason: 'expired', quoteGeneration: journey.quoteGeneration ?? 0 },
          ip:          '',
          userAgent:   'scheduler',
        });

        this.logger.log(`[Scheduler] Offer expired → ${journey.requestId as string}`);
      } catch (err) {
        this.logger.error(`[Scheduler] Expiry failed: ${(err as Error).message}`);
      }
    }
  }

  // ── Auto-close helper ─────────────────────────────────────────────────────

  private async autoCloseNoCustomerAction(
    journey: RepairRequestJourneyDocument,
    step: string,
    closedAtKey: string,
    newStatus: RepairJourneyStatus,
  ): Promise<void> {
    const guard = await this.journeyModel.updateOne(
      {
        _id: journey._id,
        status: RepairJourneyStatus.ACTIVE,
        [`dynamicData.${closedAtKey}`]: { $exists: false },
      },
      {
        $set: {
          status: newStatus,
          [`dynamicData.${closedAtKey}`]: new Date(),
          'dynamicData.autoClosedReason':
            'Customer took no action within 24 hours after the reminder email',
          'dynamicData.closedByScheduler': true,
          'dynamicData.reminderDue': false,
        },
      },
    );

    if (guard.modifiedCount === 0) return;

    await this.actionModel.create({
      workspaceId: journey.workspaceId,
      requestId: journey.requestId,
      journeyId: journey._id,
      step,
      actionType: JourneyActionType.JOURNEY_AUTO_CLOSED,
      payload: {
        reason: 'no_customer_action_after_reminder',
        hoursAfterReminder: NO_ACTION_CLOSE_AFTER_REMINDER_H,
      },
      ip: '',
      userAgent: 'scheduler',
    });

    this.logger.warn(
      `[Scheduler] Auto-closed (no customer action) → ${journey.requestId as string} (${step}, status → ${newStatus})`,
    );
  }

  private async autoClose(
    journey: RepairRequestJourneyDocument,
    step: string,
    closedAtKey: string,
    newStatus: RepairJourneyStatus,
  ): Promise<void> {
    const guard = await this.journeyModel.updateOne(
      { _id: journey._id, status: RepairJourneyStatus.ACTIVE, [`dynamicData.${closedAtKey}`]: { $exists: false } },
      {
        $set: {
          status:                           newStatus,
          [`dynamicData.${closedAtKey}`]:   new Date(),
          'dynamicData.autoClosedReason':   `No response after ${AUTO_CLOSE_THRESHOLD_H / 24} days`,
        },
      },
    );

    if (guard.modifiedCount === 0) return;

    await this.actionModel.create({
      workspaceId: journey.workspaceId,
      requestId:   journey.requestId,
      journeyId:   journey._id,
      step,
      actionType:  JourneyActionType.QUOTE_DECLINED,
      payload:     { reason: 'auto_closed_no_response', thresholdDays: AUTO_CLOSE_THRESHOLD_H / 24 },
      ip:          '',
      userAgent:   'scheduler',
    });

    this.logger.warn(
      `[Scheduler] Auto-closed → ${journey.requestId as string} (${step}, status → ${newStatus})`,
    );
  }
}
