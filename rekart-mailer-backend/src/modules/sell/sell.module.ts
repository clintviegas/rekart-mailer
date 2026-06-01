import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SellTemplate, SellTemplateSchema } from './schemas/sell-template.schema';
import { SellDeliveryLog, SellDeliveryLogSchema } from './schemas/sell-delivery-log.schema';
import { SellSuppression, SellSuppressionSchema } from './schemas/sell-suppression.schema';
import { SellRequest, SellRequestSchema } from './schemas/sell-request.schema';
import { SellRequestJourney, SellRequestJourneySchema } from './schemas/sell-request-journey.schema';
import { SellJourneyAction, SellJourneyActionSchema } from './schemas/sell-journey-action.schema';
import {
  SellStaffNotificationState,
  SellStaffNotificationStateSchema,
} from './schemas/sell-staff-notification-state.schema';
import { Workspace, WorkspaceSchema } from '../workspace/schemas/workspace.schema';
import { WorkspaceBranding, WorkspaceBrandingSchema } from '../workspace/schemas/workspace-branding.schema';
import { WorkspaceBrandingService } from '../workspace/workspace-branding.service';
import { SellRequestIdService } from './sell-request-id.service';
import { SellRequestService } from './sell-request.service';
import { SellRequestController } from './sell-request.controller';
import { SellTemplatesService } from './sell-templates.service';
import { SellTestEmailService } from './sell-test-email.service';
import { SellEmailQueueService } from './sell-email-queue.service';
import { SellAnalyticsService } from './sell-analytics.service';
import { SellSuppressionService } from './sell-suppression.service';
import { SellJourneysService } from './sell-journeys.service';
import { SellPublicActionService } from './sell-public-action.service';
import { SellTemplatesController } from './sell-templates.controller';
import { SellAnalyticsController } from './sell-analytics.controller';
import { SellTrackingController } from './sell-tracking.controller';
import { SellUnsubscribeController } from './sell-unsubscribe.controller';
import { SellSuppressionController } from './sell-suppression.controller';
import { SellAttachmentController } from './sell-attachment.controller';
import { SellJourneysController } from './sell-journeys.controller';
import { SellPublicActionController } from './sell-public-action.controller';
import { TrackingTokenService } from './tracking-token.service';
import { UnsubscribeTokenService } from './unsubscribe-token.service';
import { SellPublicActionTokenService } from './sell-public-action-token.service';
import { SellSchedulerService } from './sell-scheduler.service';
import { SellEmailWorker } from '../../queue/sell-email.worker';
import {
  EMAIL_PROVIDER_TOKEN,
} from '../../providers/email/email-provider.interface';
import { createEmailProvider } from '../../providers/email/email-provider.factory';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SellTemplate.name, schema: SellTemplateSchema },
      { name: SellDeliveryLog.name, schema: SellDeliveryLogSchema },
      { name: SellSuppression.name, schema: SellSuppressionSchema },
      { name: SellRequest.name, schema: SellRequestSchema },
      { name: SellRequestJourney.name, schema: SellRequestJourneySchema },
      { name: SellJourneyAction.name, schema: SellJourneyActionSchema },
      {
        name: SellStaffNotificationState.name,
        schema: SellStaffNotificationStateSchema,
      },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: WorkspaceBranding.name, schema: WorkspaceBrandingSchema },
    ]),
  ],
  controllers: [
    SellTemplatesController,
    SellAnalyticsController,
    SellTrackingController,
    SellUnsubscribeController,
    SellSuppressionController,
    SellRequestController,
    SellAttachmentController,
    SellJourneysController,
    SellPublicActionController,
  ],
  providers: [
    SellTemplatesService,
    SellTestEmailService,
    SellEmailQueueService,
    SellAnalyticsService,
    SellSuppressionService,
    SellJourneysService,
    TrackingTokenService,
    UnsubscribeTokenService,
    SellPublicActionTokenService,
    SellPublicActionService,
    SellEmailWorker,
    WorkspaceBrandingService,
    SellRequestIdService,
    SellRequestService,
    SellSchedulerService,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: () => createEmailProvider(),
    },
  ],
  exports: [
    SellTemplatesService,
    SellTestEmailService,
    SellEmailQueueService,
    SellSuppressionService,
    TrackingTokenService,
    UnsubscribeTokenService,
    SellJourneysService,
  ],
})
export class SellModule {}
