import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../common/utils/enums';
import { SellRequestService } from './sell-request.service';
import {
  CreateSellRequestDto,
  UpdateSellRequestStatusDto,
} from './dto/create-sell-request.dto';

const WRITER_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR];
const READER_ROLES = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.EDITOR,
  UserRole.SENDER,
  UserRole.ANALYST,
];

@Controller('sell/requests')
@UseGuards(JwtAuthGuard)
export class SellRequestController {
  constructor(private readonly service: SellRequestService) {}

  /**
   * GET /api/v1/sell/requests/new-id
   * Returns a freshly generated unique requestId without persisting anything.
   * Frontend calls this once when starting a brand-new customer journey.
   */
  @Get('new-id')
  @Roles(...WRITER_ROLES)
  generateId(@CurrentUser() user: JwtPayload) {
    void user; // workspace auth is implicit
    return this.service.generateNewId();
  }

  /**
   * POST /api/v1/sell/requests
   * Persists a new SellRequest (customer journey start).
   */
  @Post()
  @Roles(...WRITER_ROLES)
  create(
    @Body() dto: CreateSellRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(dto, user);
  }

  /**
   * GET /api/v1/sell/requests
   * List all requests for this workspace (with optional filters).
   */
  @Get()
  @Roles(...READER_ROLES)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('workflowStatus') workflowStatus?: string,
    @Query('customerEmail') customerEmail?: string,
  ) {
    return this.service.findAll(user, workflowStatus, customerEmail);
  }

  /**
   * GET /api/v1/sell/requests/by-id/:requestId
   * Look up by human-readable RKTS ID (e.g. RKTS47914).
   */
  @Get('by-id/:requestId')
  @Roles(...READER_ROLES)
  findByRequestId(
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findByRequestId(requestId, user);
  }

  /**
   * GET /api/v1/sell/requests/:id
   * Get a single SellRequest by MongoDB _id.
   */
  @Get(':id')
  @Roles(...READER_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user);
  }

  /**
   * PATCH /api/v1/sell/requests/:id
   * Update workflow status and/or dynamic field values.
   */
  @Patch(':id')
  @Roles(...WRITER_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSellRequestStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user);
  }
}
