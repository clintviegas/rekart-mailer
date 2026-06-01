import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SellTemplate,
  SellTemplateDocument,
  SellTemplateStatus,
} from './schemas/sell-template.schema';
import { CreateSellTemplateDto } from './dto/create-sell-template.dto';
import { UpdateSellTemplateDto } from './dto/update-sell-template.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';
import { SELL_PUBLISHED_TEMPLATE_DEFAULTS, ALL_SELL_TEMPLATE_WORKFLOW_KEYS } from './sell-template-defaults';
import { JOURNEY_WORKFLOW_STEPS } from './schemas/sell-request-journey.schema';

@Injectable()
export class SellTemplatesService {
  private readonly logger = new Logger(SellTemplatesService.name);

  constructor(
    @InjectModel(SellTemplate.name)
    private readonly templateModel: Model<SellTemplateDocument>,
  ) {}

  async create(dto: CreateSellTemplateDto, user: JwtPayload) {
    const template = await this.templateModel.create({
      ...dto,
      workspaceId: new Types.ObjectId(user.workspaceId),
      status: SellTemplateStatus.DRAFT,
      version: 1,
      createdBy: new Types.ObjectId(user.sub),
      updatedBy: new Types.ObjectId(user.sub),
    });

    return createResponse(template.toJSON(), 'Template created');
  }

  async findAll(user: JwtPayload, workflowKey?: string) {
    const filter: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(user.workspaceId),
    };

    if (workflowKey) filter['workflowKey'] = workflowKey;

    const templates = await this.templateModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return createResponse(templates, 'Templates fetched');
  }

  async findOne(id: string, user: JwtPayload) {
    const template = await this.templateModel.findById(id).lean();
    this.assertOwnership(template, id, user);
    return createResponse(template, 'Template fetched');
  }

  async findLatestByWorkflow(workflowKey: string, user: JwtPayload) {
    const template = await this.templateModel
      .findOne({
        workspaceId: new Types.ObjectId(user.workspaceId),
        workflowKey,
        status: { $in: [SellTemplateStatus.DRAFT, SellTemplateStatus.PUBLISHED] },
      })
      .sort({ updatedAt: -1 })
      .lean();

    return createResponse(template ?? null, 'Latest template fetched');
  }

  async update(id: string, dto: UpdateSellTemplateDto, user: JwtPayload) {
    const template = await this.templateModel.findById(id).lean();
    this.assertOwnership(template, id, user);

    if (template!.status === SellTemplateStatus.PUBLISHED) {
      throw new BadRequestException(
        'Published templates are immutable. Duplicate to create a new draft.',
      );
    }

    const updated = await this.templateModel
      .findByIdAndUpdate(
        id,
        {
          ...dto,
          updatedBy: new Types.ObjectId(user.sub),
        },
        { new: true },
      )
      .lean();

    return createResponse(updated, 'Template updated');
  }

  async publish(id: string, user: JwtPayload) {
    const template = await this.templateModel.findById(id).lean();
    this.assertOwnership(template, id, user);

    if (template!.status === SellTemplateStatus.PUBLISHED) {
      throw new BadRequestException('Template is already published');
    }

    const published = await this.templateModel
      .findByIdAndUpdate(
        id,
        {
          status: SellTemplateStatus.PUBLISHED,
          updatedBy: new Types.ObjectId(user.sub),
        },
        { new: true },
      )
      .lean();

    return createResponse(published, 'Template published');
  }

  async duplicate(id: string, user: JwtPayload) {
    const source = await this.templateModel.findById(id).lean();
    this.assertOwnership(source, id, user);

    // Find highest version for this workflow
    const latest = await this.templateModel
      .findOne({
        workspaceId: new Types.ObjectId(user.workspaceId),
        workflowKey: source!.workflowKey,
      })
      .sort({ version: -1 })
      .lean();

    const nextVersion = (latest?.version ?? 0) + 1;

    const duplicate = await this.templateModel.create({
      workspaceId: source!.workspaceId,
      workflowKey: source!.workflowKey,
      name: `${source!.name} (copy)`,
      version: nextVersion,
      status: SellTemplateStatus.DRAFT,
      subject: source!.subject,
      recipientEmail: source!.recipientEmail,
      dynamicFieldValues: source!.dynamicFieldValues,
      previewSnapshot: source!.previewSnapshot,
      htmlTemplate: source!.htmlTemplate,
      createdBy: new Types.ObjectId(user.sub),
      updatedBy: new Types.ObjectId(user.sub),
    });

    return createResponse(duplicate.toJSON(), 'Template duplicated');
  }

  async remove(id: string, user: JwtPayload) {
    const template = await this.templateModel
      .findById(id)
      .select('workspaceId status')
      .lean();

    this.assertOwnership(template, id, user);

    await this.templateModel.findByIdAndDelete(id);
    return createResponse(null, 'Template deleted');
  }

  /**
   * Ensures a published template exists for the workflow step (creates platform default if missing).
   * Keeps journey send/preview unblocked when the design studio has not published yet.
   */
  async ensurePublishedTemplate(
    workflowKey: string,
    user: JwtPayload,
  ): Promise<SellTemplateDocument> {
    if (
      !ALL_SELL_TEMPLATE_WORKFLOW_KEYS.includes(
        workflowKey as (typeof ALL_SELL_TEMPLATE_WORKFLOW_KEYS)[number],
      )
    ) {
      throw new BadRequestException(`Invalid workflowKey: ${workflowKey}`);
    }

    const wid = new Types.ObjectId(user.workspaceId);
    const existing = await this.templateModel
      .findOne({
        workspaceId: wid,
        workflowKey,
        status: SellTemplateStatus.PUBLISHED,
      })
      .sort({ updatedAt: -1 });

    if (existing) return existing;

    const def =
      SELL_PUBLISHED_TEMPLATE_DEFAULTS[
        workflowKey as keyof typeof SELL_PUBLISHED_TEMPLATE_DEFAULTS
      ];

    const created = await this.templateModel.create({
      workspaceId: wid,
      workflowKey,
      name: def.name,
      subject: def.subject,
      recipientEmail: 'customer@example.com',
      status: SellTemplateStatus.PUBLISHED,
      version: 1,
      dynamicFieldValues: def.sampleDynamicFields,
      previewSnapshot: {},
      htmlTemplate: null,
      createdBy: new Types.ObjectId(user.sub),
      updatedBy: new Types.ObjectId(user.sub),
    });

    this.logger.log(
      `Auto-published default sell template for workspace ${user.workspaceId} step "${workflowKey}"`,
    );
    return created;
  }

  private assertOwnership(
    template: SellTemplate | null,
    id: string,
    user: JwtPayload,
  ): void {
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    if (template.workspaceId.toString() !== user.workspaceId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
