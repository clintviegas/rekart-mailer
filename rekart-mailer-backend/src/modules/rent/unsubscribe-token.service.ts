import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface UnsubscribeTokenPayload {
  wsId: string;
  email: string;
  iat: number;
}

@Injectable()
export class UnsubscribeTokenService {
  private readonly secret: string;

  constructor() {
    this.secret =
      process.env.TRACKING_TOKEN_SECRET ??
      'rekart_unsub_fallback_secret_change_me';
  }

  sign(payload: UnsubscribeTokenPayload): string {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
    return `${data}.${sig}`;
  }

  verify(token: string): UnsubscribeTokenPayload | null {
    try {
      const dot = token.lastIndexOf('.');
      if (dot === -1) return null;

      const data = token.slice(0, dot);
      const sig = token.slice(dot + 1);

      const expected = crypto
        .createHmac('sha256', this.secret)
        .update(data)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null;
      }

      const payload = JSON.parse(
        Buffer.from(data, 'base64url').toString('utf8'),
      ) as UnsubscribeTokenPayload;

      if (!payload.wsId || !payload.email) return null;
      return payload;
    } catch {
      return null;
    }
  }
}
