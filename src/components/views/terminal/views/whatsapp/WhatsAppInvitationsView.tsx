'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Upload, Plus, Trash2, Loader2, ShieldAlert, ShieldCheck, ShieldX, Clock } from 'lucide-react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Invitation {
  id: string;
  phone_number: string;
  name: string | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  response_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface RiskInfo {
  level: string;
  consecutiveBlocks: number;
  cooldownUntil: string | null;
  dailyInvitationCount: number;
  lastInvitationAt: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-muted text-muted-foreground' },
  pre_message_sent: { label: 'Pre-msg enviado', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  waiting_response: { label: 'Esperando respuesta', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  invited: { label: 'Invitado', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  accepted: { label: 'Aceptado', color: 'bg-green-600 text-white' },
  rejected: { label: 'Rechazado', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  expired: { label: 'Expirado', color: 'bg-muted text-muted-foreground' },
  blocked: { label: 'Bloqueado', color: 'bg-red-600 text-white' },
};

export default function WhatsAppInvitationsView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [risk, setRisk] = useState<RiskInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [importing, setImporting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const loadInvitations = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);

    const params = new URLSearchParams({ store_id: storeId });
    if (filterStatus !== 'all') params.set('status', filterStatus);

    const res = await fetch(`/api/whatsapp/invitations?${params}`);
    const json = await res.json();

    if (json.data) setInvitations(json.data);
    if (json.risk) {
      setRisk({
        level: json.risk.level,
        consecutiveBlocks: json.risk.consecutiveBlocks,
        cooldownUntil: json.risk.cooldownUntil,
        dailyInvitationCount: json.risk.dailyInvitationCount,
        lastInvitationAt: json.risk.lastInvitationAt,
      });
    }
    setLoading(false);
  }, [storeId, filterStatus]);

  useEffect(() => {
    loadInvitations();
    const interval = setInterval(loadInvitations, 15000);
    return () => clearInterval(interval);
  }, [loadInvitations]);

  const handleAdd = async () => {
    if (!newPhone.trim() || !storeId) return;
    const res = await fetch('/api/whatsapp/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, phone_number: newPhone.replace(/\D/g, ''), name: newName || undefined }),
    });
    if (res.ok) {
      toast.success('Invitación agregada a la cola');
      setNewPhone('');
      setNewName('');
      setShowAddForm(false);
      loadInvitations();
    } else {
      toast.error('Error al agregar');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('store_id', storeId);
    const res = await fetch('/api/whatsapp/invitations/import', { method: 'POST', body: formData });
    const json = await res.json();
    if (res.ok) {
      toast.success(`${json.imported} contactos importados`);
      loadInvitations();
    } else {
      toast.error(json.error || 'Error al importar');
    }
    setImporting(false);
    e.target.value = '';
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Cancelar esta invitación?')) return;
    if (!storeId) return;
    await fetch(`/api/whatsapp/invitations?id=${id}&store_id=${storeId}`, { method: 'DELETE' });
    setInvitations(prev => prev.filter(i => i.id !== id));
    toast.success('Invitación cancelada');
  };

  const riskIcon = risk?.level === 'safe' ? <ShieldCheck className="w-5 h-5 text-green-500" /> :
                   risk?.level === 'warning' ? <ShieldAlert className="w-5 h-5 text-amber-500" /> :
                   risk?.level === 'danger' ? <ShieldAlert className="w-5 h-5 text-orange-500" /> :
                   <ShieldX className="w-5 h-5 text-red-500" />;

  const riskLabel = risk?.level === 'safe' ? 'Seguro' :
                    risk?.level === 'warning' ? 'Precaución' :
                    risk?.level === 'danger' ? 'Peligro' :
                    'Bloqueado';

  const riskColor = risk?.level === 'safe' ? 'text-green-600 dark:text-green-400' :
                    risk?.level === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                    risk?.level === 'danger' ? 'text-orange-600 dark:text-orange-400' :
                    'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-4 p-4 max-w-5xl w-full mx-auto overflow-y-auto h-full pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight">Invitaciones</h2>
            <p className="text-xs text-muted-foreground">Cola de invitaciones con anti-ban</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
          </Button>
          <label>
            <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
            <Button variant="outline" size="sm" asChild disabled={importing}>
              <span>{importing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />} CSV</span>
            </Button>
          </label>
        </div>
      </div>

      {/* Risk semáforo */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {riskIcon}
            <div>
              <p className={cn('text-sm font-black uppercase', riskColor)}>{riskLabel}</p>
              <p className="text-[10px] text-muted-foreground">
                {risk?.consecutiveBlocks ? `${risk.consecutiveBlocks} bloqueos consecutivos` : 'Sin bloqueos'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <p className="font-bold">{risk?.dailyInvitationCount || 0}/20</p>
              <p className="text-[9px] text-muted-foreground uppercase">Hoy</p>
            </div>
            {risk?.cooldownUntil && (
              <div className="text-center">
                <p className="font-bold text-amber-600">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {new Date(risk.cooldownUntil).toLocaleDateString('es-CU')}
                </p>
                <p className="text-[9px] text-muted-foreground uppercase">Pausa hasta</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Teléfono</Label>
                <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="5312345678" pattern="[0-9]{5,15}" className="h-11" />
              </div>
              <div>
                <Label className="text-xs">Nombre (opcional)</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Juan Pérez" className="h-11" />
              </div>
            </div>
            <Button onClick={handleAdd} size="sm" className="w-full">Agregar a cola</Button>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-1 flex-wrap overflow-x-auto no-scrollbar">
        {['all', 'pending', 'pre_message_sent', 'waiting_response', 'invited', 'rejected', 'expired', 'blocked'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              'px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-colors',
              filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {s === 'all' ? 'Todos' : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-green-600" />
        </div>
      ) : invitations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin invitaciones en la cola</p>
          <p className="text-xs mt-1">Agrega contactos o importa un CSV para comenzar</p>
        </div>
      ) : (
        <div className="space-y-1">
          {invitations.map(inv => (
            <div
              key={inv.id}
              className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg border border-border/50 hover:bg-muted/30"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{inv.name || inv.phone_number}</p>
                <p className="text-[10px] text-muted-foreground">{inv.phone_number}</p>
              </div>
              <Badge className={cn('text-[9px] font-bold uppercase', STATUS_CONFIG[inv.status]?.color || 'bg-muted')}>
                {STATUS_CONFIG[inv.status]?.label || inv.status}
              </Badge>
              <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                {inv.sent_at ? new Date(inv.sent_at).toLocaleDateString('es-CU') : '—'}
              </span>
              {inv.status === 'pending' && (
                <button onClick={() => handleDelete(inv.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
