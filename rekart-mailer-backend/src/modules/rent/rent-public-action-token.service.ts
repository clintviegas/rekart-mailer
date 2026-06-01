import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { RentJourneyActionType } from './schemas/rent-journey-action.schema';

export interface RentActionTokenPayload {
  jid: string;
  rid: string;
  wid: string;
  step: string;
  action: RentJourneyActionType;
  iat: number;
  requestAckGen?: number;
  agreementGen?: number;
}

@Injectable()
export class RentPublicActionTokenService {
  private readonly secret: string;

  constructor() {
    const secret =
      process.env.ACTION_TOKEN_SECRET ?? process.env.TRACKING_TOKEN_SECRET;
    this.secret = secret ?? 'rekart_dev_only_secret__do_not_use_in_prod';
  }

  sign(payload: RentActionTokenPayload): string {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
    return `${data}.${sig}`;
  }

  verify(token: string): RentActionTokenPayload | null {
    try {
      const dot = token.lastIndexOf('.');
      if (dot === -1) return null;

      const data = token.slice(0, dot);
      const sig = token.slice(dot + 1);

      const expected = crypto
        .createHmac('sha256', this.secret)
        .update(data)
        .digest('hex');

      if (sig.length !== expected.length) return null;
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null;
      }

      const payload = JSON.parse(
        Buffer.from(data, 'base64url').toString('utf8'),
      ) as RentActionTokenPayload;

      if (!payload.jid || !payload.wid || !payload.action) return null;
      return payload;
    } catch {
      return null;
    }
  }

  buildUrl(
    frontendUrl: string,
    actionPath: string,
    payload: RentActionTokenPayload,
  ): string {
    const token = this.sign(payload);
    return `${frontendUrl}/rent/action/${actionPath}/${token}`;
  }
}
