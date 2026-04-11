'use client';

import React from 'react';
import { TrendingUp, DollarSign, Activity } from 'lucide-react';
import { cn, formatCurrency , isDarkTheme} from '@/lib/utils';
import { useTheme } from 'next-themes';

interface KpiCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  linePath: string;
  lineColor: string;
}

const Sparkline = ({ path, color }: { path: string; color: string }) => (
  <svg className="w-16 h-8 overflow-visible" viewBox="0 0 60 20">
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeWidth="2"
    />
    {/* Circle at the end of the path */}
    <circle cx="60" cy={path.includes('T 60') ? path.split('T 60')[1].trim() : (path.includes('60') ? path.split('60').pop()?.split(' ')[1] : 10)} fill={color} r="2" />
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
      icon: <TrendingUp className="w-6 h-6" />,
      iconColor: 'text-[#39FF14]',
      iconBg: 'bg-[#39FF14]/10 border-[#39FF14]/20',
      linePath: 'M0 15 Q 10 5, 20 12 T 40 8 T 60 18',
      lineColor: '#39FF14'
    },
    {
      title: 'Costo de Ventas',
      value: costs,
      icon: <DollarSign className="w-6 h-6" />,
      iconColor: 'text-muted-foreground dark:text-foreground/80',
      iconBg: 'bg-muted/50 dark:bg-white/5 border-border/50 dark:border-white/10',
      linePath: 'M0 5 Q 15 15, 30 8 T 60 12',
      lineColor: isDark ? '#ffffff' : '#64748b' // White in dark, Slate-500 in light
    },
    {
      title: 'Utilidad Neta',
      value: profit,
      icon: <Activity className="w-6 h-6" />,
      iconColor: 'text-[#00E0FF]',
      iconBg: 'bg-[#00E0FF]/10 border-[#00E0FF]/20',
      linePath: 'M0 18 Q 15 2, 30 14 T 60 2',
      lineColor: '#00E0FF'
    }
  ];

  return (
    <div className="space-y-3">
      {cards.map((card, i) => (
        <div
          key={i}
          className="bg-card/80 backdrop-blur-md p-5 rounded-[24px] border border-border/50 flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border", card.iconBg, card.iconColor)}>
              {card.icon}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-600 dark:text-foreground/80 uppercase tracking-tight">
                {card.title}
              </p>
              <h3 className="text-xl font-bold font-display text-foreground">
                {formatCurrency(card.value)}
              </h3>
            </div>
          </div>
          <Sparkline path={card.linePath} color={card.lineColor} />
        </div>
      ))}
    </div>
  );
};
