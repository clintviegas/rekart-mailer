import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { RentPublicActionService } from './rent-public-action.service';
import { SubmitRentRequestConfirmDto } from './dto/submit-rent-request-confirm.dto';
import { SubmitRentRequestDeclineDto } from './dto/submit-rent-request-decline.dto';
import { SubmitRentAgreementDeclineDto } from './dto/submit-rent-agreement-decline.dto';
import { SubmitRentAgreementAcceptDto } from './dto/submit-rent-agreement-accept.dto';

@Controller('rent/public')
export class RentPublicActionController {
  constructor(private readonly service: RentPublicActionService) {}

  @Get('track/:token')
  @Public()
  track(@Param('token') token: string) {
    return this.service.getTrackPage(token);
  }

  @Get('request/confirm/:token')
  @Public()
  requestConfirmView(@Param('token') token: string) {
    return this.service.getRequestConfirmView(token);
  }

  @Post('request/confirm/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  requestConfirmSubmit(
    @Param('token') token: string,
    @Body() body: SubmitRentRequestConfirmDto,
  ) {
    return this.service.submitRequestConfirm(token, body);
  }

  @Get('request/decline/:token')
  @Public()
  requestDeclineView(@Param('token') token: string) {
    return this.service.getRequestDeclineView(token);
  }

  @Post('request/decline/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  requestDeclineSubmit(
    @Param('token') token: string,
    @Body() body: SubmitRentRequestDeclineDto,
  ) {
    return this.service.submitRequestDecline(token, body?.reason);
  }

  /** Legacy — old emails with direct pickup/delivery links */
  @Post('request/pickup/:token')
  @Public()
  confirmPickup(@Param('token') token: string) {
    return this.service.confirmFulfillment(token, 'pickup');
  }

  @Post('request/delivery/:token')
  @Public()
  confirmDelivery(@Param('token') token: string) {
    return this.service.confirmFulfillment(token, 'delivery');
  }

  @Post('agreement/sign/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  signAgreement(
    @Param('token') token: string,
    @Body() body: SubmitRentAgreementAcceptDto,
  ) {
    return this.service.signAgreement(token, body);
  }

  @Get('agreement/accept/:token')
  @Public()
  agreementAcceptView(@Param('token') token: string) {
    return this.service.getAgreementAcceptView(token);
  }

  @Post('agreement/accept/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  agreementAcceptSubmit(
    @Param('token') token: string,
    @Body() body: SubmitRentAgreementAcceptDto,
  ) {
    return this.service.submitAgreementAccept(token, body);
  }

  @Get('agreement/decline/:token')
  @Public()
  agreementDeclineView(@Param('token') token: string) {
    return this.service.getAgreementDeclineView(token);
  }

  @Post('agreement/decline/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  agreementDeclineSubmit(
    @Param('token') token: string,
    @Body() body: SubmitRentAgreementDeclineDto,
  ) {
    return this.service.submitAgreementDecline(token, body);
  }
}
