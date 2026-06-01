import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import {
  RentDeliveryLog,
  RentDeliveryLogDocument,
  DeliveryStatus,
} from './schemas/rent-delivery-log.schema';
import { SendEmailDto } from './dto/send-email.dto';
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
import { ALL_RENT_TEMPLATE_WORKFLOW_KEYS } from './rent-template-defaults';

const VALID_WORKFLOW_KEYS = new Set<string>(ALL_RENT_TEMPLATE_WORKFLOW_KEYS);

export interface DeliveryLogFilters {
  status?: string;
  workflowKey?: string;
  provider?: string;
  recipientEmail?: string;
  requestId?: string;
  dateFrom?: string;
  dateTo?: string;
  opened?: string;
  clicked?: string;
  suppressed?: string;
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: string;
}

@Injectable()
export class RentEmailQueueService {
  private readonly logger = new Logger(RentEmailQueueService.name);

  constructor(
    @InjectModel(RentDeliveryLog.name)
    private readonly logModel: Model<RentDeliveryLogDocument>,

    @Inject(RENT_EMAIL_QUEUE_TOKEN)
    private readonly queue: Queue | null,
  ) {}

  private requireQueue(): Queue {
    if (!this.queue) {
      throw new ServiceUnavailableException(
        'Email queue is off. Set RENT_USE_BULL_QUEUE=true and Redis, or send via RENT journeys (direct SMTP).',
      );
    }
    return this.queue;
  }

  async enqueue(dto: SendEmailDto, user: JwtPayload) {
    if (!VALID_WORKFLOW_KEYS.has(dto.workflowKey)) {
      throw new BadRequestException(
        `Unknown workflowKey: "${dto.workflowKey}"`,
      );
    }

    const dynamicFieldValues = dto.dynamicFieldValues ?? {};
    const requestId =
      typeof dynamicFieldValues['requestId'] === 'string'
        ? (dynamicFieldValues['requestId'] as string)
        : null;

    const log = await this.logModel.create({
      workspaceId: new Types.ObjectId(user.workspaceId),
      templateId: dto.templateId ? new Types.ObjectId(dto.templateId) : null,
      workflowKey: dto.workflowKey,
      recipientEmail: dto.recipientEmail,
      requestId,
      subject: dto.subject,
      status: DeliveryStatus.QUEUED,
      createdBy: new Types.ObjectId(user.sub),
      dynamicFieldValues,
    });

    const payload: RentEmailJobPayload = {
      workspaceId: user.workspaceId,
      workflowKey: dto.workflowKey,
      recipientEmail: dto.recipientEmail,
      subject: dto.subject,
      dynamicFieldValues: dto.dynamicFieldValues ?? {},
      templateId: dto.templateId ?? null,
      triggeredBy: user.sub,
      deliveryLogId: (log._id as Types.ObjectId).toString(),
      attachments: dto.attachments?.map((a) => ({
        storedFilename: a.storedFilename,
        originalName: a.originalName,
        mimeType: a.mimeType,
      })),
      customSignoffName: dto.customSignoffName,
      customFooterNote: dto.customFooterNote,
      customGreetingText: dto.customGreetingText,
      customHeadingColor: dto.customHeadingColor,
      customBodyTextColor: dto.customBodyTextColor,
      customButtonLabel: dto.customButtonLabel,
    };

    const job = await this.requireQueue().add(RENT_EMAIL_JOB, payload, {
      jobId: `rent-${log._id.toString()}`,
    });

    this.logger.log(
      `Enqueued rent email job ${job.id} → ${dto.recipientEmail} (${dto.workflowKey})`,
    );

    return createResponse(
      {
        jobId: job.id,
        deliveryLogId: log._id.toString(),
        status: DeliveryStatus.QUEUED,
        recipient: dto.recipientEmail,
      },
      'Email queued successfully',
    );
  }

  async getLogs(user: JwtPayload, filters: DeliveryLogFilters) {
    const query: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(user.workspaceId),
    };

