import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SellRequest,
  SellRequestDocument,
  SellWorkflowStatus,
} from './schemas/sell-request.schema';
import { SellRequestIdService } from './sell-request-id.service';
import {
  CreateSellRequestDto,
  UpdateSellRequestStatusDto,
} from './dto/create-sell-request.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';

@Injectable()
export class SellRequestService {
  constructor(
    @InjectModel(SellRequest.name)
    private readonly model: Model<SellRequestDocument>,
    private readonly idService: SellRequestIdService,
  ) {}

  // ── Generate a fresh unique ID (used by frontend on new journey start) ─────
  async generateNewId() {
    const requestId = await this.idService.generate();
    return createResponse({ requestId }, 'Request ID generated');
  }

  // ── Create a new SellRequest (first stage of a journey) ──────────────────
  async create(dto: CreateSellRequestDto, user: JwtPayload) {
    const requestId = await this.idService.generate();

    const doc = await this.model.create({
      workspaceId: new Types.ObjectId(user.workspaceId),
      requestId,
      customerEmail: dto.customerEmail.toLowerCase().trim(),
      workflowStatus: dto.workflowStatus ?? SellWorkflowStatus.REQUEST_RECEIVED,
      dynamicFieldValues: dto.dynamicFieldValues ?? {},
      createdBy: new Types.ObjectId(user.sub),
    });

    return createResponse(doc.toJSON(), 'SELL request created');
  }

  // ── Update status and/or field values (subsequent workflow stages) ────────
  async update(id: string, dto: UpdateSellRequestStatusDto, user: JwtPayload) {
    const doc = await this.model.findById(id).lean();
    this.assertOwnership(doc, id, user);

    const updated = await this.model
      .findByIdAndUpdate(
        id,
        {
          workflowStatus: dto.workflowStatus,
          ...(dto.dynamicFieldValues && {
            $set: {
              workflowStatus: dto.workflowStatus,
              dynamicFieldValues: {
                ...doc!.dynamicFieldValues,
                ...dto.dynamicFieldValues,
              },
            },
          }),
        },
        { new: true },
      )
      .lean();

    return createResponse(updated, 'SELL request updated');
  }

  // ── List all requests for the workspace ───────────────────────────────────
  async findAll(
    user: JwtPayload,
    workflowStatus?: string,
    customerEmail?: string,
  ) {
    const filter: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(user.workspaceId),
    };
    if (workflowStatus) filter['workflowStatus'] = workflowStatus;
    if (customerEmail) filter['customerEmail'] = customerEmail.toLowerCase().trim();

    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return createResponse(docs, 'SELL requests fetched');
  }

  // ── Get one by MongoDB _id ─────────────────────────────────────────────────
  async findOne(id: string, user: JwtPayload) {
    const doc = await this.model.findById(id).lean();
    this.assertOwnership(doc, id, user);
    return createResponse(doc, 'SELL request fetched');
  }

  // ── Find by human-readable requestId (e.g. RKTS47914) ────────────────────
  async findByRequestId(requestId: string, user: JwtPayload) {
    const doc = await this.model
      .findOne({
        requestId: requestId.toUpperCase().trim(),
        workspaceId: new Types.ObjectId(user.workspaceId),
      })
      .lean();

    if (!doc) throw new NotFoundException(`No request found with ID ${requestId}`);
    return createResponse(doc, 'SELL request fetched');
  }

  private assertOwnership(
    doc: SellRequest | null,
    id: string,
    user: JwtPayload,
  ) {
    if (!doc) throw new NotFoundException(`SELL request ${id} not found`);
    if (doc.workspaceId.toString() !== user.workspaceId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
