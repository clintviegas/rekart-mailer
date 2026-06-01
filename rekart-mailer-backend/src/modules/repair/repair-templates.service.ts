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
  RepairTemplate,
  RepairTemplateDocument,
  RepairTemplateStatus,
} from './schemas/repair-template.schema';
import { CreateRepairTemplateDto } from './dto/create-repair-template.dto';
import { UpdateRepairTemplateDto } from './dto/update-repair-template.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';
import { REPAIR_PUBLISHED_TEMPLATE_DEFAULTS, ALL_REPAIR_TEMPLATE_WORKFLOW_KEYS } from './repair-template-defaults';
import { REPAIR_JOURNEY_WORKFLOW_STEPS } from './schemas/repair-request-journey.schema';

@Injectable()
export class RepairTemplatesService {
  private readonly logger = new Logger(RepairTemplatesService.name);

  constructor(
    @InjectModel(RepairTemplate.name)
    private readonly templateModel: Model<RepairTemplateDocument>,
  ) {}

  async create(dto: CreateRepairTemplateDto, user: JwtPayload) {
    const template = await this.templateModel.create({
      ...dto,
      workspaceId: new Types.ObjectId(user.workspaceId),
      status: RepairTemplateStatus.DRAFT,
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
        status: { $in: [RepairTemplateStatus.DRAFT, RepairTemplateStatus.PUBLISHED] },
      })
      .sort({ updatedAt: -1 })
      .lean();

    return createResponse(template ?? null, 'Latest template fetched');
  }

  async update(id: string, dto: UpdateRepairTemplateDto, user: JwtPayload) {
    const template = await this.templateModel.findById(id).lean();
    this.assertOwnership(template, id, user);

    if (template!.status === RepairTemplateStatus.PUBLISHED) {
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

    if (template!.status === RepairTemplateStatus.PUBLISHED) {
      throw new BadRequestException('Template is already published');
    }

    const published = await this.templateModel
      .findByIdAndUpdate(
        id,
        {
          status: RepairTemplateStatus.PUBLISHED,
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
      status: RepairTemplateStatus.DRAFT,
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
  ): Promise<RepairTemplateDocument> {
    if (
      !ALL_REPAIR_TEMPLATE_WORKFLOW_KEYS.includes(
        workflowKey as (typeof ALL_REPAIR_TEMPLATE_WORKFLOW_KEYS)[number],
      )
    ) {
      throw new BadRequestException(`Invalid workflowKey: ${workflowKey}`);
    }

    const wid = new Types.ObjectId(user.workspaceId);
    const existing = await this.templateModel
      .findOne({
        workspaceId: wid,
        workflowKey,
        status: RepairTemplateStatus.PUBLISHED,
      })
      .sort({ updatedAt: -1 });

    if (existing) return existing;

    const def =
      REPAIR_PUBLISHED_TEMPLATE_DEFAULTS[
        workflowKey as keyof typeof REPAIR_PUBLISHED_TEMPLATE_DEFAULTS
      ];

    const created = await this.templateModel.create({
      workspaceId: wid,
      workflowKey,
      name: def.name,
      subject: def.subject,
      recipientEmail: 'customer@example.com',
      status: RepairTemplateStatus.PUBLISHED,
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
    template: RepairTemplate | null,
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
