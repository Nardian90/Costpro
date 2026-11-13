'use client';

/**
 * AGREGAR A NÓMINA — incorporación de un trabajador desde la pestaña
 * «Trabajadores» (RECURSOS HUMANOS → Trabajadores y Comisiones).
 *
 * Flujo (§5 de la misión trabajadores↔nóminas):
 *   1. Identifica al trabajador de la fila y verifica que pertenece a la
 *      tienda activa (por construcción — la tabla ya está acotada por tienda).
 *   2. Verifica elegibilidad: estado activo + tarifa vigente para el período
 *      objetivo (misma regla del motor servidor), con explicación clara —
 *      nunca un error técnico.
 *   3. Ofrece: nómina BORRADOR existente (seleccionable) o crear una nueva.
 *      Si el trabajador ya está en la nómina elegida, se informa y se evita
 *      el duplicado (el servidor lo revalida: UNIQUE payroll+worker).
 *   4. Incorpora con el MISMO SERVICIO BACKEND que usa el editor de nóminas:
 *      PUT /api/payrolls/[id] (añadir línea a borrador) o POST /api/payrolls
 *      (nueva nómina) — nunca un segundo mecanismo de escritura.
 *   5. onDone(payroll_id) → WorkersView navega a la pestaña Nóminas y abre
 *      el editor en esa nómina, conservando la tienda activa.
 *
 * La tarifa y los importes son SIEMPRE snapshot del servidor: el cliente
 * solo envía worker_id + cantidades (trust boundary intacto).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, FilePlus2, Loader2, Plus, Users, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';
import {
  TIPO_NOMINA_LABELS,
} from '@/lib/payrolls/types';
import type { Payroll, TipoNomina } from '@/lib/payrolls/types';
import { evaluateWorkerEligibility, type SelectableWorker } from './WorkerSearchSelect';

const TIPOS = ['sueldos', 'jornales', 'vacaciones', 'licencias', 'subsidios', 'movilizados', 'otros'] as const;
const inputCls = 'w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40';
const touch = 'min-h-[44px]';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthStartStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function dateLabel(s?: string | null): string {
  return s ? s.split('-').reverse().join('/') : '—';
}
function moneyFmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(n);
}

export function AddToPayrollModal({
  worker, storeId, onClose, onDone,
}: {
  /** Trabajador de la fila de la pestaña Trabajadores (tienda activa). */
  worker: { worker_id: string; first_name: string; last_name: string; status?: string | null };
  storeId: string;
  onClose: () => void;
  /** Éxito real (guardado en backend) → navega y abre la nómina. */
  onDone: (payrollId: string) => void;
}) {
  const [drafts, setDrafts] = useState<Payroll[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [selected, setSelected] = useState<string>('new'); // 'new' | payroll.id
  const [draftDetail, setDraftDetail] = useState<Payroll | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Formulario de nueva nómina
  const [tipo, setTipo] = useState<TipoNomina>('sueldos');
  const [periodStart, setPeriodStart] = useState(monthStartStr());
  const [periodEnd, setPeriodEnd] = useState(todayStr());

  // Trabajador con tarifa evaluada al período objetivo
  const [workerInfo, setWorkerInfo] = useState<SelectableWorker | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);

  // Cantidad (horas o días según la tarifa del período)
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);

  const targetPeriod = useMemo(() => {
    if (selected === 'new') {
      return { start: periodStart, end: periodEnd };
    }
    const d = drafts.find((p) => p.id === selected);
    return { start: d?.period_start ?? '', end: d?.period_end ?? '' };
  }, [selected, drafts, periodStart, periodEnd]);

  // Borradores de la tienda (misma consulta que la pestaña Nóminas)
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setLoadingDrafts(true);
    void (async () => {
      try {
        const data = await apiFetch(`/api/payrolls?store_id=${storeId}&status=draft`);
        const list: Payroll[] = data.payrolls ?? [];
        if (cancelled) return;
        setDrafts(list);
        if (list.length === 0) setSelected('new');
      } catch (e) {
        if (!cancelled) toast.error((e as { error?: string }).error || 'No se pudo cargar las nóminas borrador');
      } finally {
        if (!cancelled) setLoadingDrafts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  // Trabajador con tarifa evaluada AL PERÍODO objetivo (misma regla del servidor)
  useEffect(() => {
    if (!storeId || !targetPeriod.start || !targetPeriod.end) return;
    let cancelled = false;
    setInfoLoading(true);
    void (async () => {
      try {
        const data = await apiFetch(
          `/api/workers?store_id=${storeId}&include_rate=1&period_start=${targetPeriod.start}&period_end=${targetPeriod.end}`,
        );
        if (cancelled) return;
        const found: SelectableWorker | undefined = (data.workers ?? [])
          .find((w: SelectableWorker) => w.worker_id === worker.worker_id);
        setWorkerInfo(found ?? {
          worker_id: worker.worker_id,
          first_name: worker.first_name,
          last_name: worker.last_name,
          status: worker.status ?? 'active',
          rate_amount: null,
        });
      } catch {
        if (!cancelled) setWorkerInfo(null);
      } finally {
        if (!cancelled) setInfoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeId, targetPeriod.start, targetPeriod.end, worker.worker_id, worker.first_name, worker.last_name, worker.status]);

  // Detalle del borrador seleccionado (líneas actuales + duplicado)
  useEffect(() => {
    if (selected === 'new') { setDraftDetail(null); return; }
    let cancelled = false;
    setLoadingDetail(true);
    void (async () => {
      try {
        const data = await apiFetch(`/api/payrolls/${selected}`);
        if (!cancelled) setDraftDetail(data?.payroll ?? null);
      } catch {
        if (!cancelled) setDraftDetail(null);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const addedIds = useMemo(
    () => new Set((draftDetail?.items ?? []).map((i) => i.worker_id)),
    [draftDetail],
  );

  const eligibility = useMemo(() => {
    if (!workerInfo) return null;
    return evaluateWorkerEligibility(workerInfo, addedIds, targetPeriod.start, targetPeriod.end);
  }, [workerInfo, addedIds, targetPeriod.start, targetPeriod.end]);

  const alreadyInDraft = selected !== 'new' && addedIds.has(worker.worker_id);
  const qtyNum = Number(quantity);
  const qtyValid = quantity !== '' && !isNaN(qtyNum) && qtyNum > 0;
  const periodValid = targetPeriod.start && targetPeriod.end && targetPeriod.start <= targetPeriod.end;
  const canConfirm = !!eligibility?.eligible && !alreadyInDraft && qtyValid && !!periodValid && !saving && !loadingDetail;

  const estimate = useMemo(() => {
    if (!workerInfo?.rate_amount || !qtyValid) return null;
    return workerInfo.rate_amount * qtyNum;
  }, [workerInfo, qtyValid, qtyNum]);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm || !workerInfo) return;
    setSaving(true);
    try {
      const newItem = {
        worker_id: worker.worker_id,
        regular_hours: workerInfo.rate_type === 'hourly' ? qtyNum : 0,
        accrued_days: workerInfo.rate_type === 'daily' ? qtyNum : 0,
        overtime_hours: 0,
        overtime_amount: 0,
        vacation_days: 0,
        vacation_amount: 0,
      };
      let result;
      if (selected === 'new') {
        // MISMO servicio que el editor: POST /api/payrolls (store explícito).
        result = await apiFetch('/api/payrolls', {
          method: 'POST',
          body: JSON.stringify({
            store_id: storeId,
            tipo_nomina: tipo,
            period_start: targetPeriod.start,
            period_end: targetPeriod.end,
            payment_method: 'efectivo',
            items: [newItem],
            idempotency_key: (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : `add-nom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          }),
        });
        toast.success(`Nómina ${result.payroll_number} creada en borrador con ${worker.first_name} ${worker.last_name}`);
      } else {
        // MISMO servicio que el editor: PUT /api/payrolls/[id] — líneas
        // existentes + la nueva (el servidor recalcula y re-snapshotea TODO).
        const existingItems = (draftDetail?.items ?? []).map((it) => ({
          worker_id: it.worker_id,
          regular_hours: it.regular_hours,
          accrued_days: it.accrued_days,
          overtime_hours: it.overtime_hours,
          overtime_amount: it.overtime_amount,
          vacation_days: it.vacation_days,
          vacation_amount: it.vacation_amount,
          concepts: (it.concepts ?? []).map((c) => ({
            kind: c.kind, sigla: c.sigla, description: c.description, amount: Number(c.amount),
          })),
        }));
        result = await apiFetch(`/api/payrolls/${selected}`, {
          method: 'PUT',
          body: JSON.stringify({
            tipo_nomina: draftDetail?.tipo_nomina ?? 'sueldos',
            period_start: targetPeriod.start,
            period_end: targetPeriod.end,
            payment_method: draftDetail?.payment_method ?? 'efectivo',
            cheque_number: draftDetail?.cheque_number ?? null,
            cheque_date: draftDetail?.cheque_date ?? null,
            reintegro_number: draftDetail?.reintegro_number ?? null,
            reintegro_date: draftDetail?.reintegro_date ?? null,
            notes: draftDetail?.notes ?? null,
            items: [...existingItems, newItem],
          }),
        });
        toast.success(`${worker.first_name} ${worker.last_name} agregado a ${draftDetail?.payroll_number ?? 'la nómina'} — totales recalculados por el servidor`);
      }
      onDone(String(result.payroll_id ?? selected));
    } catch (e) {
      toast.error((e as { error?: string }).error || 'No se pudo incorporar el trabajador a la nómina');
    } finally {
      setSaving(false);
    }
  }, [canConfirm, workerInfo, worker, qtyNum, selected, storeId, tipo, targetPeriod, draftDetail, onDone]);

  const fullName = `${worker.first_name} ${worker.last_name}`;
  const isDaily = workerInfo?.rate_type === 'daily';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label={`Agregar ${fullName} a una nómina`}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl p-5">
        <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
          <FilePlus2 className="w-4 h-4 text-primary" aria-hidden="true" />
          Agregar a Nómina — {fullName}
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Incorpora al trabajador a una nómina BORRADOR de la tienda activa o crea una nueva.
          Misma lógica que confeccionar desde «Nóminas → Nueva nómina» (un único servicio).
        </p>

        {/* Elegibilidad */}
        <div className={cn(
          'mt-4 rounded-xl border p-3 text-xs',
          eligibility?.eligible
            ? 'border-success/40 bg-success/5'
            : 'border-destructive/40 bg-destructive/5',
        )} role={eligibility?.eligible ? 'status' : 'alert'}>
          {infoLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando tarifa para el período…
            </span>
          ) : eligibility?.eligible ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Check className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />
              <strong>{fullName}</strong>
              {workerInfo?.ci && <span className="font-mono text-[10px] text-muted-foreground">CI {workerInfo.ci}</span>}
              <span className="text-success font-semibold">
                {moneyFmt(workerInfo?.rate_amount)} {workerInfo?.rate_currency ?? 'CUP'}/{isDaily ? 'día' : 'hora'}
              </span>
              <span className="text-muted-foreground">
                · vigente para {dateLabel(targetPeriod.start)} → {dateLabel(targetPeriod.end)}
              </span>
            </span>
          ) : (
            <span className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {alreadyInDraft
                  ? 'El trabajador ya está en la nómina seleccionada — no se puede duplicar.'
                  : (eligibility?.label ?? 'No se pudo verificar la elegibilidad del trabajador.')}
                {eligibility?.reason === 'sin_tarifa' && ' Fija la tarifa con el botón «Tarifa» de la tabla antes de incorporarlo.'}
                {eligibility?.reason === 'tarifa_no_vigente' && ' Ajusta el período o fija una tarifa vigente para ese rango.'}
              </span>
            </span>
          )}
        </div>

        {/* Destino: borrador existente o nueva */}
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Destino de la incorporación
          </p>
          {loadingDrafts ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando nóminas borrador…
            </p>
          ) : (
            <div className="space-y-1.5" role="radiogroup" aria-label="Nómina destino">
              {drafts.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors',
                    selected === p.id ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/30',
                  )}
                >
                  <input
                    type="radio"
                    name="add-payroll-target"
                    value={p.id}
                    checked={selected === p.id}
                    onChange={() => { setSelected(p.id); setQuantity(''); }}
                    className="accent-primary w-4 h-4"
                  />
                  <span className="flex-1 min-w-0 text-xs">
                    <span className="font-mono font-bold">{p.payroll_number}</span>
                    <span className="ml-2 text-muted-foreground">
                      {dateLabel(p.period_start)} → {dateLabel(p.period_end)}
                    </span>
                    <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                      <Users className="w-3 h-3" aria-hidden="true" /> {p.total_workers}
                    </span>
                    <span className="ml-2 font-semibold">{moneyFmt(p.total_net)} {p.currency}</span>
                  </span>
                  <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {TIPO_NOMINA_LABELS[p.tipo_nomina] ?? p.tipo_nomina}
                  </span>
                </label>
              ))}
              <label
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors',
                  selected === 'new' ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/30',
                )}
              >
                <input
                  type="radio"
                  name="add-payroll-target"
                  value="new"
                  checked={selected === 'new'}
                  onChange={() => setSelected('new')}
                  className="accent-primary w-4 h-4"
                />
                <span className="flex-1 text-xs font-bold flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  Crear nueva nómina
                  {drafts.length === 0 && <span className="font-normal text-muted-foreground">(no hay borradores)</span>}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Nueva nómina: cabecera */}
        {selected === 'new' && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-[10px] font-black uppercase text-muted-foreground">Tipo de nómina
              <select className={cn(inputCls, 'mt-1')} value={tipo} onChange={(e) => setTipo(e.target.value as TipoNomina)}>
                {TIPOS.map((t) => <option key={t} value={t}>{TIPO_NOMINA_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-black uppercase text-muted-foreground">Desde
              <input type="date" className={cn(inputCls, 'mt-1')} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label className="text-[10px] font-black uppercase text-muted-foreground">Hasta
              <input type="date" className={cn(inputCls, 'mt-1')} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </div>
        )}

        {/* Cantidad del trabajador */}
        <div className="mt-3">
          <label htmlFor="add-payroll-qty" className="text-[10px] font-black uppercase text-muted-foreground">
            {isDaily ? 'Días devengados' : 'Horas regulares'}
            <input
              id="add-payroll-qty"
              type="number"
              min="0"
              step={isDaily ? '0.5' : '0.5'}
              inputMode="decimal"
              disabled={!eligibility?.eligible || alreadyInDraft}
              className={cn(inputCls, 'mt-1', (!eligibility?.eligible || alreadyInDraft) && 'opacity-50')}
              value={quantity}
              placeholder={isDaily ? 'p. ej. 15' : 'p. ej. 190'}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          {estimate != null && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
              Devengado estimado: <strong className="text-foreground">{moneyFmt(estimate)} {workerInfo?.rate_currency ?? 'CUP'}</strong>
              <span className="text-[10px]">(estimación local — el servidor calcula al guardar)</span>
            </p>
          )}
        </div>

        {selected !== 'new' && loadingDetail && (
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando líneas de la nómina…
          </p>
        )}
        {selected !== 'new' && !loadingDetail && draftDetail && (draftDetail.items ?? []).length > 0 && (
          <div className="mt-2 rounded-lg border border-border/60 bg-muted/20 p-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              Trabajadores ya en la nómina ({draftDetail.items.length})
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate" title={(draftDetail.items ?? []).map((i) => i.worker_names).join(', ')}>
              {(draftDetail.items ?? []).map((i) => i.worker_names).join(' · ')}
            </p>
          </div>
        )}

        {/* Acciones */}
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className={cn('px-3 py-2 rounded-lg border border-border text-xs', touch)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold',
              touch, 'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {selected === 'new' ? 'Crear nómina y agregar' : 'Agregar al borrador'}
          </button>
        </div>
      </div>
    </div>
  );
}
