import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { JourneyActionType } from './schemas/repair-journey-action.schema';

export interface ActionTokenPayload {
  /** journey _id (hex) */
  jid: string;
  /** requestId (RKRP…) */
  rid: string;
  /** workspace _id (hex) */
  wid: string;
  /** workflow step key */
  step: string;
  /** action this token authorises */
  action: JourneyActionType;
  /** issued-at epoch seconds */
  iat: number;
  /** quote-ready email revision; must match journey.quoteGeneration when customer acts */
  quoteGen?: number;
  /** booking-confirmed email revision; must match journey.bookingAckGeneration when customer acts */
  bookingAckGen?: number;
}

/**
 * Stateless HMAC-SHA256 signed tokens for public customer action URLs.
 * Format: <base64url(json)>.<hex-sig>
 * Tokens do not expire — revocation is done by checking journey state.
 */
@Injectable()
export class RepairPublicActionTokenService {
  private readonly secret: string;

  constructor() {
    const secret =
      process.env.ACTION_TOKEN_SECRET ??
      process.env.TRACKING_TOKEN_SECRET;

    if (!secret) {
      // In production a missing secret is a hard failure — signed customer links
      // cannot be trusted without a real secret.
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'ACTION_TOKEN_SECRET env variable is required in production. ' +
          'Set it in your .env file.',
        );
      }
      // Dev/test: warn loudly but allow startup
      console.warn(
        '[RepairPublicActionTokenService] WARNING: ACTION_TOKEN_SECRET is not set. ' +
        'Using an insecure dev-only secret. Set ACTION_TOKEN_SECRET in .env before deploying.',
      );
    }

    this.secret = secret ?? 'rekart_dev_only_secret__do_not_use_in_prod';
  }

  sign(payload: ActionTokenPayload): string {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
    return `${data}.${sig}`;
  }

  verify(token: string): ActionTokenPayload | null {
    try {
      const dot = token.lastIndexOf('.');
      if (dot === -1) return null;

      const data = token.slice(0, dot);
      const sig  = token.slice(dot + 1);

      const expected = crypto
        .createHmac('sha256', this.secret)
        .update(data)
        .digest('hex');

      if (sig.length !== expected.length) return null;
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

      const payload = JSON.parse(
        Buffer.from(data, 'base64url').toString('utf8'),
      ) as ActionTokenPayload;

      if (!payload.jid || !payload.wid || !payload.action) return null;
      return payload;
    } catch {
      return null;
    }
  }

  /** Build a full action URL pointing to the frontend. */
  buildUrl(frontendUrl: string, actionPath: string, payload: ActionTokenPayload): string {
    const token = this.sign(payload);
    return `${frontendUrl}/repair/action/${actionPath}/${token}`;
  }
}
