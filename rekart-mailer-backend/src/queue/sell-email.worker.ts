import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as path from 'path';
import { Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { WorkspaceBrandingService } from '../modules/workspace/workspace-branding.service';
import {
  SELL_EMAIL_QUEUE,
  type SellEmailJobPayload,
} from './queue.constants';

const ATTACHMENTS_DIR = path.join(process.cwd(), 'uploads', 'sell-attachments');
import {
  SellDeliveryLog,
  SellDeliveryLogDocument,
  DeliveryStatus,
} from '../modules/sell/schemas/sell-delivery-log.schema';
import { Workspace, WorkspaceDocument } from '../modules/workspace/schemas/workspace.schema';
import {
  renderSellEmailHtml,
  brandingToDesignTokens,
  prepareBrandingLogoForEmail,
  prepareMascotForEmail,
  prepareSocialIconsForEmail,
  mergeInlineCidAttachments,
} from '../modules/sell/templates/email-html.renderer';
import { createEmailProvider, FailoverEmailProvider } from '../providers/email/email-provider.factory';
import { TrackingTokenService } from '../modules/sell/tracking-token.service';
import { UnsubscribeTokenService } from '../modules/sell/unsubscribe-token.service';
import { SellSuppressionService } from '../modules/sell/sell-suppression.service';

@Injectable()
export class SellEmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SellEmailWorker.name);
  private worker: Worker | null = null;
  private readonly emailProvider: FailoverEmailProvider;

  constructor(
    @InjectModel(SellDeliveryLog.name)
    private readonly logModel: Model<SellDeliveryLogDocument>,

    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,

    private readonly trackingTokenService: TrackingTokenService,
    private readonly unsubscribeTokenService: UnsubscribeTokenService,
    private readonly suppressionService: SellSuppressionService,
    private readonly brandingService: WorkspaceBrandingService,
  ) {
    this.emailProvider = createEmailProvider();
  }

  onModuleInit() {
    if (process.env.SELL_USE_BULL_QUEUE !== 'true') {
      this.logger.log(
        '[Worker] sell-email worker disabled (set SELL_USE_BULL_QUEUE=true to process queued jobs)',
      );
      return;
    }

    const redisConn = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 500, 10_000),
    });
    redisConn.on('error', (err: Error) =>
      this.logger.warn(`[Worker] Redis error (will retry): ${err.message}`),
    );

    this.worker = new Worker(
      SELL_EMAIL_QUEUE,
      (job: Job<SellEmailJobPayload>) => this.processJob(job),
      {
        connection: redisConn,
        concurrency: 5,
        limiter: { max: 20, duration: 1000 },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`[Worker] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `[Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });

    this.worker.on('error', (err) =>
      this.logger.warn(`[Worker] Worker error (will retry): ${err.message}`),
    );

    this.logger.log('[Worker] sell-email worker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.logger.log('[Worker] sell-email worker stopped');
  }

  private async processJob(job: Job<SellEmailJobPayload>): Promise<void> {
    const {
      deliveryLogId,
      workspaceId,
      workflowKey,
      recipientEmail,
      subject,
      dynamicFieldValues,
      attachments: jobAttachments,
      customSignoffName,
      customFooterNote,
      customGreetingText,
      customHeadingColor,
      customBodyTextColor,
      customButtonLabel,
    } = job.data;

    const logId = new Types.ObjectId(deliveryLogId);

    // ── 1. Check suppression list ─────────────────────────────────────────────
    const suppression = await this.suppressionService.isSuppressed(
      workspaceId,
      recipientEmail,
    );

    if (suppression.suppressed) {
      this.logger.warn(
        `[Worker] Suppressed → ${recipientEmail} (reason: ${suppression.reason ?? 'unknown'})`,
      );
      await this.logModel.findByIdAndUpdate(logId, {
        status: DeliveryStatus.SUPPRESSED,
        suppressed: true,
        suppressionReason: suppression.reason ?? 'suppressed',
        retryCount: job.attemptsMade,
      });
      return; // Do NOT throw — job is complete (no retry needed)
    }

    // ── 2. Mark as PROCESSING ─────────────────────────────────────────────────
    await this.logModel.findByIdAndUpdate(logId, {
      status: DeliveryStatus.PROCESSING,
      retryCount: job.attemptsMade,
    });

    let usedProvider = 'smtp';

    try {
      // ── 3. Fetch workspace + branding ─────────────────────────────────────
      const [workspace, branding] = await Promise.all([
        this.workspaceModel
          .findById(new Types.ObjectId(workspaceId))
          .select('name')
          .lean(),
        this.brandingService.getRaw(workspaceId),
      ]);

      const b = branding as unknown as Record<string, unknown> | null;
      const workspaceName = (b?.companyName as string) || workspace?.name || 'Rekart';
      const { logoSrc: logoUrl, inlineCidAttachments: logoInline } =
        await prepareBrandingLogoForEmail((b?.logoUrl as string) || '', 'outbound');
      const { mascotSrc, inlineCidAttachments: mascotInline } =
        await prepareMascotForEmail(workflowKey, 'outbound');
      const { iconSrcs: socialIconSrcs, inlineCidAttachments: socialInline } =
        await prepareSocialIconsForEmail('outbound');
      const inlineCidAttachments = mergeInlineCidAttachments(logoInline, mascotInline, socialInline);

      // Full design tokens from workspace branding
      const designTokens = brandingToDesignTokens(b);

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

      const perEmailOverrides = {
        customSignoffName,
        customFooterNote,
        customGreetingText,
        customHeadingColor,
        customBodyTextColor,
        customButtonLabel,
      };

      // Build attachment objects from job data
      const emailAttachments = (jobAttachments ?? []).map((a) => ({
        filename: a.originalName,
        storedPath: path.join(ATTACHMENTS_DIR, a.storedFilename),
        contentType: a.mimeType,
      }));

      // ── 4. Generate tracking token ────────────────────────────────────────
      const trackingToken = this.trackingTokenService.sign({
        lid: deliveryLogId,
        wsId: workspaceId,
        iat: Math.floor(Date.now() / 1000),
      });

      await this.logModel.findByIdAndUpdate(logId, { trackingToken });

      const backendBase =
        process.env.BACKEND_BASE_URL ?? 'http://localhost:8000';
      const trackingBase = `${backendBase}/api/v1/sell/track`;

      // ── 5. Generate unsubscribe token ─────────────────────────────────────
      const unsubToken = this.unsubscribeTokenService.sign({
        wsId: workspaceId,
        email: recipientEmail.toLowerCase().trim(),
        iat: Math.floor(Date.now() / 1000),
      });
      const unsubscribeUrl = `${backendBase}/api/v1/sell/unsubscribe/${unsubToken}`;

      // ── 6. Render HTML ────────────────────────────────────────────────────
      const html = renderSellEmailHtml(workflowKey, dynamicFieldValues, {
        workspaceName,
        logoUrl,
        mascotSrc,
        socialIconSrcs,
        subject,
        designTokens,
        footer: footerOpts,
        perEmailOverrides,
        tracking: {
          trackingPixelUrl: `${trackingBase}/open/${trackingToken}`,
          clickBaseUrl: `${trackingBase}/click/${trackingToken}`,
        },
        compliance: {
          unsubscribeUrl,
          workspaceName,
          customComplianceText: (b?.complianceText      as string) || '',
          complianceBgColor:    (b?.complianceBgColor   as string) || '#f8fafc',
          complianceTextColor:  (b?.complianceTextColor as string) || '#94a3b8',
        },
      });

      // ── 7. Send via provider (with failover) ──────────────────────────────
      const result = await this.emailProvider.send({
        to: recipientEmail,
        subject,
        html,
        attachments: emailAttachments.length ? emailAttachments : undefined,
        inlineCidAttachments:
          inlineCidAttachments && inlineCidAttachments.length
            ? inlineCidAttachments
            : undefined,
      });

      usedProvider = result.usedProvider ?? 'unknown';

      // ── 8. Mark SENT ──────────────────────────────────────────────────────
      await this.logModel.findByIdAndUpdate(logId, {
        status: DeliveryStatus.SENT,
        providerMessageId: result.messageId ?? null,
        provider: usedProvider,
        sentAt: new Date(),
        errorMessage: null,
        retryCount: job.attemptsMade,
      });

      this.logger.log(
        `[Worker] Sent → ${recipientEmail} via ${usedProvider} (job ${job.id})`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;

      await this.logModel.findByIdAndUpdate(logId, {
        status: isLastAttempt ? DeliveryStatus.FAILED : DeliveryStatus.QUEUED,
        errorMessage: message,
        provider: usedProvider,
        retryCount: job.attemptsMade,
      });

      this.logger.error(
        `[Worker] Job ${job.id} error (attempt ${job.attemptsMade + 1}): ${message}`,
      );

      throw err;
    }
  }
}
