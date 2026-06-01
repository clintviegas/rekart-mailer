import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RepairTemplate, RepairTemplateSchema } from './schemas/repair-template.schema';
import { RepairDeliveryLog, RepairDeliveryLogSchema } from './schemas/repair-delivery-log.schema';
import { RepairSuppression, RepairSuppressionSchema } from './schemas/repair-suppression.schema';
import { RepairRequestJourney, RepairRequestJourneySchema } from './schemas/repair-request-journey.schema';
import { RepairJourneyAction, RepairJourneyActionSchema } from './schemas/repair-journey-action.schema';
import {
  RepairStaffNotificationState,
  RepairStaffNotificationStateSchema,
} from './schemas/repair-staff-notification-state.schema';
import { Workspace, WorkspaceSchema } from '../workspace/schemas/workspace.schema';
import { WorkspaceBranding, WorkspaceBrandingSchema } from '../workspace/schemas/workspace-branding.schema';
import { WorkspaceBrandingService } from '../workspace/workspace-branding.service';
import { RepairRequestIdService } from './repair-request-id.service';
import { RepairTemplatesService } from './repair-templates.service';
import { RepairTestEmailService } from './repair-test-email.service';
import { RepairEmailQueueService } from './repair-email-queue.service';
import { RepairAnalyticsService } from './repair-analytics.service';
import { RepairSuppressionService } from './repair-suppression.service';
import { RepairJourneysService } from './repair-journeys.service';
import { RepairPublicActionService } from './repair-public-action.service';
import { RepairTemplatesController } from './repair-templates.controller';
import { RepairAnalyticsController } from './repair-analytics.controller';
import { RepairTrackingController } from './repair-tracking.controller';
import { RepairUnsubscribeController } from './repair-unsubscribe.controller';
import { RepairSuppressionController } from './repair-suppression.controller';
import { RepairAttachmentController } from './repair-attachment.controller';
import { RepairJourneysController } from './repair-journeys.controller';
import { RepairPublicActionController } from './repair-public-action.controller';
import { RepairRequestController } from './repair-request.controller';
import { TrackingTokenService } from './tracking-token.service';
import { UnsubscribeTokenService } from './unsubscribe-token.service';
import { RepairPublicActionTokenService } from './repair-public-action-token.service';
import { RepairSchedulerService } from './repair-scheduler.service';
import { RepairEmailWorker } from '../../queue/repair-email.worker';
import { EMAIL_PROVIDER_TOKEN } from '../../providers/email/email-provider.interface';
import { createEmailProvider } from '../../providers/email/email-provider.factory';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RepairTemplate.name, schema: RepairTemplateSchema },
      { name: RepairDeliveryLog.name, schema: RepairDeliveryLogSchema },
      { name: RepairSuppression.name, schema: RepairSuppressionSchema },
      { name: RepairRequestJourney.name, schema: RepairRequestJourneySchema },
      { name: RepairJourneyAction.name, schema: RepairJourneyActionSchema },
      {
        name: RepairStaffNotificationState.name,
        schema: RepairStaffNotificationStateSchema,
      },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: WorkspaceBranding.name, schema: WorkspaceBrandingSchema },
    ]),
  ],
  controllers: [
    RepairTemplatesController,
    RepairAnalyticsController,
    RepairTrackingController,
    RepairUnsubscribeController,
    RepairSuppressionController,
    RepairAttachmentController,
    RepairJourneysController,
    RepairPublicActionController,
    RepairRequestController,
  ],
  providers: [
    RepairTemplatesService,
    RepairTestEmailService,
    RepairEmailQueueService,
    RepairAnalyticsService,
    RepairSuppressionService,
    RepairJourneysService,
    TrackingTokenService,
    UnsubscribeTokenService,
    RepairPublicActionTokenService,
    RepairPublicActionService,
    RepairEmailWorker,
    WorkspaceBrandingService,
    RepairRequestIdService,
    RepairSchedulerService,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: () => createEmailProvider(),
    },
  ],
  exports: [
    RepairTemplatesService,
    RepairTestEmailService,
    RepairEmailQueueService,
    RepairSuppressionService,
    TrackingTokenService,
    UnsubscribeTokenService,
    RepairJourneysService,
  ],
})
export class RepairModule {}
