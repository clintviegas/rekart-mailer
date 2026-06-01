import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SellRequestJourneyDocument,
  JourneyStatus,
  SellRequestJourney,
} from './schemas/sell-request-journey.schema';
import {
  SellJourneyAction,
  SellJourneyActionDocument,
  JourneyActionType,
} from './schemas/sell-journey-action.schema';
import { SellJourneysService } from './sell-journeys.service';

// ── Reminder sequence ─────────────────────────────────────────────────────────
//
//  Request received: reminder at 24 h, auto-close 24 h after reminder if no action
//  Other steps: Reminder 1/2/3 at 24 h / 72 h / 144 h, auto-close at 168 h
//
// Each journey tracks how many reminders have been sent per step in dynamicData:
//   rrReminderCount  — request-received (0–1 only)
//   puReminderCount  — pickup-scheduled (0–3)
//   orReminderCount  — offer-ready (0–3, resets when offer gen changes)
//   orReminderGen    — which offer generation the count applies to
// ─────────────────────────────────────────────────────────────────────────────

const REQUEST_RECEIVED_REMINDER_H = 24;
const REQUEST_RECEIVED_MAX_REMINDERS = 1;
const NO_ACTION_CLOSE_AFTER_REMINDER_H = 24;

const REMINDER_THRESHOLDS_H = [24, 72, 144] as const; // hours per reminder (1-indexed)
const AUTO_CLOSE_THRESHOLD_H = 168;                    // 7 days — journey closed

type ReminderN = 1 | 2 | 3;

@Injectable()
export class SellSchedulerService {
  private readonly logger = new Logger(SellSchedulerService.name);

  constructor(
    @InjectModel(SellRequestJourney.name)
    private readonly journeyModel: Model<SellRequestJourneyDocument>,
    @InjectModel(SellJourneyAction.name)
    private readonly actionModel: Model<SellJourneyActionDocument>,
    private readonly journeysService: SellJourneysService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private hoursAgo(h: number): Date {
    return new Date(Date.now() - h * 3_600_000);
  }

  /** Returns the original sentAt for the given step from sentSteps array. */
  private stepSentAt(
    journey: SellRequestJourneyDocument,
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

  // ── Job 1: Request-received reminders (3×) + auto-close ──────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async requestReceivedReminder(): Promise<void> {
    await this.sendRequestReceivedReminders();
    await this.autoCloseRequestReceivedNoAction();
  }

  private async sendRequestReceivedReminders(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status:       JourneyStatus.ACTIVE,
        currentStep:  'request-received',
        completedSteps: 'request-received',
        'dynamicData.requestAckByCustomer': { $ne: true },
        $or: [
          { 'dynamicData.rrReminderCount': { $lt: REQUEST_RECEIVED_MAX_REMINDERS } },
          { 'dynamicData.rrReminderCount': { $exists: false } },
        ],
      })
      .lean();

