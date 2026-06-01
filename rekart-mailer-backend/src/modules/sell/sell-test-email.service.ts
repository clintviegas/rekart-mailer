import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as path from 'path';
import { Workspace, WorkspaceDocument } from '../workspace/schemas/workspace.schema';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import {
  renderSellEmailHtml,
  brandingToDesignTokens,
  prepareBrandingLogoForEmail,
  prepareMascotForEmail,
  prepareSocialIconsForEmail,
  mergeInlineCidAttachments,
} from './templates/email-html.renderer';
import {
  EMAIL_PROVIDER_TOKEN,
  IEmailProvider,
  EmailAttachment,
} from '../../providers/email/email-provider.interface';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';
import { WorkspaceBrandingService } from '../workspace/workspace-branding.service';

const VALID_WORKFLOW_KEYS = new Set([
  'request-received',
  'pickup-scheduled',
  'inspection-underway',
  'offer-ready',
  'payment-sent',
  'device-collected',
  'completed',
]);

const ATTACHMENTS_DIR = path.join(process.cwd(), 'uploads', 'sell-attachments');

@Injectable()
export class SellTestEmailService {
  private readonly logger = new Logger(SellTestEmailService.name);

  constructor(
    @Inject(EMAIL_PROVIDER_TOKEN)
    private readonly emailProvider: IEmailProvider,

    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,

    private readonly brandingService: WorkspaceBrandingService,
  ) {}

  async sendTestEmail(dto: SendTestEmailDto, user: JwtPayload) {
    if (!VALID_WORKFLOW_KEYS.has(dto.workflowKey)) {
      throw new BadRequestException(
        `Unknown workflowKey: "${dto.workflowKey}". ` +
          `Valid keys: ${[...VALID_WORKFLOW_KEYS].join(', ')}`,
      );
    }

    const [workspace, branding] = await Promise.all([
      this.workspaceModel
        .findById(new Types.ObjectId(user.workspaceId))
        .select('name')
        .lean(),
      this.brandingService.getRaw(user.workspaceId),
    ]);

    const b = branding as unknown as Record<string, unknown> | null;
    const workspaceName = (b?.companyName as string) || workspace?.name || 'Rekart';
    const { logoSrc: logoUrl, inlineCidAttachments: logoInline } =
      await prepareBrandingLogoForEmail((b?.logoUrl as string) || '', 'outbound');
    const { mascotSrc, inlineCidAttachments: mascotInline } =
      await prepareMascotForEmail(dto.workflowKey, 'outbound');
    const { iconSrcs: socialIconSrcs, inlineCidAttachments: socialInline } =
      await prepareSocialIconsForEmail('outbound');
    const inlineCidAttachments = mergeInlineCidAttachments(logoInline, mascotInline, socialInline);

    // Full design tokens from workspace branding
    const designTokens = brandingToDesignTokens(b);

    // Footer options
    const footerOpts = {
      teamDisplayName:   (b?.teamDisplayName as string)   || '',
      companyAddress:    (b?.footerAddress as string)      || '',
      supportPhone:      (b?.supportPhone as string)       || '',
      privacyPolicyUrl:  (b?.privacyPolicyUrl as string)   || '',
      termsOfServiceUrl: (b?.termsOfServiceUrl as string)  || '',
      supportUrl:        (b?.supportUrl as string)         || '',
      website:           (b?.website as string)            || '',
      socialLinks:       (b?.socialLinks as Record<string, string>) || {},
    };

    // Per-email overrides
    const perEmailOverrides = {
      customSignoffName:   dto.customSignoffName,
      customFooterNote:    dto.customFooterNote,
      customGreetingText:  dto.customGreetingText,
      customHeadingColor:  dto.customHeadingColor,
      customBodyTextColor: dto.customBodyTextColor,
      customButtonLabel:   dto.customButtonLabel,
    };

    // Build attachment objects
    const emailAttachments: EmailAttachment[] = (dto.attachments ?? []).map((a) => ({
      filename:    a.originalName,
      storedPath:  path.join(ATTACHMENTS_DIR, a.storedFilename),
      contentType: a.mimeType,
    }));

    const html = renderSellEmailHtml(
      dto.workflowKey,
      dto.dynamicFieldValues ?? {},
      {
        workspaceName,
        logoUrl,
        mascotSrc,
        socialIconSrcs,
        subject: dto.subject,
        designTokens,
        footer: footerOpts,
        perEmailOverrides,
      },
    );

    try {
      const result = await this.emailProvider.send({
        to:          dto.recipientEmail,
        subject:     `[TEST] ${dto.subject}`,
        html,
        attachments: emailAttachments.length ? emailAttachments : undefined,
        inlineCidAttachments:
          inlineCidAttachments && inlineCidAttachments.length
            ? inlineCidAttachments
            : undefined,
      });

      this.logger.log(
        `Test email sent to ${dto.recipientEmail} ` +
          `(workflow: ${dto.workflowKey}, messageId: ${result.messageId ?? 'n/a'})`,
      );

      return createResponse(
        {
          messageId:       result.messageId ?? null,
          recipient:       dto.recipientEmail,
          workflowKey:     dto.workflowKey,
          attachmentCount: emailAttachments.length,
        },
        `Test email sent to ${dto.recipientEmail}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Email provider error';
      this.logger.error(`Test email failed: ${message}`);
      throw new ServiceUnavailableException(`Failed to send email: ${message}`);
    }
  }
}
