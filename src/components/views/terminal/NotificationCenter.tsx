'use client';

import React from 'react';
import { useStoreNotifications } from '@/hooks/api/useStoreNotifications';
import { Bell, AlertTriangle, FileText, Package, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

/**
 * F6-T02: Centro de notificaciones por tienda.
 *
 * Se monta en el Header (bell icon con badge de no leídas).
 * Muestra notificaciones scoped por tienda: stock bajo, FCs pendientes, etc.
 * Cada notificación se puede marcar como leída.
 */

const NOTIFICATION_ICONS = {
  stock_low: Package,
  fc_pending: FileText,
  store_inactive: AlertTriangle,
  receipt_pending: Package,
};

const SEVERITY_COLORS = {
  error: 'text-destructive bg-destructive/10',
  warning: 'text-amber-600 bg-amber-100 dark:bg-amber-950/40',
  info: 'text-primary bg-primary/10',
};

export function NotificationCenter() {
  const { notifications, unreadCount, isLoading, markAsRead } = useStoreNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-xl hover:bg-muted transition-colors"
          aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-white text-[9px] font-black">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 sm:w-96 p-0 max-h-[70vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-xs font-black uppercase tracking-widest text-primary">
            Notificaciones
          </h3>
          {unreadCount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {unreadCount} sin leer
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Cargando notificaciones...
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center">
            <Bell className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Sin notificaciones
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {notifications.map(n => {
              const Icon = NOTIFICATION_ICONS[n.type] || Bell;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "p-3 hover:bg-muted/30 transition-colors cursor-pointer",
                    !n.read && "bg-primary/5"
                  )}
                  onClick={() => markAsRead(n.id)}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      SEVERITY_COLORS[n.severity]
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                        {n.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary/60">
                          {n.store_name}
                        </span>
                      </div>
                    </div>
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
