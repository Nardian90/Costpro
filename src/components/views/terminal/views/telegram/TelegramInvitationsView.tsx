'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Trash2, UserPlus, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Invitation {
  id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
  response_at: string | null;
  joined_at: string | null;
}

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  pending: { color: 'bg-muted text-muted-foreground', icon: Clock, label: 'Pendiente' },
  pre_message_sent: { color: 'bg-blue-500/10 text-blue-600', icon: Upload, label: 'Pre-mensaje enviado' },
  waiting_response: { color: 'bg-amber-500/10 text-amber-600', icon: Clock, label: 'Esperando respuesta' },
  invited: { color: 'bg-purple-500/10 text-purple-600', icon: CheckCircle2, label: 'Invitado' },
  accepted: { color: 'bg-green-500/10 text-green-600', icon: CheckCircle2, label: 'Aceptado' },
  rejected: { color: 'bg-red-500/10 text-red-600', icon: XCircle, label: 'Rechazado' },
  expired: { color: 'bg-muted text-muted-foreground', icon: Clock, label: 'Expirado' },
  failed: { color: 'bg-destructive/10 text-destructive', icon: AlertCircle, label: 'Fallido' },
};

export default function TelegramInvitationsView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    try {
      const params = new URLSearchParams({ store_id: storeId });
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/telegram/invitations?${params}`);
      const json = await res.json();
      if (json.data) setInvitations(json.data);
    } catch {
      toast.error('Error al cargar invitaciones');
    }
    setLoading(false);
  }, [storeId, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const handleAddOne = async () => {
    if (!storeId) return;
    // Prompt simple: pedir telegram_user_id via input inline
    const input = prompt('Telegram User ID (número):');
    if (!input) return;
    const tgId = parseInt(input, 10);
    if (isNaN(tgId)) {
      toast.error('ID debe ser un número');
      return;
    }
    try {
      const res = await fetch('/api/telegram/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, telegram_user_id: tgId }),
      });
      if (res.ok) {
        toast.success('Invitación creada');
        load();
      } else {
        toast.error('Error al crear invitación');
      }
    } catch {
      toast.error('Error de red');
    }
  };

  const handleImport = async () => {
    if (!storeId || !importText.trim()) return;
    setImporting(true);
    try {
      // Parse: un ID por línea, opcionalmente "id,username,first_name"
      const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
      const invs = lines.map(line => {
        const [idStr, username, first_name] = line.split(',').map(s => s.trim());
        const telegram_user_id = parseInt(idStr, 10);
        if (isNaN(telegram_user_id)) return null;
        return { telegram_user_id, username: username || undefined, first_name: first_name || undefined };
      }).filter(Boolean) as any[];

      if (invs.length === 0) {
        toast.error('No se parsearon IDs válidos');
        setImporting(false);
        return;
      }

      const res = await fetch('/api/telegram/invitations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, invitations: invs }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`${json.imported} invitaciones importadas`);
        setImportText('');
        setShowImport(false);
        load();
      } else {
        toast.error(json.error || 'Error al importar');
      }
    } catch {
      toast.error('Error de red');
    }
    setImporting(false);
  };

  const handleDelete = async (id: string) => {
    if (!storeId) return;
    try {
      await fetch(`/api/telegram/invitations?id=${id}&store_id=${storeId}`, { method: 'DELETE' });
      setInvitations(prev => prev.filter(i => i.id !== id));
      toast.success('Invitación eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl w-full mx-auto overflow-y-auto h-full pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight">Invitaciones</h2>
            <p className="text-xs text-muted-foreground">Telegram · botones inline</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowImport(!showImport)} className="text-xs h-9">
            <Upload className="w-3.5 h-3.5" /> Importar
          </Button>
          <Button size="sm" onClick={handleAddOne} className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white">
            <UserPlus className="w-3.5 h-3.5" /> Nueva
          </Button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-xs font-black uppercase">Importar invitaciones</h3>
            <p className="text-[10px] text-muted-foreground">
              Un ID por línea. Formato: <code className="bg-muted px-1 rounded">telegram_user_id, username, first_name</code> (solo el ID es obligatorio).
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'123456789\n987654321, juanperez, Juan\n555555555, mariagarcia, Maria'}
              className="w-full text-xs p-2 rounded-lg border border-border bg-background min-h-[100px] font-mono"
            />
            <Button onClick={handleImport} disabled={importing || !importText.trim()} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Importar'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={filterStatus === '' ? 'default' : 'outline'}
          onClick={() => setFilterStatus('')}
          className="text-[10px] h-7"
        >
          Todas
        </Button>
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <Button
            key={status}
            size="sm"
            variant={filterStatus === status ? 'default' : 'outline'}
            onClick={() => setFilterStatus(status)}
            className="text-[10px] h-7"
          >
            {cfg.label}
          </Button>
        ))}
      </div>

      {/* Lista */}
      {invitations.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Upload className="w-8 h-8 opacity-20 mx-auto mb-2" />
            <p className="text-xs">Sin invitaciones. Crea una o importa una lista.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invitations.map(inv => {
            const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <Card key={inv.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-600">
                      {(inv.first_name || inv.username || String(inv.telegram_user_id))[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">
                      {inv.first_name || inv.username || `ID: ${inv.telegram_user_id}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">{inv.telegram_user_id}</p>
                  </div>
                  <Badge className={cn('text-[9px]', cfg.color)}>
                    <Icon className="w-2.5 h-2.5 mr-1 inline" />
                    {cfg.label}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(inv.id)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
