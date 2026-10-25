'use client';

/**
 * CashFlowCreateModal — registro del documento Ingreso/Egreso de caja.
 *
 * MISIÓN INGRESOS/EGRESOS (2026-10-20). Formulario DEDICADO (no reutiliza el
 * de venta ni el de gasto) con flujo de DOS PASOS (patrón ValeSalidaCreateModal):
 *
 *   1. EDICIÓN: tipo (ingreso/egreso) → motivo (matriz dinámica), importe +
 *      moneda (+ equivalencia CUP con tasa informativa), fecha operativa
 *      (política temporal, dentro del turno), contraparte, justificación y
 *      notas. Validaciones visibles junto al campo.
 *   2. CONFIRMACIÓN: resumen inequívoco con caja, moneda, importe y EFECTO
 *      ESPERADO sobre el saldo (el RPC devuelve el efecto real ejecutado).
 *
 * Reglas de UI (espejo de los controles del backend — la DB es la última
 * barrera):
 *   · Sin turno abierto → bloqueado con explicación (abrir Caja primero).
 *   · Importe > 0 con máximo 2 decimales; moneda CUP/USD.
 *   · Egreso: importe (CUP canónico) ≤ efectivo disponible.
 *   · Devolución de fondo: ≤ fondo vigente + vínculo opcional al documento
 *     origen (constitución/reposición confirmadas).
 *   · Constitución con apertura que ya declaró fondo → aviso (no doble
 *     registro del mismo dinero).
 *   · Fecha operativa dentro del turno abierto (doctrina caja FIJA).
 *   · Doble envío imposible (botón deshabilitado + idempotency_key).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle2, Loader2, AlertTriangle, Info, Link2 } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { OperationDatePicker, useOperationDateValidation } from '@/components/ui/OperationDatePicker';
import {
  CASH_FLOW_CONCEPTS, conceptLabel, conceptsForType, canLinkRelatedDocument,
  isFondoConcept, hasValidMonetaryPrecision, allowedWithoutShift, DELIVERY_AUTH_ROLES,
  COUNTERPARTY_MAX_LENGTH, JUSTIFICATION_MAX_LENGTH, NOTES_MAX_LENGTH,
  type CashFlowDocType,
} from '@/lib/cash-flow/constants';
import { useCreateCashFlow, useFondoSourceDocuments } from '@/hooks/api/useCashFlow';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';
import { resolvePosOperationDate } from '@/lib/pos/operation-date';
import { useActiveShift } from '@/hooks/api/useActiveShift';
import { useAuthStore } from '@/store';
import { formatCurrency, cn, touch } from '@/lib/utils';
import type { CashFlowSummary } from '@/types';

type Paso = 'editando' | 'confirmando' | 'registrado';

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string | null;
  storeName: string | null;
  summary: CashFlowSummary | null;
  onRegistrado?: () => void;
  /** MISIÓN CAJA v2.24.0 (§9): saldos físicos por moneda (libro) — los trae la vista padre. */
  saldoFisico?: { CUP: number | null; USD: number | null };
}

