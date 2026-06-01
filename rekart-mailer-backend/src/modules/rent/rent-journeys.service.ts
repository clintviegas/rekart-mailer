import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as path from 'path';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import {
  RentRequestJourney,
  RentRequestJourneyDocument,
  RENT_JOURNEY_WORKFLOW_STEPS,
  RENT_JOURNEY_STEP_LABELS,
  RentJourneyStatus,
} from './schemas/rent-request-journey.schema';
import {
  RentDeliveryLog,
  RentDeliveryLogDocument,
  DeliveryStatus,
} from './schemas/rent-delivery-log.schema';
import { Workspace, WorkspaceDocument } from '../workspace/schemas/workspace.schema';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { SendJourneyStepDto } from './dto/send-journey-step.dto';
import { PreviewJourneyDraftDto } from './dto/preview-journey-draft.dto';
import { RentPublicActionTokenService } from './rent-public-action-token.service';
import { TrackingTokenService } from './tracking-token.service';
import { UnsubscribeTokenService } from './unsubscribe-token.service';
import {
  RentJourneyAction,
  RentJourneyActionDocument,
  RentJourneyActionType,
} from './schemas/rent-journey-action.schema';
import {
  RentStaffNotificationState,
  RentStaffNotificationStateDocument,
} from './schemas/rent-staff-notification-state.schema';
import { RENT_EMAIL_QUEUE_TOKEN } from '../../queue/queue.module';
import {
  RENT_EMAIL_JOB,
  type RentEmailJobPayload,
} from '../../queue/queue.constants';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  createResponse,
  createPaginatedResponse,
} from '../../common/utils/api-response';
import { formatDateDDMMYY, formatMonthYY } from '../../common/date-format';
import {
  EMAIL_PROVIDER_TOKEN,
  IEmailProvider,
} from '../../providers/email/email-provider.interface';
import { WorkspaceBrandingService } from '../workspace/workspace-branding.service';
import {
  renderRentEmailHtml,
  brandingToDesignTokens,
  prepareBrandingLogoForEmail,
  prepareMascotForEmail,
  prepareSocialIconsForEmail,
  mergeInlineCidAttachments,
} from './templates/rent-email-html.renderer';
import { RentTemplatesService } from './rent-templates.service';
import { RentRequestIdService } from './rent-request-id.service';
import {
  isRentAgreementAccepted,
  rentAgreementDeclinedPendingResend,
} from './rent-agreement-status';
import {
  applyRentReturnDueFields,
  compareRentReturnDueAsc,
  getRentReturnDueSummary,
  isRentReturnDueListItem,
} from './rent-return-due.util';
import { rentJourneyRevenueAmountExpr } from './rent-revenue.util';

const RENT_ATTACHMENTS_DIR = path.join(process.cwd(), 'uploads', 'rent-attachments');

/** Customer actions surfaced as in-app notifications for staff. */
const RENT_STAFF_ALERT_ACTION_TYPES: RentJourneyActionType[] = [
  RentJourneyActionType.REQUEST_CONFIRMED,
  RentJourneyActionType.REQUEST_DECLINED,
  RentJourneyActionType.AGREEMENT_SIGNED,
  RentJourneyActionType.AGREEMENT_DECLINED,
];

function mapRentActionForStaff(action: RentJourneyActionType): string {
  switch (action) {
    case RentJourneyActionType.REQUEST_CONFIRMED:
      return 'request_received_accepted';
    case RentJourneyActionType.REQUEST_DECLINED:
      return 'request_received_declined';
    case RentJourneyActionType.AGREEMENT_SIGNED:
      return 'agreement_signed';
    case RentJourneyActionType.AGREEMENT_DECLINED:
      return 'agreement_declined';
    default:
      return action;
  }
}

interface RentJourneyPreviewContext {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  requestId: string;
  customerName: string;
  currency: string;
  dynamicData: Record<string, unknown>;
  completedSteps: string[];
}

function interpolateRentTemplateVars(
  text: string,
  merged: Record<string, unknown>,
): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const v = merged[key];
    return v != null && v !== '' ? String(v) : '';
  });
}

