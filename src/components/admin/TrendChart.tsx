"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface TrendPoint {
  date: string;
  total: number;
  resolved: number;
  escalated: number;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-ink-subtle">
        No data for the selected period.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "rgb(var(--ink-subtle))" }}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "rgb(var(--ink-subtle))" }}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid rgb(var(--line))",
            }}
          />
          <Line
            type="monotone"
            dataKey="total"
            name="Total"
            stroke="rgb(var(--e6-eternal))"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="resolved"
            name="Resolved"
            stroke="rgb(var(--e6-vibrant))"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="escalated"
            name="Emailed Service Desk"
            stroke="rgb(var(--e6-orange))"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