export function CashFlowCreateModal({ open, onClose, storeId, storeName, summary, onRegistrado, saldoFisico = { CUP: null, USD: null } }: Props) {
  const activeShift = useActiveShift(storeId);
  const turnoAbierto = activeShift.data != null;
  const createMutation = useCreateCashFlow();
  // MISIÓN CAJA v2.24.0 (§9): libro físico por moneda — la ENTREGA valida
  // contra el saldo físico de la MONEDA del documento (no contra el canónico).
  // El libro lo consulta la vista padre (fuente única) y llega por props.

  const { user } = useAuthStore();

  const [paso, setPaso] = useState<Paso>('editando');
  const [docType, setDocType] = useState<CashFlowDocType>('ingreso');
  const [concept, setConcept] = useState<string>('constitucion_fondo');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState<'CUP' | 'USD'>('CUP');
  const [movDate, setMovDate] = useState<string>(todayBusinessDay());
  const [counterparty, setCounterparty] = useState('');
  const [justification, setJustification] = useState('');
  const [notes, setNotes] = useState('');
  const [relatedDocumentId, setRelatedDocumentId] = useState<string>('');
  const [resultado, setResultado] = useState<{
    document_number: string; cash_after: number; fondo_after: number; amount: number; currency: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // REVISIÓN FINAL v2.24.1: clave de idempotencia estable POR APERTURA del
  // modal — reintentos del mismo documento reutilizan la clave; el RPC v2.24.1
  // compara hash del payload (mismo payload ⇒ resultado original benigno;
  // payload distinto ⇒ ERR_IDEMPOTENCY_KEY_REUSE → 409).
  const [idempotencyKey, setIdempotencyKey] = useState(() => `cf-${crypto.randomUUID()}`);

  const mostrarVinculo = canLinkRelatedDocument(concept);
  const fondoSources = useFondoSourceDocuments(storeId, mostrarVinculo && open);

  // Reset completo al abrir (patrón ValeSalidaCreateModal)
  useEffect(() => {
    if (open) {
      // REVISIÓN FINAL v2.24.1: el modal queda MONTADO (prop open) — la clave
      // se regenera en cada apertura para que cada NUEVO documento tenga su
      // propia identidad; los reintentos DENTRO de la misma apertura la
      // conservan (replay benigno del RPC v2.24.1).
      setIdempotencyKey(`cf-${crypto.randomUUID()}`);
      setPaso('editando');
      setDocType('ingreso');
      setConcept('constitucion_fondo');
      setAmountStr('');
      setCurrency('CUP');
      setMovDate(todayBusinessDay());
      setCounterparty('');
      setJustification('');
      setNotes('');
      setRelatedDocumentId('');
      setResultado(null);
      setSubmitError(null);
      createMutation.reset();
    }
  }, [open]);

  // Al cambiar tipo, el concepto debe pertenecer a la matriz del tipo
  useEffect(() => {
    const validos: string[] = conceptsForType(docType).map(c => c.value);
    if (!validos.includes(concept)) {
      setConcept(validos[0]);
      setRelatedDocumentId('');
    }
  }, [docType]);

  // MISIÓN CAJA v2.24.0 (D4): SIN turno abierto, el ÚNICO concepto autorizado
  // es la ENTREGA de efectivo (egreso, fuera de turno, con rol de autoridad).
  // La forzosa solo aplica cuando la consulta del turno YA RESOLVIÓ (evita
  // forzar 'entrega_efectivo' durante el loading inicial del query).
  const shiftSettled = !activeShift.isLoading && !activeShift.isPending;
  const sinTurno = shiftSettled && !turnoAbierto;
  const modoEntregaSinTurno = sinTurno && concept === 'entrega_efectivo';
  useEffect(() => {
    if (sinTurno) {
      setDocType('egreso');
      setConcept('entrega_efectivo');
      setRelatedDocumentId('');
    }
  }, [sinTurno]);

  const amount = Number(amountStr);
  const dateValidation = useOperationDateValidation(movDate, storeId, todayBusinessDay());

  const saldoCaja = summary?.expected_cash ?? null;
  const fondoVigente = summary?.fondo_vigente ?? null;
  const amountCupEquiv = currency === 'CUP' ? amount : null; // USD: equivalencia solo informativa (tasa del servidor)

  const errores: Array<string> = useMemo(() => {
    const errs: string[] = [];
    // MISIÓN CAJA v2.24.0 (D4): sin turno SOLO se permite la entrega de
    // efectivo (fuera de turno, rol de autoridad). Los demás conceptos exigen
    // turno abierto (espejo del RPC — la DB es la última barrera).
    if (sinTurno && !modoEntregaSinTurno) errs.push('La caja no tiene un turno abierto: solo la ENTREGA de efectivo puede registrarse sin turno.');
    if (modoEntregaSinTurno && !user?.roles?.some(r => (DELIVERY_AUTH_ROLES as readonly string[]).includes(r))) {
      errs.push('La entrega de efectivo requiere rol admin, manager o encargado.');
    }
    if (!amountStr) errs.push('Introduce el importe.');
    else if (!Number.isFinite(amount) || amount <= 0) errs.push('El importe debe ser mayor que cero.');
    else if (!hasValidMonetaryPrecision(amount)) errs.push('El importe admite máximo 2 decimales.');
    if (!justification.trim()) errs.push('La justificación es obligatoria.');
    if (justification.trim().length > JUSTIFICATION_MAX_LENGTH) errs.push(`La justificación no puede exceder ${JUSTIFICATION_MAX_LENGTH} caracteres.`);
    // MISIÓN CAJA v2.24.0 (D4): contraparte OBLIGATORIA en la entrega (quien recibe).
    if (concept === 'entrega_efectivo' && !counterparty.trim()) {
      errs.push('Identifica a la persona que RECIBE el efectivo (contraparte obligatoria).');
    }
    if (!dateValidation.valid) errs.push(dateValidation.error || 'La fecha operativa no es válida.');
    if (docType === 'egreso' && concept === 'entrega_efectivo') {
      // Validación POR MONEDA contra el libro físico (misma regla del RPC:
      // ERR_INSUFFICIENT_CURRENCY — get_cash_currency_summary net).
      const saldoMoneda = saldoFisico[currency];
      if (saldoMoneda != null && Number.isFinite(amount) && amount > 0 && amount > saldoMoneda + 0.005) {
        errs.push(`La entrega supera el saldo físico ${currency} en caja (${formatCurrency(saldoMoneda, currency)}).`);
      }
    } else if (docType === 'egreso') {
      // MISIÓN POST-MERGE 20261024220000: TODO egreso ordinario valida POR
      // MONEDA contra el libro físico (espejo del RPC — la DB es la barrera
      // real). El saldo de la OTRA moneda no financia billetes de esta.
      const saldoMoneda = saldoFisico[currency];
      if (saldoMoneda != null && Number.isFinite(amount) && amount > 0 && amount > saldoMoneda + 0.005) {
        errs.push(`El egreso supera el saldo físico ${currency} en caja (${formatCurrency(saldoMoneda, currency)}).`);
      }
      // Disciplina canónica del turno (espejo ERR_INSUFFICIENT_CASH del RPC):
      // información temprana; la DB decide con la ventana autoritativa.
      if (saldoCaja != null && Number.isFinite(amount) && amount > 0 && currency === 'CUP' && amount > saldoCaja + 0.005) {
        errs.push(`El egreso supera el efectivo esperado del turno (${formatCurrency(saldoCaja)}).`);
      }
    }
    if (docType === 'egreso' && isFondoConcept(concept) && fondoVigente != null
        && Number.isFinite(amount) && amount > 0 && currency === 'CUP' && amount > fondoVigente + 0.005) {
      errs.push(`La devolución supera el fondo de cambio vigente (${formatCurrency(fondoVigente)}).`);
    }
    return errs;
  }, [sinTurno, modoEntregaSinTurno, user?.roles, amountStr, amount, justification, counterparty, dateValidation, docType, saldoCaja, fondoVigente, concept, currency, saldoFisico]);

  const advertencias: Array<string> = useMemo(() => {
    const warns: string[] = [];
    // MISIÓN CAJA v2.24.0 (D4): entrega FUERA de turno — identificada como tal.
    if (modoEntregaSinTurno) {
      warns.push('Operación FUERA DE TURNO: se registrará identificada como entrega sin turno abierto (sin turno artificial), con tu usuario, la fecha efectiva y el receptor documentados. La DB valida el rol y el saldo físico de la moneda.');
    }
    if (concept === 'entrega_efectivo' && turnoAbierto) {
      warns.push('Entrega DENTRO del turno vigente: entrará en la ventana del arqueo actual y reducirá el efectivo esperado de la moneda entregada.');
    }
    if (concept === 'constitucion_fondo' && (summary?.opening_balance ?? 0) > 0) {
      warns.push(`La apertura del turno ya declaró un fondo inicial de ${formatCurrency(summary?.opening_balance ?? 0)}. Registra la constitución SOLO si entra dinero NUEVO (reposición) — nunca dos veces el mismo billete.`);
    }
    if (currency === 'USD') {
      warns.push('El equivalente en CUP lo resuelve el servidor con la tasa vigente de la tienda (jerarquía tienda → BCC → elToque).');
    }
    if (docType === 'egreso' && !isFondoConcept(concept) && concept !== 'entrega_efectivo') {
      warns.push('Los gastos de proveedores, servicios y comisiones tienen su propio módulo (Cuentas por Pagar) — usa «Otro egreso» solo para salidas autorizadas sin módulo propio.');
    }
    return warns;
  }, [modoEntregaSinTurno, concept, summary?.opening_balance, currency, docType, turnoAbierto]);

  const validoParaConfirmar = errores.length === 0;

  async function registrar() {
    if (!validoParaConfirmar || createMutation.isPending) return;
    setSubmitError(null);
    try {
      const res = await createMutation.mutateAsync({
        doc_type: docType,
        concept,
        amount: Math.round(amount * 100) / 100,
        currency,
        // REVISIÓN FINAL v2.24.1: idempotencia cooperativa (estable por apertura)
        idempotency_key: idempotencyKey,
        // Doctrina de la casa (resolvePosOperationDate): hoy → undefined → el
        // servidor estampa NOW() (siempre dentro de la ventana del turno);
        // otro día → mediodía ISO, validado contra la ventana por el RPC.
        operation_date: resolvePosOperationDate(movDate),
        counterparty: counterparty.trim() || null,
        justification: justification.trim(),
        notes: notes.trim() || null,
        related_document_id: mostrarVinculo && relatedDocumentId ? relatedDocumentId : null,
      });
      setResultado({
        document_number: res.document_number,
        cash_after: res.cash_after,
        fondo_after: res.fondo_after,
        amount: res.amount,
        currency: res.currency,
      });
      setPaso('registrado');
      onRegistrado?.();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo registrar el documento.');
    }
  }

  const footer =
    paso === 'editando' ? (
      <Button
        type="button"
        onClick={() => setPaso('confirmando')}
        disabled={!validoParaConfirmar}
        className="h-10 rounded-lg font-black uppercase text-xs tracking-wide"
      >
        Revisar y confirmar <ArrowRight className="w-4 h-4 ml-1.5" />
      </Button>
    ) : paso === 'confirmando' ? (
      <div className="flex flex-wrap items-center justify-between gap-2 w-full">
        <Button type="button" variant="outline" onClick={() => setPaso('editando')} disabled={createMutation.isPending} className="h-10 rounded-lg">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Volver a editar
        </Button>
        <Button
          type="button"
          onClick={registrar}
          disabled={createMutation.isPending}
          className="h-10 rounded-lg font-black uppercase text-xs tracking-wide"
        >
          {createMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Registrando…</>
          ) : (
            <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Confirmar Documento</>
          )}
        </Button>
      </div>
    ) : (
      <Button type="button" onClick={onClose} className="h-10 rounded-lg font-black uppercase text-xs tracking-wide">
        Cerrar
      </Button>
    );

  return (
    <BaseModal
      open={open}
      onOpenChange={o => { if (!o && !createMutation.isPending) onClose(); }}
      maxWidth="sm:max-w-2xl"
      title="Registrar Ingreso / Egreso de Caja"
      description={`Documento de efectivo físico${storeName ? ` · ${storeName}` : ''} — fondo de cambio y otros movimientos autorizados`}
      footer={footer}
    >
      {paso === 'editando' && (
        <div className="space-y-4">
          {/* Tipo de documento */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de documento">
            {([['ingreso', 'Ingreso (+)', 'Entra efectivo a la caja'], ['egreso', 'Egreso (−)', 'Sale efectivo de la caja']] as const).map(([tipo, label, desc]) => (
              <button
                key={tipo}
                type="button"
                role="radio"
                aria-checked={docType === tipo}
                onClick={() => setDocType(tipo)}
                className={cn(
                  'rounded-xl border-2 p-3 text-left transition-all',
                  docType === tipo
                    ? tipo === 'ingreso' ? 'border-success/50 bg-success/10' : 'border-destructive/50 bg-destructive/10'
                    : 'border-border hover:bg-muted/50',
                  touch,
                )}
              >
                <span className={cn('block text-xs font-black uppercase tracking-widest', docType === tipo ? (tipo === 'ingreso' ? 'text-success' : 'text-destructive') : 'text-muted-foreground')}>
                  {label}
                </span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">{desc}</span>
              </button>
            ))}
          </div>

          {/* Motivo */}
          <div>
            <label htmlFor="cf-concept" className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              Motivo *
            </label>
            <select
              id="cf-concept"
              value={concept}
              onChange={e => { setConcept(e.target.value); setRelatedDocumentId(''); }}
              className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm font-bold', touch)}
            >
              {conceptsForType(docType).map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
              {CASH_FLOW_CONCEPTS.find(c => c.value === concept)?.description}
            </p>
          </div>

          {/* Importe + moneda */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="cf-amount" className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                Importe * (máx. 2 decimales)
              </label>
              <input
                id="cf-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                placeholder="0.00"
                aria-invalid={!!amountStr && (!Number.isFinite(Number(amountStr)) || Number(amountStr) <= 0)}
                className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm font-mono font-bold', touch)}
              />
            </div>
            <div>
              <label htmlFor="cf-currency" className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                Moneda *
              </label>
              <select
                id="cf-currency"
                value={currency}
                onChange={e => setCurrency(e.target.value as 'CUP' | 'USD')}
                className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm font-bold', touch)}
              >
                <option value="CUP">CUP</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          {currency === 'CUP' && Number.isFinite(amount) && amount > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Equivalente: <span className="font-bold text-foreground">{formatCurrency(amount)}</span>
            </p>
          )}
          {currency === 'USD' && Number.isFinite(amount) && amount > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Equivalente CUP: <span className="font-bold text-foreground">tasa del servidor</span> (se confirma al registrar)
            </p>
          )}

          {/* Fecha operativa (política temporal) */}
          <OperationDatePicker
            value={movDate}
            onChange={setMovDate}
            label="Fecha operativa *"
            storeId={storeId}
            max={todayBusinessDay()}
            inputId="cf-operation-date"
          />
          <p className="text-[10px] text-muted-foreground -mt-2 leading-relaxed">
            Debe caer dentro del turno abierto (doctrina de caja: el turno mide lo que pasa en su ventana).
          </p>

          {/* Contraparte */}
          <div>
            <label htmlFor="cf-counterparty" className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              {concept === 'entrega_efectivo'
                ? 'Quien RECIBE el dinero (obligatorio) *'
                : `Quien ${docType === 'ingreso' ? 'entrega' : 'recibe'} el dinero (opcional)`}
            </label>
            <input
              id="cf-counterparty"
              type="text"
              maxLength={COUNTERPARTY_MAX_LENGTH}
              value={counterparty}
              onChange={e => setCounterparty(e.target.value)}
              placeholder={concept === 'entrega_efectivo'
                ? 'Ej. Nombre del receptor del efectivo (trazabilidad de la entrega)'
                : docType === 'ingreso' ? 'Ej. Encargado que entrega el fondo' : 'Ej. Encargado que recibe la devolución'}
              className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm', touch)}
            />
            {concept === 'entrega_efectivo' && (
              <p className="text-[10px] text-muted-foreground mt-1">
                La entrega registra quién entrega (tu usuario) y quién recibe (contraparte) — trazabilidad completa del dinero.
              </p>
            )}
          </div>

          {/* Vínculo con documento de fondo (solo devoluciones) */}
          {mostrarVinculo && (
            <div>
              <label htmlFor="cf-related" className="flex items-center gap-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                <Link2 className="w-3 h-3" /> Fondo de origen (opcional)
              </label>
              <select
                id="cf-related"
                value={relatedDocumentId}
                onChange={e => setRelatedDocumentId(e.target.value)}
                className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm font-bold', touch)}
              >
                <option value="">Sin vínculo específico (del fondo global)</option>
                {(fondoSources.data ?? []).map(src => (
                  <option key={src.id} value={src.id}>
                    {src.document_number} · {conceptLabel(src.concept)} · {formatCurrency(src.amount, src.currency)}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Vincula la devolución a la constitución/reposición que la origina (trazabilidad del fondo).
              </p>
            </div>
          )}

          {/* Justificación */}
          <div>
            <label htmlFor="cf-justification" className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              Justificación *
            </label>
            <textarea
              id="cf-justification"
              rows={2}
              maxLength={JUSTIFICATION_MAX_LENGTH}
              value={justification}
              onChange={e => setJustification(e.target.value)}
              placeholder="Motivo del movimiento (queda en el documento y en la auditoría)"
              className={cn('w-full px-3 py-2 rounded-xl border border-border bg-background text-sm', touch)}
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{justification.length}/{JUSTIFICATION_MAX_LENGTH} caracteres</p>
          </div>

          {/* Notas */}
          <div>
            <label htmlFor="cf-notes" className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              Observaciones (opcional)
            </label>
            <textarea
              id="cf-notes"
              rows={2}
              maxLength={NOTES_MAX_LENGTH}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={cn('w-full px-3 py-2 rounded-xl border border-border bg-background text-sm', touch)}
            />
          </div>

          {/* Estado de caja + validaciones */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado de caja</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {/* MISIÓN CAJA v2.24.0 (§9) + EFECTIVO FÍSICO (P0 2026-10-26):
                  saldos físicos por moneda como referencia operativa + la
                  valoración canónica clasificada (nunca como billetes) */}
              <span>Saldo físico CUP: <span className="font-black tabular-nums">{saldoFisico.CUP != null ? formatCurrency(saldoFisico.CUP) : '—'}</span></span>
              <span>Saldo físico USD: <span className="font-black tabular-nums">{saldoFisico.USD != null ? formatCurrency(saldoFisico.USD, 'USD') : '—'}</span></span>
              <span>Valoración contable CUP: <span className="font-black tabular-nums">{saldoCaja != null ? formatCurrency(saldoCaja) : '—'}</span> <span className="text-muted-foreground">(no son billetes)</span></span>
              <span>Fondo de cambio: <span className="font-black tabular-nums">{fondoVigente != null ? formatCurrency(fondoVigente) : '—'}</span></span>
            </div>
            {errores.length > 0 && (
              <div className="pt-1 space-y-1" role="alert">
                {errores.map(e => (
                  <p key={e} className="flex items-start gap-1.5 text-[10px] text-destructive font-medium leading-relaxed">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" /> {e}
                  </p>
                ))}
              </div>
            )}
            {advertencias.map(w => (
              <p key={w} className="flex items-start gap-1.5 text-[10px] text-warning font-medium leading-relaxed">
                <Info className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" /> {w}
              </p>
            ))}
          </div>
        </div>
      )}

      {paso === 'confirmando' && (
        <div className="space-y-3">
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Resumen de la operación</p>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Tipo</dt>
                <dd className={cn('font-black uppercase', docType === 'ingreso' ? 'text-success' : 'text-destructive')}>
                  {docType === 'ingreso' ? 'Ingreso de efectivo (+)' : 'Egreso de efectivo (−)'}
                </dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Motivo</dt>
                <dd className="font-bold text-right">{conceptLabel(concept)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Importe</dt>
                <dd className="font-black font-mono tabular-nums">{formatCurrency(amount, currency)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Fecha operativa</dt>
                <dd className="font-bold">{movDate}</dd></div>
              {counterparty.trim() && (
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{docType === 'ingreso' ? 'Entrega' : 'Recibe'}</dt>
                  <dd className="font-bold text-right">{counterparty.trim()}</dd></div>
              )}
              {mostrarVinculo && relatedDocumentId && (
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Fondo de origen</dt>
                  <dd className="font-mono text-xs font-bold">
                    {fondoSources.data?.find(s => s.id === relatedDocumentId)?.document_number ?? relatedDocumentId}
                  </dd></div>
              )}
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Justificación</dt>
                <dd className="font-bold text-right max-w-[60%]">{justification.trim()}</dd></div>
            </dl>
          </div>
          {/* Efecto esperado sobre el saldo (requisito §6) */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1 text-xs">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Efecto esperado sobre el saldo</p>
            {concept === 'entrega_efectivo' ? (
              <p className="tabular-nums">
                Saldo físico {currency}: <span className="font-black">{saldoFisico[currency] != null ? formatCurrency(saldoFisico[currency]!, currency) : '—'}</span>
                {' → '}
                <span className="font-black text-destructive">
                  {saldoFisico[currency] != null ? formatCurrency((saldoFisico[currency] ?? 0) - amount, currency) : '—'}
                </span>
                {modoEntregaSinTurno && <span className="text-muted-foreground"> · documento fuera de turno (closure_id nulo)</span>}
              </p>
            ) : saldoFisico.CUP != null && currency === 'CUP' && (
              <p className="tabular-nums">
                Saldo físico CUP: <span className="font-black">{formatCurrency(saldoFisico.CUP)}</span>
                {' → '}
                <span className={cn('font-black', docType === 'ingreso' ? 'text-success' : 'text-destructive')}>
                  {formatCurrency(saldoFisico.CUP + (docType === 'ingreso' ? amount : -amount))}
                </span>
                {saldoCaja != null && Math.abs(saldoCaja - (saldoFisico.CUP ?? 0)) >= 0.005 && (
                  <span className="text-muted-foreground"> · valoración contable CUP {formatCurrency(saldoCaja)} (no son billetes)</span>
                )}
              </p>
            )}
            {isFondoConcept(concept) && fondoVigente != null && currency === 'CUP' && (
              <p className="tabular-nums">
                Fondo de cambio: <span className="font-black">{formatCurrency(fondoVigente)}</span>
                {' → '}
                <span className="font-black text-warning">
                  {formatCurrency(
                    fondoVigente
                    + (concept === 'constitucion_fondo' || concept === 'reposicion_fondo' ? amount : -amount),
                  )}
                </span>
              </p>
            )}
            {currency === 'USD' && concept !== 'entrega_efectivo' && (
              <p className="text-muted-foreground">Documento en USD: el equivalente CUP y el efecto final los fija el servidor con la tasa vigente.</p>
            )}
          </div>
          {submitError && (
            <p role="alert" className="text-xs p-3 rounded-xl bg-destructive/10 text-destructive font-medium">{submitError}</p>
          )}
        </div>
      )}

      {paso === 'registrado' && resultado && (
        <div className="py-8 text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 mx-auto text-success" aria-hidden="true" />
          <div>
            <p className="text-sm font-black uppercase tracking-widest">Documento registrado</p>
            <p className="text-lg font-mono font-black text-primary mt-1">{resultado.document_number}</p>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="tabular-nums">
              {formatCurrency(resultado.amount, resultado.currency as 'CUP' | 'USD')}
              {' · '}efectivo en caja ahora: <span className="font-black text-foreground">{formatCurrency(resultado.cash_after)}</span>
            </p>
            {isFondoConcept(concept) && (
              <p className="tabular-nums">Fondo de cambio ahora: <span className="font-black text-foreground">{formatCurrency(resultado.fondo_after)}</span></p>
            )}
            <p>El movimiento ya aparece en el listado, en el arqueo y en Inicio.</p>
          </div>
        </div>
      )}
    </BaseModal>
  );
}
