import { Controller, Get } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('current')
  getCurrent(@CurrentUser() user: JwtPayload) {
    return this.workspaceService.getCurrent(user);
  }
}
