import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SellRequest, SellRequestDocument } from './schemas/sell-request.schema';

const PREFIX = 'RKTS';
const SUFFIX_MIN = 10000;
const SUFFIX_MAX = 99999;
const MAX_RETRIES = 20;

@Injectable()
export class SellRequestIdService {
  constructor(
    @InjectModel(SellRequest.name)
    private readonly model: Model<SellRequestDocument>,
  ) {}

  /**
   * Generates a guaranteed-unique RKTS{5-digit} request ID.
   * Retries up to MAX_RETRIES times before throwing.
   */
  async generate(): Promise<string> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const suffix = this.randomSuffix();
      const candidate = `${PREFIX}${suffix}`;

      const exists = await this.model.exists({ requestId: candidate }).lean();
      if (!exists) {
        return candidate;
      }
    }

    throw new InternalServerErrorException(
      'Failed to generate a unique SELL request ID after maximum retries.',
    );
  }

  private randomSuffix(): number {
    return Math.floor(Math.random() * (SUFFIX_MAX - SUFFIX_MIN + 1)) + SUFFIX_MIN;
  }
}
