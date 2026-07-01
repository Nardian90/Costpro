import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: LucideIcon;
  color?: 'primary' | 'success' | 'warning' | 'destructive' | 'blue';
  progress?: number;
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, icon: Icon, color = 'primary', progress = 85 }) => {
  const colorMap = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    destructive: 'bg-destructive/10 text-destructive border-destructive/20',
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  };

  const barColorMap = {
    primary: 'bg-primary',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    destructive: 'bg-destructive',
    blue: 'bg-blue-500',
  };

  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="p-8 rounded-[40px] bg-card border border-border/50 shadow-sm hover:shadow-2xl hover:border-primary/30 transition-all duration-500 group relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center gap-6 mb-8">
        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center border shrink-0 group-hover:scale-110 transition-transform duration-500", colorMap[color])}>
          <Icon className="w-8 h-8" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground truncate">{title}</h4>
          <div className="text-3xl font-black tracking-tighter leading-none mt-1 group-hover:text-primary transition-colors">{value}</div>
        </div>
      </div>

      <div className="w-full h-1 bg-muted/20 rounded-full overflow-hidden mb-3">
         <div className={cn("h-full rounded-full transition-all duration-1000", barColorMap[color])} style={{ width: `${clampedProgress}%` }} />
      </div>

      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-60 leading-tight">
        {subtitle}
      </p>
    </div>
  );
};
