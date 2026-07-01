'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Shield, Crown, Search, UserMinus, MessageCircle } from 'lucide-react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useWhatsAppSocket, type WhatsAppMessageEvent, type WhatsAppGroupParticipantEvent } from '@/hooks/whatsapp/useWhatsAppSocket';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}min`;
  if (diffHour < 24) return `hace ${diffHour}h`;
  if (diffDay < 7) return `hace ${diffDay}d`;
  return date.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit' });
}

interface Participant {
  id: string;
  name: string;
  isAdmin: boolean;
}

export default function WhatsAppGroupView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [config, setConfig] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // FASE 5: último mensaje del grupo (se actualiza en tiempo real via socket)
  const [lastGroupMessage, setLastGroupMessage] = useState<{ content: string; sender: string; ts: number } | null>(null);

  // FASE 5: suscripción a eventos realtime
  const { on } = useWhatsAppSocket({ storeId });

  const loadGroup = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/group?store_id=${storeId}`);
      const json = await res.json();
      if (json.data) {
        setConfig(json.data.config);
        setParticipants(json.data.participants || []);
      }
    } catch {
      toast.error('Error al cargar grupo');
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    loadGroup();
    // FASE 5: el polling cada 30s se elimina — los cambios en participantes
    // llegan via socket event 'group_participant'.
  }, [loadGroup]);

  // FASE 5: escuchar eventos realtime
  useEffect(() => {
    const offs: Array<() => void> = [];

    // Cuando alguien entra/sale del grupo, recargar la lista
    offs.push(on('group_participant', (_ev: WhatsAppGroupParticipantEvent) => {
      // Recargar la lista completa del server (más confiable que patch local)
      loadGroup();
    }));

    // Cuando llega un mensaje del grupo, actualizar el 'último mensaje'
    // Solo nos interesan mensajes cuyo phone_number coincide con el JID del grupo
    // (los mensajes de grupo usan jid@g.us como remitente).
    offs.push(on('message_incoming', (ev: WhatsAppMessageEvent) => {
      if (config?.group_jid && ev.phone_number.includes('@g.us')) {
        setLastGroupMessage({
          content: ev.content,
          sender: ev.sender_name || ev.phone_number,
          ts: ev.ts,
        });
      }
    }));

    return () => { offs.forEach(off => off()); };
  }, [on, config?.group_jid, loadGroup]);

  const filteredParticipants = participants.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search)
  );

  const adminCount = participants.filter(p => p.isAdmin).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl w-full mx-auto overflow-y-auto h-full pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-black uppercase tracking-tight">Grupo de Ventas</h2>
          <p className="text-xs text-muted-foreground">Gestión de participantes</p>
        </div>
      </div>

      {/* Group info */}
      {!config?.group_jid ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium">Sin grupo configurado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Ve a "Conexión y Config" para configurar el JID del grupo de ventas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-black text-green-600 dark:text-green-400">{participants.length}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Participantes</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{adminCount}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Admins</p>
                </div>
                <div>
                  <p className="text-2xl font-black">{config?.bot_is_admin ? '✓' : '✗'}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Bot Admin</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Group name */}
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold">{config?.group_name || 'Grupo sin nombre'}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{config?.group_jid}</p>
              </div>
              <Badge variant={config?.welcome_enabled ? 'default' : 'secondary'} className="text-[9px]">
                {config?.welcome_enabled ? 'Bienvenida ON' : 'Bienvenida OFF'}
              </Badge>
            </CardContent>
          </Card>

          {/* FASE 5: Último mensaje del grupo (actualización en tiempo real) */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                <h3 className="text-xs font-black uppercase">Último mensaje del grupo</h3>
              </div>
              {lastGroupMessage ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[9px] h-4">{lastGroupMessage.sender}</Badge>
                    <span className="text-[9px] text-muted-foreground">{timeAgo(new Date(lastGroupMessage.ts).toISOString())}</span>
                  </div>
                  <p className="text-xs text-foreground/90 line-clamp-2">{lastGroupMessage.content}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Sin mensajes recientes. Cuando llegue uno al grupo, aparecerá aquí en tiempo real.</p>
              )}
            </CardContent>
          </Card>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar participante…"
              className="w-full h-11 pl-8 pr-3 rounded-lg border border-border bg-background text-xs"
            />
          </div>

          {/* Participants list */}
          <div className="space-y-1">
            {filteredParticipants.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-xs">
                  {participants.length === 0
                    ? 'No se pudieron cargar participantes. ¿Está WhatsApp conectado?'
                    : 'Sin resultados'}
                </p>
              </div>
            ) : (
              filteredParticipants.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg border border-border/50 hover:bg-muted/30"
                >
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-green-600">
                      {p.name[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{p.id.split('@')[0]}</p>
                  </div>
                  {p.isAdmin && (
                    <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px]">
                      <Crown className="w-2.5 h-2.5 mr-1" /> Admin
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
