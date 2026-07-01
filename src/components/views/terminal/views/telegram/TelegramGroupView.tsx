'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Crown, Shield, MessageCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

interface GroupInfo {
  configured: boolean;
  group_chat_id: number | null;
  group_title: string | null;
  member_count: number;
  bot_is_admin: boolean;
  welcome_enabled: boolean;
  welcome_message: string;
  error?: string;
}

export default function TelegramGroupView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastGroupMessage, setLastGroupMessage] = useState<{ content: string; sender: string; ts: number } | null>(null);

  const loadGroup = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/telegram/group?store_id=${storeId}`);
      const json = await res.json();
      if (json.data) setGroup(json.data);
    } catch {
      toast.error('Error al cargar grupo');
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    loadGroup();
    // Fase T6: polling 60s — se reemplazará por Supabase Realtime
    const interval = setInterval(loadGroup, 60000);
    return () => clearInterval(interval);
  }, [loadGroup]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl w-full mx-auto overflow-y-auto h-full pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-black uppercase tracking-tight">Grupo de Ventas</h2>
          <p className="text-xs text-muted-foreground">Telegram</p>
        </div>
      </div>

      {!group?.configured ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium">Sin grupo configurado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Ve a "Bot y Config" para configurar el Group Chat ID.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{group.member_count}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Miembros</p>
                </div>
                <div>
                  <p className="text-2xl font-black">{group.bot_is_admin ? '✓' : '✗'}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Bot Admin</p>
                </div>
                <div>
                  <p className="text-2xl font-black">{group.welcome_enabled ? '✓' : '✗'}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Bienvenida</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Group info */}
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold">{group.group_title || 'Grupo sin nombre'}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{group.group_chat_id}</p>
              </div>
              <Badge variant={group.bot_is_admin ? 'default' : 'secondary'} className="text-[9px]">
                {group.bot_is_admin ? (
                  <><Crown className="w-2.5 h-2.5 mr-1 inline" />Bot Admin</>
                ) : (
                  <><Shield className="w-2.5 h-2.5 mr-1 inline" />Sin admin</>
                )}
              </Badge>
            </CardContent>
          </Card>

          {/* Fase T6: Último mensaje del grupo (Supabase Realtime) */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                <h3 className="text-xs font-black uppercase">Último mensaje del grupo</h3>
              </div>
              {lastGroupMessage ? (
                <div className="space-y-1">
                  <Badge variant="secondary" className="text-[9px] h-4">{lastGroupMessage.sender}</Badge>
                  <p className="text-xs text-foreground/90 line-clamp-2">{lastGroupMessage.content}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Sin mensajes recientes. Cuando llegue uno al grupo, aparecerá aquí en tiempo real (Fase T6).
                </p>
              )}
            </CardContent>
          </Card>

          {/* Welcome message */}
          {group.welcome_enabled && (
            <Card>
              <CardContent className="p-3">
                <h3 className="text-xs font-black uppercase mb-1">Mensaje de bienvenida</h3>
                <p className="text-xs text-muted-foreground">{group.welcome_message}</p>
              </CardContent>
            </Card>
          )}

          {group.error && (
            <Card>
              <CardContent className="p-3 flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="text-xs">{group.error}</p>
              </CardContent>
            </Card>
          )}

          {/* Nota sobre limitación de Telegram */}
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">
                💡 <strong>Nota:</strong> Telegram Bot API no permite enumerar miembros de un grupo
                por privacidad. Solo se muestra el contador total. Para ver la lista de miembros,
                usa la app de Telegram directamente.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
