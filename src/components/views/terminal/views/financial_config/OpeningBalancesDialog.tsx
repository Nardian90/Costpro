'use client';

/**
 * CP-FIN — Vista A: Configuración de Documentos.
 * OpeningBalancesDialog: saldos iniciales de la tienda (apertura financiera).
 *
 * GET  /api/fin/opening-balances?store_id=...  (lista, todos los estados)
 * POST /api/fin/opening-balances
 *        { action:'create', category_code, amount, currency, exchange_rate?, as_of_date, notes? }
 *        { action:'apply', id }  → genera el asiento de apertura (RPC motor)
 *        { action:'void',  id }  → solo borradores
 *
 * Patrón de fetch autenticado: ReceivedServicesView (Bearer del authStore).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Landmark, RefreshCw, Plus, CheckCircle2, Ban, Info,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { type FinCategory, type OpeningBalance } from './types';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  applied: { label: 'Aplicado', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  voided: { label: 'Anulado', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface OpeningBalancesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Categorías del catálogo (GET /api/fin/config); se filtran a activo/pasivo/patrimonio. */
  categories: FinCategory[];
}

export default function OpeningBalancesDialog({ open, onClose, categories }: OpeningBalancesDialogProps) {
  const { user } = useAuthStore();
  const authToken = useAuthStore((s) => s.token);
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
  const storeId = user?.activeStoreId;

  const [balances, setBalances] = useState<OpeningBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Formulario
  const [categoryCode, setCategoryCode] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'CUP' | 'USD'>('CUP');
  const [exchangeRate, setExchangeRate] = useState('');
  const [asOfDate, setAsOfDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Confirmaciones (aplicar genera asiento real: siempre confirmado)
  const [confirmApply, setConfirmApply] = useState<OpeningBalance | null>(null);

  const openingCategories = useMemo(
    () => categories.filter((c) => ['activo', 'pasivo', 'patrimonio'].includes(c.clase)),
    [categories],
  );

  const fetchBalances = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/fin/opening-balances?store_id=${storeId}`, {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al cargar saldos iniciales');
      }
      const data = await res.json();
      setBalances(data.opening_balances ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de conexión';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [storeId, authToken]);

  useEffect(() => {
    if (open) fetchBalances();
  }, [open, fetchBalances]);

  // Reset del formulario al abrir
  useEffect(() => {
    if (open) {
      setCategoryCode('');
      setAmount('');
      setCurrency('CUP');
      setExchangeRate('');
      setAsOfDate(todayISO());
      setNotes('');
    }
  }, [open]);

  const handleCreate = async () => {
    if (submitting) return;
    const amt = parseFloat(amount);
    if (!categoryCode) { toast.error('Selecciona una categoría'); return; }
    if (!amt || amt <= 0) { toast.error('El importe debe ser mayor a 0'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) { toast.error('Indica la fecha del saldo'); return; }
    if (currency !== 'CUP') {
      const rate = parseFloat(exchangeRate);
      if (!rate || rate <= 0) { toast.error('Indica la tasa de cambio para moneda extranjera'); return; }
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/fin/opening-balances', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'create',
          category_code: categoryCode,
          amount: amt,
          currency,
          ...(currency !== 'CUP' ? { exchange_rate: parseFloat(exchangeRate) } : {}),
          as_of_date: asOfDate,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al crear el saldo inicial');
      toast.success('Saldo inicial creado en borrador. Revísalo y aplícalo para generar el asiento de apertura.');
      setAmount(''); setNotes(''); setCategoryCode(''); setCurrency('CUP'); setExchangeRate('');
      fetchBalances();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApply = async (ob: OpeningBalance) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/fin/opening-balances', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action: 'apply', id: ob.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al aplicar el saldo');
      toast.success('Saldo aplicado: asiento de apertura contabilizado');
      fetchBalances();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setSubmitting(false);
      setConfirmApply(null);
    }
  };

  const handleVoid = async (ob: OpeningBalance) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/fin/opening-balances', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action: 'void', id: ob.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al anular el saldo');
      toast.success('Saldo anulado');
      fetchBalances();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOf = (code: string) => categories.find((c) => c.code === code);

  return (
    <BaseModal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={(
        <span className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-primary" />
          Saldos iniciales
        </span>
      )}
      description="Apertura financiera de la tienda: la situación real antes de usar el motor."
      maxWidth="sm:max-w-3xl"
    >
      <div className="space-y-5">
        {/* Principio de apertura */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Los saldos iniciales representan la situación real de la tienda antes de usar el motor.
            Nunca se usan ajustes ficticios para cuadrar.
          </p>
        </div>

        {/* Tabla de saldos existentes */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cargando saldos...</p>
            </div>
          ) : loadError ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm font-bold text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={fetchBalances} className="min-h-[44px]">Reintentar</Button>
            </div>
          ) : balances.length === 0 ? (
            <div className="p-8 text-center">
              <Landmark className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm font-bold text-muted-foreground">No hay saldos iniciales registrados</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Crea el primero con el formulario inferior</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoría</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Importe</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Fecha</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {balances.map((ob) => {
                    const meta = STATUS_META[ob.status] ?? { label: ob.status, cls: 'bg-muted text-muted-foreground border-border' };
                    const cat = categoryOf(ob.category_code);
                    return (
                      <tr key={ob.id} className="hover:bg-primary/5 transition-colors">
                        <td className="px-3 py-2.5">
                          <p className="text-xs font-bold">{cat?.name ?? ob.category_code}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{ob.category_code}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <p className="text-xs font-mono font-bold tabular-nums">
                            {formatCurrency(ob.amount)} {ob.currency}
                          </p>
                          {ob.currency !== 'CUP' && (
                            <p className="text-[10px] text-muted-foreground tabular-nums">
                              = {formatCurrency(ob.amount_cup)} CUP (tasa {ob.exchange_rate})
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{ob.as_of_date}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={cn('px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest', meta.cls)}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            {ob.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => setConfirmApply(ob)}
                                  className="p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-600 transition-colors min-h-[44px] min-w-[44px]"
                                  aria-label="Aplicar saldo" title="Aplicar (genera asiento de apertura)"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleVoid(ob)}
                                  className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors min-h-[44px] min-w-[44px]"
                                  aria-label="Anular saldo" title="Anular borrador"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Formulario de creación */}
        <div className="rounded-2xl border border-border p-4 space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Nuevo saldo inicial
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría (activo, pasivo o patrimonio)</Label>
              <Select value={categoryCode} onValueChange={setCategoryCode}>
                <SelectTrigger className="min-h-[44px] bg-background"><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
                <SelectContent>
                  {openingCategories.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Importe</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="min-h-[44px] tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Moneda</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as 'CUP' | 'USD')}>
                <SelectTrigger className="min-h-[44px] bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUP">CUP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {currency === 'USD' ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Tasa de cambio (a CUP)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder="Ej: 440"
                  className="min-h-[44px] tabular-nums"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha del saldo</Label>
                <Input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
            )}
            {currency === 'USD' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha del saldo</Label>
                <Input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Origen del saldo, autorización, referencia..."
                className="min-h-[44px] min-h-[66px]"
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={submitting} className="min-h-[44px] font-black uppercase tracking-widest text-xs gap-2">
              <Plus className="w-4 h-4" />
              {submitting ? 'Creando...' : 'Crear saldo'}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmación de aplicación (acción contable real) */}
      <AlertDialog open={!!confirmApply} onOpenChange={(o) => !o && setConfirmApply(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aplicar este saldo inicial?</AlertDialogTitle>
            <AlertDialogDescription>
              Se generará el asiento de apertura correspondiente en el libro del motor.
              Esta acción contabiliza datos y no puede deshacerse con «Anular» (solo los borradores pueden anularse).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={(e) => { e.preventDefault(); if (confirmApply) handleApply(confirmApply); }}
            >
              Aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BaseModal>
  );
}
