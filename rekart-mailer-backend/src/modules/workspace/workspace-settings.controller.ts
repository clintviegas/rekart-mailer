import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { WorkspaceBrandingService } from './workspace-branding.service';
import { Workspace, WorkspaceDocument } from './schemas/workspace.schema';
import { createResponse } from '../../common/utils/api-response';

export interface EmailProviderConfig {
  provider: 'smtp' | 'sendgrid';
  fromEmail: string;
  fromName: string;
}

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class WorkspaceSettingsController {
  constructor(
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
    private readonly brandingService: WorkspaceBrandingService,
  ) {}

  @Get('email-provider')
  async getEmailProviderConfig(@CurrentUser() user: JwtPayload) {
    const provider = (process.env.EMAIL_PROVIDER ?? 'smtp') as
      | 'smtp'
      | 'sendgrid';

    const fromEmail =
      provider === 'sendgrid'
        ? (process.env.SENDGRID_FROM_EMAIL ?? process.env.SMTP_FROM_EMAIL ?? '')
        : (process.env.SMTP_FROM_EMAIL ?? '');

    let fromName =
      provider === 'sendgrid'
        ? (process.env.SENDGRID_FROM_NAME ?? process.env.SMTP_FROM_NAME ?? '')
        : (process.env.SMTP_FROM_NAME ?? '');

    if (!fromName) {
      const branding = await this.brandingService.getRaw(user.workspaceId);
      if (branding?.companyName) {
        fromName = branding.companyName;
      } else {
        const workspace = await this.workspaceModel
          .findById(new Types.ObjectId(user.workspaceId))
          .select('name')
          .lean();
        fromName = (workspace as { name?: string })?.name ?? 'Rekart Team';
      }
    }

    const config: EmailProviderConfig = { provider, fromEmail, fromName };
    return createResponse(config, 'Email provider config fetched');
  }
}
