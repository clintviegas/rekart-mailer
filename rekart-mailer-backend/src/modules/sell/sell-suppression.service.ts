import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SellSuppression,
  SellSuppressionDocument,
  SuppressionReason,
} from './schemas/sell-suppression.schema';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';

export interface AddSuppressionInput {
  email: string;
  reason?: SuppressionReason;
  source?: string;
}

@Injectable()
export class SellSuppressionService {
  constructor(
    @InjectModel(SellSuppression.name)
    private readonly model: Model<SellSuppressionDocument>,
  ) {}

  // ── Check (used internally before send) ──────────────────────────────────
  async isSuppressed(
    workspaceId: string | Types.ObjectId,
    email: string,
  ): Promise<{ suppressed: boolean; reason?: string }> {
    const entry = await this.model
      .findOne({
        workspaceId: new Types.ObjectId(workspaceId.toString()),
        email: email.toLowerCase().trim(),
      })
      .select('reason')
      .lean();

    if (!entry) return { suppressed: false };
    return { suppressed: true, reason: entry.reason };
  }

  // ── Add suppression ───────────────────────────────────────────────────────
  async add(
    workspaceId: string | Types.ObjectId,
    input: AddSuppressionInput,
    createdBy?: string | Types.ObjectId | null,
  ): Promise<SellSuppression> {
    const wsId = new Types.ObjectId(workspaceId.toString());
    const normEmail = input.email.toLowerCase().trim();

    try {
      const doc = await this.model.create({
        workspaceId: wsId,
        email: normEmail,
        reason: input.reason ?? SuppressionReason.MANUAL,
        source: input.source ?? 'manual',
        createdBy: createdBy ? new Types.ObjectId(createdBy.toString()) : null,
      });
      return doc;
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e.code === 11000) {
        // Already suppressed — idempotent, just return existing
        const existing = await this.model
          .findOne({ workspaceId: wsId, email: normEmail })
          .lean();
        return existing as SellSuppression;
      }
      throw err;
    }
  }

  // ── List ──────────────────────────────────────────────────────────────────
  async findAll(
    user: JwtPayload,
    opts: { reason?: SuppressionReason; search?: string; page?: number; limit?: number },
  ) {
    const wsId = new Types.ObjectId(user.workspaceId);
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, opts.limit ?? 50);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { workspaceId: wsId };
    if (opts.reason) filter.reason = opts.reason;
    if (opts.search) {
      filter.email = { $regex: opts.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const [docs, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);

    return createResponse(docs, 'Suppression list fetched', {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async remove(id: string, user: JwtPayload) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new NotFoundException('Suppression entry not found');
    if (doc.workspaceId.toString() !== user.workspaceId) {
      throw new ForbiddenException('Access denied');
    }
    await this.model.deleteOne({ _id: id });
    return createResponse(null, 'Suppression removed');
  }

  // ── Manual add (API) ──────────────────────────────────────────────────────
  async addByUser(
    user: JwtPayload,
    input: AddSuppressionInput,
  ) {
    const existing = await this.model
      .findOne({
        workspaceId: new Types.ObjectId(user.workspaceId),
        email: input.email.toLowerCase().trim(),
      })
      .lean();

    if (existing) throw new ConflictException('Email is already suppressed');

    const doc = await this.add(user.workspaceId, input, user.sub);
    return createResponse(doc, 'Email added to suppression list');
  }
}
