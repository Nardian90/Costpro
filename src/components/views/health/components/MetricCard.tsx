import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isUp: boolean;
  };
  color?: 'primary' | 'success' | 'warning' | 'destructive' | 'blue';
  className?: string;
}

const colorMap = {
  primary: 'bg-primary/10 text-primary border-primary/20',
  success: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'primary',
  className
}) => {
  return (
    <div className={cn(
      "p-6 rounded-[32px] bg-card border border-border/50 shadow-sm",
      className
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center border",
          colorMap[color]
        )}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <div className={cn(
            "text-[10px] font-black px-2 py-1 rounded-full",
            trend.isUp ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
          )}>
            {trend.isUp ? '↑' : '↓'} {trend.value}%
          </div>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
        <div className="text-3xl font-black tracking-tighter">{value}</div>
        {subtitle && (
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{subtitle}</p>
        )}
      </div>
    </div>
  );
};
