import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RentJourneysService } from './rent-journeys.service';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { SendJourneyStepDto } from './dto/send-journey-step.dto';
import { PreviewJourneyDraftDto } from './dto/preview-journey-draft.dto';
import { UpdateRentJourneyDataDto } from './dto/update-journey-data.dto';
import { AddStaffNoteDto } from './dto/add-staff-note.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../common/utils/enums';

const WRITER_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR];
const SENDER_ROLES = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.EDITOR,
  UserRole.SENDER,
];

@Controller('rent/journeys')
export class RentJourneysController {
  constructor(private readonly service: RentJourneysService) {}

  @Post()
  @Roles(...WRITER_ROLES)
  create(@Body() dto: CreateJourneyDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user);
  }

  @Post('preview-draft')
  @Roles(...SENDER_ROLES)
  previewDraft(
    @Body() dto: PreviewJourneyDraftDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.previewDraftEmail(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('currentStep') currentStep?: string,
    @Query('returnDue') returnDue?: string,
  ) {
    return this.service.findAll(user, {
      status,
      search,
      page,
      limit,
      currentStep,
      returnDue,
    });
  }

  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload) {
    return this.service.getStats(user);
  }

  @Get('analytics')
  getAnalytics(@CurrentUser() user: JwtPayload) {
    return this.service.getJourneyAnalytics(user);
  }

  @Get('staff-notifications')
  getStaffNotifications(@CurrentUser() user: JwtPayload) {
    return this.service.getStaffNotifications(user);
  }

  @Post('staff-notifications/mark-read')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  markStaffNotificationsRead(
    @CurrentUser() user: JwtPayload,
    @Body() body?: { readThrough?: string },
  ) {
    return this.service.markStaffNotificationsRead(user, body?.readThrough);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user);
  }

  @Patch(':id/data')
  @Roles(...WRITER_ROLES)
  updateData(
    @Param('id') id: string,
    @Body() dto: UpdateRentJourneyDataDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateJourneyData(id, dto, user);
  }

  @Get(':id/actions')
  @Roles(...SENDER_ROLES)
  listActions(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getJourneyActions(id, user);
  }

  @Get(':id/email-logs')
  @Roles(...SENDER_ROLES)
  listEmailLogs(
    @Param('id') id: string,
    @Query('step') step: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listStepEmailDeliveryLogs(id, user, step);
  }

  @Get(':id/delivery-log/:logId/preview')
  @Roles(...SENDER_ROLES)
  previewDeliveryLog(
    @Param('id') id: string,
    @Param('logId') logId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.previewDeliveryLog(id, logId, user);
  }

  @Post(':id/preview/:step')
  @Roles(...SENDER_ROLES)
  previewStep(
    @Param('id') id: string,
    @Param('step') step: string,
    @Body() dto: SendJourneyStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.previewStep(id, step, dto, user);
  }

  @Post(':id/send-next')
  @Roles(...SENDER_ROLES)
  sendNext(
    @Param('id') id: string,
    @Body() dto: SendJourneyStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.sendNext(id, dto, user);
  }

  @Post(':id/send/:step')
  @Roles(...SENDER_ROLES)
  sendStep(
    @Param('id') id: string,
    @Param('step') step: string,
    @Body() dto: SendJourneyStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.sendStep(id, step, dto, user);
  }

  @Post(':id/resend/:step')
  @Roles(...SENDER_ROLES)
  @HttpCode(HttpStatus.OK)
  resendStep(
    @Param('id') id: string,
    @Param('step') step: string,
    @Body() dto: SendJourneyStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.resendStep(id, step, dto, user);
  }

  @Patch(':id/cancel')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.cancel(id, user);
  }

  @Patch(':id/resume-final-offer')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  resumeFinalOffer(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.resumeFinalOfferQuote(id, user);
  }

  @Patch(':id/decline-request')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  declineRequest(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.markRequestDeclined(id, user);
  }

  @Post(':id/notes')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  addNote(
    @Param('id') id: string,
    @Body() dto: AddStaffNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addStaffNote(id, dto.text, user);
  }

  @Delete(':id/notes/:index')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  deleteNote(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.deleteStaffNote(id, parseInt(index, 10), user);
  }
}
