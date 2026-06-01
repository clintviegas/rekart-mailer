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
import { RecycleTemplatesService } from './recycle-templates.service';
import { RecycleTestEmailService } from './recycle-test-email.service';
import { RecycleEmailQueueService } from './recycle-email-queue.service';
import { CreateRecycleTemplateDto } from './dto/create-recycle-template.dto';
import { UpdateRecycleTemplateDto } from './dto/update-recycle-template.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { ResendFailedDto } from './dto/resend-failed.dto';
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

@Controller('sell')
export class RecycleTemplatesController {
  constructor(
    private readonly service: RecycleTemplatesService,
    private readonly testEmailService: RecycleTestEmailService,
    private readonly queueService: RecycleEmailQueueService,
  ) {}

  // ── Send test email (synchronous) ────────────────────────────────────────
  @Post('send-test')
  @Roles(...SENDER_ROLES)
  sendTestEmail(
    @Body() dto: SendTestEmailDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.testEmailService.sendTestEmail(dto, user);
  }

  // ── Enqueue real email delivery ───────────────────────────────────────────
  @Post('send')
  @Roles(...SENDER_ROLES)
  sendEmail(@Body() dto: SendEmailDto, @CurrentUser() user: JwtPayload) {
    return this.queueService.enqueue(dto, user);
  }

  // ── Delivery logs — static routes MUST come before :id routes ────────────

  @Get('delivery-logs')
  getDeliveryLogs(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('workflowKey') workflowKey?: string,
    @Query('provider') provider?: string,
    @Query('recipientEmail') recipientEmail?: string,
    @Query('requestId') requestId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('opened') opened?: string,
    @Query('clicked') clicked?: string,
    @Query('suppressed') suppressed?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.queueService.getLogs(user, {
      status,
      workflowKey,
      provider,
      recipientEmail,
      requestId,
      dateFrom,
      dateTo,
      opened,
      clicked,
      suppressed,
      page,
      limit,
      sortBy,
      sortOrder,
    });
  }

  @Get('delivery-logs/export')
  @Roles(...SENDER_ROLES)
  exportDeliveryLogs(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('workflowKey') workflowKey?: string,
    @Query('provider') provider?: string,
    @Query('recipientEmail') recipientEmail?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('opened') opened?: string,
    @Query('clicked') clicked?: string,
    @Query('suppressed') suppressed?: string,
  ) {
    return this.queueService.exportCsv(user, {
      status,
      workflowKey,
      provider,
      recipientEmail,
      dateFrom,
      dateTo,
      opened,
      clicked,
      suppressed,
    });
  }

  @Post('delivery-logs/resend-failed')
  @Roles(...SENDER_ROLES)
  resendFailed(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ResendFailedDto,
  ) {
    return this.queueService.resendFailed(user, dto);
  }

  @Get('delivery-logs/:id/details')
  getDeliveryLogDetails(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.queueService.getLogDetails(id, user);
  }

  @Post('delivery-logs/:id/resend')
  @Roles(...SENDER_ROLES)
  resendOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.queueService.resendOne(id, user);
  }

  @Get('delivery-logs/:id')
  getDeliveryLog(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.queueService.getLog(id, user);
  }

  // ── Templates CRUD ───────────────────────────────────────────────────────

  @Post('templates')
  @Roles(...WRITER_ROLES)
  create(@Body() dto: CreateRecycleTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user);
  }

  @Get('templates')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('workflowKey') workflowKey?: string,
  ) {
    return this.service.findAll(user, workflowKey);
  }

  // NOTE: static sub-routes (workflow/:key) MUST be declared before :id
  @Get('templates/workflow/:workflowKey')
  findLatestByWorkflow(
    @Param('workflowKey') workflowKey: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findLatestByWorkflow(workflowKey, user);
  }

  @Get('templates/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user);
  }

  @Patch('templates/:id')
  @Roles(...WRITER_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRecycleTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post('templates/:id/publish')
  @Roles(...WRITER_ROLES)
  publish(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.publish(id, user);
  }

  @Post('templates/:id/duplicate')
  @Roles(...WRITER_ROLES)
  duplicate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.duplicate(id, user);
  }

  @Delete('templates/:id')
  @Roles(...WRITER_ROLES)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user);
  }
}
