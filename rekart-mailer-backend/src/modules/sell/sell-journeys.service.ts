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
  SellRequestJourney,
  SellRequestJourneyDocument,
  JOURNEY_WORKFLOW_STEPS,
  JourneyStatus,
} from './schemas/sell-request-journey.schema';
import {
  SellTemplate,
  SellTemplateDocument,
} from './schemas/sell-template.schema';
import {
  SellDeliveryLog,
  SellDeliveryLogDocument,
  DeliveryStatus,
} from './schemas/sell-delivery-log.schema';
import { Workspace, WorkspaceDocument } from '../workspace/schemas/workspace.schema';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { SendJourneyStepDto } from './dto/send-journey-step.dto';
import { SendDeviceReshipDto } from './dto/send-device-reship.dto';
import { PreviewJourneyDraftDto } from './dto/preview-journey-draft.dto';
import { EXTRA_SELL_WORKFLOW_KEYS } from './sell-template-defaults';
import { SELL_EMAIL_QUEUE_TOKEN } from '../../queue/queue.module';
import {
  SELL_EMAIL_JOB,
  type SellEmailJobPayload,
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
  renderSellEmailHtml,
  brandingToDesignTokens,
  prepareBrandingLogoForEmail,
  prepareMascotForEmail,
  prepareSocialIconsForEmail,
  mergeInlineCidAttachments,
} from './templates/email-html.renderer';
import {
  SellPublicActionTokenService,
  type ActionTokenPayload,
} from './sell-public-action-token.service';
import {
  JourneyActionType,
  SellJourneyAction,
  SellJourneyActionDocument,
} from './schemas/sell-journey-action.schema';
import {
  SellStaffNotificationState,
  SellStaffNotificationStateDocument,
} from './schemas/sell-staff-notification-state.schema';
import { SellTemplatesService } from './sell-templates.service';

const PREFIX = 'RKTS';
const SUFFIX_MIN = 10000;
const SUFFIX_MAX = 99999;
const MAX_ID_RETRIES = 20;

const SELL_ATTACHMENTS_DIR = path.join(process.cwd(), 'uploads', 'sell-attachments');

/** High-signal customer actions surfaced as in-app notifications for staff. */
const STAFF_ALERT_ACTION_TYPES: JourneyActionType[] = [
  JourneyActionType.OFFER_DECLINED,
  JourneyActionType.OFFER_ACCEPTED,
  JourneyActionType.REQUEST_RECEIVED_ACCEPTED,
  JourneyActionType.REQUEST_RECEIVED_DECLINED,
  JourneyActionType.RESCHEDULE_REQUESTED,
  JourneyActionType.SUPPORT_REQUESTED,
];

/** Minimal journey shape for HTML preview + signed links (real doc or draft). */
type JourneyPreviewContext = {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  requestId: string;
  customerName: string;
  currency: string;
  dynamicData?: Record<string, unknown>;
  completedSteps?: string[];
  offerGeneration?: number;
  requestAckGeneration?: number;
};

import { formatCurrency } from '../../common/format-display-money';

export { formatCurrency };

/** Replace {{field}} in template subject lines with merged journey data. */
function interpolateSellTemplateVars(
  text: string,
  merged: Record<string, unknown>,
): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const v = merged[key];
    return v != null && v !== '' ? String(v) : '';
  });
}

