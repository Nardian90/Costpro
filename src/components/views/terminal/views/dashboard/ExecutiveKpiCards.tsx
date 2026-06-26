'use client';

import React from 'react';
import { TrendingUp, DollarSign, Activity } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/utils';
import { useTranslations } from 'next-intl';

// Sparkline: SVG con color de token semántico (no hex hardcoded)
const Sparkline = ({ path, colorClass }: { path: string; colorClass: string }) => {
  // Extract final Y position from the path for the dot
  const match = path.match(/[\d.]+$/);
  const cy = match ? parseFloat(match[0]) : 10;

  return (
    <svg className="w-16 h-8 overflow-visible" viewBox="0 0 60 20" aria-hidden="true">
      <path
        d={path}
        className={colorClass}
        fill="none"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle className={colorClass} cx="60" cy={cy} r="2" />
    </svg>
  );
};

interface KpiCardData {
  title: string;
  value: number;
  icon: React.ReactNode;
  iconBg: string;
  linePath: string;
  lineColorClass: string;
}

export const ExecutiveKpiCards = ({
  sales,
  costs,
  profit
}: {
  sales: number;
  costs: number;
  profit: number;
}) => {
  const t = useTranslations('dashboard.storeDashboard');
  const { resolvedTheme } = useTheme();
  const isDark = isDarkTheme(resolvedTheme);

  const cards: KpiCardData[] = [
    {
      title: t('executiveKpis.totalSales'),
      value: sales,
      icon: <TrendingUp className="w-5 h-5" />,
      iconBg: 'bg-primary/10 text-primary',
      linePath: 'M0 15 Q 10 5, 20 12 T 40 8 T 60 18',
      lineColorClass: 'stroke-primary',
    },
    {
      title: t('executiveKpis.costOfSales'),
      value: costs,
      icon: <DollarSign className="w-5 h-5" />,
      iconBg: 'bg-muted text-muted-foreground',
      linePath: 'M0 5 Q 15 15, 30 8 T 60 12',
      // Uses semantic token instead of hardcoded #94a3b8 / #64748b
      lineColorClass: isDark ? 'stroke-muted-foreground' : 'stroke-secondary',
    },
    {
      title: t('executiveKpis.netProfit'),
      value: profit,
      icon: <Activity className="w-5 h-5" />,
      // Uses semantic success token instead of hardcoded emerald
      iconBg: 'bg-success/10 text-success',
      linePath: 'M0 18 Q 15 2, 30 14 T 60 2',
      lineColorClass: 'stroke-success',
    }
  ];

  return (
    <div className="space-y-3" role="list" aria-label="Indicadores clave de rendimiento">
      {cards.map((card, i) => (
        <div
          key={i}
          role="listitem"
          className="bg-card p-4 sm:p-5 rounded-2xl border border-border/50 flex items-center justify-between shadow-sm transition-colors duration-200 hover:border-border"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0", card.iconBg)}>
              {card.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground truncate">
                {card.title}
              </p>
              <h3 className="text-lg sm:text-xl font-bold font-display text-foreground tracking-tight tabular-nums">
                {formatCurrency(card.value)}
              </h3>
            </div>
          </div>
          <div className="shrink-0 hidden sm:block">
            <Sparkline path={card.linePath} colorClass={card.lineColorClass} />
          </div>
        </div>
      ))}
    </div>
  );
};
