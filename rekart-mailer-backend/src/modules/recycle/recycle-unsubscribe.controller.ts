import {
  Controller,
  Get,
  Param,
  Res,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { UnsubscribeTokenService } from './unsubscribe-token.service';
import { RecycleSuppressionService } from './recycle-suppression.service';
import { SuppressionReason } from './schemas/recycle-suppression.schema';

@Controller('recycle/unsubscribe')
export class RecycleUnsubscribeController {
  private readonly logger = new Logger(RecycleUnsubscribeController.name);

  constructor(
    private readonly tokenService: UnsubscribeTokenService,
    private readonly suppressionService: RecycleSuppressionService,
  ) {}

  /**
   * One-click unsubscribe
   * GET /api/v1/recycle/unsubscribe/:token
   *
   * @Public — recipients have no auth token
   * Validates token, adds to suppression list, redirects to frontend success page.
   */
  @Get(':token')
  @Public()
  async unsubscribe(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    const payload = this.tokenService.verify(token);

    if (!payload) {
      res.redirect(302, `${frontendUrl}/unsubscribe/invalid`);
      return;
    }

    try {
      await this.suppressionService.add(
        payload.wsId,
        {
          email: payload.email,
          reason: SuppressionReason.UNSUBSCRIBED,
          source: 'email_link',
        },
        null,
      );

      this.logger.log(`[Unsubscribe] ${payload.email} unsubscribed (ws: ${payload.wsId})`);
    } catch (err) {
      // Already suppressed is fine — still redirect to success
      this.logger.warn(`[Unsubscribe] Non-critical error for ${payload.email}: ${String(err)}`);
    }

    const encodedEmail = encodeURIComponent(payload.email);
    res.redirect(302, `${frontendUrl}/unsubscribe/success?email=${encodedEmail}`);
  }
}
