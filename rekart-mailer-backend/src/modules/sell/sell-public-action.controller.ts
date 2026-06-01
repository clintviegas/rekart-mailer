import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { SellPublicActionService } from './sell-public-action.service';
import { IsNumber, IsOptional, IsString, Min, Max, IsIn, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { SELL_PICKUP_TIME_WINDOW_SELECT_OPTIONS } from './sell-pickup-time-windows';

class RequestAcceptSubmitDto {
  @IsString()
  @IsIn([...SELL_PICKUP_TIME_WINDOW_SELECT_OPTIONS])
  preferredPickupTimeSlot: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  preferredPickupDate: string;
}

class RescheduleDto {
  @IsOptional() @IsString() preferredDate?: string;
  @IsOptional() @IsString() preferredTime?: string;
  @IsOptional() @IsString() note?: string;
}

class RatingDto {
  @Type(() => Number) @IsNumber() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() feedback?: string;
}

function ctx(req: Request) {
  return {
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '',
    userAgent: req.headers['user-agent'] || '',
  };
}

/** Public endpoints — no JWT required. Secured by HMAC-signed action tokens.
 *  Rate-limited with the stricter "public" throttler (20 req / 60s per IP). */
@Public()
@Throttle({ public: {} })
@Controller('sell/public')
export class SellPublicActionController {
  constructor(private readonly service: SellPublicActionService) {}

  // ── Track ──────────────────────────────────────────────────────────────────
  @Get('track/:token')
  track(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleTrack(token, ctx(req));
  }

  // ── Reschedule ─────────────────────────────────────────────────────────────
  @Get('reschedule/:token')
  rescheduleView(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleRescheduleView(token, ctx(req));
  }

  @Post('reschedule/:token')
  @HttpCode(HttpStatus.OK)
  rescheduleSubmit(
    @Param('token') token: string,
    @Body() body: RescheduleDto,
    @Req() req: Request,
  ) {
    return this.service.handleRescheduleSubmit(token, body, ctx(req));
  }

  // ── Offer ──────────────────────────────────────────────────────────────────
  @Get('offer/accept/:token')
  offerAccept(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleOfferDecision(token, 'accept', ctx(req));
  }

  @Get('offer/decline/:token')
  offerDecline(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleOfferDecision(token, 'decline', ctx(req));
  }

  // ── Request received (step 1 confirm / decline) ────────────────────────────
  @Get('request/accept/:token')
  requestAccept(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleRequestAcceptView(token, ctx(req));
  }

  @Post('request/accept/:token')
  @HttpCode(HttpStatus.OK)
  requestAcceptSubmit(
    @Param('token') token: string,
    @Body() body: RequestAcceptSubmitDto,
    @Req() req: Request,
  ) {
    return this.service.handleRequestAcceptSubmit(
      token,
      body.preferredPickupTimeSlot,
      body.preferredPickupDate,
      ctx(req),
    );
  }

  @Get('request/decline/:token')
  requestDecline(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleRequestReceivedDecision(token, 'decline', ctx(req));
  }

  // ── Receipt ────────────────────────────────────────────────────────────────
  @Get('receipt/:token')
  receipt(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleReceipt(token, ctx(req));
  }

  // ── Rating ─────────────────────────────────────────────────────────────────
  @Get('rate/:token')
  rateView(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleRatingView(token, ctx(req));
  }

  @Post('rate/:token')
  @HttpCode(HttpStatus.OK)
  rateSubmit(
    @Param('token') token: string,
    @Body() body: RatingDto,
    @Req() req: Request,
  ) {
    return this.service.handleRatingSubmit(token, body, ctx(req));
  }

  // ── Support ────────────────────────────────────────────────────────────────
  @Get('support/:token')
  support(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleSupport(token, ctx(req));
  }
}
