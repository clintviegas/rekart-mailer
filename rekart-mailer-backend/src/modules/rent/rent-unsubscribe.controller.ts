import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { UnsubscribeTokenService } from './unsubscribe-token.service';

@Controller('rent/unsubscribe')
export class RentUnsubscribeController {
  private readonly logger = new Logger(RentUnsubscribeController.name);

  constructor(private readonly tokenService: UnsubscribeTokenService) {}

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

    this.logger.log(
      `[Unsubscribe] ${payload.email} unsubscribed (ws: ${payload.wsId})`,
    );

    const encodedEmail = encodeURIComponent(payload.email);
    res.redirect(
      302,
      `${frontendUrl}/unsubscribe/success?email=${encodedEmail}`,
    );
  }
}