    for (const d of journeys) {
      const journey = d as unknown as SellRequestJourneyDocument;
      const dd      = (d as unknown as Record<string, unknown>)['dynamicData'] as Record<string, unknown> ?? {};
      const sentAt  = this.stepSentAt(journey, 'request-received');
      if (!sentAt) continue;

      const reminderCount = Number(dd['rrReminderCount'] ?? 0);
      if (reminderCount >= REQUEST_RECEIVED_MAX_REMINDERS) continue;

      const elapsed = (Date.now() - sentAt.getTime()) / 3_600_000;
      if (elapsed < REQUEST_RECEIVED_REMINDER_H) continue;

      if (dd['reminderDue'] !== true) {
        await this.journeyModel.updateOne(
          { _id: journey._id },
          { $set: { 'dynamicData.reminderDue': true } },
        );
      }

      const which = 1 as const;
      const guard = await this.journeyModel.updateOne(
        { _id: journey._id, 'dynamicData.rrReminderCount': dd['rrReminderCount'] ?? { $exists: false } },
        {
          $set: {
            'dynamicData.rrReminderCount': which,
            'dynamicData.reminderDue': false,
            'dynamicData.rrReminderSentAt': new Date(),
          },
        },
      );
      if (guard.modifiedCount === 0) continue;

      try {
        await this.journeysService.sendReminderEmail(journey, 'request-received', which);
        this.logger.log(`[Scheduler] RR Reminder 1/1 → ${journey.requestId as string}`);
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
        this.logger.error(`[Scheduler] RR reminder failed: ${(err as Error).message}`);
      }
    }
  }

  private async autoCloseRequestReceivedNoAction(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status: JourneyStatus.ACTIVE,
        currentStep: 'request-received',
        'dynamicData.requestAckByCustomer': { $ne: true },
        'dynamicData.rrReminderCount': { $gte: REQUEST_RECEIVED_MAX_REMINDERS },
        'dynamicData.rrReminderSentAt': { $exists: true },
        'dynamicData.rrAutoClosedAt': { $exists: false },
      })
      .lean();

    for (const d of journeys) {
      const journey = d as unknown as SellRequestJourneyDocument;
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
        'request-received',
        'rrAutoClosedAt',
        JourneyStatus.NO_CUSTOMER_ACTION,
      );
    }
  }

  // ── Job 2: Pickup-scheduled reminders (3×) + auto-close ──────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async pickupScheduledReminder(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status:       JourneyStatus.ACTIVE,
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
      const journey = d as unknown as SellRequestJourneyDocument;
      const dd      = (d as unknown as Record<string, unknown>)['dynamicData'] as Record<string, unknown> ?? {};
      const sentAt  = this.stepSentAt(journey, 'pickup-scheduled');
      if (!sentAt) continue;

      const reminderCount = Number(dd['puReminderCount'] ?? 0);

      if (reminderCount >= 3 && this.isAutoCloseDue(sentAt) && !dd['puAutoClosedAt']) {
        await this.autoClose(journey, 'pickup-scheduled', 'puAutoClosedAt', JourneyStatus.CANCELLED);
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

  // ── Job 3: Offer-ready reminders (3×) + auto-close ───────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async offerReadyReminder(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status:       JourneyStatus.ACTIVE,
        currentStep:  'offer-ready',
        completedSteps: 'offer-ready',
        'dynamicData.offerAcceptedByCustomer': { $ne: true },
        $or: [
          { 'dynamicData.orReminderCount': { $lt: 3 } },
          { 'dynamicData.orReminderCount': { $exists: false } },
          { 'dynamicData.orAutoClosedAt':  { $exists: false } },
        ],
      })
      .lean();

    for (const d of journeys) {
      const journey    = d as unknown as SellRequestJourneyDocument;
      const dd         = (d as unknown as Record<string, unknown>)['dynamicData'] as Record<string, unknown> ?? {};
      const currentGen = Number((d as unknown as Record<string, unknown>)['offerGeneration'] ?? 1);
      const sentAt     = this.stepSentAt(journey, 'offer-ready');
      if (!sentAt) continue;

      // Reset reminder count when a new offer generation is sent
      const savedGen = Number(dd['orReminderGen'] ?? 0);
      const reminderCount = savedGen === currentGen ? Number(dd['orReminderCount'] ?? 0) : 0;

      if (reminderCount >= 3 && this.isAutoCloseDue(sentAt) && !dd['orAutoClosedAt']) {
        await this.autoClose(journey, 'offer-ready', 'orAutoClosedAt', JourneyStatus.OFFER_DECLINED);
        continue;
      }

      const which = this.whichReminderDue(sentAt, reminderCount);
      if (!which) continue;

      const guard = await this.journeyModel.updateOne(
        {
          _id: journey._id,
          offerGeneration: currentGen,
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
        await this.journeysService.sendReminderEmail(journey, 'offer-ready', which);
        this.logger.log(`[Scheduler] OR Reminder ${which}/3 → ${journey.requestId as string} (gen ${currentGen})`);
      } catch (err) {
        await this.journeyModel.updateOne(
          { _id: journey._id },
          { $set: { 'dynamicData.orReminderCount': reminderCount } },
        );
        this.logger.error(`[Scheduler] OR reminder failed: ${(err as Error).message}`);
      }
    }
  }

  // ── Job 4: Offer expiry (manual offerExpiresAt field) ────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async offerExpiryCheck(): Promise<void> {
    const now = new Date();

    const expiredJourneys = await this.journeyModel
      .find({
        status:         JourneyStatus.ACTIVE,
        offerExpiresAt: { $lt: now, $ne: null },
        completedSteps: 'offer-ready',
      })
      .select('_id requestId workspaceId offerGeneration')
      .lean();

    if (expiredJourneys.length === 0) return;
    this.logger.log(`[Scheduler] Expiring ${expiredJourneys.length} offers`);

    for (const journey of expiredJourneys) {
      try {
        await this.journeyModel.updateOne(
          { _id: journey._id, status: JourneyStatus.ACTIVE },
          {
            $set: {
              status:                                JourneyStatus.OFFER_DECLINED,
              currentStep:                           'offer-ready',
              'dynamicData.offerExpired':            true,
              'dynamicData.offerExpiredAt':          now,
              'dynamicData.offerAcceptedByCustomer': false,
            },
          },
        );

        await this.actionModel.create({
          workspaceId: journey.workspaceId,
          requestId:   journey.requestId,
          journeyId:   journey._id,
          step:        'offer-ready',
          actionType:  JourneyActionType.OFFER_DECLINED,
          payload:     { reason: 'expired', offerGeneration: journey.offerGeneration ?? 0 },
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
    journey: SellRequestJourneyDocument,
    step: string,
    closedAtKey: string,
    newStatus: JourneyStatus,
  ): Promise<void> {
    const guard = await this.journeyModel.updateOne(
      {
        _id: journey._id,
        status: JourneyStatus.ACTIVE,
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
    journey: SellRequestJourneyDocument,
    step: string,
    closedAtKey: string,
    newStatus: JourneyStatus,
  ): Promise<void> {
    const guard = await this.journeyModel.updateOne(
      { _id: journey._id, status: JourneyStatus.ACTIVE, [`dynamicData.${closedAtKey}`]: { $exists: false } },
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
      actionType:  JourneyActionType.OFFER_DECLINED,
      payload:     { reason: 'auto_closed_no_response', thresholdDays: AUTO_CLOSE_THRESHOLD_H / 24 },
      ip:          '',
      userAgent:   'scheduler',
    });

    this.logger.warn(
      `[Scheduler] Auto-closed → ${journey.requestId as string} (${step}, status → ${newStatus})`,
    );
  }
}
