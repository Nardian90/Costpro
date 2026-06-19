import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Package, TrendingUp, ChevronRight, Target, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionBadgesProps {
  appliedRules?: string[];
  className?: string;
}

export function ActionBadges({ appliedRules, className }: ActionBadgesProps) {
  if (!appliedRules || appliedRules.length === 0) return null;

  const badges = [
    { rule: 'HARD_REF', icon: <Target className="w-3 h-3" />, label: 'EXACT_MATCH', color: 'text-primary bg-blue-50 border-blue-200' },
    { rule: 'EXACT_SUM', icon: <Target className="w-3 h-3" />, label: 'EXACT_MATCH', color: 'text-success bg-green-50 border-green-200' },
    { rule: 'PRICE_FLEX', icon: <TrendingUp className="w-3 h-3" />, label: 'PRICE_FLEX', color: 'text-warning bg-orange-50 border-orange-200' },
    { rule: 'WILDCARDS', icon: <Package className="w-3 h-3" />, label: 'WILDCARDS', color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { rule: 'TOLERANCE', icon: <Info className="w-3 h-3" />, label: 'TOLERANCE_APPLIED', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
    { rule: 'CASH_FILL', icon: <ChevronRight className="w-3 h-3" />, label: 'CASH_FILL', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  ];

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {badges.filter(b => appliedRules.includes(b.rule)).map((b, idx) => (
        <Tooltip key={idx}>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={cn("px-1 h-5 text-[9px] font-black flex items-center gap-1 uppercase", b.color)}>
              {b.icon}
              {b.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-[10px] font-bold uppercase">Regla aplicada: {b.rule}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
