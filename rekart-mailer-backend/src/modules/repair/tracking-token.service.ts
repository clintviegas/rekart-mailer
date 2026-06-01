import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface TrackingTokenPayload {
  /** delivery log _id (hex string) */
  lid: string;
  /** workspace _id (hex string) */
  wsId: string;
  /** issued-at epoch seconds */
  iat: number;
}

/**
 * Stateless, HMAC-SHA256 signed tracking tokens.
 *
 * Format:  <base64url(json)>.<hex-signature>
 *
 * The secret is read from TRACKING_TOKEN_SECRET env var at construction time.
 * Tokens never expire — they are invalidated by clearing `trackingToken`
 * on the delivery log if needed.
 */
@Injectable()
export class TrackingTokenService {
  private readonly secret: string;

  constructor() {
    this.secret =
      process.env.TRACKING_TOKEN_SECRET ??
      'rekart_tracking_fallback_secret_change_me';
  }

  /** Create a URL-safe token for a delivery log. */
  sign(payload: TrackingTokenPayload): string {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
    return `${data}.${sig}`;
  }

  /** Verify and decode a token. Returns null if invalid/tampered. */
  verify(token: string): TrackingTokenPayload | null {
    try {
      const dot = token.lastIndexOf('.');
      if (dot === -1) return null;

      const data = token.slice(0, dot);
      const sig = token.slice(dot + 1);

      const expected = crypto
        .createHmac('sha256', this.secret)
        .update(data)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null;
      }

      const payload = JSON.parse(
        Buffer.from(data, 'base64url').toString('utf8'),
      ) as TrackingTokenPayload;

      if (!payload.lid || !payload.wsId) return null;

      return payload;
    } catch {
      return null;
    }
  }
}
