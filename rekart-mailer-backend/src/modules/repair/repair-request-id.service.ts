import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RepairRequestJourney,
  RepairRequestJourneyDocument,
} from './schemas/repair-request-journey.schema';

const PREFIX = 'RKRP';
const SUFFIX_MIN = 10000;
const SUFFIX_MAX = 99999;
const MAX_RETRIES = 20;

@Injectable()
export class RepairRequestIdService {
  constructor(
    @InjectModel(RepairRequestJourney.name)
    private readonly journeyModel: Model<RepairRequestJourneyDocument>,
  ) {}

  /** Generates a unique RKRP{5-digit} request ID per workspace. */
  async generate(workspaceId: string): Promise<string> {
    const wid = new Types.ObjectId(workspaceId);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const suffix = Math.floor(
        Math.random() * (SUFFIX_MAX - SUFFIX_MIN + 1),
      ) + SUFFIX_MIN;
      const candidate = `${PREFIX}${suffix}`;
      const exists = await this.journeyModel
        .exists({ workspaceId: wid, requestId: candidate })
        .lean();
      if (!exists) return candidate;
    }
    throw new InternalServerErrorException(
      'Failed to generate a unique repair request ID after maximum retries.',
    );
  }
}
