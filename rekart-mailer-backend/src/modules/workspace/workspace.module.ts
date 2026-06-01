import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { Workspace, WorkspaceSchema } from './schemas/workspace.schema';
import {
  WorkspaceBranding,
  WorkspaceBrandingSchema,
} from './schemas/workspace-branding.schema';
import { WorkspaceBrandingService } from './workspace-branding.service';
import { WorkspaceBrandingController } from './workspace-branding.controller';
import { WorkspaceSettingsController } from './workspace-settings.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: WorkspaceBranding.name, schema: WorkspaceBrandingSchema },
    ]),
    MulterModule.register({}),
  ],
  controllers: [
    WorkspaceController,
    WorkspaceBrandingController,
    WorkspaceSettingsController,
  ],
  providers: [WorkspaceService, WorkspaceBrandingService],
  exports: [WorkspaceService, WorkspaceBrandingService],
})
export class WorkspaceModule {}