    if (filters.status) query['status'] = filters.status;
    if (filters.workflowKey) query['workflowKey'] = filters.workflowKey;
    if (filters.provider)
      query['provider'] = { $regex: filters.provider, $options: 'i' };
    if (filters.recipientEmail) {
      query['recipientEmail'] = {
        $regex: filters.recipientEmail,
        $options: 'i',
      };
    }
    if (filters.requestId) {
      query['requestId'] = {
        $regex: filters.requestId.toUpperCase().trim(),
        $options: 'i',
      };
    }
    if (filters.dateFrom || filters.dateTo) {
      const dateRange: Record<string, Date> = {};
      if (filters.dateFrom) dateRange['$gte'] = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        dateRange['$lte'] = to;
      }
      query['createdAt'] = dateRange;
    }
    if (filters.opened !== undefined && filters.opened !== '')
      query['opened'] = filters.opened === 'true';
    if (filters.clicked !== undefined && filters.clicked !== '')
      query['clicked'] = filters.clicked === 'true';
    if (filters.suppressed !== undefined && filters.suppressed !== '')
      query['suppressed'] = filters.suppressed === 'true';

    const page = Math.max(1, parseInt(filters.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit ?? '25', 10)));
    const skip = (page - 1) * limit;

    const validSortFields = ['createdAt', 'sentAt'];
    const sortField = validSortFields.includes(filters.sortBy ?? '')
      ? filters.sortBy!
      : 'createdAt';
    const sortDir: 1 | -1 = filters.sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.logModel
        .find(query)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.logModel.countDocuments(query),
    ]);

    return createPaginatedResponse(data, 'Delivery logs fetched', page, limit, total);
  }

  async getLog(id: string, user: JwtPayload) {
    const log = await this.logModel.findById(id).lean();
    if (!log) throw new BadRequestException(`Delivery log ${id} not found`);
    if (log.workspaceId.toString() !== user.workspaceId)
      throw new ForbiddenException('Access denied');
    return createResponse(log, 'Delivery log fetched');
  }

  async getLogDetails(id: string, user: JwtPayload) {
    const log = await this.logModel.findById(id).lean();
    if (!log) throw new BadRequestException(`Delivery log ${id} not found`);
    if (log.workspaceId.toString() !== user.workspaceId)
      throw new ForbiddenException('Access denied');

    const logAny = log as typeof log & { createdAt?: Date; updatedAt?: Date };
    const detail = {
      ...log,
      timeline: [
        { event: 'Queued', at: logAny.createdAt },
        ...(log.status === DeliveryStatus.PROCESSING ||
        log.status === DeliveryStatus.SENT ||
        log.status === DeliveryStatus.FAILED
          ? [{ event: 'Processing started', at: logAny.updatedAt }]
          : []),
        ...(log.sentAt ? [{ event: 'Sent', at: log.sentAt }] : []),
        ...(log.firstOpenedAt
          ? [{ event: 'First opened', at: log.firstOpenedAt }]
          : []),
        ...(log.firstClickedAt
          ? [{ event: 'First click', at: log.firstClickedAt }]
          : []),
        ...(log.suppressed
          ? [{ event: 'Suppressed', at: logAny.updatedAt }]
          : []),
      ],
      canResend: [DeliveryStatus.FAILED, DeliveryStatus.SUPPRESSED].includes(
        log.status,
      ),
    };

    return createResponse(detail, 'Delivery log details fetched');
  }

  async resendOne(id: string, user: JwtPayload) {
    const original = await this.logModel.findById(id).lean();
    if (!original) throw new BadRequestException('Delivery log not found');
    if (original.workspaceId.toString() !== user.workspaceId)
      throw new ForbiddenException('Access denied');
    if (
      ![DeliveryStatus.FAILED, DeliveryStatus.SUPPRESSED].includes(
        original.status,
      )
    ) {
      throw new BadRequestException(
        'Only failed or suppressed emails can be resent',
      );
    }

    const newLog = await this.logModel.create({
      workspaceId: new Types.ObjectId(user.workspaceId),
      templateId: original.templateId,
      workflowKey: original.workflowKey,
      recipientEmail: original.recipientEmail,
      requestId: original.requestId ?? null,
      subject: original.subject,
      status: DeliveryStatus.QUEUED,
      createdBy: new Types.ObjectId(user.sub),
      dynamicFieldValues: original.dynamicFieldValues ?? {},
    });

    const payload: RentEmailJobPayload = {
      workspaceId: user.workspaceId,
      workflowKey: original.workflowKey,
      recipientEmail: original.recipientEmail,
      subject: original.subject,
      dynamicFieldValues: (original.dynamicFieldValues as Record<string, unknown>) ?? {},
      templateId: original.templateId?.toString() ?? null,
      triggeredBy: user.sub,
      deliveryLogId: (newLog._id as Types.ObjectId).toString(),
    };

    await this.requireQueue().add(RENT_EMAIL_JOB, payload, {
      jobId: `rent-resend-${newLog._id.toString()}`,
    });

    return createResponse(
      {
        deliveryLogId: (newLog._id as Types.ObjectId).toString(),
        originalId: id,
        status: DeliveryStatus.QUEUED,
        recipient: original.recipientEmail,
      },
      'Email resend queued',
    );
  }

  async exportCsv(
    user: JwtPayload,
    filters: Omit<DeliveryLogFilters, 'page' | 'limit' | 'sortBy' | 'sortOrder'>,
  ) {
    const query: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(user.workspaceId),
    };

    if (filters.status) query['status'] = filters.status;
    if (filters.workflowKey) query['workflowKey'] = filters.workflowKey;
    if (filters.provider)
      query['provider'] = { $regex: filters.provider, $options: 'i' };
    if (filters.recipientEmail) {
      query['recipientEmail'] = {
        $regex: filters.recipientEmail,
        $options: 'i',
      };
    }
    if (filters.dateFrom || filters.dateTo) {
      const dateRange: Record<string, Date> = {};
      if (filters.dateFrom) dateRange['$gte'] = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        dateRange['$lte'] = to;
      }
      query['createdAt'] = dateRange;
    }

    const logs = await this.logModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const escape = (v: unknown) =>
      `"${String(v ?? '').replace(/"/g, '""')}"`;

    const headers = [
      'Recipient Email',
      'Workflow',
      'Status',
      'Provider',
      'Subject',
      'Sent At',
      'Created At',
      'Error Message',
    ];

    const rows = logs.map((log) => [
      escape(log.recipientEmail),
      escape(log.workflowKey),
      escape(log.status),
      escape(log.provider),
      escape(log.subject),
      escape(log.sentAt ? new Date(log.sentAt).toISOString() : ''),
      escape(
        (log as unknown as { createdAt?: Date }).createdAt
          ? new Date((log as unknown as { createdAt: Date }).createdAt).toISOString()
          : '',
      ),
      escape(log.errorMessage),
    ]);

    const csv = [headers.map(escape), ...rows]
      .map((row) => row.join(','))
      .join('\n');

    const filename = `rent-delivery-logs-${new Date().toISOString().slice(0, 10)}.csv`;

    return createResponse({ csv, filename, count: logs.length }, 'Export ready');
  }
}
