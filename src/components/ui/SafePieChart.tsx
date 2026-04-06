'use client';

import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import { cn } from '@/lib/utils';

interface SafePieChartProps {
  data: any[];
  colors?: string[];
  height?: number | string;
  innerRadius?: number;
  outerRadius?: number;
  showTooltip?: boolean;
  showLegend?: boolean;
  className?: string;
}

export const SafePieChart: React.FC<SafePieChartProps> = ({
  data,
  colors = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6'],
  height = 280,
  innerRadius = 60,
  outerRadius = 90,
  showTooltip = true,
  showLegend = false,
  className
}) => {
  return (
    <div className={cn("w-full relative overflow-visible chart-container", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={5}
            dataKey="value"
            stroke="transparent"
            animationBegin={0}
            animationDuration={1500}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length]}
                className="hover:opacity-80 transition-opacity"
              />
            ))}
          </Pie>
          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(var(--background), 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(var(--border), 0.2)',
                borderRadius: '16px',
                fontSize: '11px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '12px'
              }}
              cursor={{ fill: 'transparent' }}
            />
          )}
          {showLegend && <Legend verticalAlign="bottom" height={36} />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
