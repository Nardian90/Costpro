'use client';

import React from 'react';
import { TrendingUp, DollarSign, Activity } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/utils';

const Sparkline = ({ path, color }: { path: string; color: string }) => (
  <svg className="w-16 h-8 overflow-visible" viewBox="0 0 60 20">
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeWidth="2"
    />
    <circle cx="60" cy={path.includes('T 60') ? path.split('T 60')[1].trim() : 10} fill={color} r="2" />
  </svg>
);

export const ExecutiveKpiCards = ({
  sales,
  costs,
  profit
}: {
  sales: number;
  costs: number;
  profit: number;
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = isDarkTheme(resolvedTheme);

  const cards = [
    {
      title: 'Ingresos Totales',
      value: sales,
      icon: <TrendingUp className="w-5 h-5" />,
      iconBg: 'bg-primary/10 text-primary',
      linePath: 'M0 15 Q 10 5, 20 12 T 40 8 T 60 18',
      lineColor: 'var(--primary)',
    },
    {
      title: 'Costo de Ventas',
      value: costs,
      icon: <DollarSign className="w-5 h-5" />,
      iconBg: 'bg-muted text-muted-foreground',
      linePath: 'M0 5 Q 15 15, 30 8 T 60 12',
      lineColor: isDark ? '#94a3b8' : '#64748b',
    },
    {
      title: 'Utilidad Neta',
      value: profit,
      icon: <Activity className="w-5 h-5" />,
      iconBg: 'bg-emerald-500/10 text-emerald-500',
      linePath: 'M0 18 Q 15 2, 30 14 T 60 2',
      lineColor: '#10b981',
    }
  ];

  return (
    <div className="space-y-3">
      {cards.map((card, i) => (
        <div
          key={i}
          className="bg-card p-4 sm:p-5 rounded-2xl border border-border/50 flex items-center justify-between shadow-sm transition-colors hover:border-border"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0", card.iconBg)}>
              {card.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground truncate">
                {card.title}
              </p>
              <h3 className="text-lg sm:text-xl font-bold font-display text-foreground tracking-tight">
                {formatCurrency(card.value)}
              </h3>
            </div>
          </div>
          <div className="shrink-0 hidden sm:block">
            <Sparkline path={card.linePath} color={card.lineColor} />
          </div>
        </div>
      ))}
    </div>
  );
};
