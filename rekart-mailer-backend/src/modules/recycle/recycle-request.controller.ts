import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../common/utils/enums';
import { createResponse } from '../../common/utils/api-response';
import { RecycleRequestIdService } from './recycle-request-id.service';

const WRITER_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR];

@Controller('recycle/requests')
export class RecycleRequestController {
  constructor(private readonly requestIdService: RecycleRequestIdService) {}

  /** GET /api/v1/recycle/requests/new-id */
  @Get('new-id')
  @Roles(...WRITER_ROLES)
  async generateId(@CurrentUser() user: JwtPayload) {
    const requestId = await this.requestIdService.generate(user.workspaceId);
    return createResponse({ requestId }, 'recycle request ID generated');
  }
}
