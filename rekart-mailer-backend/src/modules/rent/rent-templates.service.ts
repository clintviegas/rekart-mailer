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
  RentTemplate,
  RentTemplateDocument,
  RentTemplateStatus,
} from './schemas/rent-template.schema';
import { CreateRentTemplateDto } from './dto/create-rent-template.dto';
import { UpdateRentTemplateDto } from './dto/update-rent-template.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';
import {
  ALL_RENT_TEMPLATE_WORKFLOW_KEYS,
  RENT_PUBLISHED_TEMPLATE_DEFAULTS,
} from './rent-template-defaults';

@Injectable()
export class RentTemplatesService {
  private readonly logger = new Logger(RentTemplatesService.name);

  constructor(
    @InjectModel(RentTemplate.name)
    private readonly templateModel: Model<RentTemplateDocument>,
  ) {}

  async create(dto: CreateRentTemplateDto, user: JwtPayload) {
    const template = await this.templateModel.create({
      ...dto,
      workspaceId: new Types.ObjectId(user.workspaceId),
      status: RentTemplateStatus.DRAFT,
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
        status: { $in: [RentTemplateStatus.DRAFT, RentTemplateStatus.PUBLISHED] },
      })
      .sort({ updatedAt: -1 })
      .lean();

    return createResponse(template ?? null, 'Latest template fetched');
  }

  async update(id: string, dto: UpdateRentTemplateDto, user: JwtPayload) {
    const template = await this.templateModel.findById(id).lean();
    this.assertOwnership(template, id, user);

    if (template!.status === RentTemplateStatus.PUBLISHED) {
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

    if (template!.status === RentTemplateStatus.PUBLISHED) {
      throw new BadRequestException('Template is already published');
    }

    const published = await this.templateModel
      .findByIdAndUpdate(
        id,
        {
          status: RentTemplateStatus.PUBLISHED,
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
      status: RentTemplateStatus.DRAFT,
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

  async ensurePublishedTemplate(
    workflowKey: string,
    user: JwtPayload,
  ): Promise<RentTemplateDocument> {
    if (
      !ALL_RENT_TEMPLATE_WORKFLOW_KEYS.includes(
        workflowKey as (typeof ALL_RENT_TEMPLATE_WORKFLOW_KEYS)[number],
      )
    ) {
      throw new BadRequestException(`Invalid workflowKey: ${workflowKey}`);
    }

    const wid = new Types.ObjectId(user.workspaceId);
    const existing = await this.templateModel
      .findOne({
        workspaceId: wid,
        workflowKey,
        status: RentTemplateStatus.PUBLISHED,
      })
      .sort({ updatedAt: -1 });

    if (existing) return existing;

    const def =
      RENT_PUBLISHED_TEMPLATE_DEFAULTS[
        workflowKey as keyof typeof RENT_PUBLISHED_TEMPLATE_DEFAULTS
      ];

    const created = await this.templateModel.create({
      workspaceId: wid,
      workflowKey,
      name: def.name,
      subject: def.subject,
      recipientEmail: 'customer@example.com',
      status: RentTemplateStatus.PUBLISHED,
      version: 1,
      dynamicFieldValues: def.sampleDynamicFields,
      previewSnapshot: {},
      htmlTemplate: null,
      createdBy: new Types.ObjectId(user.sub),
      updatedBy: new Types.ObjectId(user.sub),
    });

    this.logger.log(
      `Auto-published default rent template for workspace ${user.workspaceId} step "${workflowKey}"`,
    );
    return created;
  }

  private assertOwnership(
    template: RentTemplate | null,
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
