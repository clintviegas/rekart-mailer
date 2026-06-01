"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const data = [
  { name: "Sent", value: 48, color: "oklch(0.558 0.238 264.376)" },
  { name: "Draft", value: 22, color: "oklch(0.73 0.13 290)" },
  { name: "Scheduled", value: 18, color: "oklch(0.626 0.19 240)" },
  { name: "Paused", value: 12, color: "oklch(0.688 0.155 220)" },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: entry.payload.color }}
        />
        <span className="text-muted-foreground">{entry.name}:</span>
        <span className="font-medium text-foreground">{entry.value}%</span>
      </div>
    </div>
  );
}

export function CampaignStatusChart() {
  return (
    <div className="flex flex-col items-center gap-4">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={78}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} strokeWidth={0} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="grid w-full grid-cols-2 gap-2">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium text-foreground">{entry.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
