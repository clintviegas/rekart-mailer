import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../common/utils/enums';
import { createResponse } from '../../common/utils/api-response';
import { RepairRequestIdService } from './repair-request-id.service';

const WRITER_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR];

@Controller('repair/requests')
export class RepairRequestController {
  constructor(private readonly requestIdService: RepairRequestIdService) {}

  /** GET /api/v1/repair/requests/new-id */
  @Get('new-id')
  @Roles(...WRITER_ROLES)
  async generateId(@CurrentUser() user: JwtPayload) {
    const requestId = await this.requestIdService.generate(user.workspaceId);
    return createResponse({ requestId }, 'Repair request ID generated');
  }
}
