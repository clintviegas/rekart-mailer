import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { SellSuppressionService } from './sell-suppression.service';
import { AddSuppressionDto } from './dto/add-suppression.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../common/utils/enums';
import { SuppressionReason } from './schemas/sell-suppression.schema';

const ADMIN_ROLES = [UserRole.OWNER, UserRole.ADMIN];

@Controller('sell/suppression')
export class SellSuppressionController {
  constructor(private readonly service: SellSuppressionService) {}

  @Get()
  @Roles(...ADMIN_ROLES)
  list(
    @CurrentUser() user: JwtPayload,
    @Query('reason') reason?: SuppressionReason,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(user, {
      reason,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  add(@Body() dto: AddSuppressionDto, @CurrentUser() user: JwtPayload) {
    return this.service.addByUser(user, dto);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user);
  }
}
