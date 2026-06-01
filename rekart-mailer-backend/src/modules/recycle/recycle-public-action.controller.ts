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
import { RecyclePublicActionService } from './recycle-public-action.service';
import { IsNumber, IsOptional, IsString, Min, Max, IsIn, MinLength, MaxLength, Matches, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { Recycle_RETURN_PAYMENT_METHODS } from './recycle-payment-methods';
import { Recycle_PICKUP_TIME_WINDOW_SELECT_OPTIONS } from './recycle-pickup-time-windows';

class BookingAcceptSubmitDto {
  @IsString()
  @IsIn([...Recycle_PICKUP_TIME_WINDOW_SELECT_OPTIONS])
  preferredPickupTimeSlot: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  preferredPickupDate: string;

  /** same = use address on the request; different = customer enters another address */
  @IsString()
  @IsIn(['same', 'different'])
  pickupAddressChoice: 'same' | 'different';

  @ValidateIf((o: BookingAcceptSubmitDto) => o.pickupAddressChoice === 'different')
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  pickupAddress?: string;
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

class QuoteAcceptDto {
  @IsString()
  @IsIn([...Recycle_RETURN_PAYMENT_METHODS])
  preferredPaymentMethod: string;
}

class QuoteDeclineDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  declineReason: string;
}

class ReturnModeCourierDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  deliveryAddress: string;
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
@Controller('recycle/public')
export class RecyclePublicActionController {
  constructor(private readonly service: RecyclePublicActionService) {}

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

  // ── Quote (accept / decline) ───────────────────────────────────────────────
  @Get('quote/accept/:token')
  quoteAcceptView(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleOfferAcceptView(token, ctx(req));
  }

  @Post('quote/accept/:token')
  @HttpCode(HttpStatus.OK)
  quoteAcceptSubmit(
    @Param('token') token: string,
    @Body() body: QuoteAcceptDto,
    @Req() req: Request,
  ) {
    return this.service.handleOfferAcceptSubmit(token, body.preferredPaymentMethod, ctx(req));
  }

  @Get('quote/decline/:token')
  quoteDeclineView(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleOfferDeclineView(token, ctx(req));
  }

  @Post('quote/decline/:token')
  @HttpCode(HttpStatus.OK)
  quoteDeclineSubmit(
    @Param('token') token: string,
    @Body() body: QuoteDeclineDto,
    @Req() req: Request,
  ) {
    return this.service.handleOfferDeclineSubmit(token, body.declineReason, ctx(req));
  }

  @Get('return-device/:token')
  returnDeviceView(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleReturnDeviceView(token, ctx(req));
  }

  @Post('return-device/:token')
  @HttpCode(HttpStatus.OK)
  returnDeviceSubmit(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleReturnDeviceSubmit(token, ctx(req));
  }

  // ── Device ready — return mode (collect / courier) ─────────────────────────
  @Get('return-mode/collect/:token')
  returnModeCollectView(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleReturnModeStoreView(token, ctx(req));
  }

  @Post('return-mode/collect/:token')
  @HttpCode(HttpStatus.OK)
  returnModeCollectSubmit(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleReturnModeStoreSubmit(token, ctx(req));
  }

  @Get('return-mode/courier/:token')
  returnModeCourierView(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleReturnModeCourierView(token, ctx(req));
  }

  @Post('return-mode/courier/:token')
  @HttpCode(HttpStatus.OK)
  returnModeCourierSubmit(
    @Param('token') token: string,
    @Body() body: ReturnModeCourierDto,
    @Req() req: Request,
  ) {
    return this.service.handleReturnModeCourierSubmit(token, body.deliveryAddress, ctx(req));
  }

  /** Legacy sell-style paths — same handlers */
  @Get('offer/accept/:token')
  offerAcceptView(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleOfferAcceptView(token, ctx(req));
  }

  @Post('offer/accept/:token')
  @HttpCode(HttpStatus.OK)
  offerAcceptSubmit(
    @Param('token') token: string,
    @Body() body: QuoteAcceptDto,
    @Req() req: Request,
  ) {
    return this.service.handleOfferAcceptSubmit(token, body.preferredPaymentMethod, ctx(req));
  }

  @Get('offer/decline/:token')
  offerDeclineView(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleOfferDeclineView(token, ctx(req));
  }

  @Post('offer/decline/:token')
  @HttpCode(HttpStatus.OK)
  offerDeclineSubmit(
    @Param('token') token: string,
    @Body() body: QuoteDeclineDto,
    @Req() req: Request,
  ) {
    return this.service.handleOfferDeclineSubmit(token, body.declineReason, ctx(req));
  }

  // ── Booking confirmed (confirm / decline) ──────────────────────────────────
  @Get('booking/accept/:token')
  bookingAccept(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleBookingAcceptView(token, ctx(req));
  }

  @Post('booking/accept/:token')
  @HttpCode(HttpStatus.OK)
  bookingAcceptSubmit(
    @Param('token') token: string,
    @Body() body: BookingAcceptSubmitDto,
    @Req() req: Request,
  ) {
    return this.service.handleBookingAcceptSubmit(
      token,
      body.preferredPickupTimeSlot,
      body.preferredPickupDate,
      body.pickupAddressChoice,
      body.pickupAddress,
      ctx(req),
    );
  }

  @Get('booking/decline/:token')
  bookingDecline(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleRequestReceivedDecision(token, 'decline', ctx(req));
  }

  /** Legacy paths */
  @Get('request/accept/:token')
  requestAccept(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleRequestReceivedDecision(token, 'accept', ctx(req));
  }

  @Get('request/decline/:token')
  requestDecline(@Param('token') token: string, @Req() req: Request) {
    return this.service.handleRequestReceivedDecision(token, 'decline', ctx(req));
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
