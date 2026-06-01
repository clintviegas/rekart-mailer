import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RecycleRequestJourney,
  RecycleRequestJourneyDocument,
  RecycleJourneyStatus,
} from './schemas/recycle-request-journey.schema';
import { RecycleJourneysService } from './recycle-journeys.service';

const REQUEST_REMINDER_H = 24;

@Injectable()
export class RecycleSchedulerService {
  private readonly logger = new Logger(RecycleSchedulerService.name);

  constructor(
    @InjectModel(RecycleRequestJourney.name)
    private readonly journeyModel: Model<RecycleRequestJourneyDocument>,
    private readonly journeysService: RecycleJourneysService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async recycleRequestReminder(): Promise<void> {
    const journeys = await this.journeyModel.find({
      status: RecycleJourneyStatus.ACTIVE,
      currentStep: 'recycle-request',
      completedSteps: 'recycle-request',
      'dynamicData.requestAckByCustomer': { $ne: true },
      $or: [
        { 'dynamicData.rrReminderCount': { $lt: 1 } },
        { 'dynamicData.rrReminderCount': { $exists: false } },
      ],
    });

    for (const journey of journeys) {
      const sent = [...(journey.sentSteps ?? [])]
        .reverse()
        .find((s) => s.stepKey === 'recycle-request');
      if (!sent?.sentAt) continue;

      const elapsedH =
        (Date.now() - new Date(sent.sentAt).getTime()) / 3_600_000;
      if (elapsedH < REQUEST_REMINDER_H) continue;

      const dd = journey.dynamicData ?? {};
      const reminderCount = Number(dd['rrReminderCount'] ?? 0);
      if (reminderCount >= 1) continue;

      const guard = await this.journeyModel.updateOne(
        {
          _id: journey._id,
          'dynamicData.rrReminderCount': dd['rrReminderCount'] ?? { $exists: false },
        },
        {
          $set: {
            'dynamicData.rrReminderCount': 1,
            'dynamicData.rrReminderSentAt': new Date(),
          },
        },
      );
      if (guard.modifiedCount === 0) continue;

      try {
        await this.journeysService.sendReminderEmail(journey, 'recycle-request', 1);
        this.logger.log(`[Scheduler] Recycle request reminder → ${journey.requestId}`);
      } catch (err) {
        await this.journeyModel.updateOne(
          { _id: journey._id },
          { $set: { 'dynamicData.rrReminderCount': reminderCount } },
        );
        this.logger.warn(
          `Recycle request reminder failed for ${journey.requestId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
