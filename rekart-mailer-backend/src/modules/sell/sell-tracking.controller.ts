import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Public } from '../../common/decorators/public.decorator';
import { TrackingTokenService } from './tracking-token.service';
import {
  SellDeliveryLog,
  SellDeliveryLogDocument,
} from './schemas/sell-delivery-log.schema';

// Transparent 1×1 GIF (43 bytes)
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

// Allowed redirect protocols
const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Allowed destination hosts.
 * Add your production domains here. For dev we allow all HTTPS/HTTP.
 * Set ALLOWED_REDIRECT_HOSTS="domain1.com,domain2.com" to restrict.
 */
function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!SAFE_PROTOCOLS.has(u.protocol)) return false;

    const allowedHosts = process.env.ALLOWED_REDIRECT_HOSTS;
    if (!allowedHosts) return true; // allow all in dev

    return allowedHosts.split(',').some((h) => u.hostname.endsWith(h.trim()));
  } catch {
    return false;
  }
}

@Controller('sell/track')
export class SellTrackingController {
  private readonly logger = new Logger(SellTrackingController.name);

  constructor(
    private readonly tokenService: TrackingTokenService,
    @InjectModel(SellDeliveryLog.name)
    private readonly logModel: Model<SellDeliveryLogDocument>,
  ) {}

  /**
   * Open tracking pixel
   * GET /api/v1/sell/track/open/:token
   *
   * Returns a transparent 1×1 GIF and records the open event.
   * Must remain @Public — email clients load this without auth.
   */
  @Get('open/:token')
  @Public()
  async trackOpen(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const payload = this.tokenService.verify(token);

    if (payload) {
      const now = new Date();
      try {
        await this.logModel.findOneAndUpdate(
          { _id: payload.lid, trackingToken: token },
          [
            {
              $set: {
                opened: true,
                openCount: { $add: ['$openCount', 1] },
                lastOpenedAt: now,
                firstOpenedAt: {
                  $cond: [{ $eq: ['$firstOpenedAt', null] }, now, '$firstOpenedAt'],
                },
              },
            },
          ],
        );
      } catch (err) {
        this.logger.warn(`Open tracking update failed: ${String(err)}`);
      }
    }

    // Always return the pixel — never leak errors to email clients
    res
      .status(200)
      .setHeader('Content-Type', 'image/gif')
      .setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      .setHeader('Pragma', 'no-cache')
      .setHeader('Expires', '0')
      .end(PIXEL_GIF);
  }

  /**
   * Click tracking redirect
   * GET /api/v1/sell/track/click/:token?url=<encoded-destination>
   *
   * Records the click and redirects to the destination.
   * @Public — links are in emails, recipients have no auth token.
   */
  @Get('click/:token')
  @Public()
  async trackClick(
    @Param('token') token: string,
    @Query('url') destinationUrl: string,
    @Res() res: Response,
  ): Promise<void> {
    // Validate destination before doing anything
    if (!destinationUrl || !isSafeUrl(destinationUrl)) {
      res.status(400).send('Invalid or missing destination URL');
      return;
    }

    const payload = this.tokenService.verify(token);

    if (payload) {
      const now = new Date();
      const safeUrl = destinationUrl.slice(0, 2048); // cap length
      try {
        await this.logModel.findOneAndUpdate(
          { _id: payload.lid, trackingToken: token },
          [
            {
              $set: {
                clicked: true,
                clickCount: { $add: ['$clickCount', 1] },
                lastClickedAt: now,
                firstClickedAt: {
                  $cond: [
                    { $eq: ['$firstClickedAt', null] },
                    now,
                    '$firstClickedAt',
                  ],
                },
                clickedLinks: {
                  $cond: [
                    { $in: [safeUrl, '$clickedLinks'] },
                    '$clickedLinks',
                    { $concatArrays: ['$clickedLinks', [safeUrl]] },
                  ],
                },
              },
            },
          ],
        );
      } catch (err) {
        this.logger.warn(`Click tracking update failed: ${String(err)}`);
      }
    }

    // Always redirect — never block the user
    res.redirect(302, destinationUrl);
  }
}
