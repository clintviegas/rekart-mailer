import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RentTemplate, RentTemplateSchema } from './schemas/rent-template.schema';
import { RentDeliveryLog, RentDeliveryLogSchema } from './schemas/rent-delivery-log.schema';
import { RentRequestJourney, RentRequestJourneySchema } from './schemas/rent-request-journey.schema';
import {
  RentJourneyAction,
  RentJourneyActionSchema,
} from './schemas/rent-journey-action.schema';
import {
  RentStaffNotificationState,
  RentStaffNotificationStateSchema,
} from './schemas/rent-staff-notification-state.schema';
import { Workspace, WorkspaceSchema } from '../workspace/schemas/workspace.schema';
import { WorkspaceBranding, WorkspaceBrandingSchema } from '../workspace/schemas/workspace-branding.schema';
import { WorkspaceBrandingService } from '../workspace/workspace-branding.service';
import { RentRequestIdService } from './rent-request-id.service';
import { RentRequestController } from './rent-request.controller';
import { RentTemplatesService } from './rent-templates.service';
import { RentEmailQueueService } from './rent-email-queue.service';
import { RentJourneysService } from './rent-journeys.service';
import { RentTemplatesController } from './rent-templates.controller';
import { RentJourneysController } from './rent-journeys.controller';
import { RentAnalyticsController } from './rent-analytics.controller';
import { RentAnalyticsService } from './rent-analytics.service';
import { TrackingTokenService } from './tracking-token.service';
import { UnsubscribeTokenService } from './unsubscribe-token.service';
import { RentPublicActionTokenService } from './rent-public-action-token.service';
import { RentPublicActionService } from './rent-public-action.service';
import { RentPublicActionController } from './rent-public-action.controller';
import { RentTrackingController } from './rent-tracking.controller';
import { RentUnsubscribeController } from './rent-unsubscribe.controller';
import { RentEmailWorker } from '../../queue/rent-email.worker';
import { RentSchedulerService } from './rent-scheduler.service';
import { EMAIL_PROVIDER_TOKEN } from '../../providers/email/email-provider.interface';
import { createEmailProvider } from '../../providers/email/email-provider.factory';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RentTemplate.name, schema: RentTemplateSchema },
      { name: RentDeliveryLog.name, schema: RentDeliveryLogSchema },
      { name: RentRequestJourney.name, schema: RentRequestJourneySchema },
      { name: RentJourneyAction.name, schema: RentJourneyActionSchema },
      { name: RentStaffNotificationState.name, schema: RentStaffNotificationStateSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: WorkspaceBranding.name, schema: WorkspaceBrandingSchema },
    ]),
  ],
  controllers: [
    RentTemplatesController,
    RentRequestController,
    RentJourneysController,
    RentAnalyticsController,
    RentPublicActionController,
    RentTrackingController,
    RentUnsubscribeController,
  ],
  providers: [
    RentTemplatesService,
    RentEmailQueueService,
    RentJourneysService,
    RentAnalyticsService,
    TrackingTokenService,
    UnsubscribeTokenService,
    RentPublicActionTokenService,
    RentPublicActionService,
    RentEmailWorker,
    WorkspaceBrandingService,
    RentRequestIdService,
    RentSchedulerService,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: () => createEmailProvider(),
    },
  ],
  exports: [
    RentTemplatesService,
    RentEmailQueueService,
    TrackingTokenService,
    UnsubscribeTokenService,
    RentJourneysService,
  ],
})
export class RentModule {}
