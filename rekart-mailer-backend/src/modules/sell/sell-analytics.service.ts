import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PipelineStage } from 'mongoose';
import {
  SellDeliveryLog,
  SellDeliveryLogDocument,
  DeliveryStatus,
} from './schemas/sell-delivery-log.schema';
import {
  SellSuppression,
  SellSuppressionDocument,
  SuppressionReason,
} from './schemas/sell-suppression.schema';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';
import { formatDateDDMMYY } from '../../common/date-format';

const WORKFLOW_LABELS: Record<string, string> = {
  'request-received': 'Request Received',
  'pickup-scheduled': 'Pickup Scheduled',
  'inspection-underway': 'Inspection Underway',
  'offer-ready': 'Offer Ready',
  'payment-sent': 'Payment Sent',
  'device-collected': 'Item Collected',
  completed: 'Completed',
};

@Injectable()
export class SellAnalyticsService {
  constructor(
    @InjectModel(SellDeliveryLog.name)
    private readonly logModel: Model<SellDeliveryLogDocument>,

    @InjectModel(SellSuppression.name)
    private readonly suppressionModel: Model<SellSuppressionDocument>,
  ) {}

  // ── Overview KPIs (delivery + engagement) ─────────────────────────────────
  async getOverview(user: JwtPayload) {
    const wsId = new Types.ObjectId(user.workspaceId);

    const [statusCounts, engagementAgg, recentCount, suppressionCounts] = await Promise.all([
      this.logModel.aggregate<{ _id: string; count: number }>([
        { $match: { workspaceId: wsId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.logModel.aggregate<{
        totalSent: number;
        totalOpened: number;
        totalClicked: number;
      }>([
        { $match: { workspaceId: wsId, status: DeliveryStatus.SENT } },
        {
          $group: {
            _id: null,
            totalSent: { $sum: 1 },
            totalOpened: { $sum: { $cond: ['$opened', 1, 0] } },
            totalClicked: { $sum: { $cond: ['$clicked', 1, 0] } },
          },
        },
      ]),
      this.logModel.countDocuments({
        workspaceId: wsId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
      this.suppressionModel.aggregate<{ _id: string; count: number }>([
        { $match: { workspaceId: wsId } },
        { $group: { _id: '$reason', count: { $sum: 1 } } },
      ]),
    ]);

    const byStatus = Object.fromEntries(
      statusCounts.map((s) => [s._id, s.count]),
    );

    const totalSent: number = byStatus[DeliveryStatus.SENT] ?? 0;
    const totalFailed: number = byStatus[DeliveryStatus.FAILED] ?? 0;
    const totalQueued: number = byStatus[DeliveryStatus.QUEUED] ?? 0;
    const totalProcessing: number = byStatus[DeliveryStatus.PROCESSING] ?? 0;
    const totalSuppressed: number = byStatus[DeliveryStatus.SUPPRESSED] ?? 0;
    const totalAttempted = totalSent + totalFailed;
    const deliveryRate =
      totalAttempted > 0
        ? Math.round((totalSent / totalAttempted) * 100)
        : null;

    // Suppression breakdown
    const suppByReason = Object.fromEntries(
      suppressionCounts.map((s) => [s._id, s.count]),
    );
    const totalUnsubscribed: number =
      suppByReason[SuppressionReason.UNSUBSCRIBED] ?? 0;
    const totalSuppressedList: number = suppressionCounts.reduce(
      (acc, s) => acc + s.count,
      0,
    );

    const eng = engagementAgg[0] ?? { totalSent: 0, totalOpened: 0, totalClicked: 0 };
    const totalOpened: number = eng.totalOpened;
    const totalClicked: number = eng.totalClicked;
    const openRate =
      eng.totalSent > 0 ? Math.round((totalOpened / eng.totalSent) * 100) : null;
    const clickRate =
      eng.totalSent > 0 ? Math.round((totalClicked / eng.totalSent) * 100) : null;
    const ctr =
      totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : null;

    return createResponse(
      {
        totalSent,
        totalFailed,
        totalQueued,
        totalProcessing,
        totalSuppressed,
        deliveryRate,
        recentActivityCount: recentCount,
        totalOpened,
        totalClicked,
        openRate,
        clickRate,
        ctr,
        totalUnsubscribed,
        totalSuppressedList,
      },
      'Overview fetched',
    );
  }

  // ── Workflow breakdown ────────────────────────────────────────────────────
  async getWorkflowBreakdown(user: JwtPayload) {
    const wsId = new Types.ObjectId(user.workspaceId);

    const pipeline: PipelineStage[] = [
      { $match: { workspaceId: wsId } },
      {
        $group: {
          _id: { workflowKey: '$workflowKey', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.workflowKey',
          statuses: {
            $push: { status: '$_id.status', count: '$count' },
          },
        },
      },
    ];

    const raw = await this.logModel.aggregate<{
      _id: string;
      statuses: { status: string; count: number }[];
    }>(pipeline);

    const result = raw.map((r) => {
      const byStatus = Object.fromEntries(
        r.statuses.map((s) => [s.status, s.count]),
      );
      return {
        workflowKey: r._id,
        label: WORKFLOW_LABELS[r._id] ?? r._id,
        sent: byStatus[DeliveryStatus.SENT] ?? 0,
        failed: byStatus[DeliveryStatus.FAILED] ?? 0,
        queued:
          (byStatus[DeliveryStatus.QUEUED] ?? 0) +
          (byStatus[DeliveryStatus.PROCESSING] ?? 0),
      };
    });

    const ORDER = Object.keys(WORKFLOW_LABELS);
    result.sort(
      (a, b) => ORDER.indexOf(a.workflowKey) - ORDER.indexOf(b.workflowKey),
    );

    return createResponse(result, 'Workflow breakdown fetched');
  }

  // ── Daily trend (last 30 days) ────────────────────────────────────────────
  async getDailyTrend(user: JwtPayload) {
    const wsId = new Types.ObjectId(user.workspaceId);
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const pipeline: PipelineStage[] = [
      {
        $match: {
          workspaceId: wsId,
          createdAt: { $gte: since },
          status: { $in: [DeliveryStatus.SENT, DeliveryStatus.FAILED] },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          statuses: {
            $push: { status: '$_id.status', count: '$count' },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const raw = await this.logModel.aggregate<{
      _id: string;
      statuses: { status: string; count: number }[];
    }>(pipeline);

    const dataMap = new Map(
      raw.map((r) => [
        r._id,
        Object.fromEntries(r.statuses.map((s) => [s.status, s.count])),
      ]),
    );

    const trend: { date: string; sent: number; failed: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const entry = dataMap.get(key) ?? {};
      trend.push({
        date: formatDateDDMMYY(d),
        sent: entry[DeliveryStatus.SENT] ?? 0,
        failed: entry[DeliveryStatus.FAILED] ?? 0,
      });
    }

    return createResponse(trend, 'Daily trend fetched');
  }

  // ── Provider breakdown ────────────────────────────────────────────────────
  async getProviderBreakdown(user: JwtPayload) {
    const wsId = new Types.ObjectId(user.workspaceId);

    const pipeline: PipelineStage[] = [
      {
        $match: {
          workspaceId: wsId,
          provider: { $ne: null },
          status: { $in: [DeliveryStatus.SENT, DeliveryStatus.FAILED] },
        },
      },
      {
        $group: {
          _id: { provider: '$provider', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.provider',
          statuses: {
            $push: { status: '$_id.status', count: '$count' },
          },
        },
      },
    ];

    const raw = await this.logModel.aggregate<{
      _id: string | null;
      statuses: { status: string; count: number }[];
    }>(pipeline);

    const result = raw
      .filter((r) => r._id !== null)
      .map((r) => {
        const byStatus = Object.fromEntries(
          r.statuses.map((s) => [s.status, s.count]),
        );
        return {
          provider: r._id as string,
          sent: byStatus[DeliveryStatus.SENT] ?? 0,
          failed: byStatus[DeliveryStatus.FAILED] ?? 0,
        };
      });

    return createResponse(result, 'Provider breakdown fetched');
  }

  // ── Engagement trend (daily opens + clicks, last 30 days) ─────────────────
  async getEngagementTrend(user: JwtPayload) {
    const wsId = new Types.ObjectId(user.workspaceId);
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    // Opens: group by firstOpenedAt date
    const opensPipeline: PipelineStage[] = [
      {
        $match: {
          workspaceId: wsId,
          opened: true,
          firstOpenedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$firstOpenedAt' },
          },
          count: { $sum: 1 },
        },
      },
    ];

    // Clicks: group by firstClickedAt date
    const clicksPipeline: PipelineStage[] = [
      {
        $match: {
          workspaceId: wsId,
          clicked: true,
          firstClickedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$firstClickedAt' },
          },
          count: { $sum: 1 },
        },
      },
    ];

    const [opensRaw, clicksRaw] = await Promise.all([
      this.logModel.aggregate<{ _id: string; count: number }>(opensPipeline),
      this.logModel.aggregate<{ _id: string; count: number }>(clicksPipeline),
    ]);

    const opensMap = new Map(opensRaw.map((r) => [r._id, r.count]));
    const clicksMap = new Map(clicksRaw.map((r) => [r._id, r.count]));

    const trend: { date: string; opens: number; clicks: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      trend.push({
        date: formatDateDDMMYY(d),
        opens: opensMap.get(key) ?? 0,
        clicks: clicksMap.get(key) ?? 0,
      });
    }

    return createResponse(trend, 'Engagement trend fetched');
  }

  // ── Recent deliveries ─────────────────────────────────────────────────────
  async getRecentDeliveries(user: JwtPayload, limit = 10) {
    const logs = await this.logModel
      .find({ workspaceId: new Types.ObjectId(user.workspaceId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return createResponse(logs, 'Recent deliveries fetched');
  }
}