function escapeRegexSegment(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Per-step note from dashboard forms (`customMessages[stepKey]`) or one-off `customMessage` on send DTO. */
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

@Injectable()
export class SellJourneysService implements OnModuleInit {
  private readonly logger = new Logger(SellJourneysService.name);

  onModuleInit() {
    const mode =
      process.env.SELL_USE_BULL_QUEUE === 'true'
        ? 'BullMQ (Redis queue) — enabled'
        : 'Direct SMTP — no Bull queue/Redis for journeys';
    this.logger.log(`Sell journey step emails: ${mode}`);
  }

  constructor(
    @InjectModel(SellRequestJourney.name)
    private readonly journeyModel: Model<SellRequestJourneyDocument>,

    @InjectModel(SellJourneyAction.name)
    private readonly journeyActionModel: Model<SellJourneyActionDocument>,

    @InjectModel(SellStaffNotificationState.name)
    private readonly staffNotifStateModel: Model<SellStaffNotificationStateDocument>,

    @InjectModel(SellTemplate.name)
    private readonly templateModel: Model<SellTemplateDocument>,

    @InjectModel(SellDeliveryLog.name)
    private readonly logModel: Model<SellDeliveryLogDocument>,

    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,

    @Inject(SELL_EMAIL_QUEUE_TOKEN)
    private readonly queue: Queue | null,

    @Inject(EMAIL_PROVIDER_TOKEN)
    private readonly emailProvider: IEmailProvider,

    private readonly brandingService: WorkspaceBrandingService,
    private readonly actionTokenService: SellPublicActionTokenService,
    private readonly sellTemplatesService: SellTemplatesService,
  ) {}

  // ── Create journey ─────────────────────────────────────────────────────────

  async create(dto: CreateJourneyDto, user: JwtPayload) {
    const requestId = await this.generateUniqueId(user.workspaceId);

    const attachments = (dto.attachments ?? []).map((a) => ({
      storedFilename: a.storedFilename,
      originalName:   a.originalName,
      mimeType:       a.mimeType,
      size:           a.size ?? 0,
      url:            a.url ?? '',
      uploadedAt:     new Date(),
    }));

    const journey = await this.journeyModel.create({
      workspaceId: new Types.ObjectId(user.workspaceId),
      requestId,
      customerEmail: dto.customerEmail,
      customerName:  dto.customerName,
      currency:      dto.currency ?? 'AED',
      currentStep:   'request-received',
      completedSteps: [],
      dynamicData:   dto.dynamicData ?? {},
      attachments,
      sentSteps:     [],
      status:        JourneyStatus.ACTIVE,
      createdBy:     new Types.ObjectId(user.sub),
    });

    this.logger.log(`Created journey ${requestId} for ${dto.customerEmail}`);

    return createResponse(journey.toJSON(), 'Journey created');
  }

  // ── Attachment management ──────────────────────────────────────────────────

  async addAttachment(
    id: string,
    attachment: { storedFilename: string; originalName: string; mimeType: string; size: number; url: string },
    user: JwtPayload,
  ) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);

    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $push: { attachments: { ...attachment, uploadedAt: new Date() } } },
    );
    return createResponse({ id }, 'Attachment added');
  }

  async removeAttachment(id: string, storedFilename: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);

    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $pull: { attachments: { storedFilename } } },
    );
    return createResponse({ id }, 'Attachment removed');
  }

  // ── List journeys ──────────────────────────────────────────────────────────

  async findAll(
    user: JwtPayload,
    params: {
      status?: string;
      search?: string;
      page?: string;
      limit?: string;
      /** Journeys that have this step in `completedSteps` (funnel drill-down). */
      completedStep?: string;
      /** offerGeneration &gt; 1 */
      revisedOffers?: string;
      /** dynamicData.closedByReship === true */
      closedByReship?: string;
      /** dynamicData.reminderDue === true (customer hasn't acknowledged request-received in 24h) */
      reminderDue?: string;
      /** Filter by the journey's currentStep value (e.g. pipeline view) */
      currentStep?: string;
    },
  ) {
    const query: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(user.workspaceId),
    };

    if (params.status) query['status'] = params.status;

    if (params.completedStep?.trim()) {
      const step = params.completedStep.trim();
      this.validateStepKey(step);
      query['completedSteps'] = step;
    }

    const rev = params.revisedOffers?.trim().toLowerCase();
    if (rev === '1' || rev === 'true' || rev === 'yes') {
      query['offerGeneration'] = { $gt: 1 };
    }

    const reship = params.closedByReship?.trim().toLowerCase();
    if (reship === '1' || reship === 'true' || reship === 'yes') {
      query['dynamicData.closedByReship'] = true;
    }

    const reminder = params.reminderDue?.trim().toLowerCase();
    if (reminder === '1' || reminder === 'true' || reminder === 'yes') {
      query['dynamicData.reminderDue'] = true;
    }

    if (params.currentStep?.trim()) {
      query['currentStep'] = params.currentStep.trim();
    }

    if (params.search) {
      const re = { $regex: params.search, $options: 'i' };
      query['$or'] = [
        { requestId: re },
        { customerEmail: re },
        { customerName: re },
      ];
    }

    const page  = Math.max(1, parseInt(params.page  ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit ?? '20', 10)));
    const skip  = (page - 1) * limit;

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

  // ── Bulk export ────────────────────────────────────────────────────────────

  async exportJourneysCsv(
    user: JwtPayload,
    params: { status?: string; search?: string; completedStep?: string },
  ): Promise<string> {
    const query: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(user.workspaceId),
    };
    if (params.status) query['status'] = params.status;
    if (params.completedStep?.trim()) query['completedSteps'] = params.completedStep.trim();
    if (params.search) {
      const re = { $regex: params.search, $options: 'i' };
      query['$or'] = [{ requestId: re }, { customerEmail: re }, { customerName: re }];
    }

    const rows = await this.journeyModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(5000)
      .select('requestId customerName customerEmail currency status currentStep completedSteps offerGeneration dynamicData createdAt updatedAt')
      .lean();

    const dd = (r: Record<string, unknown>) =>
      (r['dynamicData'] as Record<string, unknown>) ?? {};

    const headers = [
      'Request ID', 'Customer Name', 'Customer Email', 'Currency', 'Status',
      'Current Step', 'Completed Steps', 'Offer Generation',
      'Device Name', 'Estimated Value', 'Final Offer', 'Paid Amount',
      'Payment Method', 'Payment Reference', 'Pickup Date',
      'Tracking Number', 'Created At', 'Updated At',
    ];

    const escape = (v: unknown) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    const lines = [
      headers.map(escape).join(','),
      ...rows.map((r) => {
        const d = dd(r as unknown as Record<string, unknown>);
        return [
          r['requestId'],
          r['customerName'],
          r['customerEmail'],
          r['currency'],
          r['status'],
          r['currentStep'],
          (r['completedSteps'] as string[])?.join(' → ') ?? '',
          r['offerGeneration'] ?? 0,
          d['deviceName'] ?? '',
          d['estimatedValue'] ?? d['estimatedValueMin'] ?? '',
          d['finalOffer'] ?? d['offerAmount'] ?? '',
          d['paidAmount'] ?? d['paymentAmount'] ?? '',
          d['paymentMethod'] ?? d['payoutMethod'] ?? '',
          d['paymentReference'] ?? d['transactionId'] ?? '',
          d['pickupDate'] ?? '',
          d['trackingNumber'] ?? '',
          r['createdAt'] instanceof Date ? r['createdAt'].toISOString() : String(r['createdAt'] ?? ''),
          r['updatedAt'] instanceof Date ? r['updatedAt'].toISOString() : String(r['updatedAt'] ?? ''),
        ].map(escape).join(',');
      }),
    ];

    return lines.join('\n');
  }

  // ── Dashboard stats ────────────────────────────────────────────────────────

  async getStats(user: JwtPayload) {
    const wid = new Types.ObjectId(user.workspaceId);

    // Aggregate status counts + step completion counts in one pass
    const [statusAgg, stepAgg, currentStepAgg, revenueAgg, recentDocs, recentActions, revisedOfferJourneys, revisedOfferSendsSum, reshipClosed, reminderDueCount] =
      await Promise.all([
        // Status breakdown
        this.journeyModel.aggregate([
          { $match: { workspaceId: wid } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),

        // Step funnel — how many journeys have completed each step
        this.journeyModel.aggregate([
          { $match: { workspaceId: wid } },
          { $unwind: '$completedSteps' },
          { $group: { _id: '$completedSteps', count: { $sum: 1 } } },
        ]),

        // Current step breakdown — how many ACTIVE journeys are at each step right now
        this.journeyModel.aggregate([
          { $match: { workspaceId: wid, status: JourneyStatus.ACTIVE } },
          { $group: { _id: '$currentStep', count: { $sum: 1 } } },
        ]),

        // Revenue from paidAmount in dynamicData
        this.journeyModel.aggregate([
          { $match: { workspaceId: wid, status: JourneyStatus.COMPLETED } },
          {
            $group: {
              _id: null,
              total: {
                $sum: { $toDouble: { $ifNull: ['$dynamicData.paidAmount', 0] } },
              },
            },
          },
        ]),

        // 5 most recent journeys
        this.journeyModel
          .find({ workspaceId: wid })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('requestId customerName customerEmail currency currentStep status createdAt dynamicData')
          .lean(),

        // Recent customer actions — query action collection directly with the
        // compound index { workspaceId, createdAt } instead of joining journeys.
        this.journeyActionModel
          .find({ workspaceId: wid })
          .sort({ createdAt: -1 })
          .limit(15)
          .lean(),

        this.journeyModel.countDocuments({
          workspaceId: wid,
          offerGeneration: { $gt: 1 },
        }),

        this.journeyModel.aggregate([
          { $match: { workspaceId: wid } },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $max: [
                    0,
                    { $subtract: [{ $ifNull: ['$offerGeneration', 0] }, 1] },
                  ],
                },
              },
            },
          },
        ]),

        this.journeyModel.countDocuments({
          workspaceId: wid,
          'dynamicData.closedByReship': true,
        }),

        this.journeyModel.countDocuments({
          workspaceId: wid,
          'dynamicData.reminderDue': true,
          status: JourneyStatus.ACTIVE,
        }),
      ]);

    // Build byStatus map
    const byStatus: Record<string, number> = {
      active: 0,
      completed: 0,
      cancelled: 0,
      offer_declined: 0,
      request_declined: 0,
      no_customer_action: 0,
    };
    for (const row of statusAgg) {
      byStatus[row._id as string] = row.count as number;
    }
    const total = Object.values(byStatus).reduce((s, n) => s + n, 0);

    // Build byStep map (for funnel)
    const byStep: Record<string, number> = {};
    for (const row of stepAgg) {
      byStep[row._id as string] = row.count as number;
    }

    // Build byCurrentStep map (active journeys at each step right now)
    const byCurrentStep: Record<string, number> = {};
    for (const row of currentStepAgg) {
      byCurrentStep[row._id as string] = row.count as number;
    }

    const totalRevenue = (revenueAgg[0]?.total as number) ?? 0;

    const totalRevisedOfferEmails =
      (revisedOfferSendsSum[0]?.total as number) ?? 0;

    // Acceptance rate
    const offersSent     = byStep['offer-ready']    ?? 0;
    const paymentsIssued = byStep['payment-sent']   ?? 0;
    const acceptanceRate = offersSent > 0 ? Math.round((paymentsIssued / offersSent) * 100) : 0;

    return createResponse(
      {
        total,
        byStatus,
        byStep,
        byCurrentStep,
        totalRevenue,
        acceptanceRate,
        revisedOfferJourneys,
        totalRevisedOfferEmails,
        journeysClosedByReship: reshipClosed,
        reminderDueCount,
        recentJourneys: recentDocs,
        recentActions,
      },
      'Stats fetched',
    );
  }

  // ── Staff notifications (bell): customer journey actions + read cursor ──────

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
      actionType: { $in: STAFF_ALERT_ACTION_TYPES },
    };

    const [rows, unreadCount] = await Promise.all([
      this.journeyActionModel.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $limit: 40 },
        {
          $lookup: {
            from: 'sell_request_journeys',
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
            actionType: 1,
            step: 1,
            requestId: 1,
            journeyId: 1,
            createdAt: 1,
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
      return {
        _id: String(r._id),
        actionType: r.actionType as JourneyActionType,
        step: r.step as string,
        requestId: r.requestId as string,
        journeyId: String(r.journeyId),
        customerName: r.customerName as string,
        createdAt: createdIso,
        unread: created.getTime() > lastReadMs,
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
        // $max ensures the cursor only moves forward — clicking an older notification
        // never rolls back lastReadAt and un-reads newer items.
        $max: { lastReadAt: at },
        $setOnInsert: { userId: uid, workspaceId: wid },
      },
      { upsert: true },
    );

    return createResponse({ lastReadAt: at.toISOString() }, 'Marked as read');
  }

  // ── Reminder emails ────────────────────────────────────────────────────────

  /**
   * Sends a reminder email for a given journey step.
   * Uses the existing branding / template pipeline but adds an amber reminder
   * banner at the top. Reuses current action-token generation numbers so the
   * same accept / decline links remain valid.
   *
   * Called exclusively by the scheduler — no JwtPayload needed because the
   * email is sent as a system action, not on behalf of a staff user.
   */
  async sendReminderEmail(
    journey: SellRequestJourneyDocument,
    reminderType: 'request-received' | 'offer-ready' | 'pickup-scheduled',
    reminderNumber: 1 | 2 | 3 = 1,
  ): Promise<void> {
    const reminderKey = `${reminderType}-reminder` as const;

    const mergedData: Record<string, unknown> = {
      ...(journey.dynamicData as Record<string, unknown>),
      requestId:    journey.requestId,
      customerName: journey.customerName,
      currency:     journey.currency,
      isReminder:     'true',
      reminderType,
      reminderNumber: String(reminderNumber),
      reminderTotal:  reminderType === 'request-received' ? '1' : '3',
    };

    // Inject action URLs using the CURRENT (not next) generation so existing
    // links still work alongside the new reminder links.
    const ctx = this.toPreviewContext(journey);
    if (reminderType === 'request-received') {
      const gen = journey.requestAckGeneration ?? 1;
      this.injectActionUrls(ctx, 'request-received', mergedData, { requestAckGen: gen });
    } else if (reminderType === 'offer-ready') {
      const gen = journey.offerGeneration ?? 1;
      this.injectActionUrls(ctx, 'offer-ready', mergedData, { offerGen: gen });
    } else {
      this.injectActionUrls(ctx, 'pickup-scheduled', mergedData);
    }

    // Look up the reminder template from DB to allow staff to customise the
    // subject line from the template settings page. Fall back to a sensible
    // default if no published template exists yet.
    let templateId: Types.ObjectId | null = null;
    let subject = `Reminder — ${journey.requestId}`;
    try {
      const fakeUser = {
        workspaceId: journey.workspaceId.toString(),
        sub: 'scheduler',
      } as unknown as import('../auth/interfaces/jwt-payload.interface').JwtPayload;

      const tmpl = await this.sellTemplatesService.ensurePublishedTemplate(reminderKey, fakeUser);
      const rawSubject = tmpl.subject ?? subject;
      subject = interpolateSellTemplateVars(rawSubject, mergedData);
      templateId = (tmpl._id as Types.ObjectId) ?? null;
    } catch {
      // Template doesn't exist yet — use fallback subject
      const fallbacks: Record<string, string> = {
        'request-received': `Reminder: Please confirm your sell request — #${journey.requestId}`,
        'offer-ready':      `Reminder: Your offer is waiting — #${journey.requestId}`,
        'pickup-scheduled': `Reminder: Your pickup is coming up — #${journey.requestId}`,
      };
      subject = fallbacks[reminderType] ?? subject;
    }

    // Create a delivery log (attribute to journey owner; scheduler has no staff session)
    const log = await this.logModel.create({
      workspaceId:        journey.workspaceId,
      templateId,
      workflowKey:        reminderKey,
      recipientEmail:     journey.customerEmail,
      requestId:          journey.requestId,
      subject,
      status:             DeliveryStatus.QUEUED,
      createdBy:          new Types.ObjectId(String(journey.createdBy)),
      dynamicFieldValues: mergedData,
    });

    const payload: SellEmailJobPayload = {
      workspaceId:        journey.workspaceId.toString(),
      workflowKey:        reminderKey,
      recipientEmail:     journey.customerEmail,
      subject,
      dynamicFieldValues: mergedData,
      templateId:         null,
      triggeredBy:        'scheduler',
      deliveryLogId:      (log._id as Types.ObjectId).toString(),
    };

    await this.sendDirectFallback(payload, (log._id as Types.ObjectId).toString());
  }

  // ── Staff notes ────────────────────────────────────────────────────────────

  async addStaffNote(id: string, text: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);

    const note = {
      text:      text.trim().slice(0, 2000),
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

    const notes: unknown[] = ((journey as unknown as Record<string, unknown>)['staffNotes'] as unknown[]) ?? [];
    if (noteIndex < 0 || noteIndex >= notes.length) {
      throw new BadRequestException('Note index out of range');
    }

    // Remove by index using $unset + $pull pattern
    const updated = notes.filter((_, i) => i !== noteIndex);
    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(journeyId) },
      { $set: { staffNotes: updated } },
    );

    return createResponse(null, 'Note deleted');
  }

  // ── Journey analytics ──────────────────────────────────────────────────────

  async getJourneyAnalytics(user: JwtPayload) {
    const wid = new Types.ObjectId(user.workspaceId);
    const now = new Date();

    // Time window boundaries
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const thirtyDaysAgo   = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29); thirtyDaysAgo.setHours(0, 0, 0, 0);
    const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const STEP_LABELS: Record<string, string> = {
      'request-received':    'Request Received',
      'pickup-scheduled':    'Pickup Scheduled',
      'inspection-underway': 'Inspection Underway',
      'offer-ready':         'Offer Ready',
      'payment-sent':        'Payment Sent',
      'completed':           'Completed',
    };

    const [
      monthlyRaw, dailyRaw, funnelRaw, actionRaw,
      revenueRaw, completionTimeRaw,
      thisMonthCount, lastMonthCount, totalCount,
    ] = await Promise.all([

      // Monthly: new requests + completions + revenue (last 12 months)
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, createdAt: { $gte: twelveMonthsAgo } } },
        { $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          requests:      { $sum: 1 },
          completions:   { $sum: { $cond: [{ $eq: ['$status', JourneyStatus.COMPLETED] }, 1, 0] } },
          revenue:       { $sum: { $toDouble: { $ifNull: ['$dynamicData.paidAmount', 0] } } },
          cancellations: { $sum: { $cond: [{ $in: ['$status', [JourneyStatus.CANCELLED, JourneyStatus.OFFER_DECLINED, JourneyStatus.REQUEST_DECLINED]] }, 1, 0] } },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // Daily: new requests last 30 days
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
          requests: { $sum: 1 },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),

      // Funnel: completed steps across all journeys
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid } },
        { $unwind: '$completedSteps' },
        { $group: { _id: '$completedSteps', count: { $sum: 1 } } },
      ]),

      // Customer action counts
      this.journeyActionModel.aggregate([
        { $match: { workspaceId: wid } },
        { $group: { _id: '$actionType', count: { $sum: 1 } } },
      ]),

      // Revenue split by currency (completed journeys only)
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, status: JourneyStatus.COMPLETED } },
        { $group: {
          _id:   '$currency',
          total: { $sum: { $toDouble: { $ifNull: ['$dynamicData.paidAmount', 0] } } },
          count: { $sum: 1 },
        }},
        { $sort: { total: -1 } },
      ]),

      // Avg journey duration for completed (createdAt → updatedAt as proxy)
      this.journeyModel.aggregate([
        { $match: { workspaceId: wid, status: JourneyStatus.COMPLETED } },
        { $project: { durationHours: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 3_600_000] } } },
        { $group: { _id: null, avg: { $avg: '$durationHours' }, min: { $min: '$durationHours' }, max: { $max: '$durationHours' } } },
      ]),

      this.journeyModel.countDocuments({ workspaceId: wid, createdAt: { $gte: startOfMonth } }),
      this.journeyModel.countDocuments({ workspaceId: wid, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
      this.journeyModel.countDocuments({ workspaceId: wid }),
    ]);

    // ── Build monthly trend (fill gaps) ────────────────────────────────────
    type MonthEntry = { requests: number; completions: number; revenue: number; cancellations: number };
    const monthMap = new Map<string, MonthEntry>();
    for (const r of monthlyRaw) {
      const key = `${r._id.year as number}-${String(r._id.month as number).padStart(2, '0')}`;
      monthMap.set(key, { requests: r.requests as number, completions: r.completions as number, revenue: r.revenue as number, cancellations: r.cancellations as number });
    }
    const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
      const d   = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lbl = formatMonthYY(d);
      return { month: lbl, ...(monthMap.get(key) ?? { requests: 0, completions: 0, revenue: 0, cancellations: 0 }) };
    });

    // ── Build daily trend (fill gaps) ───────────────────────────────────────
    const dayMap = new Map<string, number>();
    for (const r of dailyRaw) {
      const key = `${r._id.year as number}-${String(r._id.month as number).padStart(2, '0')}-${String(r._id.day as number).padStart(2, '0')}`;
      dayMap.set(key, r.requests as number);
    }
    const dailyTrend = Array.from({ length: 30 }, (_, i) => {
      const d   = new Date(now); d.setDate(d.getDate() - (29 - i)); d.setHours(0, 0, 0, 0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const lbl = formatDateDDMMYY(d);
      return { date: key, day: lbl, requests: dayMap.get(key) ?? 0 };
    });

    // ── Build funnel ─────────────────────────────────────────────────────────
    const funnelMap = new Map<string, number>();
    for (const r of funnelRaw) funnelMap.set(r._id as string, r.count as number);

    const FUNNEL_STEPS = ['request-received', 'pickup-scheduled', 'inspection-underway', 'offer-ready', 'payment-sent', 'completed'] as const;
    const funnel = FUNNEL_STEPS.map((step, i) => {
      const count    = i === 0 ? (funnelMap.get(step) ?? totalCount) : (funnelMap.get(step) ?? 0);
      const prevCount = i === 0 ? totalCount : (funnelMap.get(FUNNEL_STEPS[i - 1]) ?? totalCount);
      return {
        step,
        label:          STEP_LABELS[step] ?? step,
        count,
        dropOffRate:    i === 0 || prevCount === 0 ? 0 : Math.round(((prevCount - count) / prevCount) * 100),
        conversionRate: totalCount === 0 ? 0 : Math.round((count / totalCount) * 100),
      };
    });

    // ── Action counts ────────────────────────────────────────────────────────
    const actionCounts: Record<string, number> = {};
    for (const r of actionRaw) actionCounts[r._id as string] = r.count as number;

    // ── Revenue by currency ──────────────────────────────────────────────────
    const revenueByCurrency = revenueRaw.map((r) => ({
      currency: r._id as string,
      total:    Math.round((r.total as number) * 100) / 100,
      count:    r.count as number,
      avg:      r.count > 0 ? Math.round((r.total as number) / (r.count as number)) : 0,
    }));

    const growthRate = lastMonthCount > 0
      ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
      : null;

    return createResponse({
      totalJourneys:      totalCount,
      thisMonthJourneys:  thisMonthCount,
      lastMonthJourneys:  lastMonthCount,
      growthRate,
      monthlyTrend,
      dailyTrend,
      funnel,
      actionCounts,
      revenueByCurrency,
      avgCompletionHours: completionTimeRaw[0]
        ? { avg: Math.round((completionTimeRaw[0].avg as number) * 10) / 10, min: Math.round(completionTimeRaw[0].min as number), max: Math.round(completionTimeRaw[0].max as number) }
        : null,
    }, 'Analytics fetched');
  }

  // ── Get journey detail ─────────────────────────────────────────────────────

  async findOne(id: string, user: JwtPayload) {
    const journey = await this.journeyModel
      .findById(id)
      .lean();

    this.assertOwnership(journey, id, user);
    return createResponse(journey, 'Journey fetched');
  }

  // ── Get journey by requestId ───────────────────────────────────────────────

  async findByRequestId(requestId: string, user: JwtPayload) {
    const journey = await this.journeyModel
      .findOne({ workspaceId: new Types.ObjectId(user.workspaceId), requestId })
      .lean();

    if (!journey) throw new NotFoundException(`Journey ${requestId} not found`);
    return createResponse(journey, 'Journey fetched');
  }

  // ── Send next pending step ─────────────────────────────────────────────────

  async sendNext(id: string, dto: SendJourneyStepDto, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id);
    this.assertOwnership(journey?.toJSON() ?? null, id, user);

    if (!journey) throw new NotFoundException(`Journey ${id} not found`);
    if (journey.status === JourneyStatus.COMPLETED) {
      throw new BadRequestException('All steps are already completed for this journey');
    }

    const nextStep = this.getNextStep(journey.completedSteps);
    if (!nextStep) {
      throw new BadRequestException('All steps already completed');
    }

    return this.dispatchStep(journey, nextStep, dto, user, false);
  }

  // ── Send specific step ─────────────────────────────────────────────────────

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
    if ((EXTRA_SELL_WORKFLOW_KEYS as readonly string[]).includes(step)) {
      throw new BadRequestException(
        'This step uses a dedicated endpoint (e.g. POST .../device-reship).',
      );
    }

    const stepIndex = JOURNEY_WORKFLOW_STEPS.indexOf(step as any);
    const nextIndex = this.getNextStepIndex(journey.completedSteps);

    // Allow sending current step or future steps (with gap warning), but not past
    const alreadySent = journey.sentSteps.some((s) => s.stepKey === step);
    if (alreadySent) {
      throw new ConflictException(
        `Step "${step}" was already sent. Use /resend/:step to resend it.`,
      );
    }

    // Enforce sequential ordering — cannot skip ahead more than 1
    if (stepIndex > nextIndex) {
      throw new BadRequestException(
        `Cannot send "${step}" before completing "${JOURNEY_WORKFLOW_STEPS[nextIndex]}".`,
      );
    }

    return this.dispatchStep(journey, step, dto, user, false);
  }

  // ── Explicit resend ────────────────────────────────────────────────────────

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
    if ((EXTRA_SELL_WORKFLOW_KEYS as readonly string[]).includes(step)) {
      throw new BadRequestException(
        'This email type cannot be resent from Resend. Send a new device-reship from the journey actions panel if needed.',
      );
    }

    const alreadySent = journey.sentSteps.some((s) => s.stepKey === step);
    if (!alreadySent) {
      throw new BadRequestException(
        `Step "${step}" has not been sent yet. Use /send-step/${step} to send it.`,
      );
    }

    return this.dispatchStep(journey, step, dto, user, true);
  }

  /**
   * Render the exact HTML that would be sent for a step (no queue, no delivery log).
   * Same merge + branding pipeline as dispatch / worker.
   */
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
    const stepIndex = JOURNEY_WORKFLOW_STEPS.indexOf(step as (typeof JOURNEY_WORKFLOW_STEPS)[number]);
    const alreadySent = journey.sentSteps.some((s) => s.stepKey === step);

    if (!alreadySent) {
      const nextIndex = this.getNextStepIndex(journey.completedSteps);
      if (stepIndex > nextIndex) {
        throw new BadRequestException(
          `Cannot preview "${step}" before completing "${JOURNEY_WORKFLOW_STEPS[nextIndex]}".`,
        );
      }
    }

    const { subject, html } = await this.renderJourneyStepHtml(
      journey,
      step,
      dto,
      user,
    );
    return createResponse({ html, subject, stepKey: step }, 'Preview ready');
  }

  /**
   * Preview step HTML before a journey exists (New SELL Request modal).
   * Uses the same `renderSellEmailHtml` pipeline as journey step preview.
   */
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
    const ctx: JourneyPreviewContext = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(user.workspaceId),
      requestId: dto.requestId?.trim() || 'PREVIEW',
      customerName: dto.customerName.trim(),
      currency: (dto.currency ?? 'AED').trim() || 'AED',
      dynamicData: dto.dynamicData ?? {},
      completedSteps: [],
      requestAckGeneration: 0,
    };
    const { html, subject } = await this.renderJourneyStepHtmlForContext(
      ctx,
      dto.step,
      stepDto,
      user,
    );
    return createResponse(
      { html, subject, stepKey: dto.step },
      'Preview ready',
    );
  }

  private assertCustomerAcceptedCurrentOffer(journey: {
    offerGeneration?: number;
    completedSteps?: string[];
    dynamicData?: Record<string, unknown>;
  }): void {
    const stored = journey.offerGeneration;
    const gen =
      typeof stored === 'number' && stored > 0
        ? stored
        : journey.completedSteps?.includes('offer-ready')
          ? 1
          : 0;
    const dd = journey.dynamicData ?? {};
    if (dd['offerAcceptedByCustomer'] !== true) {
      throw new BadRequestException(
        'Customer must accept the current offer (from the latest email) before payment can be sent.',
      );
    }
    const ag = dd['offerAcceptedGeneration'];
    if (typeof ag === 'number' && ag > 0) {
      if (ag !== gen) {
        throw new BadRequestException(
          'Customer must accept the latest offer round before payment can be sent.',
        );
      }
      return;
    }
    // Legacy: acceptance stored without generation — only allow on single-round journeys
    if (gen > 1) {
      throw new BadRequestException(
        'Customer must accept the latest offer round before payment can be sent.',
      );
    }
  }

  private assertCustomerAcknowledgedRequest(journey: {
    requestAckGeneration?: number;
    completedSteps?: string[];
    dynamicData?: Record<string, unknown>;
  }): void {
    if (!journey.completedSteps?.includes('request-received')) {
      return;
    }
    const gen =
      typeof journey.requestAckGeneration === 'number'
        ? journey.requestAckGeneration
        : 0;
    // Legacy journeys: requestAckGeneration was never set (0) — pickup allowed without customer link.
    if (gen <= 0) {
      return;
    }
    const dd = journey.dynamicData ?? {};
    if (dd['requestAckByCustomer'] !== true) {
      throw new BadRequestException(
        'Customer must tap Schedule pickup on the latest Request Received email before you can schedule pickup.',
      );
    }
    const ag = dd['requestAckAcceptedGen'];
    if (typeof ag === 'number' && ag > 0 && ag !== gen) {
      throw new BadRequestException(
        'Customer must confirm using the latest Request Received email (resend if you sent a new one).',
      );
    }
    if (dd['requestAckDeclined'] === true) {
      throw new BadRequestException(
        'Customer declined the request confirmation. Resend Request Received or cancel the journey.',
      );
    }
  }

  // ── Core dispatch logic ────────────────────────────────────────────────────

  private async dispatchStep(
    journey: SellRequestJourneyDocument,
    stepKey: string,
    dto: SendJourneyStepDto,
    user: JwtPayload,
    isResend: boolean,
  ) {
    if (stepKey === 'payment-sent') {
      this.assertCustomerAcceptedCurrentOffer(
        journey.toObject() as {
          offerGeneration?: number;
          completedSteps?: string[];
          dynamicData?: Record<string, unknown>;
        },
      );
    }

    if (stepKey === 'pickup-scheduled') {
      this.assertCustomerAcknowledgedRequest(
        journey.toObject() as {
          requestAckGeneration?: number;
          completedSteps?: string[];
          dynamicData?: Record<string, unknown>;
        },
      );
    }

    const template = await this.sellTemplatesService.ensurePublishedTemplate(
      stepKey,
      user,
    );

    // Merge journey dynamic data with any step-level overrides
    const mergedData: Record<string, unknown> = {
      ...journey.dynamicData,
      ...(dto.dynamicData ?? {}),
      requestId:    journey.requestId,
      customerName: journey.customerName,
      currency:     journey.currency,
    };

    mergedData.customMessage = resolveStepCustomMessage(
      journey.dynamicData as Record<string, unknown>,
      dto.dynamicData,
      stepKey,
    );

    // Format price fields using currency
    if (mergedData['amount'] || mergedData['price'] || mergedData['offerAmount']) {
      const amt = mergedData['amount'] ?? mergedData['price'] ?? mergedData['offerAmount'];
      mergedData['formattedAmount'] = formatCurrency(amt as number, journey.currency);
    }

    const offerGenForTokens =
      stepKey === 'offer-ready'
        ? this.nextOfferGenerationNumber(journey)
        : undefined;
    const requestAckGenForTokens =
      stepKey === 'request-received'
        ? this.nextRequestAckGenerationNumber(journey)
        : undefined;

    const urlOpts =
      offerGenForTokens != null
        ? { offerGen: offerGenForTokens }
        : requestAckGenForTokens != null
          ? { requestAckGen: requestAckGenForTokens }
          : undefined;

    this.injectActionUrls(
      this.toPreviewContext(journey),
      stepKey,
      mergedData,
      urlOpts,
    );

    const subjectRaw =
      dto.subjectOverride ??
      template.subject ??
      `Update — ${journey.requestId}`;
    const subject = interpolateSellTemplateVars(subjectRaw, mergedData);

    // Create delivery log
    const log = await this.logModel.create({
      workspaceId:       journey.workspaceId,
      templateId:        template._id,
      workflowKey:       stepKey,
      recipientEmail:    journey.customerEmail,
      requestId:         journey.requestId,
      subject,
      status:            DeliveryStatus.QUEUED,
      createdBy:         new Types.ObjectId(user.sub),
      dynamicFieldValues: mergedData,
    });

    // Include journey attachments in email payload
    const journeyAttachments = (journey.attachments ?? []).map((a) => ({
      storedFilename: a.storedFilename,
      originalName:   a.originalName,
      mimeType:       a.mimeType,
      url:            a.url,
    }));

    // Enqueue the email job — with direct-send fallback if Redis is unavailable
    const payload: SellEmailJobPayload = {
      workspaceId:        journey.workspaceId.toString(),
      workflowKey:        stepKey,
      recipientEmail:     journey.customerEmail,
      subject,
      dynamicFieldValues: mergedData,
      templateId:         (template._id as Types.ObjectId).toString(),
      triggeredBy:        user.sub,
      deliveryLogId:      (log._id as Types.ObjectId).toString(),
      attachments:        journeyAttachments,
      customSignoffName:   dto.customSignoffName,
      customFooterNote:    dto.customFooterNote,
      customGreetingText:  dto.customGreetingText,
      customHeadingColor:  dto.customHeadingColor,
      customBodyTextColor: dto.customBodyTextColor,
      customButtonLabel:   dto.customButtonLabel,
    };

    /** BullMQ + Redis. Omit or `false` = always direct SMTP (no queue). `true` = queue first, fallback on failure. */
    const useBullQueue = process.env.SELL_USE_BULL_QUEUE === 'true';

    let sentViaQueue = false;
    if (!useBullQueue) {
      this.logger.log(
        `[Journey ${journey.requestId}] Sending step "${stepKey}" via direct SMTP → ${journey.customerEmail}`,
      );
      await this.sendDirectFallback(payload, log._id.toString());
    } else {
      if (!this.queue) {
        throw new ServiceUnavailableException(
          'Bull queue is not enabled. Set SELL_USE_BULL_QUEUE=true, start Redis, then restart the server.',
        );
      }
      try {
        await this.queue.add(SELL_EMAIL_JOB, payload, {
          jobId: `journey-${log._id.toString()}`,
        });
        sentViaQueue = true;
      } catch (queueErr) {
        this.logger.warn(
          `[Journey ${journey.requestId}] BullMQ unavailable — falling back to direct send: ${(queueErr as Error).message}`,
        );
        await this.sendDirectFallback(payload, log._id.toString());
      }
    }

    // Update journey document
    const finalStatus = sentViaQueue ? DeliveryStatus.QUEUED : DeliveryStatus.SENT;
    const sentStep = {
      stepKey,
      sentAt:         new Date(),
      deliveryLogId:  (log._id as Types.ObjectId).toString(),
      deliveryStatus: finalStatus,
      subject,
    };

    if (isResend) {
      const resendSet: Record<string, unknown> = {
        'sentSteps.$.sentAt': sentStep.sentAt,
        'sentSteps.$.deliveryLogId': sentStep.deliveryLogId,
        'sentSteps.$.deliveryStatus': sentStep.deliveryStatus,
      };
      if (stepKey === 'offer-ready' && offerGenForTokens != null) {
        Object.assign(resendSet, {
          offerGeneration: offerGenForTokens,
          status: JourneyStatus.ACTIVE,
          currentStep: 'offer-ready',
          'dynamicData.offerAcceptedByCustomer': false,
        });
      }
      if (stepKey === 'request-received' && requestAckGenForTokens != null) {
        Object.assign(resendSet, {
          requestAckGeneration: requestAckGenForTokens,
          status: JourneyStatus.ACTIVE,
          currentStep: 'request-received',
          'dynamicData.requestAckByCustomer': false,
          'dynamicData.requestAckDeclined': false,
        });
      }
      const resendUpdate: Record<string, unknown> = { $set: resendSet };
      if (stepKey === 'offer-ready' && offerGenForTokens != null) {
        resendUpdate.$unset = {
          'dynamicData.offerAcceptedAt': '',
          'dynamicData.offerAcceptedGeneration': '',
        };
        resendUpdate.$push = {
          'dynamicData.offerRoundHistory': {
            generation: offerGenForTokens,
            at: new Date().toISOString(),
            kind: 'email_sent',
            deliveryLogId: (log._id as Types.ObjectId).toString(),
          },
        };
      }
      if (stepKey === 'request-received' && requestAckGenForTokens != null) {
        resendUpdate.$unset = {
          ...(resendUpdate.$unset as Record<string, string> | undefined),
          'dynamicData.requestAckAcceptedGen': '',
          'dynamicData.requestAckAcceptedAt': '',
          'dynamicData.requestAckDeclinedGen': '',
          'dynamicData.requestAckDeclinedAt': '',
        };
      }
      await this.journeyModel.updateOne(
        { _id: journey._id, 'sentSteps.stepKey': stepKey },
        resendUpdate,
      );
    } else {
      const newCompleted = [...journey.completedSteps];
      if (!newCompleted.includes(stepKey)) newCompleted.push(stepKey);

      const nextStep = this.getNextStep(newCompleted);
      const newStatus =
        newCompleted.length === JOURNEY_WORKFLOW_STEPS.length
          ? JourneyStatus.COMPLETED
          : JourneyStatus.ACTIVE;

      const firstSendOfferPatch =
        stepKey === 'offer-ready' && offerGenForTokens != null
          ? { offerGeneration: offerGenForTokens }
          : {};
      const firstSendRequestAckPatch =
        stepKey === 'request-received' && requestAckGenForTokens != null
          ? { requestAckGeneration: requestAckGenForTokens }
          : {};

      const newCurrentStep =
        stepKey === 'offer-ready' ? 'offer-ready' : (nextStep ?? stepKey);

      const pushPayload: Record<string, unknown> = { sentSteps: sentStep };
      if (stepKey === 'offer-ready' && offerGenForTokens != null) {
        pushPayload['dynamicData.offerRoundHistory'] = {
          generation: offerGenForTokens,
          at: new Date().toISOString(),
          kind: 'email_sent',
          deliveryLogId: (log._id as Types.ObjectId).toString(),
        };
      }

      await this.journeyModel.updateOne(
        { _id: journey._id },
        {
          $push: pushPayload,
          $set: {
            completedSteps: newCompleted,
            currentStep: newCurrentStep,
            status: newStatus,
            ...firstSendOfferPatch,
            ...firstSendRequestAckPatch,
          },
        },
      );
    }

    this.logger.log(
      `[Journey ${journey.requestId}] Step "${stepKey}" ${isResend ? 'resent' : 'sent'} → ${journey.customerEmail}`,
    );

    return createResponse(
      {
        journeyId:     journey._id,
        requestId:     journey.requestId,
        stepKey,
        deliveryLogId: (log._id as Types.ObjectId).toString(),
        status:        sentViaQueue ? DeliveryStatus.QUEUED : DeliveryStatus.SENT,
        deliveredVia:  sentViaQueue ? 'queue' : 'direct',
        isResend,
      },
      isResend ? `Step "${stepKey}" resent` : `Step "${stepKey}" sent`,
    );
  }

  /** Build subject + HTML for a journey step (preview — mirrors worker / direct send). */
  private async renderJourneyStepHtml(
    journey: SellRequestJourneyDocument,
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
    ctx: JourneyPreviewContext,
    stepKey: string,
    dto: SendJourneyStepDto,
    user: JwtPayload,
  ): Promise<{ subject: string; html: string }> {
    const template = await this.sellTemplatesService.ensurePublishedTemplate(
      stepKey,
      user,
    );

    const mergedData: Record<string, unknown> = {
      ...(ctx.dynamicData ?? {}),
      ...(dto.dynamicData ?? {}),
      requestId:    ctx.requestId,
      customerName: ctx.customerName,
      currency:     ctx.currency,
    };

    mergedData.customMessage = resolveStepCustomMessage(
      ctx.dynamicData,
      dto.dynamicData,
      stepKey,
    );

    if (mergedData['amount'] || mergedData['price'] || mergedData['offerAmount']) {
      const amt =
        mergedData['amount'] ??
        mergedData['price'] ??
        mergedData['offerAmount'];
      mergedData['formattedAmount'] = formatCurrency(
        amt as number,
        ctx.currency,
      );
    }

    this.injectActionUrls(
      ctx,
      stepKey,
      mergedData,
      stepKey === 'offer-ready'
        ? { offerGen: this.nextOfferGenerationNumber(ctx) }
        : stepKey === 'request-received'
          ? { requestAckGen: this.nextRequestAckGenerationNumber(ctx) }
          : undefined,
    );

    const subjectRaw =
      dto.subjectOverride ??
      template.subject ??
      `Update — ${ctx.requestId}`;
    const subject = interpolateSellTemplateVars(subjectRaw, mergedData);

    const [workspace, branding] = await Promise.all([
      this.workspaceModel
        .findById(ctx.workspaceId)
        .select('name')
        .lean(),
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
    const { iconSrcs: socialIconSrcs } = await prepareSocialIconsForEmail('preview');
    const designTokens = brandingToDesignTokens(b);

    const footerOpts = {
      teamDisplayName:   (b?.teamDisplayName as string) || '',
      companyAddress:    (b?.footerAddress as string) || '',
      supportPhone:      (b?.supportPhone as string) || '',
      privacyPolicyUrl:  (b?.privacyPolicyUrl as string) || '',
      termsOfServiceUrl: (b?.termsOfServiceUrl as string) || '',
      supportUrl:        (b?.supportUrl as string) || '',
      website:           (b?.website as string) || '',
      socialLinks:       (b?.socialLinks as Record<string, string>) || {},
    };

    const perEmailOverrides = {
      customSignoffName:   dto.customSignoffName,
      customFooterNote:    dto.customFooterNote,
      customGreetingText:  dto.customGreetingText,
      customHeadingColor:  dto.customHeadingColor,
      customBodyTextColor: dto.customBodyTextColor,
      customButtonLabel:   dto.customButtonLabel,
    };

    const html = renderSellEmailHtml(stepKey, mergedData, {
      workspaceName,
      logoUrl,
      mascotSrc,
      socialIconSrcs,
      subject,
      designTokens,
      footer:           footerOpts,
      perEmailOverrides,
      compliance: {
        unsubscribeUrl:       (b?.unsubscribeUrl as string) || (b?.supportUrl as string) || '',
        workspaceName,
        customComplianceText: (b?.complianceText as string) || '',
        complianceBgColor:    (b?.complianceBgColor as string) || '#f8fafc',
        complianceTextColor:  (b?.complianceTextColor as string) || '#94a3b8',
      },
    });

    return { subject, html };
  }

  // ── Direct-send fallback (used when Redis/BullMQ is unavailable) ──────────

  private async sendDirectFallback(
    payload: SellEmailJobPayload,
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
      const designTokens  = brandingToDesignTokens(b);

      const footerOpts = {
        teamDisplayName:   (b?.teamDisplayName   as string) || '',
        companyAddress:    (b?.footerAddress      as string) || '',
        supportPhone:      (b?.supportPhone       as string) || '',
        privacyPolicyUrl:  (b?.privacyPolicyUrl   as string) || '',
        termsOfServiceUrl: (b?.termsOfServiceUrl  as string) || '',
        supportUrl:        (b?.supportUrl         as string) || '',
        website:           (b?.website            as string) || '',
        socialLinks:       (b?.socialLinks        as Record<string, string>) || {},
      };

      const perEmailOverrides = {
        customSignoffName:   payload.customSignoffName,
        customFooterNote:    payload.customFooterNote,
        customGreetingText:  payload.customGreetingText,
        customHeadingColor:  payload.customHeadingColor,
        customBodyTextColor: payload.customBodyTextColor,
        customButtonLabel:   payload.customButtonLabel,
      };

      const html = renderSellEmailHtml(
        payload.workflowKey,
        payload.dynamicFieldValues ?? {},
        {
          workspaceName,
          logoUrl,
          mascotSrc,
          socialIconSrcs,
          subject:          payload.subject,
          designTokens,
          footer:           footerOpts,
          perEmailOverrides,
          compliance: {
            unsubscribeUrl:       (b?.supportUrl         as string) || '',
            workspaceName,
            customComplianceText: (b?.complianceText     as string) || '',
            complianceBgColor:    (b?.complianceBgColor  as string) || '#f8fafc',
            complianceTextColor:  (b?.complianceTextColor as string) || '#94a3b8',
          },
        },
      );

      const emailAttachments = (payload.attachments ?? []).map((a) => ({
        filename: a.originalName,
        storedPath: path.join(SELL_ATTACHMENTS_DIR, a.storedFilename),
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

  // ── Cancel journey ─────────────────────────────────────────────────────────

  async cancel(id: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);

    if (journey!.status === JourneyStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed journey');
    }
    if (journey!.status === JourneyStatus.CANCELLED) {
      throw new BadRequestException('Journey is already cancelled');
    }

    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { status: JourneyStatus.CANCELLED } },
    );

    this.logger.log(`Journey ${journey!.requestId} cancelled by ${user.sub}`);
    return createResponse({ id, status: JourneyStatus.CANCELLED }, 'Journey cancelled');
  }

  // ── Mark offer declined ────────────────────────────────────────────────────

  async markOfferDeclined(id: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);

    if (!journey!.completedSteps.includes('offer-ready')) {
      throw new BadRequestException('Offer has not been sent yet');
    }
    if ([JourneyStatus.CANCELLED, JourneyStatus.COMPLETED].includes(journey!.status as JourneyStatus)) {
      throw new BadRequestException(`Cannot decline offer on a ${journey!.status} journey`);
    }

    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          status: JourneyStatus.OFFER_DECLINED,
          currentStep: 'offer-ready',
          'dynamicData.offerAcceptedByCustomer': false,
        },
        $unset: {
          'dynamicData.offerAcceptedAt': '',
          'dynamicData.offerAcceptedGeneration': '',
        },
      },
    );

    this.logger.log(`Journey ${journey!.requestId} offer declined by ${user.sub}`);
    return createResponse({ id, status: JourneyStatus.OFFER_DECLINED }, 'Offer marked as declined');
  }

  // ── Device reship (closes journey after email) ────────────────────────────

  async sendDeviceReship(id: string, dto: SendDeviceReshipDto, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id);
    this.assertOwnership(journey?.toJSON() ?? null, id, user);
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);

    const st = journey.status as JourneyStatus;
    if (st !== JourneyStatus.OFFER_DECLINED && st !== JourneyStatus.ACTIVE) {
      throw new BadRequestException(
        'Reship is only available when the journey is active or the offer was declined.',
      );
    }
    if (!journey.completedSteps?.includes('offer-ready')) {
      throw new BadRequestException('Offer must have been sent before sending a reship email.');
    }
    if ((journey.dynamicData as Record<string, unknown>)?.closedByReship === true) {
      throw new BadRequestException('A reship email was already sent for this journey.');
    }

    const courier = dto.courierName.trim();
    const tracking = dto.trackingNumber.trim();
    const staffNote = dto.customMessage?.trim() ?? '';
    let reshipTrackingUrl: string | undefined;
    const rawUrl = dto.trackingUrl?.trim();
    if (rawUrl) {
      try {
        const u = new URL(rawUrl);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          throw new BadRequestException(
            'Tracking link must use http:// or https://',
          );
        }
        reshipTrackingUrl = u.href;
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException('Tracking link must be a valid URL.');
      }
    }
    if (!courier || !tracking) {
      throw new BadRequestException('Courier name and tracking number are required.');
    }

    const stepKey = 'device-reship';
    const template = await this.sellTemplatesService.ensurePublishedTemplate(stepKey, user);

    const mergedData: Record<string, unknown> = {
      ...(journey.dynamicData ?? {}),
      requestId:        journey.requestId,
      customerName:     journey.customerName,
      currency:         journey.currency,
      reshipCourier:    courier,
      reshipTracking:   tracking,
      /** Aliases — custom subjects often use {{courierName}} / {{trackingNumber}} from the API DTO. */
      courierName:      courier,
      trackingNumber:   tracking,
      ...(reshipTrackingUrl ? { reshipTrackingUrl } : {}),
      ...(staffNote ? { reshipMessage: staffNote } : {}),
    };

    this.injectActionUrls(this.toPreviewContext(journey), stepKey, mergedData);

    const subjectRaw = template.subject ?? `Return shipment — #${journey.requestId}`;
    const subject = interpolateSellTemplateVars(subjectRaw, mergedData);

    const log = await this.logModel.create({
      workspaceId:        journey.workspaceId,
      templateId:         template._id,
      workflowKey:        stepKey,
      recipientEmail:     journey.customerEmail,
      requestId:          journey.requestId,
      subject,
      status:             DeliveryStatus.QUEUED,
      createdBy:          new Types.ObjectId(user.sub),
      dynamicFieldValues: mergedData,
    });

    const journeyAttachments = (journey.attachments ?? []).map((a) => ({
      storedFilename: a.storedFilename,
      originalName:   a.originalName,
      mimeType:       a.mimeType,
      url:            a.url,
    }));

    const payload: SellEmailJobPayload = {
      workspaceId:        journey.workspaceId.toString(),
      workflowKey:        stepKey,
      recipientEmail:     journey.customerEmail,
      subject,
      dynamicFieldValues: mergedData,
      templateId:         (template._id as Types.ObjectId).toString(),
      triggeredBy:        user.sub,
      deliveryLogId:      (log._id as Types.ObjectId).toString(),
      attachments:        journeyAttachments,
    };

    const useBullQueue = process.env.SELL_USE_BULL_QUEUE === 'true';
    let sentViaQueue = false;
    if (!useBullQueue) {
      await this.sendDirectFallback(payload, log._id.toString());
    } else {
      if (!this.queue) {
        throw new ServiceUnavailableException(
          'Bull queue is not enabled. Set SELL_USE_BULL_QUEUE=true, start Redis, then restart the server.',
        );
      }
      try {
        await this.queue.add(SELL_EMAIL_JOB, payload, {
          jobId: `journey-${log._id.toString()}`,
        });
        sentViaQueue = true;
      } catch (queueErr) {
        this.logger.warn(
          `[Journey ${journey.requestId}] BullMQ unavailable — direct send: ${(queueErr as Error).message}`,
        );
        await this.sendDirectFallback(payload, log._id.toString());
      }
    }

    const finalStatus = sentViaQueue ? DeliveryStatus.QUEUED : DeliveryStatus.SENT;
    const sentStep = {
      stepKey,
      sentAt:         new Date(),
      deliveryLogId:  (log._id as Types.ObjectId).toString(),
      deliveryStatus: finalStatus,
      subject,
    };

    /** Only steps that were actually sent, in workflow order — never fake payment/completed for reship closes */
    const keysAfterReship = new Set((journey.sentSteps ?? []).map((s) => s.stepKey));
    keysAfterReship.add(stepKey);
    const newCompleted: string[] = [];
    for (const s of JOURNEY_WORKFLOW_STEPS) {
      if (keysAfterReship.has(s)) newCompleted.push(s);
    }
    newCompleted.push(stepKey);

    const reshipDyn = {
      ...(journey.dynamicData ?? {}),
      reshipCourier:     courier,
      reshipTracking:    tracking,
      ...(reshipTrackingUrl ? { reshipTrackingUrl } : {}),
      ...(staffNote ? { reshipMessage: staffNote } : {}),
      reshipSentAt:      new Date().toISOString(),
      closedByReship:    true,
    };

    await this.journeyModel.updateOne(
      { _id: journey._id },
      {
        $push: { sentSteps: sentStep },
        $set: {
          completedSteps: newCompleted,
          currentStep:    stepKey,
          status:         JourneyStatus.COMPLETED,
          dynamicData:    reshipDyn,
        },
      },
    );

    this.logger.log(`[Journey ${journey.requestId}] Device reship email sent — closed`);

    return createResponse(
      {
        journeyId: journey._id,
        requestId: journey.requestId,
        stepKey,
        status:    JourneyStatus.COMPLETED,
      },
      'Reship notification sent. Journey marked complete.',
    );
  }

  // ── Update dynamic data ────────────────────────────────────────────────────

  async updateDynamicData(
    id: string,
    data: Record<string, unknown>,
    user: JwtPayload,
  ) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);

    const prev = (journey!.dynamicData ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...prev, ...data };

    /** Staff PATCH merges shallow keys; never drop server-managed negotiation fields if omitted. */
    const preserveIfOmitted = [
      'offerRoundHistory',
      'offerAcceptedByCustomer',
      'offerAcceptedAt',
      'offerAcceptedGeneration',
    ] as const;
    for (const k of preserveIfOmitted) {
      if (!(k in data) && prev[k] !== undefined) {
        merged[k] = prev[k];
      }
    }

    await this.journeyModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { dynamicData: merged } },
    );

    return createResponse({ id }, 'Journey data updated');
  }

  /**
   * All offer-ready delivery logs for this journey (each outbound offer email, incl. revisions).
   */
  async listOfferEmailDeliveryLogs(id: string, user: JwtPayload) {
    const journey = await this.journeyModel.findById(id).lean();
    this.assertOwnership(journey, id, user);
    if (!journey) throw new NotFoundException(`Journey ${id} not found`);

    const wid = new Types.ObjectId(user.workspaceId);
    const rid = String(journey.requestId ?? '').trim();
    if (!rid) {
      return createResponse({ logs: [] }, 'No offer emails for this journey');
    }

    const logs = await this.logModel
      .find({
        workspaceId: wid,
        requestId:   { $regex: `^${escapeRegexSegment(rid)}$`, $options: 'i' },
        workflowKey: 'offer-ready',
      })
      .sort({ createdAt: 1 })
      .select('_id subject status sentAt createdAt dynamicFieldValues')
      .lean();

    const payload = logs.map((log) => {
      const df = (log.dynamicFieldValues ?? {}) as Record<string, unknown>;
      const rawGen = df['offerGeneration'];
      let offerGeneration: number | null = null;
      if (typeof rawGen === 'number' && rawGen > 0) offerGeneration = rawGen;
      else if (rawGen != null && String(rawGen).trim() !== '') {
        const n = Number(rawGen);
        if (!Number.isNaN(n) && n > 0) offerGeneration = n;
      }
      return {
        id: String(log._id),
        subject: log.subject,
        status: log.status,
        sentAt: log.sentAt ? log.sentAt.toISOString() : null,
        createdAt:
          (log as { createdAt?: Date }).createdAt?.toISOString?.() ??
          new Date().toISOString(),
        offerGeneration,
      };
    });

    return createResponse({ logs: payload }, 'Offer email logs fetched');
  }

  /**
   * Render stored HTML for a delivery log that belongs to this journey (as-sent preview).
   */
  async previewDeliveryLog(
    journeyId: string,
    logId: string,
    user: JwtPayload,
  ) {
    const journey = await this.journeyModel.findById(journeyId).lean();
    this.assertOwnership(journey, journeyId, user);
    if (!journey) throw new NotFoundException(`Journey ${journeyId} not found`);

    const log = await this.logModel.findById(logId).lean();
    if (!log) throw new NotFoundException(`Delivery log ${logId} not found`);
    if (log.workspaceId.toString() !== user.workspaceId) {
      throw new ForbiddenException('Access denied');
    }

    const jRid = String(journey.requestId ?? '').trim().toUpperCase();
    const logRid = String(log.requestId ?? '')
      .trim()
      .toUpperCase();
    const dfRid = String(
      (log.dynamicFieldValues as Record<string, unknown>)?.['requestId'] ?? '',
    )
      .trim()
      .toUpperCase();
    if (
      (!logRid || logRid !== jRid) &&
      (!dfRid || dfRid !== jRid)
    ) {
      throw new BadRequestException(
        'This delivery log does not belong to this journey.',
      );
    }

    const [workspace, branding] = await Promise.all([
      this.workspaceModel
        .findById(journey.workspaceId)
        .select('name')
        .lean(),
      this.brandingService.getRaw(journey.workspaceId.toString()),
    ]);

    const b = branding as unknown as Record<string, unknown> | null;
    const workspaceName =
      (b?.companyName as string) || workspace?.name || 'Rekart';
    const { logoSrc: logoUrl } = await prepareBrandingLogoForEmail(
      (b?.logoUrl as string) || '',
      'preview',
    );
    const { mascotSrc } = await prepareMascotForEmail(log.workflowKey, 'preview');
    const { iconSrcs: socialIconSrcs } = await prepareSocialIconsForEmail('preview');
    const designTokens = brandingToDesignTokens(b);

    const footerOpts = {
      teamDisplayName:   (b?.teamDisplayName as string) || '',
      companyAddress:    (b?.footerAddress as string) || '',
      supportPhone:      (b?.supportPhone as string) || '',
      privacyPolicyUrl:  (b?.privacyPolicyUrl as string) || '',
      termsOfServiceUrl: (b?.termsOfServiceUrl as string) || '',
      supportUrl:        (b?.supportUrl as string) || '',
      website:           (b?.website as string) || '',
      socialLinks:       (b?.socialLinks as Record<string, string>) || {},
    };

    const html = renderSellEmailHtml(log.workflowKey, log.dynamicFieldValues ?? {}, {
      workspaceName,
      logoUrl,
      mascotSrc,
      socialIconSrcs,
      subject: log.subject,
      designTokens,
      footer: footerOpts,
      compliance: {
        unsubscribeUrl:
          (b?.unsubscribeUrl as string) || (b?.supportUrl as string) || '',
        workspaceName,
        customComplianceText: (b?.complianceText as string) || '',
        complianceBgColor:    (b?.complianceBgColor as string) || '#f8fafc',
        complianceTextColor:  (b?.complianceTextColor as string) || '#94a3b8',
      },
    });

    return createResponse(
      {
        html,
        subject: log.subject,
        stepKey: log.workflowKey,
        deliveryLogId: logId,
      },
      'Delivery log preview ready',
    );
  }

  // ── Delete journey ─────────────────────────────────────────────────────────

  async remove(id: string, user: JwtPayload) {
    const journey = await this.journeyModel
      .findById(id)
      .select('workspaceId')
      .lean();

    this.assertOwnership(journey, id, user);
    await this.journeyModel.findByIdAndDelete(id);
    return createResponse(null, 'Journey deleted');
  }

  // ── Action URL injection ───────────────────────────────────────────────────

  private toPreviewContext(doc: SellRequestJourneyDocument): JourneyPreviewContext {
    return {
      _id: doc._id as Types.ObjectId,
      workspaceId: doc.workspaceId as Types.ObjectId,
      requestId: doc.requestId,
      customerName: doc.customerName,
      currency: doc.currency,
      dynamicData: (doc.dynamicData ?? {}) as Record<string, unknown>,
      completedSteps: doc.completedSteps,
      offerGeneration: doc.offerGeneration,
      requestAckGeneration: doc.requestAckGeneration,
    };
  }

  /** Next request-received ack token generation (embed in confirm / decline links). */
  private nextRequestAckGenerationNumber(journey: {
    requestAckGeneration?: number;
  }): number {
    const current =
      typeof journey.requestAckGeneration === 'number'
        ? journey.requestAckGeneration
        : 0;
    return current + 1;
  }

  /** Next offer token generation (embed in accept/decline links). */
  private nextOfferGenerationNumber(journey: {
    offerGeneration?: number;
    completedSteps?: string[];
  }): number {
    let current =
      typeof journey.offerGeneration === 'number' ? journey.offerGeneration : 0;
    if (current === 0 && journey.completedSteps?.includes('offer-ready')) {
      current = 1;
    }
    return current + 1;
  }

  private injectActionUrls(
    ctx: JourneyPreviewContext,
    stepKey: string,
    data: Record<string, unknown>,
    opts?: { offerGen?: number; requestAckGen?: number },
  ): void {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const jid = ctx._id.toString();
    const base = {
      jid,
      rid: ctx.requestId,
      wid: ctx.workspaceId.toString(),
      step: stepKey,
      iat: Math.floor(Date.now() / 1000),
    };

    const buildUrl = (
      actionPath: string,
      action: JourneyActionType,
      offerGen?: number,
      requestAckGen?: number,
    ) => {
      const payload: ActionTokenPayload = { ...base, action };
      if (offerGen != null) payload.offerGen = offerGen;
      if (requestAckGen != null) payload.requestAckGen = requestAckGen;
      return this.actionTokenService.buildUrl(frontendUrl, actionPath, payload);
    };

    switch (stepKey) {
      case 'request-received': {
        const gen =
          opts?.requestAckGen ?? this.nextRequestAckGenerationNumber(ctx);
        data['trackUrl'] = buildUrl('track', JourneyActionType.TRACK_CLICKED);
        data['acceptUrl'] = buildUrl(
          'request/accept',
          JourneyActionType.REQUEST_RECEIVED_ACCEPTED,
          undefined,
          gen,
        );
        data['declineUrl'] = buildUrl(
          'request/decline',
          JourneyActionType.REQUEST_RECEIVED_DECLINED,
          undefined,
          gen,
        );
        data['requestAckGeneration'] = String(gen);
        break;
      }

      case 'pickup-scheduled':
        data['trackUrl']      = buildUrl('track', JourneyActionType.TRACK_CLICKED);
        data['rescheduleUrl'] = buildUrl('reschedule', JourneyActionType.RESCHEDULE_REQUESTED);
        break;

      case 'inspection-underway':
        data['trackUrl'] = buildUrl('track', JourneyActionType.TRACK_CLICKED);
        break;

      case 'offer-ready': {
        const gen = opts?.offerGen ?? this.nextOfferGenerationNumber(ctx);
        data['acceptUrl']  = buildUrl('offer/accept', JourneyActionType.OFFER_ACCEPTED, gen);
        data['declineUrl'] = buildUrl('offer/decline', JourneyActionType.OFFER_DECLINED, gen);
        data['offerGeneration'] = String(gen);
        break;
      }

      case 'payment-sent':
        data['receiptUrl'] = buildUrl('receipt', JourneyActionType.RECEIPT_VIEWED);
        break;

      case 'completed':
        data['reviewUrl']        = buildUrl('rate', JourneyActionType.RATING_SUBMITTED);
        data['rateUrl']          = data['reviewUrl'];
        data['supportActionUrl'] = buildUrl('support', JourneyActionType.SUPPORT_REQUESTED);
        break;

      case 'device-reship':
        break;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getNextStep(completedSteps: string[]): string | null {
    const step = JOURNEY_WORKFLOW_STEPS.find((s) => !completedSteps.includes(s));
    return step ?? null;
  }

  private getNextStepIndex(completedSteps: string[]): number {
    const next = this.getNextStep(completedSteps);
    if (!next) return JOURNEY_WORKFLOW_STEPS.length;
    return JOURNEY_WORKFLOW_STEPS.indexOf(next as any);
  }

  private validateStepKey(step: string): void {
    const allowed = [
      ...JOURNEY_WORKFLOW_STEPS,
      ...EXTRA_SELL_WORKFLOW_KEYS,
    ] as string[];
    if (!allowed.includes(step)) {
      throw new BadRequestException(
        `Invalid step "${step}". Must be one of: ${allowed.join(', ')}`,
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

  private async generateUniqueId(workspaceId: string): Promise<string> {
    for (let i = 0; i < MAX_ID_RETRIES; i++) {
      const suffix = Math.floor(
        Math.random() * (SUFFIX_MAX - SUFFIX_MIN + 1),
      ) + SUFFIX_MIN;
      const candidate = `${PREFIX}${suffix}`;
      const exists = await this.journeyModel
        .exists({ workspaceId: new Types.ObjectId(workspaceId), requestId: candidate })
        .lean();
      if (!exists) return candidate;
    }
    throw new Error('Failed to generate unique journey requestId');
  }
}
