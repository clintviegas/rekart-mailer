import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecycleTemplate, RecycleTemplateSchema } from './schemas/recycle-template.schema';
import { RecycleDeliveryLog, RecycleDeliveryLogSchema } from './schemas/recycle-delivery-log.schema';
import { RecycleSuppression, RecycleSuppressionSchema } from './schemas/recycle-suppression.schema';
import { RecycleRequestJourney, RecycleRequestJourneySchema } from './schemas/recycle-request-journey.schema';
import { RecycleJourneyAction, RecycleJourneyActionSchema } from './schemas/recycle-journey-action.schema';
import {
  RecycleStaffNotificationState,
  RecycleStaffNotificationStateSchema,
} from './schemas/recycle-staff-notification-state.schema';
import { Workspace, WorkspaceSchema } from '../workspace/schemas/workspace.schema';
import { WorkspaceBranding, WorkspaceBrandingSchema } from '../workspace/schemas/workspace-branding.schema';
import { WorkspaceBrandingService } from '../workspace/workspace-branding.service';
import { RecycleRequestIdService } from './recycle-request-id.service';
import { RecycleTemplatesService } from './recycle-templates.service';
import { RecycleTestEmailService } from './recycle-test-email.service';
import { RecycleEmailQueueService } from './recycle-email-queue.service';
import { RecycleAnalyticsService } from './recycle-analytics.service';
import { RecycleSuppressionService } from './recycle-suppression.service';
import { RecycleJourneysService } from './recycle-journeys.service';
import { RecyclePublicActionService } from './recycle-public-action.service';
import { RecycleTemplatesController } from './recycle-templates.controller';
import { RecycleAnalyticsController } from './recycle-analytics.controller';
import { RecycleTrackingController } from './recycle-tracking.controller';
import { RecycleUnsubscribeController } from './recycle-unsubscribe.controller';
import { RecycleSuppressionController } from './recycle-suppression.controller';
import { RecycleAttachmentController } from './recycle-attachment.controller';
import { RecycleJourneysController } from './recycle-journeys.controller';
import { RecyclePublicActionController } from './recycle-public-action.controller';
import { RecycleRequestController } from './recycle-request.controller';
import { TrackingTokenService } from './tracking-token.service';
import { UnsubscribeTokenService } from './unsubscribe-token.service';
import { RecyclePublicActionTokenService } from './recycle-public-action-token.service';
import { RecycleSchedulerService } from './recycle-scheduler.service';
import { RecycleEmailWorker } from '../../queue/recycle-email.worker';
import { EMAIL_PROVIDER_TOKEN } from '../../providers/email/email-provider.interface';
import { createEmailProvider } from '../../providers/email/email-provider.factory';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecycleTemplate.name, schema: RecycleTemplateSchema },
      { name: RecycleDeliveryLog.name, schema: RecycleDeliveryLogSchema },
      { name: RecycleSuppression.name, schema: RecycleSuppressionSchema },
      { name: RecycleRequestJourney.name, schema: RecycleRequestJourneySchema },
      { name: RecycleJourneyAction.name, schema: RecycleJourneyActionSchema },
      {
        name: RecycleStaffNotificationState.name,
        schema: RecycleStaffNotificationStateSchema,
      },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: WorkspaceBranding.name, schema: WorkspaceBrandingSchema },
    ]),
  ],
  controllers: [
    RecycleTemplatesController,
    RecycleAnalyticsController,
    RecycleTrackingController,
    RecycleUnsubscribeController,
    RecycleSuppressionController,
    RecycleAttachmentController,
    RecycleJourneysController,
    RecyclePublicActionController,
    RecycleRequestController,
  ],
  providers: [
    RecycleTemplatesService,
    RecycleTestEmailService,
    RecycleEmailQueueService,
    RecycleAnalyticsService,
    RecycleSuppressionService,
    RecycleJourneysService,
    TrackingTokenService,
    UnsubscribeTokenService,
    RecyclePublicActionTokenService,
    RecyclePublicActionService,
    RecycleEmailWorker,
    WorkspaceBrandingService,
    RecycleRequestIdService,
    RecycleSchedulerService,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: () => createEmailProvider(),
    },
  ],
  exports: [
    RecycleTemplatesService,
    RecycleTestEmailService,
    RecycleEmailQueueService,
    RecycleSuppressionService,
    TrackingTokenService,
    UnsubscribeTokenService,
    RecycleJourneysService,
  ],
})
export class RecycleModule {}
