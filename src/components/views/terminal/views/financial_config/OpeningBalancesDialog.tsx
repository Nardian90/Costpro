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
  Landmark, RefreshCw, Plus, CheckCircle2, Ban, Info, ArrowLeftRight,
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

/** Convención M-015: apertura = día anterior al primer documento del motor. */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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

  // CP-FIN-015: fecha de apertura sugerida (día anterior al primer documento)
  // + estado de completitud del motor para esta tienda.
  const [suggestedDate, setSuggestedDate] = useState<string | null>(null);
  const [primerDocumento, setPrimerDocumento] = useState<string | null>(null);

  // Formulario
  const [categoryCode, setCategoryCode] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'CUP' | 'USD'>('CUP');
  const [exchangeRate, setExchangeRate] = useState('');
  const [asOfDate, setAsOfDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [zeroDeclaration, setZeroDeclaration] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Confirmaciones (aplicar genera asiento real: siempre confirmado)
  const [confirmApply, setConfirmApply] = useState<OpeningBalance | null>(null);

  const openingCategories = useMemo(
    () => categories.filter((c) => ['activo', 'pasivo', 'patrimonio'].includes(c.clase)),
    [categories],
  );

  // M-015: resumen débe/haber de la apertura (estructura de partida doble).
  // Naturaleza: activo/gasto = débito; pasivo/patrimonio = crédito. Las filas
  // aplicadas generan un asiento cada una; el conjunto debe quedar equilibrado.
  const debeHaber = useMemo(() => {
    let debe = 0; let haber = 0;
    for (const ob of balances) {
      if (ob.status !== 'applied') continue;
      const cat = categories.find((c) => c.code === ob.category_code);
      const cup = ob.currency === 'CUP' ? ob.amount : ob.amount * (ob.exchange_rate ?? 0);
      if (cat && ['activo', 'gasto'].includes(cat.clase)) debe += cup; else haber += cup;
    }
    return { debe, haber, diferencia: Math.round((debe - haber) * 100) / 100 };
  }, [balances, categories]);

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
    if (!open || !storeId) return;
    fetchBalances();
    // Sugerencia de fecha de apertura: día anterior al primer documento del
    // motor (completitud del balance). Si el motor aún no tiene documentos,
    // se usa la fecha de hoy.
    (async () => {
      try {
        const res = await fetch(
          `/api/fin/statements?type=balance&store_id=${storeId}&as_of=${todayISO()}`,
          { headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) } },
        );
        if (!res.ok) return;
        const data = await res.json();
        const pd: string | null = data?.completitud?.primer_documento ?? null;
        setPrimerDocumento(pd);
        setSuggestedDate(pd ? dayBefore(pd) : todayISO());
      } catch { /* sugerencia best-effort */ }
    })();
  }, [open, fetchBalances, storeId, authToken]);

  // Reset del formulario al abrir
  useEffect(() => {
    if (open) {
      setCategoryCode('');
      setAmount('');
      setCurrency('CUP');
      setExchangeRate('');
      setAsOfDate(suggestedDate ?? todayISO());
      setNotes('');
      setZeroDeclaration(false);
    }
  }, [open, suggestedDate]);

  const handleCreate = async () => {
    if (submitting) return;
    const amt = parseFloat(amount);
    if (!categoryCode) { toast.error('Selecciona una categoría'); return; }
    if (zeroDeclaration) {
      // Declaración de apertura en cero: exige fuente de verificación documentada.
      if (amt !== 0) { toast.error('Con la declaración en cero el importe debe ser 0'); return; }
      if (!notes.trim() || notes.trim().length < 20) {
        toast.error('Describe en notas la fuente que verifica la inexistencia de saldo (mínimo 20 caracteres)');
        return;
      }
    } else {
      if (!amt || amt <= 0) { toast.error('El importe debe ser mayor a 0'); return; }
    }
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
          amount: zeroDeclaration ? 0 : amt,
          currency: zeroDeclaration ? 'CUP' : currency,
          ...(!zeroDeclaration && currency !== 'CUP' ? { exchange_rate: parseFloat(exchangeRate) } : {}),
          as_of_date: asOfDate,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al crear el saldo inicial');
      toast.success(zeroDeclaration
        ? 'Declaración de apertura en cero registrada. Aplícala para dejar constancia en el libro.'
        : 'Saldo inicial creado en borrador. Revísalo y aplícalo para generar el asiento de apertura.');
      setAmount(''); setNotes(''); setCategoryCode(''); setCurrency('CUP'); setExchangeRate(''); setZeroDeclaration(false);
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
        {/* Ruta de navegación (CP-FIN-015) + principio de apertura */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <ArrowLeftRight className="w-3 h-3" /> Ruta de navegación
          </p>
          <p className="text-xs text-foreground font-bold">
            Inicio → ANÁLISIS → Configuración de Documentos → <span className="text-primary">Saldos iniciales</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            También accesible desde Estados Financieros con el botón «Configurar saldos iniciales».
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            <p>
              Los saldos iniciales representan la situación real de la tienda antes de usar el motor.
              Nunca se usan ajustes ficticios para cuadrar.
            </p>
            {primerDocumento && (
              <p className="mt-1">
                Primer documento del motor: <span className="font-bold tabular-nums text-foreground">{primerDocumento}</span>
                {suggestedDate ? ` · fecha de apertura sugerida: ${suggestedDate} (día anterior).` : ''}
              </p>
            )}
          </div>
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

        {/* Resumen débe/haber de la apertura aplicada (partida doble) */}
        {balances.length > 0 && (
          <div className="rounded-2xl border border-border p-3 grid grid-cols-3 gap-2 text-center" data-testid="opening-debe-haber">
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Débe (aplicado)</p>
              <p className="text-sm font-black tabular-nums">{formatCurrency(debeHaber.debe)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Haber (aplicado)</p>
              <p className="text-sm font-black tabular-nums">{formatCurrency(debeHaber.haber)}</p>
            </div>
            <div className={cn('rounded-lg p-2', Math.abs(debeHaber.diferencia) < 0.01 ? 'bg-emerald-500/10' : 'bg-amber-500/10')}>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Diferencia</p>
              <p className={cn('text-sm font-black tabular-nums', Math.abs(debeHaber.diferencia) < 0.01 ? 'text-emerald-600' : 'text-amber-600')}>
                {formatCurrency(debeHaber.diferencia)}
              </p>
            </div>
          </div>
        )}

        {/* Formulario de creación */}
        <div className="rounded-2xl border border-border p-4 space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Nuevo saldo inicial
          </p>
          {primerDocumento && suggestedDate && (
            <p className="text-[11px] text-muted-foreground">
              El motor contabiliza desde el primer documento ({primerDocumento}); la apertura se
              recomienda al cierre anterior ({suggestedDate}) para no mezclar el saldo inicial con
              movimientos operacionales del mismo período.
            </p>
          )}
          <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={zeroDeclaration}
              onChange={(e) => { setZeroDeclaration(e.target.checked); if (e.target.checked) setAmount('0'); }}
              className="w-4 h-4 accent-[var(--primary)]"
              data-testid="zero-declaration"
            />
            Declarar apertura en cero (sin saldos preexistentes; exige justificación en notas)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría (activo, pasivo o patrimonio)</Label>
              <Select value={categoryCode} onValueChange={setCategoryCode} disabled={zeroDeclaration}>
                <SelectTrigger className="min-h-[44px] bg-background"><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
                <SelectContent>
                  {openingCategories.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!zeroDeclaration && (
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
            )}
            {!zeroDeclaration && (
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
            )}
            {!zeroDeclaration && currency === 'USD' ? (
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
            {!zeroDeclaration && currency === 'USD' && (
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
              <Label className="text-xs">
                {zeroDeclaration ? 'Justificación de la declaración en cero (fuente de verificación, obligatoria)' : 'Notas (opcional)'}
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={zeroDeclaration
                  ? 'Ej: Sin saldos preexistentes — primer documento del motor 2026-07-01; sin ventas, pagos ni flujo de caja anterior (verificado)'
                  : 'Origen del saldo, autorización, referencia...'}
                className="min-h-[44px] min-h-[66px]"
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={submitting} className="min-h-[44px] font-black uppercase tracking-widest text-xs gap-2">
              <Plus className="w-4 h-4" />
              {submitting ? 'Creando...' : zeroDeclaration ? 'Registrar declaración' : 'Crear saldo'}
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
