import { Controller, Get } from '@nestjs/common';
import { RecycleAnalyticsService } from './recycle-analytics.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../common/utils/enums';

const ANALYTICS_ROLES = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.ANALYST,
  UserRole.EDITOR,
];

@Controller('recycle/analytics')
export class RecycleAnalyticsController {
  constructor(private readonly analyticsService: RecycleAnalyticsService) {}

  @Get('overview')
  @Roles(...ANALYTICS_ROLES)
  getOverview(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getOverview(user);
  }

  @Get('workflow-breakdown')
  @Roles(...ANALYTICS_ROLES)
  getWorkflowBreakdown(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getWorkflowBreakdown(user);
  }

  @Get('daily-trend')
  @Roles(...ANALYTICS_ROLES)
  getDailyTrend(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getDailyTrend(user);
  }

  @Get('provider-breakdown')
  @Roles(...ANALYTICS_ROLES)
  getProviderBreakdown(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getProviderBreakdown(user);
  }

  @Get('engagement')
  @Roles(...ANALYTICS_ROLES)
  getEngagementTrend(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getEngagementTrend(user);
  }

  @Get('recent')
  @Roles(...ANALYTICS_ROLES)
  getRecentDeliveries(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getRecentDeliveries(user);
  }
}
