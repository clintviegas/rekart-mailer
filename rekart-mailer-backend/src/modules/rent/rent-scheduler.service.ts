import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { parseDateToIsoYmd } from '../../common/date-format';
import {
  RentRequestJourney,
  RentRequestJourneyDocument,
  RentJourneyStatus,
} from './schemas/rent-request-journey.schema';
import { RentJourneysService } from './rent-journeys.service';

/** Send return reminder this many hours before the return due date (start of day). */
const RETURN_REMINDER_HOURS_BEFORE = 24;

@Injectable()
export class RentSchedulerService {
  private readonly logger = new Logger(RentSchedulerService.name);

  constructor(
    @InjectModel(RentRequestJourney.name)
    private readonly journeyModel: Model<RentRequestJourneyDocument>,
    private readonly journeysService: RentJourneysService,
  ) {}

  private resolveReturnDueRaw(dynamicData?: Record<string, unknown>): string {
    const dd = dynamicData ?? {};
    return String(dd['returnDueDate'] ?? dd['rentalEndDate'] ?? '').trim();
  }

  /** True when we are within the auto-send window (default: 24h before due date). */
  private isReturnReminderDue(dueRaw: string): boolean {
    const iso = parseDateToIsoYmd(dueRaw);
    if (!iso) return false;

    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return false;

    const dueStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    const sendAt = dueStart - RETURN_REMINDER_HOURS_BEFORE * 3_600_000;
    return Date.now() >= sendAt;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoReturnReminder(): Promise<void> {
    const journeys = await this.journeyModel
      .find({
        status: RentJourneyStatus.ACTIVE,
        currentStep: 'rent-return-reminder',
        completedSteps: {
          $all: ['rent-handover'],
          $nin: ['rent-return-reminder'],
        },
      })
      .lean();

    for (const doc of journeys) {
      const journey = doc as unknown as RentRequestJourneyDocument;
      const dd =
        ((doc as unknown as Record<string, unknown>)['dynamicData'] as Record<string, unknown>) ??
        {};

      if ((journey.sentSteps ?? []).some((s) => s.stepKey === 'rent-return-reminder')) {
        continue;
      }

      const dueRaw = this.resolveReturnDueRaw(dd);
      if (!dueRaw || !this.isReturnReminderDue(dueRaw)) continue;

      const guard = await this.journeyModel.updateOne(
        {
          _id: journey._id,
          completedSteps: { $nin: ['rent-return-reminder'] },
          'dynamicData.returnReminderAutoClaimed': { $exists: false },
        },
        { $set: { 'dynamicData.returnReminderAutoClaimed': new Date() } },
      );
      if (guard.modifiedCount === 0) continue;

      try {
        await this.journeysService.sendReturnReminderAuto(journey);
        this.logger.log(
          `[Scheduler] Return reminder auto-sent → ${journey.requestId as string}`,
        );
      } catch (err) {
        await this.journeyModel.updateOne(
          { _id: journey._id },
          { $unset: { 'dynamicData.returnReminderAutoClaimed': '' } },
        );
        this.logger.error(
          `[Scheduler] Return reminder failed for ${journey.requestId as string}: ${(err as Error).message}`,
        );
      }
    }
  }
}
