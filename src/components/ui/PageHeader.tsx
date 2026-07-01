'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderBadge {
  text: string;
  variant: 'default' | 'success' | 'warning' | 'danger';
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: PageHeaderBadge;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

const badgeVariantMap: Record<PageHeaderBadge['variant'], string> = {
  default: 'bg-primary/10 text-primary border-primary/20',
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  danger: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
};

export default function PageHeader({
  title,
  description,
  icon: Icon,
  badge,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="border-b border-border/50 pb-4 sm:pb-6"
    >
      {/* Main header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side: icon + title + badge + description */}
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground shrink-0">
              <Icon className="w-5 h-5" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-label text-lg sm:text-xl font-bold tracking-tight text-foreground capitalize">
                {title}
              </h1>

              {badge && (
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-full px-2.5 py-0 text-[10px] font-semibold uppercase tracking-wider border',
                    badgeVariantMap[badge.variant]
                  )}
                >
                  {badge.text}
                </Badge>
              )}
            </div>

            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground leading-snug">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Right side: actions */}
        {actions && (
          <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
            {actions}
          </div>
        )}
      </div>

      {/* Children: filters, toggles, etc. */}
      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </motion.div>
  );
}