function resolveStepCustomMessage(
  journeyDyn: Record<string, unknown> | null | undefined,
  dtoDyn: Record<string, unknown> | undefined,
  stepKey: string,
): string {
  const direct = String(dtoDyn?.customMessage ?? '').trim();
  if (direct) return direct;
  const msgs = journeyDyn?.customMessages;
  if (msgs && typeof msgs === 'object' && !Array.isArray(msgs)) {
    const v = (msgs as Record<string, unknown>)[stepKey];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function escapeRegexSegment(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class RentJourneysService implements OnModuleInit {
  private readonly logger = new Logger(RentJourneysService.name);

  onModuleInit() {
    const mode =
      process.env.RENT_USE_BULL_QUEUE === 'true'
        ? 'BullMQ (Redis queue) — enabled'
        : 'Direct SMTP — no Bull queue/Redis for journeys';
    this.logger.log(`Rent journey step emails: ${mode}`);
  }

  constructor(
    @InjectModel(RentRequestJourney.name)
    private readonly journeyModel: Model<RentRequestJourneyDocument>,

    @InjectModel(RentDeliveryLog.name)
    private readonly logModel: Model<RentDeliveryLogDocument>,

    @InjectModel(RentJourneyAction.name)
    private readonly journeyActionModel: Model<RentJourneyActionDocument>,

    @InjectModel(RentStaffNotificationState.name)
    private readonly staffNotifStateModel: Model<RentStaffNotificationStateDocument>,

    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,

    @Inject(RENT_EMAIL_QUEUE_TOKEN)
    private readonly queue: Queue | null,

    @Inject(EMAIL_PROVIDER_TOKEN)
    private readonly emailProvider: IEmailProvider,

    private readonly brandingService: WorkspaceBrandingService,
    private readonly rentTemplatesService: RentTemplatesService,
    private readonly requestIdService: RentRequestIdService,
    private readonly actionTokenService: RentPublicActionTokenService,
    private readonly trackingTokenService: TrackingTokenService,
    private readonly unsubscribeTokenService: UnsubscribeTokenService,
  ) {}

  async create(dto: CreateJourneyDto, user: JwtPayload) {
    const requestId = await this.requestIdService.generate(user.workspaceId);

    const attachments = (dto.attachments ?? []).map((a) => ({
      storedFilename: a.storedFilename,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size ?? 0,
      url: a.url ?? '',
      uploadedAt: new Date(),
    }));

    const journey = await this.journeyModel.create({
      workspaceId: new Types.ObjectId(user.workspaceId),
      requestId,
      customerEmail: dto.customerEmail,
      customerName: dto.customerName,
      currency: dto.currency ?? 'AED',
      currentStep: 'rent-request',
      completedSteps: [],
      dynamicData: dto.dynamicData ?? {},
      attachments,
      sentSteps: [],
      status: RentJourneyStatus.ACTIVE,
      createdBy: new Types.ObjectId(user.sub),
    });

    this.logger.log(`Created rent journey ${requestId} for ${dto.customerEmail}`);

    return createResponse(journey.toJSON(), 'Journey created');
  }

  async findAll(
    user: JwtPayload,
    params: {
      status?: string;
      search?: string;
      page?: string;
      limit?: string;
      currentStep?: string;
      /** Active rentals awaiting return with due date in next 7 days or overdue */
      returnDue?: string;
    },
  ) {
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit ?? '20', 10)));
    const skip = (page - 1) * limit;

    const returnDueFilter = params.returnDue?.trim().toLowerCase();
    const isReturnDueFilter =
      returnDueFilter === '1' ||
      returnDueFilter === 'true' ||
      returnDueFilter === 'yes' ||
      returnDueFilter === 'follow_up';

    if (isReturnDueFilter) {
      const query: Record<string, unknown> = {
        workspaceId: new Types.ObjectId(user.workspaceId),
        status: RentJourneyStatus.ACTIVE,
        completedSteps: {
          $all: ['rent-handover'],
          $nin: ['rent-return-received'],
        },
      };

      if (params.search) {
        const re = { $regex: params.search, $options: 'i' };
        query['$or'] = [
          { requestId: re },
          { customerEmail: re },
          { customerName: re },
        ];
      }

      const all = await this.journeyModel.find(query).lean();
      const now = new Date();
      const filtered = all
        .filter((doc) =>
          isRentReturnDueListItem(
            doc as unknown as {
              status?: string;
              completedSteps?: string[];
              dynamicData?: Record<string, unknown>;
            },
          ),
        )
        .sort((a, b) =>
          compareRentReturnDueAsc(
            a as unknown as {
              status?: string;
              completedSteps?: string[];
              dynamicData?: Record<string, unknown>;
            },
            b as unknown as {
              status?: string;
              completedSteps?: string[];
              dynamicData?: Record<string, unknown>;
            },
            now,
          ),
        );

      const total = filtered.length;
      const items = filtered.slice(skip, skip + limit);
      return createPaginatedResponse(items, 'Journeys fetched', page, limit, total);
    }

    const query: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(user.workspaceId),
    };

    if (params.status) query['status'] = params.status;
    if (params.currentStep?.trim()) query['currentStep'] = params.currentStep.trim();

    if (params.search) {
      const re = { $regex: params.search, $options: 'i' };
      query['$or'] = [
        { requestId: re },
        { customerEmail: re },
        { customerName: re },
      ];
    }

    const [items, total] = await Promise.all([
      this.journeyModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.journeyModel.countDocuments(query),
    ]);

    return createPaginatedResponse(items, 'Journeys fetched', page, limit, total);
  }

  async findOne(id: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);
    return createResponse(journey, 'Journey fetched');
  }

  async getJourneyActions(journeyId: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(journeyId).lean();
    this.assertOwnership(journey, journeyId, user);
    if (!journey) throw new NotFoundException(`Journey ${journeyId} not found`);

    const actions = await this.journeyActionModel
      .find({
        journeyId: new Types.ObjectId(journeyId),
        workspaceId: new Types.ObjectId(user.workspaceId),
      })
      .sort({ occurredAt: 1, createdAt: 1 })
      .lean();

    return createResponse(actions, 'Actions fetched');
  }

  async updateJourneyData(
    id: string,
    dto: { dynamicData?: Record<string, unknown> },
    user: JwtPayload,
  ) {
    const journey = await this.journeyModel.findById(id);
    this.assertOwnership(journey?.toJSON() ?? null, id, user);
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);

    const merged = applyRentReturnDueFields({
      ...(journey.dynamicData ?? {}),
      ...(dto.dynamicData ?? {}),
    });

    await this.journeyModel.updateOne(
      { _id: journey._id },
      { $set: { dynamicData: merged } },
    );

    return createResponse(
      { dynamicData: merged },
      'Journey data updated',
    );
  }

  async sendNext(id: string, dto: SendJourneyStepDto, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id);
    this.assertOwnership(journey?.toJSON() ?? null, id, user);

    if (!journey) throw new NotFoundException(`Journey ${id} not found`);
    if (journey.status === RentJourneyStatus.COMPLETED) {
      throw new BadRequestException('All steps are already completed for this journey');
    }

    const nextStep = this.getNextStep(
      journey.completedSteps,
      journey.dynamicData as Record<string, unknown>,
    );
    if (!nextStep) {
      throw new BadRequestException('All steps already completed');
    }

    return this.dispatchStep(journey, nextStep, dto, user, false);
  }

  async sendStep(
    id: string,
    step: string,
    dto: SendJourneyStepDto,
    user: JwtPayload,
  ) {
    const journey = await this.journeyModel.findById(id);
    this.assertOwnership(journey?.toJSON() ?? null, id, user);
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);

    this.validateStepKey(step);

    const dyn = journey.dynamicData as Record<string, unknown>;
    const skipped = this.getBranchSkippedSteps(dyn);
    if (skipped.has(step)) {
      throw new BadRequestException(
        `Step "${step}" does not apply for ${String(dyn?.fulfillmentMode ?? 'unknown')} fulfillment.`,
      );
    }

    const stepIndex = RENT_JOURNEY_WORKFLOW_STEPS.indexOf(step as (typeof RENT_JOURNEY_WORKFLOW_STEPS)[number]);
    const nextIndex = this.getNextStepIndex(journey.completedSteps, dyn);

    const alreadySent = journey.sentSteps.some((s) => s.stepKey === step);
    if (alreadySent) {
      throw new ConflictException(
        `Step "${step}" was already sent.`,
      );
    }

    if (stepIndex > nextIndex) {
      const nextStep = RENT_JOURNEY_WORKFLOW_STEPS[nextIndex];
      throw new BadRequestException(
        `Cannot send "${step}" before completing "${nextStep}".`,
      );
    }

    return this.dispatchStep(journey, step, dto, user, false);
  }

  async resendStep(
    id: string,
    step: string,
    dto: SendJourneyStepDto,
    user: JwtPayload,
  ) {
    const journey = await this.journeyModel.findById(id);
    this.assertOwnership(journey?.toJSON() ?? null, id, user);
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);

    this.validateStepKey(step);

    const alreadySent = journey.sentSteps.some((s) => s.stepKey === step);
    if (!alreadySent) {
      throw new BadRequestException(
        `Step "${step}" has not been sent yet. Use /send/${step} to send it.`,
      );
    }

    return this.dispatchStep(journey, step, dto, user, true);
  }

  async previewStep(
    id: string,
    step: string,
    dto: SendJourneyStepDto,
    user: JwtPayload,
  ) {
    const journey = await this.journeyModel.findById(id);
    this.assertOwnership(journey?.toJSON() ?? null, id, user);
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);

    this.validateStepKey(step);
    const dyn = journey.dynamicData as Record<string, unknown>;
    const alreadySent = journey.sentSteps.some((s) => s.stepKey === step);

    if (!alreadySent) {
      const stepIndex = RENT_JOURNEY_WORKFLOW_STEPS.indexOf(step as (typeof RENT_JOURNEY_WORKFLOW_STEPS)[number]);
      const nextIndex = this.getNextStepIndex(journey.completedSteps, dyn);
      if (stepIndex > nextIndex) {
        throw new BadRequestException(
          `Cannot preview "${step}" before completing "${RENT_JOURNEY_WORKFLOW_STEPS[nextIndex]}".`,
        );
      }
    }

    const { subject, html } = await this.renderJourneyStepHtml(journey, step, dto, user);
    return createResponse({ html, subject, stepKey: step }, 'Preview ready');
  }

  async previewDraftEmail(dto: PreviewJourneyDraftDto, user: JwtPayload) {
    const stepDto: SendJourneyStepDto = {
      dynamicData: dto.dynamicData,
      subjectOverride: dto.subjectOverride,
      customSignoffName: dto.customSignoffName,
      customFooterNote: dto.customFooterNote,
      customGreetingText: dto.customGreetingText,
      customHeadingColor: dto.customHeadingColor,
      customBodyTextColor: dto.customBodyTextColor,
      customButtonLabel: dto.customButtonLabel,
    };
    const ctx: RentJourneyPreviewContext = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(user.workspaceId),
      requestId: dto.requestId?.trim() || 'PREVIEW',
      customerName: dto.customerName.trim(),
      currency: (dto.currency ?? 'AED').trim() || 'AED',
      dynamicData: dto.dynamicData ?? {},
      completedSteps: [],
    };
    const { html, subject } = await this.renderJourneyStepHtmlForContext(
      ctx,
      dto.step,
      stepDto,
      user,
    );
    return createResponse({ html, subject, stepKey: dto.step }, 'Preview ready');
  }

  async listStepEmailDeliveryLogs(
    id: string,
    user: JwtPayload,
    stepKey?: string,
  ) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);

    const wid = new Types.ObjectId(user.workspaceId);
    const rid = String(journey.requestId ?? '').trim();
    if (!rid) {
      return createResponse({ logs: [] }, 'No emails for this journey');
    }

    const filter: Record<string, unknown> = {
      workspaceId: wid,
      requestId: { $regex: `^${escapeRegexSegment(rid)}$`, $options: 'i' },
    };
    const step = stepKey?.trim();
    if (step) filter.workflowKey = step;

    const logs = await this.logModel
      .find(filter)
      .sort({ createdAt: 1 })
      .select('_id subject status sentAt createdAt workflowKey')
      .lean();

    const payload = logs.map((log) => ({
      id: String(log._id),
      workflowKey: log.workflowKey,
      subject: log.subject,
      status: log.status,
      sentAt: log.sentAt ? log.sentAt.toISOString() : null,
      createdAt:
        (log as { createdAt?: Date }).createdAt?.toISOString?.() ?? null,
    }));

    return createResponse({ logs: payload }, 'Email logs fetched');
  }

  async previewDeliveryLog(id: string, logId: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);

    const log = await this.logModel.findById(logId).lean();
    if (!log || log.requestId !== journey.requestId) {
      throw new NotFoundException('Delivery log not found for this journey');
    }

    const previewData: Record<string, unknown> = {
      ...(log.dynamicFieldValues ?? {}),
      requestId: journey.requestId,
      customerName: journey.customerName,
      currency: journey.currency,
    };
    if (log.workflowKey === 'rent-request' && previewData.requestAckGeneration == null) {
      previewData.requestAckGeneration =
        journey.dynamicData?.requestAckGeneration ??
        log.dynamicFieldValues?.requestAckGeneration ??
        1;
    }
    this.injectActionUrls(journey, log.workflowKey, previewData);

    const [workspace, branding] = await Promise.all([
      this.workspaceModel.findById(journey.workspaceId).select('name').lean(),
      this.brandingService.getRaw(journey.workspaceId.toString()),
    ]);

    const b = branding as unknown as Record<string, unknown> | null;
    const workspaceName = (b?.companyName as string) || workspace?.name || 'Rekart';
    const { logoSrc: logoUrl } = await prepareBrandingLogoForEmail(
      (b?.logoUrl as string) || '',
      'preview',
    );
    const { mascotSrc } = await prepareMascotForEmail(log.workflowKey, 'preview');
    const { iconSrcs: socialIconSrcs } = await prepareSocialIconsForEmail('preview');
    const designTokens = brandingToDesignTokens(b);

    const html = renderRentEmailHtml(log.workflowKey, previewData, {
      workspaceName,
      logoUrl,
      mascotSrc,
      socialIconSrcs,
      subject: log.subject ?? undefined,
      designTokens,
      footer: {
        teamDisplayName: (b?.teamDisplayName as string) || '',
        companyAddress: (b?.footerAddress as string) || '',
        supportPhone: (b?.supportPhone as string) || '',
        privacyPolicyUrl: (b?.privacyPolicyUrl as string) || '',
        termsOfServiceUrl: (b?.termsOfServiceUrl as string) || '',
        supportUrl: (b?.supportUrl as string) || '',
        website: (b?.website as string) || '',
        socialLinks: (b?.socialLinks as Record<string, string>) || {},
      },
      compliance: {
        unsubscribeUrl: (b?.supportUrl as string) || '',
        workspaceName,
        customComplianceText: (b?.complianceText as string) || '',
        complianceBgColor: (b?.complianceBgColor as string) || '#f8fafc',
        complianceTextColor: (b?.complianceTextColor as string) || '#94a3b8',
      },
    });

    return createResponse(
      {
        html,
        subject: log.subject ?? '',
        stepKey: log.workflowKey,
        deliveryLogId: logId,
      },
      'Delivery log preview ready',
    );
  }

  private async dispatchStep(
    journey: RentRequestJourneyDocument,
    stepKey: string,
    dto: SendJourneyStepDto,
    user: JwtPayload,
    isResend: boolean,
  ) {
    this.assertStepPreconditions(journey, stepKey);

    const template = await this.rentTemplatesService.ensurePublishedTemplate(
      stepKey,
      user,
    );

    const mergedData: Record<string, unknown> = {
      ...journey.dynamicData,
      ...(dto.dynamicData ?? {}),
      requestId: journey.requestId,
      customerName: journey.customerName,
      currency: journey.currency,
    };

    mergedData.customMessage = resolveStepCustomMessage(
      journey.dynamicData as Record<string, unknown>,
      dto.dynamicData,
      stepKey,
    );

    if (stepKey === 'rent-request') {
      const nextGen = this.nextRequestAckGeneration(journey) + 1;
      mergedData.requestAckGeneration = nextGen;
    }

    if (stepKey === 'rent-agreement') {
      const nextGen = this.nextAgreementGeneration(journey) + 1;
      mergedData.agreementGeneration = nextGen;
      if (journey.dynamicData?.finalOfferResumeLocked === true) {
        mergedData.quoteReviseType = 'final_offer';
      }
      if (isResend) {
        const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
        const reviseType = String(mergedData['quoteReviseType'] ?? '').trim();
        if (reviseType === 'after_reason' && !mergedData['quoteDeclineReason']) {
          mergedData['quoteDeclineReason'] = dd['quoteDeclineReason'] ?? '';
        }
        if (reviseType === 'after_reason' && !mergedData['quoteDeclineNote']) {
          mergedData['quoteDeclineNote'] = dd['quoteDeclineNote'] ?? '';
        }
      }
    }

    this.injectActionUrls(journey, stepKey, mergedData);

    const subjectRaw =
      dto.subjectOverride ??
      template.subject ??
      `Update — ${journey.requestId}`;
    const subject = interpolateRentTemplateVars(subjectRaw, mergedData);

    const log = await this.logModel.create({
      workspaceId: journey.workspaceId,
      templateId: template._id,
      workflowKey: stepKey,
      recipientEmail: journey.customerEmail,
      requestId: journey.requestId,
      subject,
      status: DeliveryStatus.QUEUED,
      createdBy: new Types.ObjectId(user.sub),
      dynamicFieldValues: mergedData,
    });

    const journeyAttachments = (journey.attachments ?? []).map((a) => ({
      storedFilename: a.storedFilename,
      originalName: a.originalName,
      mimeType: a.mimeType,
      url: a.url,
    }));

    const payload: RentEmailJobPayload = {
      workspaceId: journey.workspaceId.toString(),
      workflowKey: stepKey,
      recipientEmail: journey.customerEmail,
      subject,
      dynamicFieldValues: mergedData,
      templateId: (template._id as Types.ObjectId).toString(),
      triggeredBy: user.sub,
      deliveryLogId: (log._id as Types.ObjectId).toString(),
      attachments: journeyAttachments,
      customSignoffName: dto.customSignoffName,
      customFooterNote: dto.customFooterNote,
      customGreetingText: dto.customGreetingText,
      customHeadingColor: dto.customHeadingColor,
      customBodyTextColor: dto.customBodyTextColor,
      customButtonLabel: dto.customButtonLabel,
    };

    const useBullQueue = process.env.RENT_USE_BULL_QUEUE === 'true';

    let sentViaQueue = false;
    if (!useBullQueue) {
      this.logger.log(
        `[Journey ${journey.requestId}] Sending step "${stepKey}" via direct SMTP → ${journey.customerEmail}`,
      );
      await this.sendDirectFallback(payload, log._id.toString());
    } else {
      if (!this.queue) {
        throw new ServiceUnavailableException(
          'Bull queue is not enabled. Set RENT_USE_BULL_QUEUE=true, start Redis, then restart the server.',
        );
      }
      try {
        await this.queue.add(RENT_EMAIL_JOB, payload, {
          jobId: `rent-journey-${log._id.toString()}`,
        });
        sentViaQueue = true;
      } catch (queueErr) {
        this.logger.warn(
          `[Journey ${journey.requestId}] BullMQ unavailable — falling back to direct send: ${(queueErr as Error).message}`,
        );
        await this.sendDirectFallback(payload, log._id.toString());
      }
    }

    const finalStatus = sentViaQueue ? DeliveryStatus.QUEUED : DeliveryStatus.SENT;
    const sentStep = {
      stepKey,
      sentAt: new Date(),
      deliveryLogId: (log._id as Types.ObjectId).toString(),
      deliveryStatus: finalStatus,
      subject,
    };

    if (isResend) {
      const resendSet: Record<string, unknown> = {
        'sentSteps.$.sentAt': sentStep.sentAt,
        'sentSteps.$.deliveryLogId': sentStep.deliveryLogId,
        'sentSteps.$.deliveryStatus': sentStep.deliveryStatus,
      };
      const resendUpdate: Record<string, unknown> = { $set: resendSet };

      if (dto.dynamicData && Object.keys(dto.dynamicData).length > 0) {
        for (const [k, v] of Object.entries(dto.dynamicData)) {
          resendSet[`dynamicData.${k}`] = v;
        }
      }

      if (stepKey === 'rent-request') {
        Object.assign(resendSet, {
          'dynamicData.requestAckGeneration': mergedData.requestAckGeneration,
          'dynamicData.requestAckByCustomer': false,
          'dynamicData.requestAckDeclined': false,
          currentStep: 'rent-request',
        });
        resendUpdate.$unset = {
          'dynamicData.requestAckConfirmedGen': '',
          'dynamicData.requestAckDeclinedGen': '',
          'dynamicData.declineReason': '',
          'dynamicData.customerMessage': '',
          'dynamicData.itemsNotes': '',
          'dynamicData.customerRentalItems': '',
          'dynamicData.staffDeclinedRequest': '',
          'dynamicData.fulfillmentMode': '',
          'dynamicData.fulfillmentConfirmedAt': '',
          'dynamicData.rentalStartDate': '',
          'dynamicData.rentalEndDate': '',
          'dynamicData.rentalDuration': '',
          'dynamicData.rentalDurationDays': '',
          'dynamicData.preferredDate': '',
          'dynamicData.preferredTimeSlot': '',
          'dynamicData.addressMode': '',
          'dynamicData.confirmedAddress': '',
          'dynamicData.deliveryAddress': '',
          'dynamicData.customerItemChanges': '',
        };
      }

      if (stepKey === 'rent-agreement') {
        Object.assign(resendSet, {
          'dynamicData.agreementGeneration': mergedData.agreementGeneration,
          'dynamicData.agreementSigned': false,
          'dynamicData.agreementDeclined': false,
          'dynamicData.finalOfferResumePending': false,
          currentStep: 'rent-agreement',
        });
        if (journey.dynamicData?.finalOfferResumeLocked === true || mergedData.quoteReviseType === 'final_offer') {
          resendSet['dynamicData.quoteReviseType'] = 'final_offer';
        }
        resendUpdate.$unset = {
          ...(resendUpdate.$unset as Record<string, string> | undefined),
          'dynamicData.agreementSignedAt': '',
          'dynamicData.agreementSignedGen': '',
          'dynamicData.agreementDeclinedGen': '',
          'dynamicData.agreementDeclinedAt': '',
        };
      }

      await this.journeyModel.updateOne(
        { _id: journey._id, 'sentSteps.stepKey': stepKey },
        resendUpdate,
      );
    } else {
      const newCompleted = [...journey.completedSteps];
      if (!newCompleted.includes(stepKey)) newCompleted.push(stepKey);

      const dyn = {
        ...(journey.dynamicData as Record<string, unknown>),
        ...(dto.dynamicData ?? {}),
      };
      const nextStep = this.getNextStep(newCompleted, dyn);
      const applicable = this.getApplicableSteps(dyn);
      const allDone = applicable.every((s) => newCompleted.includes(s));
      const newStatus = allDone
        ? RentJourneyStatus.COMPLETED
        : RentJourneyStatus.ACTIVE;

      const dynamicDataUpdate =
        stepKey === 'rent-request'
          ? {
              ...(journey.dynamicData ?? {}),
              requestAckGeneration: mergedData.requestAckGeneration,
              originalRentalItems:
                mergedData.rentalItems ?? journey.dynamicData?.rentalItems ?? [],
            }
          : stepKey === 'rent-agreement'
            ? applyRentReturnDueFields({
                ...(journey.dynamicData ?? {}),
                ...(dto.dynamicData ?? {}),
                agreementGeneration: mergedData.agreementGeneration,
              })
            : stepKey === 'rent-return-reminder'
              ? applyRentReturnDueFields({
                  ...(journey.dynamicData ?? {}),
                  ...(dto.dynamicData ?? {}),
                  returnReminderSentBy:
                    user.sub === 'scheduler' ? 'scheduler' : 'staff',
                  ...(user.sub === 'scheduler'
                    ? { returnReminderAutoSentAt: new Date() }
                    : { returnReminderManualSentAt: new Date() }),
                })
              : applyRentReturnDueFields({
                  ...(journey.dynamicData ?? {}),
                  ...(dto.dynamicData ?? {}),
                });

      await this.journeyModel.updateOne(
        { _id: journey._id },
        {
          $push: { sentSteps: sentStep },
          $set: {
            completedSteps: newCompleted,
            currentStep: nextStep ?? stepKey,
            status: newStatus,
            dynamicData: dynamicDataUpdate,
          },
        },
      );
    }

    this.logger.log(
      `[Journey ${journey.requestId}] Step "${stepKey}" ${isResend ? 'resent' : 'sent'} → ${journey.customerEmail}`,
    );

    return createResponse(
      {
        journeyId: journey._id,
        requestId: journey.requestId,
        stepKey,
        deliveryLogId: (log._id as Types.ObjectId).toString(),
        status: sentViaQueue ? DeliveryStatus.QUEUED : DeliveryStatus.SENT,
        deliveredVia: sentViaQueue ? 'queue' : 'direct',
        isResend,
      },
      isResend ? `Step "${stepKey}" resent` : `Step "${stepKey}" sent`,
    );
  }

  private async sendDirectFallback(
    payload: RentEmailJobPayload,
    logId: string,
  ): Promise<void> {
    try {
      const [workspace, branding] = await Promise.all([
        this.workspaceModel
          .findById(new Types.ObjectId(payload.workspaceId))
          .select('name')
          .lean(),
        this.brandingService.getRaw(payload.workspaceId),
      ]);

      const b = branding as unknown as Record<string, unknown> | null;
      const workspaceName = (b?.companyName as string) || workspace?.name || 'Rekart';
      const { logoSrc: logoUrl, inlineCidAttachments: logoInline } =
        await prepareBrandingLogoForEmail((b?.logoUrl as string) || '', 'outbound');
      const { mascotSrc, inlineCidAttachments: mascotInline } =
        await prepareMascotForEmail(payload.workflowKey, 'outbound');
      const { iconSrcs: socialIconSrcs, inlineCidAttachments: socialInline } =
        await prepareSocialIconsForEmail('outbound');
      const inlineCidAttachments = mergeInlineCidAttachments(logoInline, mascotInline, socialInline);
      const designTokens = brandingToDesignTokens(b);

      const footerOpts = {
        teamDisplayName: (b?.teamDisplayName as string) || '',
        companyAddress: (b?.footerAddress as string) || '',
        supportPhone: (b?.supportPhone as string) || '',
        privacyPolicyUrl: (b?.privacyPolicyUrl as string) || '',
        termsOfServiceUrl: (b?.termsOfServiceUrl as string) || '',
        supportUrl: (b?.supportUrl as string) || '',
        website: (b?.website as string) || '',
        socialLinks: (b?.socialLinks as Record<string, string>) || {},
      };

      const perEmailOverrides = {
        customSignoffName: payload.customSignoffName,
        customFooterNote: payload.customFooterNote,
        customGreetingText: payload.customGreetingText,
        customHeadingColor: payload.customHeadingColor,
        customBodyTextColor: payload.customBodyTextColor,
        customButtonLabel: payload.customButtonLabel,
      };

      const trackingToken = this.trackingTokenService.sign({
        lid: logId,
        wsId: payload.workspaceId,
        iat: Math.floor(Date.now() / 1000),
      });

      await this.logModel.findByIdAndUpdate(logId, { trackingToken });

      const backendBase =
        process.env.BACKEND_BASE_URL ?? 'http://localhost:8000';
      const trackingBase = `${backendBase}/api/v1/rent/track`;

      const unsubToken = this.unsubscribeTokenService.sign({
        wsId: payload.workspaceId,
        email: payload.recipientEmail.toLowerCase().trim(),
        iat: Math.floor(Date.now() / 1000),
      });
      const unsubscribeUrl = `${backendBase}/api/v1/rent/unsubscribe/${unsubToken}`;

      const html = renderRentEmailHtml(
        payload.workflowKey,
        payload.dynamicFieldValues ?? {},
        {
          workspaceName,
          logoUrl,
          mascotSrc,
          socialIconSrcs,
          subject: payload.subject,
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
            customComplianceText: (b?.complianceText as string) || '',
            complianceBgColor: (b?.complianceBgColor as string) || '#f8fafc',
            complianceTextColor: (b?.complianceTextColor as string) || '#94a3b8',
          },
        },
      );

      const emailAttachments = (payload.attachments ?? []).map((a) => ({
        filename: a.originalName,
        storedPath: path.join(RENT_ATTACHMENTS_DIR, a.storedFilename),
        contentType: a.mimeType,
      }));

      const sendResult = await this.emailProvider.send({
        to: payload.recipientEmail,
        subject: payload.subject,
        html,
        attachments: emailAttachments.length ? emailAttachments : undefined,
        inlineCidAttachments:
          inlineCidAttachments && inlineCidAttachments.length
            ? inlineCidAttachments
            : undefined,
      });

      const usedProvider =
        (sendResult as { usedProvider?: string }).usedProvider ?? 'smtp';

      await this.logModel.updateOne(
        { _id: new Types.ObjectId(logId) },
        {
          $set: {
            status: DeliveryStatus.SENT,
            sentAt: new Date(),
            providerMessageId: sendResult.messageId ?? null,
            provider: usedProvider,
            errorMessage: null,
          },
        },
      );

      this.logger.log(
        `[Direct] Sent → ${payload.recipientEmail} (step: ${payload.workflowKey}, provider: ${usedProvider})`,
      );
    } catch (err) {
      this.logger.error(`[Direct] Send failed for log ${logId}: ${(err as Error).message}`);
      await this.logModel.updateOne(
        { _id: new Types.ObjectId(logId) },
        { $set: { status: DeliveryStatus.FAILED } },
      );
      throw err;
    }
  }

  private injectActionUrls(
    journey: RentJourneyPreviewContext | RentRequestJourneyDocument,
    stepKey: string,
    data: Record<string, unknown>,
  ): void {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const base = {
      jid: journey._id.toString(),
      rid: journey.requestId,
      wid: journey.workspaceId.toString(),
      step: stepKey,
      iat: Math.floor(Date.now() / 1000),
    };

    const buildUrl = (
      actionPath: string,
      action: RentJourneyActionType,
      extra?: { requestAckGen?: number; agreementGen?: number },
    ) => {
      const payload = {
        ...base,
        action,
        ...(extra?.requestAckGen != null ? { requestAckGen: extra.requestAckGen } : {}),
        ...(extra?.agreementGen != null ? { agreementGen: extra.agreementGen } : {}),
      };
      return this.actionTokenService.buildUrl(frontendUrl, actionPath, payload);
    };

    switch (stepKey) {
      case 'rent-request': {
        const gen = Number(data.requestAckGeneration ?? this.nextRequestAckGeneration(journey) + 1);
        data['confirmUrl'] = buildUrl(
          'request/confirm',
          RentJourneyActionType.REQUEST_CONFIRMED,
          { requestAckGen: gen },
        );
        data['declineUrl'] = buildUrl(
          'request/decline',
          RentJourneyActionType.REQUEST_DECLINED,
          { requestAckGen: gen },
        );
        data['requestAckGeneration'] = String(gen);
        break;
      }
      case 'rent-agreement': {
        const gen = Number(
          data.agreementGeneration ?? this.nextAgreementGeneration(journey) + 1,
        );
        data['acceptUrl'] = buildUrl(
          'agreement/accept',
          RentJourneyActionType.AGREEMENT_SIGNED,
          { agreementGen: gen },
        );
        data['declineUrl'] = buildUrl(
          'agreement/decline',
          RentJourneyActionType.AGREEMENT_DECLINED,
          { agreementGen: gen },
        );
        data['agreementUrl'] = data['acceptUrl'];
        data['agreementGeneration'] = String(gen);
        break;
      }
      default:
        break;
    }
  }

  private nextRequestAckGeneration(
    journey: RentJourneyPreviewContext | RentRequestJourneyDocument,
  ): number {
    const stored = Number(journey.dynamicData?.requestAckGeneration ?? 0);
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  }

  private nextAgreementGeneration(
    journey: RentJourneyPreviewContext | RentRequestJourneyDocument,
  ): number {
    const stored = Number(journey.dynamicData?.agreementGeneration ?? 0);
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  }

  private assertStepPreconditions(
    journey: RentRequestJourneyDocument,
    stepKey: string,
  ): void {
    const mode = String(journey.dynamicData?.fulfillmentMode ?? '').toLowerCase();

    if (stepKey === 'rent-agreement' && journey.dynamicData?.requestAckByCustomer !== true) {
      throw new BadRequestException(
        'Customer must confirm the rent request email before sending the quote.',
      );
    }

    if (stepKey === 'rent-agreement' && journey.dynamicData?.requestAckDeclined === true) {
      throw new BadRequestException(
        'Customer declined the rent request. Send a revised quote before the agreement step.',
      );
    }

    const dd = journey.dynamicData ?? {};
    const agreementDeclined = rentAgreementDeclinedPendingResend(dd);
    const agreementSigned = isRentAgreementAccepted(dd);

    if (
      stepKey !== 'rent-agreement' &&
      journey.completedSteps.includes('rent-agreement') &&
      agreementDeclined &&
      !agreementSigned
    ) {
      throw new BadRequestException(
        'Customer declined the quote. Resend the agreement email with a revised quote first.',
      );
    }

    if (stepKey === 'rent-ready-pickup' && mode !== 'pickup') {
      throw new BadRequestException(
        'Ready for pickup email only applies when customer chose pickup.',
      );
    }

    if (stepKey === 'rent-dispatched' && mode !== 'delivery') {
      throw new BadRequestException(
        'Dispatched email only applies when customer chose delivery.',
      );
    }

    if (
      (stepKey === 'rent-ready-pickup' || stepKey === 'rent-dispatched') &&
      !agreementSigned
    ) {
      throw new BadRequestException(
        'Customer must accept the rent agreement before this step.',
      );
    }
  }

  private toPreviewContext(
    journey: RentRequestJourneyDocument,
  ): RentJourneyPreviewContext {
    return {
      _id: journey._id as Types.ObjectId,
      workspaceId: journey.workspaceId,
      requestId: journey.requestId,
      customerName: journey.customerName,
      currency: journey.currency,
      dynamicData: (journey.dynamicData ?? {}) as Record<string, unknown>,
      completedSteps: journey.completedSteps ?? [],
    };
  }

  private async renderJourneyStepHtml(
    journey: RentRequestJourneyDocument,
    stepKey: string,
    dto: SendJourneyStepDto,
    user: JwtPayload,
  ): Promise<{ subject: string; html: string }> {
    return this.renderJourneyStepHtmlForContext(
      this.toPreviewContext(journey),
      stepKey,
      dto,
      user,
    );
  }

  private async renderJourneyStepHtmlForContext(
    ctx: RentJourneyPreviewContext,
    stepKey: string,
    dto: SendJourneyStepDto,
    user: JwtPayload,
  ): Promise<{ subject: string; html: string }> {
    const template = await this.rentTemplatesService.ensurePublishedTemplate(
      stepKey,
      user,
    );

    const mergedData: Record<string, unknown> = {
      ...ctx.dynamicData,
      ...(dto.dynamicData ?? {}),
      requestId: ctx.requestId,
      customerName: ctx.customerName,
      currency: ctx.currency,
    };

    mergedData.customMessage = resolveStepCustomMessage(
      ctx.dynamicData,
      dto.dynamicData,
      stepKey,
    );

    if (stepKey === 'rent-request') {
      mergedData.requestAckGeneration =
        this.nextRequestAckGeneration(ctx) + 1;
    }

    this.injectActionUrls(ctx, stepKey, mergedData);

    const subjectRaw =
      dto.subjectOverride ??
      template.subject ??
      `Update — ${ctx.requestId}`;
    const subject = interpolateRentTemplateVars(subjectRaw, mergedData);

    const [workspace, branding] = await Promise.all([
      this.workspaceModel.findById(ctx.workspaceId).select('name').lean(),
      this.brandingService.getRaw(ctx.workspaceId.toString()),
    ]);

    const b = branding as unknown as Record<string, unknown> | null;
    const workspaceName =
      (b?.companyName as string) || workspace?.name || 'Rekart';
    const { logoSrc: logoUrl } = await prepareBrandingLogoForEmail(
      (b?.logoUrl as string) || '',
      'preview',
    );
    const { mascotSrc } = await prepareMascotForEmail(stepKey, 'preview');
    const { iconSrcs: socialIconSrcs } =
      await prepareSocialIconsForEmail('preview');
    const designTokens = brandingToDesignTokens(b);

    const html = renderRentEmailHtml(stepKey, mergedData, {
      workspaceName,
      logoUrl,
      mascotSrc,
      socialIconSrcs,
      subject,
      designTokens,
      footer: {
        teamDisplayName: (b?.teamDisplayName as string) || '',
        companyAddress: (b?.footerAddress as string) || '',
        supportPhone: (b?.supportPhone as string) || '',
        privacyPolicyUrl: (b?.privacyPolicyUrl as string) || '',
        termsOfServiceUrl: (b?.termsOfServiceUrl as string) || '',
        supportUrl: (b?.supportUrl as string) || '',
        website: (b?.website as string) || '',
        socialLinks: (b?.socialLinks as Record<string, string>) || {},
      },
      perEmailOverrides: {
        customSignoffName: dto.customSignoffName,
        customFooterNote: dto.customFooterNote,
        customGreetingText: dto.customGreetingText,
        customHeadingColor: dto.customHeadingColor,
        customBodyTextColor: dto.customBodyTextColor,
        customButtonLabel: dto.customButtonLabel,
      },
      compliance: {
        unsubscribeUrl: (b?.supportUrl as string) || '',
        workspaceName,
        customComplianceText: (b?.complianceText as string) || '',
        complianceBgColor: (b?.complianceBgColor as string) || '#f8fafc',
        complianceTextColor: (b?.complianceTextColor as string) || '#94a3b8',
      },
    });

    return { subject, html };
  }

  private getBranchSkippedSteps(
    dynamicData?: Record<string, unknown>,
  ): Set<string> {
    const mode = String(dynamicData?.fulfillmentMode ?? '').toLowerCase();
    if (mode === 'pickup') return new Set(['rent-dispatched']);
    if (mode === 'delivery') return new Set(['rent-ready-pickup']);
    return new Set();
  }

  private getApplicableSteps(dynamicData?: Record<string, unknown>): string[] {
    const skipped = this.getBranchSkippedSteps(dynamicData);
    return RENT_JOURNEY_WORKFLOW_STEPS.filter((s) => !skipped.has(s));
  }

  private getNextStep(
    completedSteps: string[],
    dynamicData?: Record<string, unknown>,
  ): (typeof RENT_JOURNEY_WORKFLOW_STEPS)[number] | null {
    const applicable = this.getApplicableSteps(dynamicData);
    const step = applicable.find((s) => !completedSteps.includes(s));
    return (step as (typeof RENT_JOURNEY_WORKFLOW_STEPS)[number]) ?? null;
  }

  private getNextStepIndex(
    completedSteps: string[],
    dynamicData?: Record<string, unknown>,
  ): number {
    const next = this.getNextStep(completedSteps, dynamicData);
    if (!next) return RENT_JOURNEY_WORKFLOW_STEPS.length;
    return RENT_JOURNEY_WORKFLOW_STEPS.indexOf(next);
  }

  private validateStepKey(step: string): void {
    if (
      !RENT_JOURNEY_WORKFLOW_STEPS.includes(
        step as (typeof RENT_JOURNEY_WORKFLOW_STEPS)[number],
      )
    ) {
      throw new BadRequestException(
        `Invalid step "${step}". Must be one of: ${RENT_JOURNEY_WORKFLOW_STEPS.join(', ')}`,
      );
    }
  }

  private assertOwnership(
    journey: { workspaceId: Types.ObjectId | string } | null,
    id: string,
    user: JwtPayload,
  ): void {
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);
    if (journey.workspaceId.toString() !== user.workspaceId) {
      throw new ForbiddenException('Access denied');
    }
  }

  // ── Dashboard stats ────────────────────────────────────────────────────────

  async getStats(user: JwtPayload) {
    const wid = new Types.ObjectId(user.workspaceId);

    const [
      statusAgg,
      stepAgg,
      currentStepAgg,
      fulfillmentAgg,
      revenueAgg,
      recentDocs,
      agreementSignedCount,
      awaitingReturnDocs,
    ] = await Promise.all([
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid } },
        { $unwind: '$completedSteps' },
        { $group: { _id: '$completedSteps', count: { $sum: 1 } } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, status: RentJourneyStatus.ACTIVE } },
        { $group: { _id: '$currentStep', count: { $sum: 1 } } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid } },
        {
          $project: {
            mode: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$dynamicData.fulfillmentMode', 'pickup'] },
                    then: 'pickup',
                  },
                  {
                    case: { $eq: ['$dynamicData.fulfillmentMode', 'delivery'] },
                    then: 'delivery',
                  },
                ],
                default: 'pending',
              },
            },
          },
        },
        { $group: { _id: '$mode', count: { $sum: 1 } } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, status: RentJourneyStatus.COMPLETED } },
        {
          $group: {
            _id: null,
            total: {
              $sum: rentJourneyRevenueAmountExpr(),
            },
          },
        },
      ]),
      this.journeyModel
        .find({ workspaceId: wid })
        .sort({ createdAt: -1 })
        .limit(5)
        .select(
          'requestId customerName customerEmail currency currentStep status createdAt dynamicData',
        )
        .lean(),
      this.journeyModel.countDocuments({
        workspaceId: wid,
        'dynamicData.agreementSigned': true,
      }),
      this.journeyModel
        .find({
          workspaceId: wid,
          status: RentJourneyStatus.ACTIVE,
          completedSteps: {
            $all: ['rent-handover'],
            $nin: ['rent-return-received'],
          },
        })
        .select(
          'requestId customerName customerEmail currency currentStep status completedSteps dynamicData createdAt _id',
        )
        .lean(),
    ]);

    const byStatus: Record<string, number> = {
      active: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const row of statusAgg) {
      byStatus[row._id as string] = row.count as number;
    }
    const total = Object.values(byStatus).reduce((s, n) => s + n, 0);

    const byStep: Record<string, number> = {};
    for (const row of stepAgg) {
      byStep[row._id as string] = row.count as number;
    }

    const byCurrentStep: Record<string, number> = {};
    for (const row of currentStepAgg) {
      byCurrentStep[row._id as string] = row.count as number;
    }

    const byFulfillment: Record<string, number> = {
      pickup: 0,
      delivery: 0,
      pending: 0,
    };
    for (const row of fulfillmentAgg) {
      byFulfillment[row._id as string] = row.count as number;
    }

    const totalRevenue = (revenueAgg[0]?.total as number) ?? 0;
    const handoverCount = byStep['rent-handover'] ?? 0;
    const agreementCount = byStep['rent-agreement'] ?? 0;
    const agreementRate =
      agreementCount > 0
        ? Math.round((handoverCount / agreementCount) * 100)
        : 0;

    const now = new Date();
    let returnOverdueCount = 0;
    let returnDueTodayCount = 0;
    let returnDueSoonCount = 0;
    let returnDueFollowUpCount = 0;
    let returnAwaitingCount = 0;
    const returnDueFollowUp: Array<Record<string, unknown>> = [];
    const returnAwaitingSorted: Array<Record<string, unknown>> = [];

    for (const doc of awaitingReturnDocs) {
      const journeyLike = doc as unknown as {
        status?: string;
        completedSteps?: string[];
        dynamicData?: Record<string, unknown>;
      };
      const summary = getRentReturnDueSummary(journeyLike, now);
      if (!summary.iso) continue;

      if (isRentReturnDueListItem(journeyLike)) {
        returnAwaitingCount += 1;
        returnAwaitingSorted.push({
          ...(doc as unknown as Record<string, unknown>),
          returnDueStatus: summary.status,
          returnDueLabel: summary.label,
          returnDueIso: summary.iso,
          daysUntilDue: summary.daysUntilDue,
        });
      }

      if (summary.status === 'overdue') returnOverdueCount += 1;
      if (summary.status === 'due_today') returnDueTodayCount += 1;
      if (summary.status === 'due_soon') returnDueSoonCount += 1;
      if (summary.followUp) {
        returnDueFollowUpCount += 1;
        returnDueFollowUp.push({
          ...(doc as unknown as Record<string, unknown>),
          returnDueStatus: summary.status,
          returnDueLabel: summary.label,
          returnDueIso: summary.iso,
          daysUntilDue: summary.daysUntilDue,
        });
      }
    }

    returnAwaitingSorted.sort((a, b) =>
      compareRentReturnDueAsc(
        a as unknown as {
          status?: string;
          completedSteps?: string[];
          dynamicData?: Record<string, unknown>;
        },
        b as unknown as {
          status?: string;
          completedSteps?: string[];
          dynamicData?: Record<string, unknown>;
        },
        now,
      ),
    );

    returnDueFollowUp.sort((a, b) =>
      compareRentReturnDueAsc(
        a as unknown as {
          status?: string;
          completedSteps?: string[];
          dynamicData?: Record<string, unknown>;
        },
        b as unknown as {
          status?: string;
          completedSteps?: string[];
          dynamicData?: Record<string, unknown>;
        },
        now,
      ),
    );

    return createResponse(
      {
        total,
        byStatus,
        byStep,
        byCurrentStep,
        byFulfillment,
        totalRevenue,
        agreementSignedCount,
        agreementRate,
        recentJourneys: recentDocs,
        returnOverdueCount,
        returnDueTodayCount,
        returnDueSoonCount,
        returnDueFollowUpCount,
        returnAwaitingCount,
        returnDueFollowUp: returnAwaitingSorted.slice(0, 10),
      },
      'Stats fetched',
    );
  }

  async getJourneyAnalytics(user: JwtPayload) {
    const wid = new Types.ObjectId(user.workspaceId);
    const now = new Date();

    const twelveMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 11,
      1,
    );
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      monthlyRaw,
      dailyRaw,
      funnelRaw,
      actionRaw,
      revenueRaw,
      completionTimeRaw,
      thisMonthCount,
      lastMonthCount,
      totalCount,
      statusAgg,
      fulfillmentAgg,
      currentStepAgg,
      agreementSignedCount,
    ] = await Promise.all([
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, createdAt: { $gte: twelveMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            requests: { $sum: 1 },
            completions: {
              $sum: {
                $cond: [{ $eq: ['$status', RentJourneyStatus.COMPLETED] }, 1, 0],
              },
            },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ['$status', RentJourneyStatus.COMPLETED] },
                  rentJourneyRevenueAmountExpr(),
                  0,
                ],
              },
            },
            cancellations: {
              $sum: {
                $cond: [{ $eq: ['$status', RentJourneyStatus.CANCELLED] }, 1, 0],
              },
            },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            requests: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid } },
        { $unwind: '$completedSteps' },
        { $group: { _id: '$completedSteps', count: { $sum: 1 } } },
      ]),
      this.journeyActionModel.aggregate([
        { $match: { workspaceId: wid } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, status: RentJourneyStatus.COMPLETED } },
        {
          $group: {
            _id: '$currency',
            total: {
              $sum: rentJourneyRevenueAmountExpr(),
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, status: RentJourneyStatus.COMPLETED } },
        {
          $project: {
            durationHours: {
              $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 3_600_000],
            },
          },
        },
        {
          $group: {
            _id: null,
            avg: { $avg: '$durationHours' },
            min: { $min: '$durationHours' },
            max: { $max: '$durationHours' },
          },
        },
      ]),
      this.journeyModel.countDocuments({
        workspaceId: wid,
        createdAt: { $gte: startOfMonth },
      }),
      this.journeyModel.countDocuments({
        workspaceId: wid,
        createdAt: { $gte: startOfLastMonth, $lt: startOfMonth },
      }),
      this.journeyModel.countDocuments({ workspaceId: wid }),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid } },
        {
          $project: {
            mode: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$dynamicData.fulfillmentMode', 'pickup'] },
                    then: 'pickup',
                  },
                  {
                    case: { $eq: ['$dynamicData.fulfillmentMode', 'delivery'] },
                    then: 'delivery',
                  },
                ],
                default: 'pending',
              },
            },
          },
        },
        { $group: { _id: '$mode', count: { $sum: 1 } } },
      ]),
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, status: RentJourneyStatus.ACTIVE } },
        { $group: { _id: '$currentStep', count: { $sum: 1 } } },
      ]),
      this.journeyModel.countDocuments({
        workspaceId: wid,
        'dynamicData.agreementSigned': true,
      }),
    ]);

    type MonthEntry = {
      requests: number;
      completions: number;
      revenue: number;
      cancellations: number;
    };
    const monthMap = new Map<string, MonthEntry>();
    for (const r of monthlyRaw) {
      const key = `${r._id.year as number}-${String(r._id.month as number).padStart(2, '0')}`;
      monthMap.set(key, {
        requests: r.requests as number,
        completions: r.completions as number,
        revenue: r.revenue as number,
        cancellations: r.cancellations as number,
      });
    }
    const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lbl = formatMonthYY(d);
      return {
        month: lbl,
        ...(monthMap.get(key) ?? {
          requests: 0,
          completions: 0,
          revenue: 0,
          cancellations: 0,
        }),
      };
    });

    const dayMap = new Map<string, number>();
    for (const r of dailyRaw) {
      const key = `${r._id.year as number}-${String(r._id.month as number).padStart(2, '0')}-${String(r._id.day as number).padStart(2, '0')}`;
      dayMap.set(key, r.requests as number);
    }
    const dailyTrend = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (29 - i));
      d.setHours(0, 0, 0, 0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const lbl = formatDateDDMMYY(d);
      return { date: key, day: lbl, requests: dayMap.get(key) ?? 0 };
    });

    const funnelMap = new Map<string, number>();
    for (const r of funnelRaw) {
      funnelMap.set(r._id as string, r.count as number);
    }

    const funnel = RENT_JOURNEY_WORKFLOW_STEPS.map((step, i) => {
      const count =
        i === 0
          ? (funnelMap.get(step) ?? totalCount)
          : (funnelMap.get(step) ?? 0);
      const prevCount =
        i === 0
          ? totalCount
          : (funnelMap.get(RENT_JOURNEY_WORKFLOW_STEPS[i - 1]) ?? totalCount);
      return {
        step,
        label: RENT_JOURNEY_STEP_LABELS[step] ?? step,
        count,
        dropOffRate:
          i === 0 || prevCount === 0
            ? 0
            : Math.round(((prevCount - count) / prevCount) * 100),
        conversionRate:
          totalCount === 0 ? 0 : Math.round((count / totalCount) * 100),
      };
    });

    const revenueByCurrency = revenueRaw.map((r) => ({
      currency: r._id as string,
      total: Math.round((r.total as number) * 100) / 100,
      count: r.count as number,
      avg:
        (r.count as number) > 0
          ? Math.round((r.total as number) / (r.count as number))
          : 0,
    }));

    const growthRate =
      lastMonthCount > 0
        ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
        : null;

    const actionCounts: Record<string, number> = {};
    for (const row of actionRaw) {
      actionCounts[row._id as string] = row.count as number;
    }

    const byStatus: Record<string, number> = {
      active: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const row of statusAgg) {
      byStatus[row._id as string] = row.count as number;
    }

    const byFulfillment: Record<string, number> = {
      pickup: 0,
      delivery: 0,
      pending: 0,
    };
    for (const row of fulfillmentAgg) {
      byFulfillment[row._id as string] = row.count as number;
    }

    const byCurrentStep: Record<string, number> = {};
    for (const row of currentStepAgg) {
      byCurrentStep[row._id as string] = row.count as number;
    }

    const agreementStepCount = funnelMap.get('rent-agreement') ?? 0;
    const handoverStepCount = funnelMap.get('rent-handover') ?? 0;
    const handoverRate =
      agreementStepCount > 0
        ? Math.round((handoverStepCount / agreementStepCount) * 100)
        : 0;

    return createResponse(
      {
        totalJourneys: totalCount,
        thisMonthJourneys: thisMonthCount,
        lastMonthJourneys: lastMonthCount,
        growthRate,
        monthlyTrend,
        dailyTrend,
        funnel,
        actionCounts,
        revenueByCurrency,
        avgCompletionHours: completionTimeRaw[0]
          ? {
              avg:
                Math.round((completionTimeRaw[0].avg as number) * 10) / 10,
              min: Math.round(completionTimeRaw[0].min as number),
              max: Math.round(completionTimeRaw[0].max as number),
            }
          : null,
        byStatus,
        byFulfillment,
        byCurrentStep,
        agreementSignedCount,
        handoverRate,
      },
      'Analytics fetched',
    );
  }

  async getStaffNotifications(user: JwtPayload) {
    const uid = new Types.ObjectId(user.sub);
    const wid = new Types.ObjectId(user.workspaceId);

    let state = await this.staffNotifStateModel
      .findOne({ userId: uid, workspaceId: wid })
      .lean();
    if (!state) {
      const doc = await this.staffNotifStateModel.create({
        userId: uid,
        workspaceId: wid,
        lastReadAt: new Date(),
      });
      state = doc.toObject();
    }
    const lastReadAt = state.lastReadAt as Date;

    const match = {
      workspaceId: wid,
      action: { $in: RENT_STAFF_ALERT_ACTION_TYPES },
    };

    const [rows, unreadCount] = await Promise.all([
      this.journeyActionModel.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $limit: 40 },
        {
          $lookup: {
            from: 'rent_request_journeys',
            localField: 'journeyId',
            foreignField: '_id',
            as: 'journey',
          },
        },
        {
          $unwind: {
            path: '$journey',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            action: 1,
            stepKey: 1,
            requestId: 1,
            journeyId: 1,
            createdAt: 1,
            metadata: 1,
            customerName: {
              $ifNull: ['$journey.customerName', 'Customer'],
            },
          },
        },
      ]),
      this.journeyActionModel.countDocuments({
        ...match,
        createdAt: { $gt: lastReadAt },
      }),
    ]);

    const lastReadMs = new Date(lastReadAt).getTime();

    const items = rows.map((r) => {
      const created =
        r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
      const createdIso = created.toISOString();
      const action = r.action as RentJourneyActionType;
      return {
        _id: String(r._id),
        actionType: mapRentActionForStaff(action),
        step: (r.stepKey as string) ?? 'rent-request',
        requestId: r.requestId as string,
        journeyId: String(r.journeyId),
        customerName: r.customerName as string,
        createdAt: createdIso,
        unread: created.getTime() > lastReadMs,
        metadata: (r.metadata as Record<string, unknown>) ?? {},
      };
    });

    return createResponse({
      items,
      unreadCount,
      lastReadAt: new Date(lastReadAt).toISOString(),
    });
  }

  async markStaffNotificationsRead(user: JwtPayload, readThroughIso?: string) {
    const at = readThroughIso ? new Date(readThroughIso) : new Date();
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException('readThrough must be a valid ISO-8601 datetime');
    }
    const uid = new Types.ObjectId(user.sub);
    const wid = new Types.ObjectId(user.workspaceId);

    await this.staffNotifStateModel.updateOne(
      { userId: uid, workspaceId: wid },
      {
        $max: { lastReadAt: at },
        $setOnInsert: { userId: uid, workspaceId: wid },
      },
      { upsert: true },
    );

    return createResponse({ lastReadAt: at.toISOString() }, 'Marked as read');
  }

  async cancel(id: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);

    if (journey!.status === RentJourneyStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed journey');
    }
    if (journey!.status === RentJourneyStatus.CANCELLED) {
      throw new BadRequestException('Journey is already cancelled');
    }

    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { status: RentJourneyStatus.CANCELLED } },
    );

    this.logger.log(`Journey ${journey!.requestId} cancelled by ${user.sub}`);
    return createResponse(
      { id, status: RentJourneyStatus.CANCELLED },
      'Journey cancelled',
    );
  }

  async resumeFinalOfferQuote(id: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);

    if (journey.status !== RentJourneyStatus.CANCELLED) {
      throw new BadRequestException('Only closed journeys can be resumed');
    }
    if (journey.dynamicData?.finalOfferDeclinedClosed !== true) {
      throw new BadRequestException(
        'Resume is only available after a customer declined the final offer',
      );
    }
    if (!journey.completedSteps.includes('rent-agreement')) {
      throw new BadRequestException('Quote email has not been sent yet');
    }

    const dynamicData: Record<string, unknown> = {
      ...(journey.dynamicData ?? {}),
      finalOfferDeclinedClosed: false,
      finalOfferResumePending: true,
      finalOfferResumeLocked: true,
      quoteReviseType: 'final_offer',
      agreementDeclined: false,
    };
    delete dynamicData.closedReason;
    delete dynamicData.closedAt;
    delete dynamicData.agreementDeclinedGen;
    delete dynamicData.agreementDeclinedAt;

    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          status: RentJourneyStatus.ACTIVE,
          currentStep: 'rent-agreement',
          dynamicData,
        },
      },
    );

    this.logger.log(`Journey ${journey.requestId} resumed for final offer by ${user.sub}`);
    return createResponse(
      { id, status: RentJourneyStatus.ACTIVE },
      'Journey resumed — send another final offer only',
    );
  }

  async markRequestDeclined(id: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);

    if (!journey!.completedSteps.includes('rent-request')) {
      throw new BadRequestException('Rent request email has not been sent yet');
    }
    if (
      journey!.status === RentJourneyStatus.CANCELLED ||
      journey!.status === RentJourneyStatus.COMPLETED
    ) {
      throw new BadRequestException(
        `Cannot decline request on a ${journey!.status} journey`,
      );
    }

    const gen = Number(journey!.dynamicData?.requestAckGeneration ?? 1);

    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          currentStep: 'rent-request',
          'dynamicData.requestAckDeclined': true,
          'dynamicData.requestAckDeclinedGen': gen,
          'dynamicData.requestAckByCustomer': false,
          'dynamicData.declineReason': 'Declined by staff',
          'dynamicData.staffDeclinedRequest': true,
        },
        $unset: {
          'dynamicData.requestAckConfirmedGen': '',
          'dynamicData.preferredDate': '',
          'dynamicData.preferredTimeSlot': '',
          'dynamicData.rentalDuration': '',
          'dynamicData.customerFairPrice': '',
          'dynamicData.itemsNotes': '',
        },
      },
    );

    this.logger.log(`Journey ${journey!.requestId} request declined by ${user.sub}`);
    return createResponse({ id, declined: true }, 'Request marked as declined');
  }

  async addStaffNote(id: string, text: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);

    const note = {
      text: text.trim().slice(0, 2000),
      createdBy: new Types.ObjectId(user.sub),
      createdAt: new Date(),
    };

    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $push: { staffNotes: { $each: [note], $position: 0 } } },
    );

    return createResponse(note, 'Note added');
  }

  async deleteStaffNote(journeyId: string, noteIndex: number, user: JwtPayload) {
    const journey = await this.journeyModel
      .findById(journeyId)
      .select('workspaceId staffNotes')
      .lean();
    this.assertOwnership(journey, journeyId, user);

    const notes: unknown[] =
      ((journey as unknown as Record<string, unknown>)['staffNotes'] as unknown[]) ?? [];
    if (noteIndex < 0 || noteIndex >= notes.length) {
      throw new BadRequestException('Note index out of range');
    }

    const updated = notes.filter((_, i) => i !== noteIndex);
    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(journeyId) },
      { $set: { staffNotes: updated } },
    );

    return createResponse(null, 'Note deleted');
  }

  /**
   * Sends the return-reminder workflow step on behalf of the scheduler.
   * Skipped automatically when staff already sent this step (completedSteps guard).
   */
  async sendReturnReminderAuto(
    journey: RentRequestJourneyDocument,
  ): Promise<void> {
    const fresh = await this.journeyModel.findById(journey._id);
    if (!fresh) return;

    if (fresh.status !== RentJourneyStatus.ACTIVE) return;
    if (fresh.completedSteps.includes('rent-return-reminder')) return;
    if (fresh.sentSteps.some((s) => s.stepKey === 'rent-return-reminder')) return;
    if (!fresh.completedSteps.includes('rent-handover')) return;

    const fakeUser = {
      workspaceId: fresh.workspaceId.toString(),
      sub: 'scheduler',
    } as JwtPayload;

    const dto: SendJourneyStepDto = {};
    await this.dispatchStep(fresh, 'rent-return-reminder', dto, fakeUser, false);

    await this.journeyModel.updateOne(
      { _id: fresh._id },
      { $unset: { 'dynamicData.returnReminderAutoClaimed': '' } },
    );
  }
}
