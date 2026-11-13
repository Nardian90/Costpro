'use client';

/**
 * NÓMINAS DE SALARIO — Modelo SC-4-06 (Res. 13/2007 MFP).
 * Pestaña «Nóminas» de Trabajadores y Comisiones (Inicio → OPERACIÓN).
 *
 * Arquitectura (patrones probados del repo):
 *   · Documento: Borrador → Confirmada → Pagada (+Contabilizada como firma
 *     sin cambio de estado) · Anulada desde borrador/confirmada con motivo
 *     OBLIGATORIO — como Ajustes Documentales, sin borrado físico.
 *   · Pestañas CONFECCIÓN | VISTA PREVIA dentro del editor (patrón Reporte
 *     Entrega/CashReportView: role=tab artesanal, vista previa = jsPDF
 *     doc.output('bloburl') en <iframe>, MISMO builder para descargar,
 *     cache por firma + punto ámbar cuando obsoleta).
 *   · Cálculo del BACKEND como única fuente de verdad: el cliente solo envía
 *     identificadores y cantidades; totales, tarifas vigentes e identidad
 *     en SNAPSHOT resueltos servidor (trust boundary del RPC).
 *   · jspdf se carga en diferido (lazy-pdf.ts) solo al previsualizar o
 *     exportar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType } from 'react';
import {
  AlertTriangle, BadgeCheck, Ban, Check, Coins, FileDown, FileText,
  Landmark, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Users, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';
import { buildPayrollPdf } from '@/lib/payrolls/pdf';
import {
  PAYROLL_STATUS_LABELS, TIPO_NOMINA_LABELS, RATE_TYPE_LABELS,
  CONCEPT_KIND_LABELS,
} from '@/lib/payrolls/types';
import type {
  Payroll, PayrollConceptInput, PayrollItemInput, PayrollStatus,
  SalaryRateType, TipoNomina, WorkerSalaryRate,
} from '@/lib/payrolls/types';
import {
  WorkerSearchSelect,
  evaluateWorkerEligibility,
  type SelectableWorker,
} from './WorkerSearchSelect';

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de presentación
// ─────────────────────────────────────────────────────────────────────────────
const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('es-CU', { maximumFractionDigits: 2 });

const dateLabel = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-CU');
  } catch {
    return iso;
  }
};

const STATUS_BADGE: Record<PayrollStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  confirmed: 'bg-primary/10 text-primary border-primary/30',
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  voided: 'bg-destructive/10 text-destructive border-destructive/30',
};

const TIPOS: TipoNomina[] = ['sueldos', 'jornales', 'vacaciones', 'licencias', 'subsidios', 'movilizados', 'otros'];

const CONCEPT_KINDS: PayrollConceptInput['kind'][] = ['complemento', 'otro_haber', 'obligacion_social', 'deduccion'];

const inputCls = 'w-full px-2.5 py-2 rounded-lg border border-border/60 bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/40';
const touch = 'min-h-[40px]';

// ─────────────────────────────────────────────────────────────────────────────
// Tarifa salarial del trabajador — modal con historial de vigencias
// ─────────────────────────────────────────────────────────────────────────────
export function SalaryRateModal({
  worker, onClose, onSaved,
}: {
  worker: { worker_id: string; first_name: string; last_name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rates, setRates] = useState<WorkerSalaryRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ rate_type: SalaryRateType; rate_amount: string; currency: string; valid_from: string }>({
    rate_type: 'hourly',
    rate_amount: '',
    currency: 'CUP',
    valid_from: '',
  });

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/workers/${worker.worker_id}/salary-rate`);
      setRates(data.rates ?? []);
    } catch (e) {
      toast.error((e as { error?: string }).error || 'No se pudo cargar el historial de tarifas');
    } finally {
      setLoading(false);
    }
  }, [worker.worker_id]);

  useEffect(() => { void loadRates(); }, [loadRates]);

  const handleSave = async () => {
    const amount = Number(form.rate_amount);
    if (!form.rate_amount || isNaN(amount) || amount <= 0) {
      toast.error('El importe de la tarifa debe ser mayor que cero');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/workers/${worker.worker_id}/salary-rate`, {
        method: 'POST',
        body: JSON.stringify({
          rate_type: form.rate_type,
          rate_amount: amount,
          currency: form.currency,
          valid_from: form.valid_from || null,
        }),
      });
      toast.success('Tarifa salarial fijada (la vigencia anterior se cierra sin solapes)');
      await loadRates();
      onSaved();
    } catch (e) {
      toast.error((e as { error?: string }).error || 'No se pudo fijar la tarifa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label="Tarifa salarial">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl p-5">
        <h3 className="text-sm font-black uppercase tracking-wider">
          Tarifa salarial — {worker.first_name} {worker.last_name}
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          La tarifa NO es una comisión: alimenta las nóminas. El historial guarda vigencias sin
          solapes; la nómina hace SNAPSHOT de la tarifa vigente al período (una modificación
          posterior no altera nóminas históricas).
        </p>

        {/* Historial */}
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
          ) : rates.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin tarifas todavía — el trabajador no puede entrar en una nómina hasta tener una vigente.</p>
          ) : (
            <ul className="space-y-1.5">
              {rates.map((r) => (
                <li key={r.id} className={cn(
                  'flex items-center justify-between rounded-lg border px-3 py-2 text-xs',
                  r.valid_to === null ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/30',
                )}>
                  <span className="flex items-center gap-2">
                    <Coins className="w-3.5 h-3.5 shrink-0" />
                    {RATE_TYPE_LABELS[r.rate_type]}
                  </span>
                  <span className="font-semibold">{money(r.rate_amount)} {r.currency}</span>
                  <span className="text-muted-foreground">
                    {dateLabel(r.valid_from)} → {r.valid_to === null ? 'vigente' : dateLabel(r.valid_to)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Nueva tarifa */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <label className="text-[10px] font-black uppercase text-muted-foreground">Tipo
            <select
              className={cn(inputCls, 'mt-1')} value={form.rate_type}
              onChange={(e) => setForm((f) => ({ ...f, rate_type: e.target.value as SalaryRateType }))}
            >
              <option value="hourly">{RATE_TYPE_LABELS.hourly}</option>
              <option value="daily">{RATE_TYPE_LABELS.daily}</option>
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-muted-foreground">Importe
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              className={cn(inputCls, 'mt-1')} value={form.rate_amount} placeholder="0.00"
              onChange={(e) => setForm((f) => ({ ...f, rate_amount: e.target.value }))}
            />
          </label>
          <label className="text-[10px] font-black uppercase text-muted-foreground">Moneda
            <select
              className={cn(inputCls, 'mt-1')} value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            >
              {['CUP', 'USD', 'EUR', 'MLC'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-muted-foreground">Vigente desde (opc.)
            <input
              type="date" className={cn(inputCls, 'mt-1')} value={form.valid_from}
              onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
            />
          </label>
          <div className="col-span-2 flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={cn('px-3 py-2 rounded-lg border border-border text-xs', touch)}>Cerrar</button>
            <button type="button" onClick={handleSave} disabled={saving}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold', touch)}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />} Fijar tarifa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de anulación (motivo obligatorio 3-500)
// ─────────────────────────────────────────────────────────────────────────────
function VoidPayrollModal({
  payroll, onClose, onDone,
}: {
  payroll: Payroll;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleVoid = async () => {
    if (reason.trim().length < 3) {
      toast.error('El motivo es obligatorio (mínimo 3 caracteres)');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/payrolls/${payroll.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toast.success(`Nómina ${payroll.payroll_number} anulada (el documento se conserva con trazabilidad)`);
      onDone();
    } catch (e) {
      toast.error((e as { error?: string }).error || 'No se pudo anular');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label="Anular nómina">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-5">
        <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
          <Ban className="w-4 h-4 text-destructive" /> Anular nómina {payroll.payroll_number}
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Solo borradores y nóminas confirmadas. El documento anulado se CONSERVA (numeración,
          motivo y trazabilidad) — nunca se borra físicamente.
        </p>
        <label className="mt-4 block text-[10px] font-black uppercase text-muted-foreground">
          Motivo (3-500 caracteres)
          <textarea
            className={cn(inputCls, 'mt-1 min-h-[80px] resize-y')} value={reason} maxLength={500}
            placeholder="Describe el motivo de la anulación…"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={cn('px-3 py-2 rounded-lg border border-border text-xs', touch)}>Cancelar</button>
          <button type="button" onClick={handleVoid} disabled={saving}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold', touch)}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />} Anular
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFECCIÓN | VISTA PREVIA — editor del documento (patrón Reporte Entrega)
// ─────────────────────────────────────────────────────────────────────────────
interface EditorLine extends PayrollItemInput {
  worker_names: string;
  rate_type: SalaryRateType | null;
  rate_amount: number | null;
  rate_currency: string | null;
}

type EditorTab = 'confeccion' | 'preview';

function PayrollEditor({
  storeId, workers, existing, onClose, onSaved,
}: {
  storeId: string;
  /** Trabajadores de la tienda (todos los estados, con perfil laboral y tarifa evaluada al período). */
  workers: SelectableWorker[];
  /** Nómina borrador a editar (null = nueva). */
  existing: Payroll | null;
  onClose: () => void;
  onSaved: (payroll: Payroll) => void;
}) {
  const [tab, setTab] = useState<EditorTab>('confeccion');
  const [saving, setSaving] = useState(false);

  // Cabecera del documento
  const [tipo, setTipo] = useState<TipoNomina>(existing?.tipo_nomina ?? 'sueldos');
  const [periodStart, setPeriodStart] = useState(existing?.period_start ?? '');
  const [periodEnd, setPeriodEnd] = useState(existing?.period_end ?? '');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta'>((existing?.payment_method as 'efectivo' | 'tarjeta') ?? 'efectivo');
  const [chequeNumber, setChequeNumber] = useState(existing?.cheque_number ?? '');
  const [chequeDate, setChequeDate] = useState(existing?.cheque_date?.slice(0, 10) ?? '');
  const [reintegroNumber, setReintegroNumber] = useState(existing?.reintegro_number ?? '');
  const [reintegroDate, setReintegroDate] = useState(existing?.reintegro_date?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // Líneas (identificadores y cantidades — NUNCA importes calculados)
  const [lines, setLines] = useState<EditorLine[]>(() =>
    (existing?.items ?? []).map((it) => ({
      worker_id: it.worker_id,
      worker_names: it.worker_names,
      rate_type: it.rate_type,
      rate_amount: it.rate_amount,
      rate_currency: it.rate_currency,
      regular_hours: it.regular_hours,
      accrued_days: it.accrued_days,
      overtime_hours: it.overtime_hours,
      overtime_amount: it.overtime_amount,
      vacation_days: it.vacation_days,
      vacation_amount: it.vacation_amount,
      concepts: (it.concepts ?? []).map((c) => ({
        kind: c.kind, sigla: c.sigla, description: c.description, amount: Number(c.amount),
      })),
    })),
  );
  // worker_id ya incorporados (el selector deshabilita duplicados con explicación).
  const addedWorkerIds = useMemo(() => new Set(lines.map((l) => l.worker_id)), [lines]);

  // Trabajadores con tarifa evaluada al PERÍODO del documento: los datos del
  // padre (referencia: hoy) sirven de arranque; al fijar un período válido se
  // re-consulta con la MISMA regla del motor servidor (fn_payroll_validate_
  // items) para que la elegibilidad del selector refleje el período real.
  const [workersState, setWorkersState] = useState<SelectableWorker[]>(workers);
  const [workersLoading, setWorkersLoading] = useState(false);
  useEffect(() => { setWorkersState(workers); }, [workers]);
  useEffect(() => {
    if (!storeId) return;
    if (!periodStart || !periodEnd || periodStart > periodEnd) return;
    let cancelled = false;
    setWorkersLoading(true);
    void (async () => {
      try {
        const data = await apiFetch(`/api/workers?store_id=${storeId}&include_rate=1&period_start=${periodStart}&period_end=${periodEnd}`);
        if (!cancelled) setWorkersState(data.workers ?? []);
      } catch {
        // Se conservan los datos vigentes (referencia: hoy) — el servidor
        // revalida la elegibilidad al guardar en cualquier caso.
      } finally {
        if (!cancelled) setWorkersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeId, periodStart, periodEnd]);

  // Documento guardado (para la vista previa con totales de servidor)
  const [savedPayroll, setSavedPayroll] = useState<Payroll | null>(existing ?? null);
  const idempotencyRef = useRef<string>(existing ? '' : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `nom-${Date.now()}`));

  // Vista previa (patrón CashReportView: cache por firma + punto ámbar)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSigRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const buildingRef = useRef(false);
  const [previewNonce, setPreviewNonce] = useState(0);

  const previewSignature = useMemo(() => {
    if (!savedPayroll) return null;
    return JSON.stringify([savedPayroll.id, savedPayroll.updated_at, savedPayroll.status, previewNonce]);
  }, [savedPayroll, previewNonce]);

  useEffect(() => () => {
    if (previewUrlRef.current) { try { URL.revokeObjectURL(String(previewUrlRef.current)); } catch {} }
  }, []);

  const buildPreview = useCallback(async (force = false) => {
    if (!savedPayroll) return;
    if (buildingRef.current) return;
    if (!force && previewUrlRef.current && previewSigRef.current === previewSignature) return;
    buildingRef.current = true;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      // Detalle completo (líneas + conceptos + totales del SERVIDOR)
      const data = await apiFetch(`/api/payrolls/${savedPayroll.id}`);
      const detail: Payroll = data.payroll;
      const doc = await buildPayrollPdf({ payroll: detail });
      const url = doc.output('bloburl');
      const old = previewUrlRef.current;
      previewUrlRef.current = String(url);
      previewSigRef.current = previewSignature;
      setPreviewUrl(String(url));
      if (old) { try { URL.revokeObjectURL(String(old)); } catch {} }
    } catch (err) {
      setPreviewError((err as { message?: string }).message || 'No se pudo generar la vista previa.');
    } finally {
      buildingRef.current = false;
      setPreviewLoading(false);
    }
  }, [savedPayroll, previewSignature]);

  useEffect(() => {
    if (tab === 'preview') void buildPreview(false);
  }, [tab, buildPreview]);

  const previewStale = !!savedPayroll && !!previewSigRef.current && previewSigRef.current !== previewSignature;

  const addWorker = (w: SelectableWorker) => {
    // Doble validación local (el selector ya filtra, pero el editor es la
    // barrera antes del servidor — que SIEMPRE revalida todo).
    const elig = evaluateWorkerEligibility(w, addedWorkerIds, periodStart, periodEnd);
    if (!elig.eligible) {
      toast.error(`${w.first_name} ${w.last_name}: ${elig.label}`);
      return;
    }
    setLines((ls) => [...ls, {
      worker_id: w.worker_id,
      worker_names: `${w.first_name} ${w.last_name}`,
      rate_type: (w.rate_type as SalaryRateType | null) ?? null,
      rate_amount: w.rate_amount ?? null,
      rate_currency: w.rate_currency ?? null,
      regular_hours: 0,
      accrued_days: 0,
      overtime_hours: 0,
      overtime_amount: 0,
      vacation_days: 0,
      vacation_amount: 0,
      concepts: [],
    }]);
    toast.success(`${w.first_name} ${w.last_name} incorporado — introduce ${w.rate_type === 'daily' ? 'los días devengados' : 'las horas regulares'}`);
  };

  const patchLine = (workerId: string, patch: Partial<EditorLine>) =>
    setLines((ls) => ls.map((l) => (l.worker_id === workerId ? { ...l, ...patch } : l)));

  const removeLine = (workerId: string) =>
    setLines((ls) => ls.filter((l) => l.worker_id !== workerId));

  const patchConcept = (workerId: string, idx: number, patch: Partial<PayrollConceptInput>) =>
    setLines((ls) => ls.map((l) => (l.worker_id === workerId
      ? { ...l, concepts: (l.concepts ?? []).map((c, i) => (i === idx ? { ...c, ...patch } : c)) }
      : l)));

  const addConcept = (workerId: string) =>
    setLines((ls) => ls.map((l) => (l.worker_id === workerId
      ? { ...l, concepts: [...(l.concepts ?? []), { kind: 'complemento', sigla: '', description: '', amount: 0 }] }
      : l)));

  const removeConcept = (workerId: string, idx: number) =>
    setLines((ls) => ls.map((l) => (l.worker_id === workerId
      ? { ...l, concepts: (l.concepts ?? []).filter((_, i) => i !== idx) }
      : l)));

  const validateAndSave = async () => {
    if (!periodStart || !periodEnd) { toast.error('Indica el período (desde/hasta)'); return; }
    if (periodStart > periodEnd) { toast.error('La fecha inicial no puede ser posterior a la final'); return; }
    if (lines.length === 0) { toast.error('Añade al menos un trabajador con líneas'); return; }
    for (const l of lines) {
      if (l.rate_type === 'hourly' && !(l.regular_hours ?? 0) && !(l.overtime_hours ?? 0)) {
        toast.error(`${l.worker_names}: indica las horas regulares (tarifa horaria)`);
        return;
      }
      if (l.rate_type === 'daily' && !(l.accrued_days ?? 0)) {
        toast.error(`${l.worker_names}: indica los días devengados (tarifa diaria)`);
        return;
      }
      for (const c of l.concepts ?? []) {
        if (!c.sigla.trim()) { toast.error(`${l.worker_names}: la sigla del concepto es obligatoria`); return; }
        if (c.amount < 0) { toast.error(`${l.worker_names}: importe de concepto no negativo`); return; }
      }
    }
    setSaving(true);
    try {
      const items = lines.map((l) => ({
        worker_id: l.worker_id,
        regular_hours: Number(l.regular_hours ?? 0),
        accrued_days: Number(l.accrued_days ?? 0),
        overtime_hours: Number(l.overtime_hours ?? 0),
        overtime_amount: Number(l.overtime_amount ?? 0),
        vacation_days: Number(l.vacation_days ?? 0),
        vacation_amount: Number(l.vacation_amount ?? 0),
        concepts: (l.concepts ?? []).map((c) => ({
          kind: c.kind, sigla: c.sigla.trim(), description: c.description?.trim() ?? '', amount: Number(c.amount),
        })),
      }));
      const base = {
        tipo_nomina: tipo,
        period_start: periodStart,
        period_end: periodEnd,
        payment_method: paymentMethod,
        cheque_number: chequeNumber.trim() || null,
        cheque_date: chequeDate || null,
        reintegro_number: reintegroNumber.trim() || null,
        reintegro_date: reintegroDate || null,
        notes: notes.trim() || null,
        items,
      };
      let result;
      if (existing) {
        result = await apiFetch(`/api/payrolls/${existing.id}`, { method: 'PUT', body: JSON.stringify(base) });
      } else {
        result = await apiFetch('/api/payrolls', {
          method: 'POST',
          // store_id EXPLÍCITO (tienda operada por la UI): evita la divergencia
          // con profiles.active_store_id — causa raíz del caso Dup Test. La
          // autorización la mantiene el RPC (has_store_access_as).
          body: JSON.stringify({ ...base, store_id: storeId, idempotency_key: idempotencyRef.current }),
        });
      }
      toast.success(`Nómina ${result.payroll_number} guardada en borrador — totales calculados por el servidor`);
      // Recuperar el detalle con líneas + conceptos para la vista previa.
      const data = await apiFetch(`/api/payrolls/${result.payroll_id}`);
      setSavedPayroll(data.payroll);
      setPreviewNonce((n) => n + 1);
      onSaved(data.payroll);
    } catch (e) {
      toast.error((e as { error?: string }).error || 'No se pudo guardar la nómina');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!savedPayroll) { toast.info('Guarda el borrador primero: la vista previa usa los totales del servidor.'); return; }
    try {
      const data = await apiFetch(`/api/payrolls/${savedPayroll.id}`);
      const doc = await buildPayrollPdf({ payroll: data.payroll });
      doc.save(`nomina-${savedPayroll.payroll_number}.pdf`);
    } catch (e) {
      toast.error((e as { message?: string }).message || 'No se pudo generar el PDF');
    }
  };

  const periodInvalid = periodStart && periodEnd && periodStart > periodEnd;

  return (
    <div className="rounded-2xl border border-border bg-card">
      {/* Barra superior del editor */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="flex-1 min-w-[180px]">
          <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {existing ? `Editando ${existing.payroll_number}` : 'Nueva nómina SC-4-06'}
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Borrador → Confirmada → Pagada (+ Contabilizada). Totales, tarifa vigente e identidad
            en snapshot: SIEMPRE servidor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className={cn('px-3 py-2 rounded-lg border border-border text-xs', touch)}>Cerrar</button>
          <button type="button" onClick={validateAndSave} disabled={saving}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold', touch)}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {existing ? 'Guardar borrador' : 'Guardar borrador'}
          </button>
        </div>
      </div>

      {/* Pestañas CONFECCIÓN | VISTA PREVIA (patrón Reporte Entrega) */}
      <div className="flex border-b border-border bg-card rounded-t-xl overflow-hidden" role="tablist" aria-label="Secciones de la nómina">
        {([
          ['confeccion', 'Confección', Pencil],
          ['preview', 'Vista previa', FileText],
        ] as Array<[EditorTab, string, ElementType]>).map(([id, label, Icon]) => (
          <button
            key={id} role="tab" aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 py-2.5 px-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5 min-h-[44px]',
              tab === id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{label}</span>
            {id === 'preview' && previewStale && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Vista previa desactualizada" />}
          </button>
        ))}
      </div>

      <div className="p-3 sm:p-4" role="tabpanel">
        {tab === 'confeccion' && (
          <div className="space-y-4">
            {/* Cabecera del documento */}
            <section aria-label="Datos de la nómina" className="rounded-xl border border-border/60 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                <label className="text-[10px] font-black uppercase text-muted-foreground">Modalidad de pago
                  <select className={cn(inputCls, 'mt-1')} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'efectivo' | 'tarjeta')}>
                    <option value="efectivo">Efectivo (cheque nominativo)</option>
                    <option value="tarjeta">Tarjeta magnética</option>
                  </select>
                </label>
                <label className="text-[10px] font-black uppercase text-muted-foreground">Cheque N.º {paymentMethod === 'tarjeta' ? '(no aplica)' : ''}
                  <input type="text" maxLength={50} disabled={paymentMethod === 'tarjeta'}
                    className={cn(inputCls, 'mt-1', paymentMethod === 'tarjeta' && 'opacity-50')}
                    value={chequeNumber} placeholder={paymentMethod === 'tarjeta' ? '—' : 'CHQ-…'}
                    onChange={(e) => setChequeNumber(e.target.value)} />
                </label>
                <label className="text-[10px] font-black uppercase text-muted-foreground">Fecha cheque
                  <input type="date" disabled={paymentMethod === 'tarjeta'}
                    className={cn(inputCls, 'mt-1', paymentMethod === 'tarjeta' && 'opacity-50')}
                    value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                </label>
                <label className="text-[10px] font-black uppercase text-muted-foreground">Reintegro N.º (opc.)
                  <input type="text" maxLength={50} className={cn(inputCls, 'mt-1')} value={reintegroNumber}
                    placeholder="Banco — indebidos no reclamados" onChange={(e) => setReintegroNumber(e.target.value)} />
                </label>
                <label className="text-[10px] font-black uppercase text-muted-foreground">Fecha reintegro
                  <input type="date" className={cn(inputCls, 'mt-1')} value={reintegroDate} onChange={(e) => setReintegroDate(e.target.value)} />
                </label>
              </div>
              {periodInvalid && (
                <p role="alert" className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5" /> El intervalo es inválido: «Desde» no puede ser posterior a «Hasta».
                </p>
              )}
              <label className="mt-3 block text-[10px] font-black uppercase text-muted-foreground">Notas
                <textarea className={cn(inputCls, 'mt-1 min-h-[48px] resize-y')} maxLength={2000} value={notes}
                  onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones del documento…" />
              </label>
            </section>

            {/* Añadir trabajador — búsqueda dinámica (misma experiencia que el
                selector de productos de ventas/entradas/documentos) */}
            <section aria-label="Añadir trabajador" className="rounded-xl border border-border/60 p-3">
              <label htmlFor="payroll-worker-search" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Search className="w-3 h-3" aria-hidden="true" />
                Agregar trabajador
              </label>
              <p className="mt-0.5 mb-2 text-[10px] text-muted-foreground">
                Trabajadores de la tienda con tarifa vigente para el período. Los no
                elegibles aparecen deshabilitados con su causa (sin ocultarlos).
              </p>
              <WorkerSearchSelect
                workers={workersState}
                addedWorkerIds={addedWorkerIds}
                periodStart={periodStart}
                periodEnd={periodEnd}
                onSelect={addWorker}
                inputId="payroll-worker-search"
              />
              {workersLoading && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Actualizando elegibilidad de tarifas para el período…
                </p>
              )}
              {workersState.length > 0 && workersState.every((w) => !w.rate_amount) && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Ningún trabajador de la tienda tiene tarifa vigente: fíjala en la pestaña
                  «Trabajadores» (botón «Tarifa», icono de moneda) antes de confeccionar.
                </p>
              )}
            </section>

            {/* Líneas por trabajador */}
            {lines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Sin líneas todavía. Añade trabajadores para confeccionar la nómina.
              </p>
            ) : (
              <div className="space-y-3">
                {lines.map((l) => (
                  <article key={l.worker_id} className="rounded-xl border border-border/60 bg-background p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Users className="w-4 h-4 shrink-0 text-primary" />
                      <h4 className="flex-1 min-w-[140px] text-xs font-bold">{l.worker_names}</h4>
                      <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {l.rate_type === 'daily' ? 'Jornal' : 'Horario'} · {money(l.rate_amount)} {l.rate_currency ?? 'CUP'}/{l.rate_type === 'daily' ? 'día' : 'hora'}
                      </span>
                      <button type="button" onClick={() => removeLine(l.worker_id)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label={`Quitar ${l.worker_names}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {l.rate_type !== 'daily' ? (
                        <label className="text-[10px] font-black uppercase text-muted-foreground">Horas regulares
                          <input type="number" min="0" step="0.5" inputMode="decimal" className={cn(inputCls, 'mt-1')}
                            value={l.regular_hours ?? 0} onChange={(e) => patchLine(l.worker_id, { regular_hours: Number(e.target.value) })} />
                        </label>
                      ) : (
                        <label className="text-[10px] font-black uppercase text-muted-foreground">Días devengados
                          <input type="number" min="0" step="0.5" inputMode="decimal" className={cn(inputCls, 'mt-1')}
                            value={l.accrued_days ?? 0} onChange={(e) => patchLine(l.worker_id, { accrued_days: Number(e.target.value) })} />
                        </label>
                      )}
                      <label className="text-[10px] font-black uppercase text-muted-foreground">Horas extras
                        <input type="number" min="0" step="0.5" inputMode="decimal" className={cn(inputCls, 'mt-1')}
                          value={l.overtime_hours ?? 0} onChange={(e) => patchLine(l.worker_id, { overtime_hours: Number(e.target.value) })} />
                      </label>
                      <label className="text-[10px] font-black uppercase text-muted-foreground">Importe extras
                        <input type="number" min="0" step="0.01" inputMode="decimal" className={cn(inputCls, 'mt-1')}
                          value={l.overtime_amount ?? 0} onChange={(e) => patchLine(l.worker_id, { overtime_amount: Number(e.target.value) })} />
                      </label>
                      <label className="text-[10px] font-black uppercase text-muted-foreground">Vacaciones (días)
                        <input type="number" min="0" step="0.5" inputMode="decimal" className={cn(inputCls, 'mt-1')}
                          value={l.vacation_days ?? 0} onChange={(e) => patchLine(l.worker_id, { vacation_days: Number(e.target.value) })} />
                      </label>
                      <label className="text-[10px] font-black uppercase text-muted-foreground">Vacaciones (importe)
                        <input type="number" min="0" step="0.01" inputMode="decimal" className={cn(inputCls, 'mt-1')}
                          value={l.vacation_amount ?? 0} onChange={(e) => patchLine(l.worker_id, { vacation_amount: Number(e.target.value) })} />
                      </label>
                    </div>

                    {/* Conceptos (4 clases del modelo) */}
                    <div className="mt-3 border-t border-border/50 pt-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-[10px] font-black uppercase text-muted-foreground">Conceptos (sigla · clase · importe)</h5>
                        <button type="button" onClick={() => addConcept(l.worker_id)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10">
                          <Plus className="w-3 h-3" /> Concepto
                        </button>
                      </div>
                      {(l.concepts ?? []).length === 0 ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Complementos, otros haberes, obligaciones estatales y deducciones — con sigla.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {(l.concepts ?? []).map((c, idx) => (
                            <li key={idx} className="grid grid-cols-2 gap-1.5 sm:grid-cols-[130px_1fr_60px_86px_32px] items-center">
                              <select className={cn(inputCls, 'text-[11px]')} value={c.kind}
                                onChange={(e) => patchConcept(l.worker_id, idx, { kind: e.target.value as PayrollConceptInput['kind'] })}>
                                {CONCEPT_KINDS.map((k) => <option key={k} value={k}>{CONCEPT_KIND_LABELS[k]}</option>)}
                              </select>
                              <input className={cn(inputCls, 'text-[11px]')} placeholder="Sigla (máx. 12)" maxLength={12} value={c.sigla}
                                onChange={(e) => patchConcept(l.worker_id, idx, { sigla: e.target.value })} />
                              <input className={cn(inputCls, 'text-[11px]')} placeholder="Descripción" maxLength={200} value={c.description ?? ''}
                                onChange={(e) => patchConcept(l.worker_id, idx, { description: e.target.value })} />
                              <input type="number" min="0" step="0.01" inputMode="decimal" className={cn(inputCls, 'text-[11px]')} value={c.amount}
                                onChange={(e) => patchConcept(l.worker_id, idx, { amount: Number(e.target.value) })} />
                              <button type="button" onClick={() => removeConcept(l.worker_id, idx)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Quitar concepto">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'preview' && (
          <div>
            {!savedPayroll ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <FileText className="mx-auto w-8 h-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">Sin documento guardado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Guarda el borrador primero: la vista previa presenta los TOTALES calculados por
                  el servidor (única fuente de verdad), no estimaciones del cliente.
                </p>
              </div>
            ) : previewLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Generando vista previa…
              </div>
            ) : previewError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive" role="alert">
                {previewError}
              </div>
            ) : previewUrl ? (
              <div className="space-y-2">
                {/* El iframe muestra el MISMO documento que se descarga (blob del builder compartido) */}
                <iframe
                  src={previewUrl}
                  title={`Vista previa de la nómina ${savedPayroll.payroll_number}`}
                  className="w-full h-[62vh] rounded-xl border border-border bg-white"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">
                    Documento SC-4-06 · {savedPayroll.payroll_number} · {PAYROLL_STATUS_LABELS[savedPayroll.status]}
                    {previewStale && <span className="text-amber-600"> · desactualizada</span>}
                  </p>
                  <button type="button" onClick={handleDownload}
                    className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold', touch)}>
                    <FileDown className="w-4 h-4" /> Descargar PDF
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña Nóminas — listado + flujo documental
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Trabajador de la tienda con perfil laboral y tarifa vigente (para
 * confección). Alias de compatibilidad del selector: todos los estados —
 * los no elegibles (inactivos, sin tarifa, tarifa no vigente para el
 * período) se muestran deshabilitados CON explicación, nunca ocultos.
 */
export type NominaWorker = SelectableWorker;

export function NominasTab({ storeId, openPayrollId, onOpenPayrollConsumed }: {
  storeId: string;
  /** Nómina que WorkersView pide abrir en el editor (flujo «Agregar a Nómina»). */
  openPayrollId?: string | null;
  /** Consumido por NominasTab al abrir el editor (WorkersView limpia su estado). */
  onOpenPayrollConsumed?: () => void;
}) {
  // Trabajadores de la tienda con tarifa (fuente propia de la pestaña —
  // desacoplada del resumen de comisiones). SIN filtro de estado: el selector
  // del editor muestra los inactivos deshabilitados con su causa.
  const [workers, setWorkers] = useState<NominaWorker[]>([]);
  const fetchWorkers = useCallback(async () => {
    if (!storeId) return;
    try {
      const data = await apiFetch(`/api/workers?store_id=${storeId}&include_rate=1`);
      setWorkers(data.workers ?? []);
    } catch {
      setWorkers([]);
    }
  }, [storeId]);

  useEffect(() => { void fetchWorkers(); }, [fetchWorkers]);

  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | PayrollStatus>('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Payroll | null>(null);
  const [voiding, setVoiding] = useState<Payroll | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rateWorker, setRateWorker] = useState<{ worker_id: string; first_name: string; last_name: string } | null>(null);

  const fetchPayrolls = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ store_id: storeId });
      if (statusFilter) params.set('status', statusFilter);
      const data = await apiFetch(`/api/payrolls?${params.toString()}`);
      setPayrolls(data.payrolls ?? []);
    } catch (e) {
      setError((e as { error?: string }).error || 'No se pudo cargar las nóminas');
    } finally {
      setLoading(false);
    }
  }, [storeId, statusFilter]);

  useEffect(() => { void fetchPayrolls(); }, [fetchPayrolls]);

  const transition = async (p: Payroll, action: 'confirm' | 'account' | 'pay', label: string) => {
    setBusyId(p.id);
    try {
      await apiFetch(`/api/payrolls/${p.id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      toast.success(`${p.payroll_number}: ${label}`);
      await fetchPayrolls();
    } catch (e) {
      toast.error((e as { error?: string }).error || `No se pudo ${label.toLowerCase()}`);
    } finally {
      setBusyId(null);
    }
  };

  const openEditor = async (p: Payroll | null) => {
    if (p) {
      // Solo borradores se editan (ERR_NOT_DRAFT en el servidor para el resto).
      if (p.status !== 'draft') {
        toast.error('Solo se pueden editar nóminas en borrador');
        return;
      }
      const data = await apiFetch(`/api/payrolls/${p.id}`).catch(() => null);
      setEditing(data?.payroll ?? p);
    } else {
      setEditing(null);
    }
    setEditorOpen(true);
  };

  // Flujo «Agregar a Nómina» desde Trabajadores: WorkersView pasa la nómina a
  // abrir (borrador recién creado o editado). Consumo único: al abrir, se
  // notifica para limpiar el estado del padre.
  useEffect(() => {
    if (!openPayrollId || !storeId) return;
    let cancelled = false;
    void (async () => {
      const data = await apiFetch(`/api/payrolls/${openPayrollId}`).catch(() => null);
      if (cancelled) return;
      const p = data?.payroll ?? null;
      if (p && p.status === 'draft') {
        setEditing(p);
        setEditorOpen(true);
      } else if (p) {
        toast.error('Solo se pueden editar nóminas en borrador');
      } else {
        toast.error('No se pudo abrir la nómina solicitada');
      }
      onOpenPayrollConsumed?.();
    })();
    return () => { cancelled = true; };
  }, [openPayrollId, storeId]);

  return (
    <div className="space-y-3">
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void openEditor(null)}
          className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold', touch)}>
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nueva nómina</span><span className="sm:hidden">Nueva</span>
        </button>
        <label className="text-[10px] font-black uppercase text-muted-foreground">
          Estado
          <select className={cn(inputCls, 'mt-0.5 w-[130px]')} value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | PayrollStatus)}>
            <option value="">Todos</option>
            {(['draft', 'confirmed', 'paid', 'voided'] as PayrollStatus[]).map((s) => (
              <option key={s} value={s}>{PAYROLL_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <button type="button" onClick={fetchPayrolls} disabled={loading}
          className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors border border-border"
          aria-label="Refrescar nóminas">
          <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Listado */}
      {loading && payrolls.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando nóminas…
        </div>
      ) : payrolls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <FileText className="mx-auto w-8 h-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Sin nóminas todavía</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Confecciona la primera nómina SC-4-06 del período (los trabajadores necesitan tarifa
            salarial vigente).
          </p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Listado de nóminas">
          {payrolls.map((p) => (
            <li key={p.id} className="rounded-xl border border-border/60 bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold">{p.payroll_number}</span>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', STATUS_BADGE[p.status])}>
                  {PAYROLL_STATUS_LABELS[p.status]}
                </span>
                <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {TIPO_NOMINA_LABELS[p.tipo_nomina] ?? p.tipo_nomina}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {dateLabel(p.period_start)} → {dateLabel(p.period_end)}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Users className="w-3 h-3" /> {p.total_workers}
                </span>
                <div className="flex-1" />
                <span className="text-sm font-black">
                  {money(p.total_net)} <span className="text-[10px] font-normal text-muted-foreground">{p.currency}</span>
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <BadgeCheck className={cn('w-3 h-3', p.reviewed_at ? 'text-emerald-600' : 'opacity-30')} /> Revisada
                </span>
                <span className="flex items-center gap-1">
                  <Landmark className={cn('w-3 h-3', p.accounted_at ? 'text-emerald-600' : 'opacity-30')} /> Contabilizada
                </span>
                <span className="flex items-center gap-1">
                  <Wallet className={cn('w-3 h-3', p.paid_at ? 'text-emerald-600' : 'opacity-30')} /> Pagada
                </span>
                {p.status === 'voided' && p.void_reason && (
                  <span className="text-destructive" title={p.void_reason}>Anulada: {p.void_reason.slice(0, 60)}{p.void_reason.length > 60 ? '…' : ''}</span>
                )}
              </div>

              {/* Acciones por estado (motor documental) */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.status === 'draft' && (
                  <>
                    <button type="button" onClick={() => void openEditor(p)}
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-semibold hover:bg-muted/40">
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                    <button type="button" disabled={busyId === p.id} onClick={() => void transition(p, 'confirm', 'confirmada (firma revisa y aprueba)')}
                      className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[10px] font-semibold text-primary hover:bg-primary/20">
                      {busyId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Confirmar
                    </button>
                  </>
                )}
                {p.status === 'confirmed' && (
                  <>
                    <button type="button" disabled={busyId === p.id || !!p.accounted_at} onClick={() => void transition(p, 'account', 'contabilizada (firma contabiliza)')}
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-semibold hover:bg-muted/40 disabled:opacity-50">
                      <Landmark className="w-3 h-3" /> {p.accounted_at ? 'Contabilizada' : 'Contabilizar'}
                    </button>
                    <button type="button" disabled={busyId === p.id} onClick={() => void transition(p, 'pay', 'pagada')}
                      className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20">
                      {busyId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wallet className="w-3 h-3" />} Marcar pagada
                    </button>
                  </>
                )}
                {(p.status === 'draft' || p.status === 'confirmed') && (
                  <button type="button" onClick={() => setVoiding(p)}
                    className="flex items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[10px] font-semibold text-destructive hover:bg-destructive/10">
                    <Ban className="w-3 h-3" /> Anular
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Editor (CONFECCIÓN | VISTA PREVIA) */}
      {editorOpen && (
        <PayrollEditor
          storeId={storeId}
          workers={workers}
          existing={editing}
          onClose={() => { setEditorOpen(false); setEditing(null); }}
          onSaved={() => { void fetchPayrolls(); }}
        />
      )}

      {/* Anulación */}
      {voiding && (
        <VoidPayrollModal
          payroll={voiding}
          onClose={() => setVoiding(null)}
          onDone={() => { setVoiding(null); void fetchPayrolls(); }}
        />
      )}

      {/* Tarifa salarial (acceso rápido desde la pestaña Nóminas) */}
      {rateWorker && (
        <SalaryRateModal
          worker={rateWorker}
          onClose={() => setRateWorker(null)}
          onSaved={() => { void fetchWorkers(); }}
        />
      )}

      {/* Ayuda contextual de tarifas sin salir de la pestaña */}
      {payrolls.length === 0 && !loading && !error && (
        <button
          type="button"
          onClick={() => {
            const w = workers.find((x) => !x.rate_amount);
            if (w) setRateWorker({ worker_id: w.worker_id, first_name: w.first_name, last_name: w.last_name });
            else toast.info('Los trabajadores de la tienda ya tienen tarifa vigente');
          }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold hover:bg-muted/40"
        >
          <Coins className="w-4 h-4" /> Fijar tarifa salarial a un trabajador
        </button>
      )}
    </div>
  );
}
