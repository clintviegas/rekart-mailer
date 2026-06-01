import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RecycleRequestJourney,
  RecycleRequestJourneyDocument,
} from './schemas/recycle-request-journey.schema';

const PREFIX = 'RKRC';
const SUFFIX_MIN = 10000;
const SUFFIX_MAX = 99999;
const MAX_RETRIES = 20;

@Injectable()
export class RecycleRequestIdService {
  constructor(
    @InjectModel(RecycleRequestJourney.name)
    private readonly journeyModel: Model<RecycleRequestJourneyDocument>,
  ) {}

  /** Generates a unique RKRC{5-digit} request ID per workspace. */
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
      'Failed to generate a unique Recycle request ID after maximum retries.',
    );
  }
}
