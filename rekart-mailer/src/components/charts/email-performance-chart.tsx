"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const data = [
  { date: "Jan 1", sent: 4200, opened: 1850, clicked: 440 },
  { date: "Jan 7", sent: 5800, opened: 2400, clicked: 620 },
  { date: "Jan 14", sent: 3900, opened: 1600, clicked: 390 },
  { date: "Jan 21", sent: 7200, opened: 3100, clicked: 850 },
  { date: "Jan 28", sent: 6100, opened: 2650, clicked: 710 },
  { date: "Feb 4", sent: 8400, opened: 3600, clicked: 920 },
  { date: "Feb 11", sent: 7800, opened: 3200, clicked: 830 },
  { date: "Feb 18", sent: 9200, opened: 4100, clicked: 1100 },
  { date: "Feb 25", sent: 10500, opened: 4800, clicked: 1250 },
  { date: "Mar 4", sent: 9800, opened: 4200, clicked: 1050 },
  { date: "Mar 11", sent: 11200, opened: 5100, clicked: 1380 },
  { date: "Mar 18", sent: 12400, opened: 5600, clicked: 1520 },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-md">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="capitalize text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">
            {entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmailPerformanceChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.558 0.238 264.376)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="oklch(0.558 0.238 264.376)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="openedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.626 0.19 240)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="oklch(0.626 0.19 240)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="clickedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.688 0.155 220)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="oklch(0.688 0.155 220)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "oklch(0.52 0.03 264)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "oklch(0.52 0.03 264)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="sent"
          stroke="oklch(0.558 0.238 264.376)"
          strokeWidth={2}
          fill="url(#sentGrad)"
        />
        <Area
          type="monotone"
          dataKey="opened"
          stroke="oklch(0.626 0.19 240)"
          strokeWidth={2}
          fill="url(#openedGrad)"
        />
        <Area
          type="monotone"
          dataKey="clicked"
          stroke="oklch(0.688 0.155 220)"
          strokeWidth={2}
          fill="url(#clickedGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
