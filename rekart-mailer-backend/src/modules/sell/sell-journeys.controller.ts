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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SellJourneysService } from './sell-journeys.service';
import { SellPublicActionService } from './sell-public-action.service';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { SendJourneyStepDto } from './dto/send-journey-step.dto';
import { SendDeviceReshipDto } from './dto/send-device-reship.dto';
import { PreviewJourneyDraftDto } from './dto/preview-journey-draft.dto';
import { UpdateJourneyDataDto } from './dto/update-journey-data.dto';
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

@Controller('sell/journeys')
export class SellJourneysController {
  constructor(
    private readonly service: SellJourneysService,
    private readonly actionService: SellPublicActionService,
  ) {}

  // POST /sell/journeys
  @Post()
  @Roles(...WRITER_ROLES)
  create(@Body() dto: CreateJourneyDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user);
  }

  /** Preview step HTML before a journey exists (same renderer as journey step preview). */
  @Post('preview-draft')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  previewDraft(
    @Body() dto: PreviewJourneyDraftDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.previewDraftEmail(dto, user);
  }

  // GET /sell/journeys
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('completedStep') completedStep?: string,
    @Query('revisedOffers') revisedOffers?: string,
    @Query('closedByReship') closedByReship?: string,
    @Query('reminderDue') reminderDue?: string,
    @Query('currentStep') currentStep?: string,
  ) {
    return this.service.findAll(user, {
      status,
      search,
      page,
      limit,
      completedStep,
      revisedOffers,
      closedByReship,
      reminderDue,
      currentStep,
    });
  }

  // GET /sell/journeys/export — download all journeys as CSV (before :id)
  @Get('export')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('completedStep') completedStep?: string,
  ) {
    const csv = await this.service.exportJourneysCsv(user, { status, search, completedStep });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="journeys-${date}.csv"`);
    res.send(csv);
  }

  // GET /sell/journeys/stats — must come before :id
  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload) {
    return this.service.getStats(user);
  }

  // GET /sell/journeys/analytics — full analytics data (trends, funnel, actions)
  @Get('analytics')
  getAnalytics(@CurrentUser() user: JwtPayload) {
    return this.service.getJourneyAnalytics(user);
  }

  // GET /sell/journeys/staff-notifications — bell + unread count (before :id)
  @Get('staff-notifications')
  getStaffNotifications(@CurrentUser() user: JwtPayload) {
    return this.service.getStaffNotifications(user);
  }

  // POST /sell/journeys/staff-notifications/mark-read
  @Post('staff-notifications/mark-read')
  @HttpCode(HttpStatus.OK)
  markStaffNotificationsRead(
    @CurrentUser() user: JwtPayload,
    @Body() body?: { readThrough?: string },
  ) {
    return this.service.markStaffNotificationsRead(user, body?.readThrough);
  }

  // GET /sell/journeys/by-request/:requestId — must come before :id
  @Get('by-request/:requestId')
  findByRequestId(
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findByRequestId(requestId, user);
  }

  // GET /sell/journeys/:id/offer-email-logs — every offer-ready send (for per-round preview)
  @Get(':id/offer-email-logs')
  listOfferEmailLogs(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.listOfferEmailDeliveryLogs(id, user);
  }

  // GET /sell/journeys/:id/delivery-log/:logId/preview — HTML exactly as stored on send
  @Get(':id/delivery-log/:logId/preview')
  @Roles(...SENDER_ROLES)
  previewDeliveryLog(
    @Param('id') id: string,
    @Param('logId') logId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.previewDeliveryLog(id, logId, user);
  }

  // GET /sell/journeys/:id
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user);
  }

  // POST /sell/journeys/:id/send-next
  @Post(':id/send-next')
  @Roles(...SENDER_ROLES)
  sendNext(
    @Param('id') id: string,
    @Body() dto: SendJourneyStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.sendNext(id, dto, user);
  }

  // POST /sell/journeys/:id/send-step/:step
  @Post(':id/send-step/:step')
  @Roles(...SENDER_ROLES)
  sendStep(
    @Param('id') id: string,
    @Param('step') step: string,
    @Body() dto: SendJourneyStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.sendStep(id, step, dto, user);
  }

  // POST /sell/journeys/:id/resend/:step
  @Post(':id/resend/:step')
  @Roles(...SENDER_ROLES)
  resendStep(
    @Param('id') id: string,
    @Param('step') step: string,
    @Body() dto: SendJourneyStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.resendStep(id, step, dto, user);
  }

  // POST /sell/journeys/:id/device-reship — return shipment email + complete journey
  @Post(':id/device-reship')
  @Roles(...SENDER_ROLES)
  @HttpCode(HttpStatus.OK)
  sendDeviceReship(
    @Param('id') id: string,
    @Body() dto: SendDeviceReshipDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.sendDeviceReship(id, dto, user);
  }

  // POST /sell/journeys/:id/preview/:step
  @Post(':id/preview/:step')
  @Roles(...SENDER_ROLES)
  @HttpCode(HttpStatus.OK)
  previewStep(
    @Param('id') id: string,
    @Param('step') step: string,
    @Body() dto: SendJourneyStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.previewStep(id, step, dto, user);
  }

  // GET /sell/journeys/:id/actions — customer action log for dashboard
  @Get(':id/actions')
  getActions(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.actionService.getJourneyActions(id, user.workspaceId);
  }

  // PATCH /sell/journeys/:id/cancel
  @Patch(':id/cancel')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.cancel(id, user);
  }

  // PATCH /sell/journeys/:id/decline-offer
  @Patch(':id/decline-offer')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  declineOffer(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.markOfferDeclined(id, user);
  }

  // PATCH /sell/journeys/:id/data — update dynamic data fields (whitelisted keys only)
  @Patch(':id/data')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  updateData(
    @Param('id') id: string,
    @Body() dto: UpdateJourneyDataDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateDynamicData(id, dto as Record<string, unknown>, user);
  }

  // POST /sell/journeys/:id/attachments — add an attachment ref to a journey
  @Post(':id/attachments')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  addAttachment(
    @Param('id') id: string,
    @Body() body: { storedFilename: string; originalName: string; mimeType: string; size: number; url: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addAttachment(id, body, user);
  }

  // DELETE /sell/journeys/:id/attachments/:filename — remove an attachment ref
  @Delete(':id/attachments/:filename')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  removeAttachment(
    @Param('id') id: string,
    @Param('filename') filename: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeAttachment(id, filename, user);
  }

  // DELETE /sell/journeys/:id
  @Delete(':id')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user);
  }

  // POST /sell/journeys/:id/notes — add a staff internal note
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

  // DELETE /sell/journeys/:id/notes/:index — remove a staff note by index
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
