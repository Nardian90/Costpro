'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Truck, Package, Shield, Link2, Eye, RefreshCw, Ban, FileText, Search, CheckCircle2, Settings2, Pencil, ChevronDown, MoreVertical, XCircle, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { useDialogs } from '@/components/ui/dialogs';
import { useTranslations } from 'next-intl';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useServiceTypes, type ServiceType } from '@/hooks/useServiceTypes';
import { useStoreRates } from '@/hooks/useStoreRates';
import PaymentRowsEditor, {
  newPaymentRow, rowsCupTotal, rowsToPayload, rowsAreValid, payRowsFingerprint,
  type PaymentEditorRow,
} from '@/components/payments/PaymentRowsEditor';
// ADN-008 §4: mismo selector de proveedores del formulario de Recepciones —
// misma fuente (Clasificador Maestro + suppliers de la tienda), misma
// búsqueda, misma alta al vuelo y mismo snapshot de identificación.
import { SupplierSelector, type SupplierSelection } from '@/components/views/terminal/views/inventory/SupplierSelector';
import { ServiceTypesManagerModal } from './ServiceTypesManagerModal';
// CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — FASE 4: guard
// de pagos vivos antes de anular un servicio con pagos aplicados.
import { UnresolvedPaymentsDialog } from '@/components/payments/UnresolvedPaymentsDialog';
import {
  fetchDocumentPayments,
  computeLivePayments,
  parseUnresolvedPaymentsError,
  type DocumentPaymentRow,
} from '@/lib/payments/live-payments';
// MISIÓN POLÍTICA TEMPORAL (2026-10-18): fecha del servicio seleccionable —
// el RPC create_received_service_v2 ya aceptaba/validaba p_service_date,
// pero la UI nunca lo exponía y el default CURRENT_DATE (UTC del servidor
// Postgres) fechaba «mañana» los servicios creados tras las 20:00 Habana.
import { OperationDatePicker, useOperationDateValidation, formatOperationDateForRPC } from '@/components/ui/OperationDatePicker';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';
// MISIÓN FECHAS DE TRABAJO (2026-10-18): default = preferencia de trabajo
// del usuario para servicios (válida contra los límites vivos) o HOY.
import { useApplyWorkDateDefault } from '@/hooks/ui/useWorkDateDefault';

/**
 * F2: Servicios Recibidos y Costos Asociados.
 * CP-NAV-FINANCE-REORGANIZATION-001 (2026-11-25): vista principal del módulo
 * OPERACIÓN → FINANZAS → Servicios Recibidos (historial: Almacén hasta
 * 2026-10-23, Logística hasta 2026-11-25). Mismo ViewType
 * 'received-services' — sin cambio de rutas ni APIs ni lógica.
 */

// Exportado para pruebas de componentes consumidores.
export interface ReceivedService {
  id: string;
  service_number: string;
  service_date: string;
  service_type_id?: string | null;
  service_type_name: string;
  supplier: string | null;
  reference_doc: string | null;
  total_amount: number;
  currency: string;
  status: string;
  distribution_method: string;
  observations: string | null;
  // FIX-PAYMENT-TRACKING (2026-07-12): campos de pago
  payment_status?: 'unpaid' | 'partial' | 'paid';
  payment_method?: 'cash' | 'transfer' | 'zelle' | null;
  paid_amount?: number;
  due_date?: string | null;
  paid_at?: string | null;
  // ADN-008: identidad del proveedor (reutilización del selector de Recepciones)
  supplier_id?: string | null;
  supplier_master_party_id?: string | null;
  supplier_code?: string | null;
  supplier_tax_id?: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
}

const SERVICE_ICONS: Record<string, any> = {
  'Transporte': Truck,
  'Manipulación': Package,
  'Seguro': Shield,
  'default': FileText,
};

export default function ReceivedServicesView() {
  const t = useTranslations();
  // CP-UX-FINAL-POLISH-003 §3.1: sistema unificado de diálogos (sin alert/confirm/prompt nativos).
  const dialogs = useDialogs();
  const { user } = useAuthStore();
  // MISIÓN POLÍTICA TEMPORAL (2026-10-18), descubrimiento FASE A: los fetch
  // crudos de este módulo (crear/activar/anular) NO llevaban Authorization
  // Bearer y el backend (getServerSession, SEC-024 fail-closed) SOLO autentica
  // por Bearer → 401 «Se requiere sesión activa» en TODA la gestión de
  // servicios desde la UI. Patrón canónico: useServiceTypes/useUsers/useOfertas.
  const authToken = useAuthStore((s) => s.token);
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
  const [services, setServices] = useState<ReceivedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // ADN-008 §3.3: los borradores se filtran y se recuperan desde el listado.
  // ADN-010: los borradores también pueden CANCELARSE (status 'cancelled').
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'active' | 'cancelled' | 'voided'>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  // ADN-008 §3.3: edición/confirmación de un borrador existente.
  const [editService, setEditService] = useState<ReceivedService | null>(null);
  // MISIÓN 2026-10-15: catálogo de tipos de servicio desde la fuente oficial
  // (tabla service_types) + acceso «Gestionar tipos de servicio».
  const { types, activeTypes, loading: typesLoading, error: typesError, refetch: refetchTypes } = useServiceTypes();
  const [managerOpen, setManagerOpen] = useState(false);
  const [preselectedTypeId, setPreselectedTypeId] = useState<string | null>(null);
  // FIX-PAYMENT-TRACKING: estado para modal de detalle con tab de pagos
  const [detailService, setDetailService] = useState<ReceivedService | null>(null);
  // ADN-010: confirmaciones de Cancelar / Eliminar borrador (con identificación
  // clara del documento y motivo opcional para la auditoría).
  const [cancelTarget, setCancelTarget] = useState<ReceivedService | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReceivedService | null>(null);
  const [draftActionReason, setDraftActionReason] = useState('');
  const [draftActionBusy, setDraftActionBusy] = useState(false);
  // CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 §FASE4:
  // servicio con pagos vivos cuya anulación queda bloqueada hasta resolverlos.
  const [unresolvedPayments, setUnresolvedPayments] = useState<{
    service: ReceivedService;
    summary: { liveCount: number; liveTotalCup: number; netPaidCup: number };
    liveRows: DocumentPaymentRow[];
  } | null>(null);

  const fetchServices = useCallback(async () => {
    if (!user?.activeStoreId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('received_services')
        .select('*')
        .eq('store_id', user.activeStoreId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setServices(data || []);
    } catch (e: any) {
      toast.error('Error al cargar servicios: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.activeStoreId]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const filtered = services.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.service_number.toLowerCase().includes(q) ||
             s.service_type_name.toLowerCase().includes(q) ||
             (s.supplier || '').toLowerCase().includes(q) ||
             (s.reference_doc || '').toLowerCase().includes(q);
    }
    return true;
  });

  // ADN-008 §3: dos modos de guardar diferenciados.
  //  · save_as_draft=true → POST create_received_service_draft (sin activar,
  //    sin pagos, CERO efectos financieros; idempotente por creation_key).
  //  · confirmar → flujo existente: POST (draft) → PATCH active (gate: proveedor
  //    + importe) → pagos del desglose si «Liquidar al confirmar».
  const handleCreate = async (data: any): Promise<boolean> => {
    try {
      const res = await fetch('/api/received-services', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ...data, store_id: user?.activeStoreId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Error al crear servicio');
      }
      const created = await res.json().catch(() => null);

      // ── Modo BORRADOR: sin activación, sin pagos, sin efectos financieros ──
      if (data.save_as_draft === true) {
        toast.success(created?.data?.duplicate
          ? `Borrador ya existente (${created.data.service_number}) — no se duplicó.`
          : `Borrador guardado (${created?.data?.service_number || ''}). Sin efectos financieros hasta confirmarlo.`);
        setCreateModalOpen(false);
        fetchServices();
        return true;
      }

      // v2.18.0: el RPC crea el servicio en estado 'draft' (documento completo,
      // vínculos incluidos). Se activa de inmediato para preservar el flujo
      // anterior (la fila aparece Activa). Si la activación falla, el servicio
      // queda en Borrador y puede activarse desde la tabla sin perder nada.
      const newId = created?.data?.id;
      if (newId) {
        const act = await fetch('/api/received-services', {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ service_id: newId, status: 'active', reason: 'Activación tras creación' }),
        });
        if (!act.ok) {
          toast.warning('Servicio creado en Borrador. Actívalo desde la tabla (botón Activar).');
        } else {
          toast.success('Servicio creado correctamente');
          // CP-FIN-003 (anexo §3.1/§3.2): liquidación inmediata al confirmar —
          // el pago viaja por el canal canónico (/api/payments → RPC
          // register_supplier_payment → motor: cuenta según medio×moneda).
          // Cada componente conserva SU forma de pago, moneda, tasa e importe.
          const payments = rowsToPayload(data.paymentRows || []);
          if (payments.length > 0) {
            const pay = await fetch('/api/payments', {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                ref_type: 'service',
                ref_id: newId,
                payments,
                payment_date: data.payment_date || undefined,
                // ADN-009 (§8): clave de idempotencia ESTABLE del intento de
                // liquidación (generada por el modal al abrir/cambiar el lote;
                // se reutiliza en reintentos tras respuesta perdida/incierta).
                // Un reintento de la MISMA operación no crea componentes extra:
                // el RPC devuelve el lote aplicado (replay completo).
                idempotency_key: data.payment_idempotency_key || crypto.randomUUID(),
              }),
            });
            if (pay.ok) {
              const n = payments.length;
              toast.success(`Servicio confirmado y pago registrado (${n} componente${n === 1 ? '' : 's'}).`);
            } else {
              const err = await pay.json().catch(() => ({}));
              toast.warning(`Servicio creado, pero el pago no se registró: ${err.error || err.message || 'error'} — regístralo desde el detalle.`);
            }
          }
        }
      } else {
        toast.success('Servicio creado correctamente');
      }
      setCreateModalOpen(false);
      fetchServices();
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    }
  };

  // ADN-008 §3.3: recuperar un borrador → guardar cambios o CONFIRMAR.
  //  · mode='draft' → PATCH update-draft (sin efectos financieros).
  //  · mode='confirm' → PATCH update-draft → PATCH status active (gate:
  //    proveedor + importe; el trigger CP-FIN contabiliza el reconocimiento
  //    UNA sola vez) → pagos del desglose si «Liquidar al confirmar».
  //    La transición es única (advisory lock + guard no_change en la BD):
  //    una segunda confirmación no re-contabiliza ni duplica nada.
  const handleSaveDraftService = async (serviceId: string, data: any, mode: 'draft' | 'confirm'): Promise<boolean> => {
    try {
      const upd = await fetch('/api/received-services', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          service_id: serviceId,
          action: 'update-draft',
          supplier: data.supplier ?? null,
          supplier_id: data.supplier_id ?? null,
          supplier_master_party_id: data.supplier_master_party_id ?? null,
          supplier_meta: data.supplier_meta ?? null,
          service_type_id: data.service_type_id,
          service_type_name: data.service_type_name,
          total_amount: data.total_amount,
          service_date: data.service_date,
          reference_doc: data.reference_doc,
          observations: data.observations,
          distribution_method: data.distribution_method,
          receipt_ids: data.receipt_ids || [],
          production_order_ids: data.production_order_ids || [],
        }),
      });
      if (!upd.ok) {
        const err = await upd.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar el borrador');
      }

      if (mode === 'draft') {
        toast.success('Cambios del borrador guardados. Sin efectos financieros.');
        setEditService(null);
        fetchServices();
        return true;
      }

      const act = await fetch('/api/received-services', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ service_id: serviceId, status: 'active', reason: 'Confirmación de borrador' }),
      });
      if (!act.ok) {
        const err = await act.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo confirmar el servicio (revisa proveedor e importe).');
      }
      toast.success('Servicio confirmado correctamente');

      // Liquidación al confirmar (mismo canal canónico del detalle).
      const payments = rowsToPayload(data.paymentRows || []);
      if (payments.length > 0) {
        const pay = await fetch('/api/payments', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            ref_type: 'service',
            ref_id: serviceId,
            payments,
            payment_date: data.payment_date || undefined,
            // ADN-009 (§8): idempotencia estable del intento (ver handleCreate).
            idempotency_key: data.payment_idempotency_key || crypto.randomUUID(),
          }),
        });
        if (pay.ok) {
          const n = payments.length;
          toast.success(`Liquidación registrada (${n} componente${n === 1 ? '' : 's'}).`);
        } else {
          const err = await pay.json().catch(() => ({}));
          toast.warning(`Servicio confirmado, pero el pago no se registró: ${err.error || 'error'} — regístralo desde el detalle.`);
        }
      }

      setEditService(null);
      fetchServices();
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    }
  };

  // v2.18.0: activar un servicio en Borrador (transición draft→active)
  const handleActivate = async (id: string) => {
    try {
      const res = await fetch('/api/received-services', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ service_id: id, status: 'active', reason: 'Activación desde la tabla' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al activar');
      }
      toast.success('Servicio activado');
      fetchServices();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleVoid = async (id: string) => {
    // CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 §FASE4:
    // pre-chequeo de pagos vivos — un servicio con pagos confirmados o
    // aplicados NO se anula ignorando sus pagos: primero se resuelve cada pago
    // con la reversión oficial y después se completa la anulación (misión §2).
    const svc = services.find(s => s.id === id);
    if (svc && user?.activeStoreId) {
      try {
        const rows = await fetchDocumentPayments('service', id, user.activeStoreId);
        const summary = computeLivePayments(rows);
        if (summary.liveCount > 0) {
          setUnresolvedPayments({ service: svc, summary, liveRows: summary.liveRows });
          return;
        }
      } catch {
        // El pre-chequeo NO bloquea: el guard del RPC (fail-closed servidor)
        // es la barrera real; aquí solo se enriquece la UX.
      }
    }
    // CP-UX-FINAL-POLISH-003 §3.1: confirmación propia (antes confirm() nativo).
    const ok = await dialogs.confirm({
      title: 'Anular servicio',
      message: '¿Anular este servicio? Se eliminarán sus distribuciones.',
      variant: 'destructive',
      confirmLabel: 'Anular',
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/received-services', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ service_id: id, action: 'void' }),
      });
      if (!res.ok) {
        // CP-AP-ACCOUNTING-INTEGRITY-001: backstop del guard server-side con
        // guía accionable (nunca error genérico — misión §6).
        const err = await res.json().catch(() => ({}));
        const guard = parseUnresolvedPaymentsError(err.error || err.message || '');
        if (guard && svc) {
          setUnresolvedPayments({
            service: svc,
            summary: { liveCount: guard.liveCount, liveTotalCup: guard.liveTotalCup, netPaidCup: guard.totalDocumento - guard.saldoActual },
            liveRows: [],
          });
          return;
        }
        throw new Error(err.error || 'Error al anular');
      }
      toast.success('Servicio anulado');
      fetchServices();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRecalculate = async (id: string) => {
    try {
      // MISIÓN SERVICIOS RECIBIDOS: distribute usa withAuth → sin Bearer daba
      // 401 silencioso («Error al recalcular»), mismo defecto que los pagos.
      const res = await fetch('/api/received-services/distribute', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ service_id: id }),
      });
      if (!res.ok) throw new Error('Error al recalcular');
      const data = await res.json();
      toast.success(`Distribución recalculada: ${data.distributed_rows} líneas`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── ADN-010: CANCELAR BORRADOR (draft→cancelled) ─────────────────────────
  // Flujo oficial del sistema: PATCH status → RPC set_received_service_status
  // (transiciones gated, auditoría SERVICE_STATUS_CHANGED). El documento se
  // CONSERVA con su trazabilidad; nunca genera efectos contables.
  const handleCancelDraft = async () => {
    if (!cancelTarget) return;
    setDraftActionBusy(true);
    try {
      const res = await fetch('/api/received-services', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          service_id: cancelTarget.id,
          status: 'cancelled',
          reason: draftActionReason.trim() || 'Cancelación de borrador desde la tabla',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al cancelar el borrador');
      }
      toast.success(`Borrador ${cancelTarget.service_number} cancelado. El documento se conserva en el historial.`);
      setCancelTarget(null);
      setDraftActionReason('');
      fetchServices();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDraftActionBusy(false);
    }
  };

  // ── ADN-010: ELIMINAR BORRADOR ───────────────────────────────────────────
  // DELETE → RPC delete_received_service_draft: solo draft, sin pagos ni
  // distribuciones ni asientos; audita el borrado con snapshot ANTES de
  // eliminar. Los errores de integridad llegan con mensaje comprensible.
  const handleDeleteDraft = async () => {
    if (!deleteTarget) return;
    setDraftActionBusy(true);
    try {
      const res = await fetch('/api/received-services', {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify({
          service_id: deleteTarget.id,
          reason: draftActionReason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al eliminar el borrador');
      }
      toast.success(`Borrador ${deleteTarget.service_number} eliminado.`);
      setDeleteTarget(null);
      setDraftActionReason('');
      fetchServices();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDraftActionBusy(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-success flex items-center justify-center shrink-0">
            <Truck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-foreground">
              Servicios Recibidos
            </h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              Registro, distribución de costos y pago de servicios de terceros
            </p>
          </div>
        </div>
        <Button
          onClick={() => setCreateModalOpen(true)}
          className="h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs gap-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo Servicio
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, tipo, proveedor..."
            className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-background text-sm font-medium min-h-[44px]"
          />
        </div>
        <div className="flex gap-1 bg-muted p-0.5 rounded-lg border border-border overflow-x-auto">
          {(['all', 'draft', 'active', 'cancelled', 'voided'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-4 py-2 rounded-md text-xs font-black uppercase tracking-widest transition-all min-h-[44px] whitespace-nowrap",
                statusFilter === s ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === 'all' ? 'Todos' : s === 'draft' ? 'Borradores' : s === 'active' ? 'Activos' : s === 'cancelled' ? 'Cancelados' : 'Anulados'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cargando servicios...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Truck className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-sm font-bold text-muted-foreground">No hay servicios registrados</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Crea tu primer servicio recibido</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">Número</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">Proveedor</th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-muted-foreground">Importe</th>
                  <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map((svc, i) => {
                  const Icon = SERVICE_ICONS[svc.service_type_name] || SERVICE_ICONS.default;
                  return (
                    <motion.tr
                      key={svc.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-primary/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-xs">{svc.service_number}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{svc.service_date}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-primary/60" />
                          <span className="text-xs font-bold">{svc.service_type_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{svc.supplier || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-sm">{formatCurrency(svc.total_amount)} {svc.currency}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-black uppercase tracking-widest",
                          svc.status === 'active' ? "bg-success/10 text-success" : svc.status === 'draft' ? "bg-amber-500/10 text-amber-500" : svc.status === 'cancelled' ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"
                        )}>
                          {svc.status === 'active' ? 'Activo' : svc.status === 'draft' ? 'Borrador' : svc.status === 'cancelled' ? 'Cancelado' : 'Anulado'}
                        </span>
                        {/* FIX-PAYMENT-TRACKING: badge de estado de pago */}
                        {svc.status === 'active' && svc.payment_status && (
                          <span className={cn(
                            "ml-1 px-2 py-1 rounded text-[10px] font-black uppercase",
                            svc.payment_status === 'paid' ? "bg-success/10 text-success"
                            : svc.payment_status === 'partial' ? "bg-amber-500/10 text-amber-500"
                            : "bg-destructive/10 text-destructive"
                          )}>
                            {svc.payment_status === 'paid' ? '💰 Pagado' : svc.payment_status === 'partial' ? '⚖️ Parcial' : '⏳ Pendiente'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {/* FIX-PAYMENT-TRACKING: botón Ver detalle con tab de pagos */}
                          <button onClick={() => setDetailService(svc)} className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors min-h-[44px] min-w-[44px]" aria-label="Ver detalle" title="Ver detalle y pagos">
                            <Eye className="w-4 h-4" />
                          </button>
                          {/* ADN-008 §3.3: recuperar el borrador para continuar editándolo */}
                          {svc.status === 'draft' && (
                            <button onClick={() => setEditService(svc)} className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors min-h-[44px] min-w-[44px]" aria-label="Continuar borrador" title="Continuar edición del borrador">
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {/* v2.18.0: activar borradores (transición draft→active; gate: proveedor + importe) */}
                          {svc.status === 'draft' && (
                            <button onClick={() => handleActivate(svc.id)} className="p-2 rounded-lg hover:bg-success/10 text-success transition-colors min-h-[44px] min-w-[44px]" aria-label="Activar" title="Confirmar servicio">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {/* ADN-010: menú de gestión del borrador (clic, NO hover:
                              accesible en táctil y pantallas pequeñas). Acciones
                              con etiqueta explícita y confirmación previa. */}
                          {svc.status === 'draft' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors min-h-[44px] min-w-[44px]"
                                  aria-label={`Más acciones del borrador ${svc.service_number}`}
                                  title="Más acciones del borrador"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem
                                  onClick={() => { setDraftActionReason(''); setCancelTarget(svc); }}
                                  className="gap-2 text-warning focus:text-warning"
                                  data-testid="draft-cancel-action"
                                >
                                  <XCircle className="w-4 h-4" /> Cancelar borrador
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => { setDraftActionReason(''); setDeleteTarget(svc); }}
                                  className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                                  data-testid="draft-delete-action"
                                >
                                  <Trash2 className="w-4 h-4" /> Eliminar borrador
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {/* ADN-008 (complemento §1): Recalcular SOLO tiene efecto en
                              servicios activos con recepción vinculada — oculto en borradores. */}
                          {svc.status !== 'draft' && (
                            <button onClick={() => handleRecalculate(svc.id)} className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors min-h-[44px] min-w-[44px]" aria-label="Recalcular distribución" title="Recalcular">
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                          {svc.status === 'active' && (
                            <button onClick={() => handleVoid(svc.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors min-h-[44px] min-w-[44px]" aria-label="Anular" title="Anular">
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de creación */}
      <CreateServiceModal
        isOpen={createModalOpen}
        onClose={() => { setCreateModalOpen(false); setPreselectedTypeId(null); }}
        onCreate={handleCreate}
        activeTypes={activeTypes}
        typesLoading={typesLoading}
        onOpenManager={() => setManagerOpen(true)}
        preselectTypeId={preselectedTypeId}
      />

      {/* ADN-008 §3.3: mismo formulario en modo EDICIÓN de borrador.
          Guardar cambios (sin efectos) o Confirmar (activación + pagos). */}
      {editService && (
        <CreateServiceModal
          isOpen={!!editService}
          onClose={() => setEditService(null)}
          onCreate={handleCreate}
          onSaveEdit={handleSaveDraftService}
          editService={editService}
          activeTypes={activeTypes}
          typesLoading={typesLoading}
          onOpenManager={() => setManagerOpen(true)}
          preselectTypeId={preselectedTypeId}
        />
      )}

      {/* MISIÓN 2026-10-15: gestión del catálogo de tipos de servicio.
          Se abre sobre el formulario sin cerrar la operación en curso; al
          crear un tipo, el selector lo recarga y lo preselecciona. */}
      <ServiceTypesManagerModal
        isOpen={managerOpen}
        onClose={() => setManagerOpen(false)}
        types={types}
        loading={typesLoading}
        onRefresh={refetchTypes}
        onTypeCreated={(created) => { setPreselectedTypeId(created.id); }}
        loadError={typesError}
      />

      {/* FIX-PAYMENT-TRACKING (2026-07-12): Modal de detalle con tab de pagos */}
      {detailService && (
        <ServiceDetailModal
          service={detailService}
          onClose={() => setDetailService(null)}
          onUpdate={() => { fetchServices(); }}
          onEditDraft={(svc) => { setDetailService(null); setEditService(svc); }}
        />
      )}

      {/* CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 §FASE4:
          diálogo del guard de pagos vivos — el servicio no se anula hasta
          resolver cada pago con la reversión oficial; el botón lleva al
          historial de pagos del propio servicio (pestaña Pagos). */}
      <UnresolvedPaymentsDialog
        open={!!unresolvedPayments}
        onClose={() => setUnresolvedPayments(null)}
        docKind="service"
        docLabel={unresolvedPayments?.service?.service_number || unresolvedPayments?.service?.reference_doc || ''}
        supplier={unresolvedPayments?.service?.supplier}
        totalCup={Number(unresolvedPayments?.service?.total_amount ?? 0)}
        summary={unresolvedPayments?.summary ?? { liveCount: 0, liveTotalCup: 0, netPaidCup: 0 }}
        liveRows={unresolvedPayments?.liveRows}
        onViewPayments={unresolvedPayments?.service ? () => {
          setDetailService(unresolvedPayments!.service);
          setUnresolvedPayments(null);
        } : undefined}
      />

      {/* ── ADN-010: confirmación de CANCELAR borrador ──
          El documento se conserva con su trazabilidad (estado Cancelado);
          la operación viaja por el flujo oficial set_received_service_status. */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar este borrador?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-border bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed">
                  <div><span className="font-bold text-foreground">{cancelTarget?.service_number}</span></div>
                  <div>{cancelTarget?.service_type_name} · {cancelTarget?.supplier || 'Sin proveedor'}</div>
                  <div>{formatCurrency(cancelTarget?.total_amount ?? 0)} {cancelTarget?.currency} · {cancelTarget?.service_date}</div>
                </div>
                <p>
                  El documento pasará a estado <span className="font-bold">Cancelado</span> y se
                  conservará en el historial con su trazabilidad. Los borradores no generan
                  efectos contables.
                </p>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Motivo (opcional)</span>
                  <input
                    type="text"
                    value={draftActionReason}
                    onChange={(e) => setDraftActionReason(e.target.value)}
                    maxLength={200}
                    placeholder="Ej.: solicitud duplicada del proveedor"
                    className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-2.5 text-xs font-medium"
                  />
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={draftActionBusy} className="min-h-[44px]">Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCancelDraft(); }}
              disabled={draftActionBusy}
              className="min-h-[44px] bg-warning text-warning-foreground hover:bg-warning/90 font-black uppercase tracking-widest text-xs"
              data-testid="confirm-cancel-draft"
            >
              {draftActionBusy ? 'Cancelando…' : 'Cancelar borrador'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── ADN-010: confirmación de ELIMINAR borrador ──
          Identificación clara del documento afectado; el backend rechaza el
          borrado si existen pagos, distribuciones o asientos (misión §2.5). */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar definitivamente este borrador?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 font-mono text-[11px] leading-relaxed">
                  <div><span className="font-bold text-foreground">{deleteTarget?.service_number}</span></div>
                  <div>{deleteTarget?.service_type_name} · {deleteTarget?.supplier || 'Sin proveedor'}</div>
                  <div>{formatCurrency(deleteTarget?.total_amount ?? 0)} {deleteTarget?.currency} · {deleteTarget?.service_date}</div>
                </div>
                <p>
                  Esta acción <span className="font-bold text-destructive">eliminará físicamente</span> el
                  borrador. No genera asientos contables y la operación quedará registrada en
                  la auditoría con una copia del documento. Si prefieres conservarlo, cáncelalo.
                </p>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Motivo (opcional)</span>
                  <input
                    type="text"
                    value={draftActionReason}
                    onChange={(e) => setDraftActionReason(e.target.value)}
                    maxLength={200}
                    placeholder="Ej.: captura de prueba, no se requiere el servicio"
                    className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-2.5 text-xs font-medium"
                  />
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={draftActionBusy} className="min-h-[44px]">Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteDraft(); }}
              disabled={draftActionBusy}
              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90 font-black uppercase tracking-widest text-xs"
              data-testid="confirm-delete-draft"
            >
              {draftActionBusy ? 'Eliminando…' : 'Eliminar definitivamente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// ServiceDetailModal — Modal de detalle con tabs: Info + Pagos
// ============================================================================
function ServiceDetailModal({
  service,
  onClose,
  onUpdate,
  onEditDraft,
}: {
  service: ReceivedService;
  onClose: () => void;
  onUpdate: () => void;
  /** ADN-008: continuar la edición de un borrador desde el detalle. */
  onEditDraft?: (svc: ReceivedService) => void;
}) {
  const { user } = useAuthStore();
  // CP-UX-FINAL-POLISH-003 §3.1: sistema unificado de diálogos (sin confirm/prompt nativos).
  const dialogs = useDialogs();
  // MISIÓN SERVICIOS RECIBIDOS (2026-10-23), causa raíz del «Error al
  // registrar el pago»: los fetch de este modal NO llevaban Authorization
  // Bearer y el backend (getServerSession, SEC-024 fail-closed) SOLO
  // autentica por Bearer → 401 «No autorizado» en GET/POST/DELETE de la
  // pestaña Pagos → historial siempre vacío y error genérico al pagar.
  // Patrón canónico del archivo: authHeaders (crear/activar/anular) y
  // ProductionOrdersView.PaymentsTab (Bearer en el fetch de pagos).
  const authToken = useAuthStore((s) => s.token);
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
  const [activeTab, setActiveTab] = useState<'info' | 'payments'>('info');
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // CP-FIN-003 (anexo §2): componente unificado de pago — mismas opciones,
  // validaciones y semántica del carrito de Ventas (medio × moneda × importe
  // × tasa). Sustituye al formulario fijo (moneda CUP / tasa 1 / una fila).
  const { rates: storeRates } = useStoreRates();
  const [payRows, setPayRows] = useState<PaymentEditorRow[]>([newPaymentRow({})]);
  const [rowsValid, setRowsValid] = useState(false);
  // ─── ADN-009 (§8): identificador de idempotencia del pago ESTABLE ───
  // Nace al abrir el formulario de pago y se RENUEVA solo cuando el CONTENIDO
  // del lote cambia (misma operación → misma clave; lote distinto → nueva
  // clave con validación actualizada del saldo). Un reintento tras respuesta
  // perdida/incierta reutiliza la clave → el RPC devuelve el lote aplicado
  // (replay completo) y NUNCA crea componentes adicionales. Antes:
  // crypto.randomUUID() por envío → reintento duplicaba el lote financiero.
  const detailPayFingerprint = useMemo(
    () => JSON.stringify(payRows.map((r) => [r.method, r.currency, r.amount, r.exchange_rate, r.reference])),
    [payRows],
  );
  const payAttemptKeyRef = useRef<string>('');
  useEffect(() => {
    payAttemptKeyRef.current = crypto.randomUUID();
  }, [detailPayFingerprint, showForm]);
  // V2.12.32 (paridad con OT): fecha financiera del pago. Default HOY (día de
  // negocio Habana); tope HOY — nunca futura. Backdating legítimo visible y
  // validado (piso real: 6 meses, lo impone validate_operation_date en BD).
  const [paymentDate, setPaymentDate] = useState<string>(todayBusinessDay());
  const maxPaymentDate = todayBusinessDay();
  const paymentDateValidation = useOperationDateValidation(paymentDate, user?.activeStoreId, maxPaymentDate);
  // v2.18.0: vínculos documentales (recepciones y OT)
  const [receiptLinks, setReceiptLinks] = useState<any[]>([]);
  const [otLinks, setOtLinks] = useState<any[]>([]);

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      // FIX-AUD5-H1: store_id es OBLIGATORIO en GET /api/payments — sin él la
      // ruta responde 400 y la pestaña mostraba "Sin pagos" en silencio.
      // MISIÓN SERVICIOS RECIBIDOS: + Authorization Bearer (con withAuth
      // respondía 401 y el historial quedaba vacío en silencio).
      const storeId = user?.activeStoreId || '';
      const res = await fetch(`/api/payments?ref_type=service&ref_id=${service.id}&store_id=${storeId}`, {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      });
      if (res.ok) setPayments(await res.json());
    } catch { /* ignore */ } finally { setLoadingPayments(false); }
  }, [service.id, user?.activeStoreId, authToken]);

  // v2.18.0: cargar vínculos documentales del servicio
  const fetchLinks = useCallback(async () => {
    if (!user?.activeStoreId) return;
    try {
      const [rcpt, ots] = await Promise.all([
        supabase.from('service_reception_links')
          .select('id, receipt_id, allocation_percentage, allocated_amount, receipt:receipts(reference_doc, supplier, status, created_at)')
          .eq('service_id', service.id),
        supabase.from('service_production_order_links')
          .select('id, production_order_id, production_order:production_orders(order_number, customer_name, status, order_date, order_type)')
          .eq('service_id', service.id),
      ]);
      if (!rcpt.error) setReceiptLinks(rcpt.data || []);
      if (!ots.error) setOtLinks(ots.data || []);
    } catch { /* best-effort */ }
  }, [service.id, user?.activeStoreId]);

  useEffect(() => { fetchPayments(); fetchLinks(); }, [fetchPayments, fetchLinks]);

  // CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001: el total
  // pagado NETEA las contra-filas 'reversal' (mismo criterio del trigger
  // update_payment_status y de PaymentHistoryRow) — sin esto, tras revertir
  // un pago el modal sobreestimaba lo pagado y subestimaba el saldo.
  const totalPaid = payments.reduce(
    (s, p) => s + ((p as { direction?: string | null }).direction === 'reversal' ? -1 : 1) * Number(p.amount_cup || p.amount),
    0,
  );
  const balance = service.total_amount - totalPaid;
  const paymentStatus = balance <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

  const handleSubmit = async () => {
    // MISIÓN SERVICIOS RECIBIDOS + CP-FIN-003: el lote se valida ANTES de
    // enviar (importe > 0, tasa > 1 para divisa, sin exceder el saldo en CUP).
    if (!paymentDateValidation.valid) {
      toast.error(paymentDateValidation.error || 'Fecha del pago no válida');
      return;
    }
    const payloadRows = rowsToPayload(payRows);
    if (payloadRows.length === 0) {
      toast.error('Monto inválido');
      return;
    }
    if (!rowsAreValid(payRows)) {
      toast.error('Revisa los componentes: importes > 0 y tasa > 1 para moneda extranjera.');
      return;
    }
    if (rowsCupTotal(payRows) > balance + 0.005) {
      toast.error(`El pago (${rowsCupTotal(payRows).toFixed(2)} CUP) excede el saldo pendiente (${balance.toFixed(2)} CUP).`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ref_type: 'service',
          ref_id: service.id,
          // Pago mixto multi-moneda: cada componente viaja con SU forma de
          // pago, moneda, tasa e importe (anexo §3.2 — varios componentes).
          // ADN-009 (§8): clave estable del intento (reintento = replay).
          payments: payloadRows,
          payment_date: formatOperationDateForRPC(paymentDate),
          idempotency_key: payAttemptKeyRef.current || crypto.randomUUID(),
        }),
      });
      if (res.ok) {
        toast.success(`Pago registrado (${payloadRows.length} componente${payloadRows.length === 1 ? '' : 's'})`);
        setPayRows([newPaymentRow(storeRates)]);
        setShowForm(false);
        setPaymentDate(todayBusinessDay());
        fetchPayments();
        onUpdate();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || err.message || 'Error al registrar pago');
      }
    } catch { toast.error('Error de conexión'); }
    finally { setSubmitting(false); }
  };

  const statusBadge = {
    paid: { label: '💰 Pagado', color: 'bg-success/10 text-success border-success/30' },
    partial: { label: '⚖️ Parcial', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
    unpaid: { label: '⏳ Pendiente', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  }[paymentStatus];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest">{service.service_number}</h2>
              <p className="text-[10px] text-muted-foreground">{service.service_type_name} · {service.supplier || 'Sin proveedor'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar">
            <span className="text-lg">✕</span>
          </button>
        </div>

        <div className="flex border-b border-border/30">
          <button onClick={() => setActiveTab('info')} className={cn("flex-1 py-3 text-xs font-black uppercase border-b-2 -mb-px", activeTab === 'info' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>Info</button>
          <button onClick={() => setActiveTab('payments')} className={cn("flex-1 py-3 text-xs font-black uppercase border-b-2 -mb-px flex items-center justify-center gap-1", activeTab === 'payments' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
            Pagos {payments.length > 0 && <span className="bg-primary/10 px-1.5 rounded text-[9px]">{payments.length}</span>}
          </button>
        </div>

        {activeTab === 'info' && (
          <div className="p-4 space-y-2">
            {/* ADN-008 §3.4: el borrador no tiene efectos financieros — se informa
                de forma explícita y se ofrece continuar la edición. */}
            {service.status === 'draft' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2" data-testid="draft-banner">
                <p className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Borrador — sin efectos financieros</p>
                <p className="text-[11px] text-muted-foreground">Este servicio no genera obligación, gasto ni movimiento de caja hasta confirmarse.</p>
                {onEditDraft && (
                  <button
                    onClick={() => onEditDraft(service)}
                    className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:opacity-90 flex items-center justify-center gap-1.5 min-h-[44px]"
                    data-testid="draft-continue-button"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Continuar edición
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Fecha:</span> <span className="font-bold">{service.service_date}</span></div>
              <div><span className="text-muted-foreground">Moneda:</span> <span className="font-bold">{service.currency}</span></div>
              <div><span className="text-muted-foreground">Proveedor:</span> <span className="font-bold">{service.supplier || '—'}</span></div>
              <div><span className="text-muted-foreground">Ref:</span> <span className="font-bold">{service.reference_doc || '—'}</span></div>
              <div><span className="text-muted-foreground">Distribución:</span> <span className="font-bold">{service.distribution_method}</span></div>
              <div><span className="text-muted-foreground">Estado:</span> <span className="font-bold">{service.status === 'active' ? 'Activo' : service.status === 'draft' ? 'Borrador' : 'Anulado'}</span></div>
            </div>
            <div className="pt-2 border-t border-border/30">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Total:</span>
                <span className="text-lg font-mono font-black">{formatCurrency(service.total_amount)} {service.currency}</span>
              </div>
              {service.due_date && (
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-muted-foreground">Vence:</span>
                  <span className={cn("text-xs font-bold", new Date(service.due_date) < new Date() && paymentStatus !== 'paid' ? "text-destructive" : "")}>{service.due_date}</span>
                </div>
              )}
            </div>
            {service.observations && (
              <div className="pt-2 border-t border-border/30">
                <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Observaciones</p>
                <p className="text-xs">{service.observations}</p>
              </div>
            )}
            {/* v2.18.0: vinculaciones documentales */}
            {(otLinks.length > 0 || receiptLinks.length > 0) && (
              <div className="pt-2 border-t border-border/30 space-y-1.5">
                <p className="text-[10px] font-black uppercase text-muted-foreground">Vinculación operativa</p>
                {otLinks.map((l: any) => (
                  <div key={l.id} className="flex items-center gap-1.5 text-xs">
                    <Link2 className="w-3 h-3 text-primary shrink-0" />
                    <span className="font-bold font-mono">{l.production_order?.order_number || l.production_order_id}</span>
                    <span className="text-muted-foreground">· OT {l.production_order?.order_type === 'production' ? 'Producción' : 'Trabajo'} {l.production_order?.customer_name ? `· ${l.production_order.customer_name}` : ''}</span>
                  </div>
                ))}
                {receiptLinks.map((l: any) => (
                  <div key={l.id} className="flex items-center gap-1.5 text-xs">
                    <Link2 className="w-3 h-3 text-primary shrink-0" />
                    <span className="font-bold">{l.receipt?.reference_doc || l.receipt_id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">· Recepción {l.receipt?.supplier ? `· ${l.receipt.supplier}` : ''} · {Number(l.allocation_percentage).toFixed(1)}% ({formatCurrency(Number(l.allocated_amount))})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border/30 bg-muted/20 p-2 text-center">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Total</p>
                <p className="text-sm font-mono font-black">{formatCurrency(service.total_amount)}</p>
              </div>
              <div className="rounded-xl border border-success/20 bg-success/5 p-2 text-center">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Pagado</p>
                <p className="text-sm font-mono font-black text-success">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-2 text-center">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Saldo</p>
                <p className="text-sm font-mono font-black text-primary">{formatCurrency(balance)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase border", statusBadge.color)}>{statusBadge.label}</span>
              {/* ADN-008 §7.3: los pagos existen SOLO tras la confirmación —
                  un borrador no admite registros de pago (no hay obligación).
                  CP-AP-ACCOUNTING-INTEGRITY-001: tampoco un documento anulado o
                  cancelado (el RPC lo bloquea con ERR_SERVICE_NOT_ACTIVE; la UI
                  no debe ofrecer el botón — deuda detectada en la auditoría). */}
              {service.status === 'draft' ? (
                <span className="text-[10px] font-bold text-muted-foreground">Confirma el servicio para registrar pagos</span>
              ) : service.status !== 'active' ? (
                <span className="text-[10px] font-bold text-muted-foreground">Documento {service.status === 'voided' ? 'anulado' : 'cancelado'} — sin obligación pagable</span>
              ) : (
                <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:opacity-90 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Registrar Pago
                </button>
              )}
            </div>

            {showForm && (
              <div className="rounded-xl border border-border/30 p-3 space-y-2 bg-muted/10">
                {/* CP-FIN-003: mismo componente del carrito — medio × moneda ×
                    importe × tasa, varios componentes (pago mixto), original y
                    equivalente contable siempre visibles (anexo §9). */}
                <PaymentRowsEditor
                  rows={payRows}
                  onChange={setPayRows}
                  storeRates={storeRates}
                  maxCupTotal={balance}
                  onValidityChange={(v) => setRowsValid(v)}
                />
                {/* V2.12.32: fecha financiera del pago — never future, backdating legítimo */}
                <OperationDatePicker
                  label="Fecha del pago"
                  value={paymentDate}
                  onChange={setPaymentDate}
                  storeId={user?.activeStoreId}
                  max={maxPaymentDate}
                  inputId="payment-date-service"
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 h-10 rounded-lg border border-border/40 text-[10px] font-black uppercase hover:bg-muted">Cancelar</button>
                  <button onClick={handleSubmit} disabled={submitting || !paymentDateValidation.valid || !rowsValid} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase hover:opacity-90 disabled:opacity-50">{submitting ? '...' : 'Confirmar'}</button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <h4 className="text-[10px] font-black uppercase text-muted-foreground">Historial</h4>
              {loadingPayments ? <p className="text-xs text-center py-2 text-muted-foreground">Cargando...</p>
              : payments.length === 0 ? <p className="text-xs text-center py-4 text-muted-foreground">Sin pagos</p>
              : payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/30 p-2.5 bg-muted/10">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.payment_method === 'cash' ? '💵' : p.payment_method === 'transfer' ? '📱' : '💳'}</span>
                    <div>
                      <p className="text-xs font-bold tabular-nums">{formatCurrency(Number(p.amount_cup || p.amount))} {p.currency}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(p.payment_date).toLocaleString()} · {p.reference || 'Sin ref'}</p>
                    </div>
                  </div>
                  <button onClick={async () => {
                    // CP-OPS-ENERVIDA §5: REVERSIÓN contable (antes DELETE
                    // físico, prohibido por PT007). Fila contraria + asiento
                    // compensatorio; la obligación del servicio se restablece.
                    // CP-UX-FINAL-POLISH-003 §3.1: confirmación + motivo con diálogos propios
                    // (antes confirm()/prompt() nativos).
                    const ok = await dialogs.confirm({
                      title: 'Anular pago',
                      message: '¿Anular este pago? Se registrará un movimiento compensatorio y la obligación del servicio quedará restablecida por el importe revertido.',
                      variant: 'destructive',
                      confirmLabel: 'Anular pago',
                    });
                    if (!ok) return;
                    const reason = await dialogs.prompt({
                      title: 'Motivo de la anulación',
                      message: 'Documento contable de la reversión (opcional).',
                      label: 'Motivo',
                      placeholder: 'Motivo de la anulación (opcional)',
                      optional: true,
                      type: 'textarea',
                      confirmLabel: 'Anular pago',
                    });
                    if (reason === null) return;
                    const res = await fetch(`/api/payments/${p.id}`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                      },
                      body: JSON.stringify({ reason: reason.trim() || null }),
                    });
                    const body = await res.json().catch(() => ({}));
                    if (res.ok) {
                      toast.success(body.message || 'Pago anulado (reversión registrada)');
                      fetchPayments(); onUpdate();
                    } else {
                      toast.error(body.error || 'Error al anular pago');
                    }
                  }} className="p-1.5 rounded text-destructive hover:bg-destructive/10" title="Anular (reversión contable)">
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal de Creación / Edición de Servicio Recibido ──
// ADN-008 (2026-11-20): misma pantalla para crear y para CONTINUAR un borrador.
// Tres salidas diferenciadas (misión §6.1):
//   · Guardar borrador        → sin confirmar; CERO efectos financieros.
//   · Confirmar pendiente     → activa el servicio y registra la obligación.
//   · Confirmar con liquidación → activa y registra los pagos del desglose.
// §4: el proveedor usa el MISMO selector de Recepciones (Clasificador Maestro
// + suppliers de la tienda + alta al vuelo) y se guarda su IDENTIDAD real.
// Complemento §2: «Tipo de servicio» = combobox con búsqueda (compacto).
// Complemento §1: «Vinculación operativa» = acordeón contraído por defecto.
interface CreateServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** ADN-009 (§7): devuelve true cuando la operación TERMINÓ con éxito — el
   *  modal espera la promesa (bloqueo visual real) y renueva la creation_key
   *  solo tras el éxito (un fallo/reintento conserva la misma clave). */
  onCreate: (data: any) => void | Promise<boolean>;
  /** ADN-008 §3.3: guardar cambios / confirmar un borrador existente. */
  onSaveEdit?: (serviceId: string, data: any, mode: 'draft' | 'confirm') => void | Promise<boolean>;
  /** ADN-008 §3.3: borrador en edición (null/ausente = modo creación). */
  editService?: ReceivedService | null;
  /** MISIÓN 2026-10-15: tipos activos del catálogo oficial (tabla service_types). */
  activeTypes: ServiceType[];
  typesLoading: boolean;
  /** Abre el modal de gestión de tipos sin cerrar la operación en curso. */
  onOpenManager: () => void;
  /** Id del tipo recién creado en la gestión → preselección inmediata. */
  preselectTypeId: string | null;
}

// ── Complemento §2: combobox de TIPO DE SERVICIO con búsqueda ──
// Una sola línea cerrado; teclado completo (↑ ↓ Enter Esc); móvil (targets
// 44px, sin desbordes). Mantiene TODAS las opciones del catálogo y sus ids
// sin alterarlos; la búsqueda filtra por nombre.
function ServiceTypeCombobox({
  types, value, onChange, disabled,
}: {
  types: ServiceType[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = types.find(t => t.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return types;
    return types.filter(t => t.name.toLowerCase().includes(q));
  }, [types, query]);

  // Cerrar al clic fuera (mismo patrón que SupplierSelector).
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const commit = (tp: ServiceType) => {
    onChange(tp.id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowDown') { setActiveIdx(i => Math.min(i + 1, Math.max(filtered.length - 1, 0))); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setActiveIdx(i => Math.max(i - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter') { if (filtered[activeIdx]) commit(filtered[activeIdx]); e.preventDefault(); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); e.preventDefault(); }
  };

  return (
    <div ref={containerRef} className="relative" data-testid="service-type-combobox">
      <div className="relative">
        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="service-type-listbox"
          aria-autocomplete="list"
          aria-label="Tipo de servicio"
          disabled={disabled}
          value={open ? query : (selected?.name || '')}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar tipo de servicio..."
          className="w-full h-11 pl-9 pr-8 rounded-xl border border-border bg-background text-sm font-bold min-h-[44px]"
        />
        <ChevronDown className={cn("absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform pointer-events-none", open && "rotate-180")} aria-hidden="true" />
      </div>
      {open && (
        <div id="service-type-listbox" role="listbox" aria-label="Opciones de tipo de servicio" className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-64 flex flex-col">
          {filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground text-center">Sin tipos que coincidan con «{query}»</p>
          ) : (
            <div className="overflow-y-auto">
              {filtered.map((tp, idx) => {
                const Icon = SERVICE_ICONS[tp.name] || SERVICE_ICONS.default;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={tp.id}
                    type="button"
                    role="option"
                    aria-selected={tp.id === value}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => commit(tp)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 flex items-center gap-2 min-h-[44px] transition-colors",
                      isActive ? "bg-primary/10" : "hover:bg-primary/5",
                      tp.id === value && "text-primary font-black",
                    )}
                  >
                    <Icon className="w-4 h-4 text-primary/60 shrink-0" aria-hidden="true" />
                    <span className="text-xs font-bold truncate flex-1">{tp.name}</span>
                    {tp.id === value && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Exportado para pruebas (misma pantalla en modo creación y edición).
export function CreateServiceModal({ isOpen, onClose, onCreate, onSaveEdit, editService, activeTypes, typesLoading, onOpenManager, preselectTypeId }: CreateServiceModalProps) {
  const { user } = useAuthStore();
  // CP-UX-FINAL-POLISH-003 §3.1: sistema unificado de diálogos (sin confirm() nativo).
  const dialogs = useDialogs();
  const isEdit = !!editService;
  // Selección por IDENTIDAD (id del catálogo), no por texto: renombrar un tipo
  // no rompe lo que el usuario tiene en la mano al crear el servicio.
  const [typeId, setTypeId] = useState('');
  const [supplier, setSupplier] = useState('');
  // ADN-008 §4: identidad del proveedor (SupplierSelection del selector de
  // Recepciones — id local de la tienda y/o tercero del Clasificador Maestro).
  const [supplierSelection, setSupplierSelection] = useState<SupplierSelection | null>(null);
  const [amount, setAmount] = useState('');
  const [referenceDoc, setReferenceDoc] = useState('');
  const [method, setMethod] = useState<'amount' | 'quantity' | 'manual'>('amount');
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // ─── ADN-009 (§7): IDEMPOTENCIA DE CREACIÓN ESTABLE POR OPERACIÓN ───
  // La creation_key nace al abrir el modal (operación nueva) y se RENUEVA
  // solo tras un guardado EXITOSO; ante fallo, timeout o respuesta incierta
  // el reintento REUTILIZA la misma clave → la BD devuelve el mismo borrador
  // (anti doble-clic / anti duplicado). Antes: clave nueva por intento.
  const [creationKey, setCreationKey] = useState<string>(() => crypto.randomUUID());
  useEffect(() => {
    if (isOpen && !isEdit) setCreationKey(crypto.randomUUID());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEdit]);
  // CP-FIN-003 (anexo §3.1): sección «Información del pago» en la creación.
  // Por defecto el servicio se registra PENDIENTE (sin egreso ficticio); el
  // operador puede liquidar al confirmar con el MISMO componente del carrito
  // (default Efectivo + CUP — valor por defecto de ENERVIDA-VITALLCONS).
  const { rates: storeRates } = useStoreRates();
  const [payNow, setPayNow] = useState(false);
  const [payRows, setPayRows] = useState<PaymentEditorRow[]>([newPaymentRow({})]);
  // ─── ADN-009 (§8): IDENTIFICADOR DE IDEMPOTENCIA DEL PAGO ESTABLE ───
  // Estable durante un mismo intento de liquidación (incl. reintentos tras
  // respuesta perdida/incierta); se regenera cuando el CONTENIDO del lote
  // cambia (misma operación → misma clave; lote distinto → nueva clave con
  // validación actualizada del saldo). Antes: crypto.randomUUID() por envío.
  // CP-LOG-UNIFICATION-001 (§3.2): helper extraída al componente COMPARTIDO
  // (payRowsFingerprint) — misma implementación que Recepciones, sin copia.
  const payRowsFp = useMemo(() => payRowsFingerprint(payRows), [payRows]);
  const payAttemptKeyRef = useRef<string>('');
  useEffect(() => {
    payAttemptKeyRef.current = crypto.randomUUID();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payRowsFp, payNow, isOpen]);
  // MISIÓN POLÍTICA TEMPORAL: fecha del servicio. Default HOY (día de negocio
  // America/Havana) o la preferencia de trabajo del usuario para servicios
  // si es válida (MISIÓN FECHAS DE TRABAJO). Tope = HOY (nunca futura);
  // mínimo per-store forward-only.
  const [serviceDate, setServiceDate] = useState<string>(todayBusinessDay());
  const [serviceDateTouched, setServiceDateTouched] = useState(false);
  useApplyWorkDateDefault('received_service', !serviceDateTouched && serviceDate === todayBusinessDay(), setServiceDate, user?.activeStoreId);
  const maxServiceDate = todayBusinessDay();
  const serviceDateValidation = useOperationDateValidation(serviceDate, user?.activeStoreId, maxServiceDate);
  // MISIÓN SRV-PAYMENT-DATE (FASE 1, causa raíz): fecha financiera del pago
  // cuando el operador liquida al confirmar. ANTES el flujo crear/confirmar
  // NO llevaba fecha (el RPC estampaba NOW()) o forzaba HOY — el pago quedaba
  // fechado en el día del REGISTRO y no en el día real del dinero. Mismo
  // contrato V2.12.32 del modal de pago del detalle: default HOY (día de
  // negocio Habana), tope HOY — nunca futura; backdating legítimo validado.
  const [paymentDate, setPaymentDate] = useState<string>(todayBusinessDay());
  const maxPaymentDate = todayBusinessDay();
  const paymentDateValidation = useOperationDateValidation(paymentDate, user?.activeStoreId, maxPaymentDate);

  // ── Vinculación operativa (complemento §1: acordeón CONTRAÍDO por defecto) ──
  const [linksOpen, setLinksOpen] = useState(false);
  const [otSearch, setOtSearch] = useState('');
  const [otResults, setOtResults] = useState<any[]>([]);
  const [otSelected, setOtSelected] = useState<any[]>([]);
  const [otSearching, setOtSearching] = useState(false);
  const [showOtList, setShowOtList] = useState(false);

  const [rcptSearch, setRcptSearch] = useState('');
  const [rcptResults, setRcptResults] = useState<any[]>([]);
  const [rcptSelected, setRcptSelected] = useState<any[]>([]);
  const [rcptSearching, setRcptSearching] = useState(false);
  const [showRcptList, setShowRcptList] = useState(false);

  const storeId = user?.activeStoreId;

  // Búsqueda de OT (producción/trabajo) de la tienda activa, no anuladas ni cerradas
  const searchOTs = useCallback(async (q: string) => {
    if (!storeId) return;
    setOtSearching(true);
    try {
      let query = supabase
        .from('production_orders')
        .select('id, order_number, order_type, status, customer_name, order_date, budget_total, budget_currency')
        .eq('store_id', storeId)
        .not('status', 'in', '("voided","closed")')
        .order('created_at', { ascending: false })
        .limit(20);
      if (q) query = query.or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,description.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      setOtResults(data || []);
    } catch (e: any) {
      console.error('Error buscando OT:', e.message);
      setOtResults([]);
    } finally {
      setOtSearching(false);
    }
  }, [storeId]);

  // Búsqueda de recepciones activas de la tienda activa
  const searchReceipts = useCallback(async (q: string) => {
    if (!storeId) return;
    setRcptSearching(true);
    try {
      let query = supabase
        .from('receipts')
        .select('id, reference_doc, supplier, total_cost, status, created_at')
        .eq('store_id', storeId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20);
      if (q) query = query.or(`reference_doc.ilike.%${q}%,supplier.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      setRcptResults(data || []);
    } catch (e: any) {
      console.error('Error buscando recepciones:', e.message);
      setRcptResults([]);
    } finally {
      setRcptSearching(false);
    }
  }, [storeId]);

  // ADN-008 §3.3 (complemento §1.3): recuperar los vínculos guardados del
  // borrador para rehidratar el acordeón. El panel NO se abre solo — el
  // badge «Configurado» comunica el estado (complemento §1).
  const loadDraftLinks = useCallback(async (serviceId: string) => {
    try {
      const [rcpt, ots] = await Promise.all([
        supabase.from('service_reception_links').select('receipt_id').eq('service_id', serviceId),
        supabase.from('service_production_order_links').select('production_order_id').eq('service_id', serviceId),
      ]);
      const receiptIds = (rcpt.data || []).map((r: any) => r.receipt_id);
      const otIds = (ots.data || []).map((o: any) => o.production_order_id);
      if (receiptIds.length > 0) {
        const { data } = await supabase.from('receipts').select('id, reference_doc, supplier, total_cost, status, created_at').in('id', receiptIds);
        setRcptSelected(data || []);
      } else setRcptSelected([]);
      if (otIds.length > 0) {
        const { data } = await supabase.from('production_orders').select('id, order_number, order_type, status, customer_name, order_date, budget_total, budget_currency').in('id', otIds);
        setOtSelected(data || []);
      } else setOtSelected([]);
    } catch { /* best-effort: el borrador sigue editable sin vínculos */ }
  }, []);

  // Abrir la sección → primera carga (creación) o prefill del borrador (edición)
  useEffect(() => {
    if (!isOpen) return;
    if (editService) {
      setTypeId(editService.service_type_id || '');
      setSupplier(editService.supplier || '');
      setSupplierSelection(
        editService.supplier_id || editService.supplier_master_party_id
          ? {
              supplierId: editService.supplier_id || null,
              masterPartyId: editService.supplier_master_party_id || null,
              code: editService.supplier_code || null,
              tax_id: editService.supplier_tax_id || null,
              phone: editService.supplier_phone || null,
              address: editService.supplier_address || null,
              source: editService.supplier_master_party_id ? 'master' : 'local',
            }
          : null,
      );
      setAmount(editService.total_amount !== undefined && editService.total_amount !== null ? String(editService.total_amount) : '');
      setReferenceDoc(editService.reference_doc || '');
      setMethod((editService.distribution_method as 'amount' | 'quantity' | 'manual') || 'amount');
      setObservations(editService.observations || '');
      setServiceDate(editService.service_date || todayBusinessDay());
      setServiceDateTouched(true); // no sobreescribir la fecha guardada
      setPayNow(false);
      setPayRows([newPaymentRow({})]);
      setOtSearch(''); setRcptSearch('');
      setLinksOpen(false); // contraído por defecto; badge «Configurado» si aplica
      loadDraftLinks(editService.id);
    } else {
      setSupplier(''); setSupplierSelection(null); setAmount(''); setReferenceDoc(''); setObservations('');
      setServiceDate(todayBusinessDay()); setServiceDateTouched(false);
      setPayNow(false); setPayRows([newPaymentRow({})]);
      setOtSelected([]); setRcptSelected([]); setOtSearch(''); setRcptSearch('');
      setLinksOpen(false);
    }
  }, [isOpen, editService]);

  // MISIÓN 2026-10-15: sincronizar la selección de tipo con el catálogo.
  // 1) Al abrir (creación): si no hay selección válida, toma el primer tipo activo.
  // 2) Si la gestión acaba de crear un tipo (preselectTypeId), se selecciona
  //    inmediatamente — sin cerrar la operación ni volver a empezar.
  // 3) En edición: el tipo llega del borrador (prefill); solo respeta preselección.
  useEffect(() => {
    if (!isOpen) return;
    if (preselectTypeId && activeTypes.some(t => t.id === preselectTypeId)) {
      setTypeId(preselectTypeId);
      return;
    }
    if (editService) return; // prefill ya colocó el tipo del borrador
    if (!typeId || !activeTypes.some(t => t.id === typeId)) {
      setTypeId(activeTypes[0]?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, preselectTypeId, activeTypes]);

  // Búsqueda con debounce
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => searchOTs(otSearch), 350);
    return () => clearTimeout(t);
  }, [otSearch, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => searchReceipts(rcptSearch), 350);
    return () => clearTimeout(t);
  }, [rcptSearch, isOpen]);

  const toggleOT = (ot: any) => {
    setOtSelected(prev => prev.some(x => x.id === ot.id) ? prev.filter(x => x.id !== ot.id) : [...prev, ot]);
  };
  const toggleRcpt = (rc: any) => {
    setRcptSelected(prev => prev.some(x => x.id === rc.id) ? prev.filter(x => x.id !== rc.id) : [...prev, rc]);
  };

  const OT_STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador', approved: 'Aprobada', in_progress: 'En curso',
    paused: 'Pausada', completed: 'Completada',
  };

  /** ADN-008: construye el payload; valida lo mínimo según el modo. */
  const buildPayload = (saveAsDraft: boolean) => {
    const selectedType = activeTypes.find(t => t.id === typeId);
    if (!selectedType) {
      toast.error('Selecciona un tipo de servicio del catálogo');
      return null;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('El importe debe ser mayor a 0');
      return null;
    }
    // MISIÓN POLÍTICA TEMPORAL: la fecha del servicio debe ser válida antes
    // de enviar (min per-store inclusivo por día + tope HOY Habana).
    if (!serviceDateValidation.valid) {
      toast.error(serviceDateValidation.error || 'La fecha del servicio no es válida.', { duration: 8000 });
      return null;
    }
    const supplierMeta = supplierSelection ? {
      code: supplierSelection.code ?? null,
      tax_id: supplierSelection.tax_id ?? null,
      phone: supplierSelection.phone ?? null,
      address: supplierSelection.address ?? null,
    } : null;

    const payload: any = {
      // MISIÓN 2026-10-15: identidad (service_type_id) + snapshot del nombre.
      service_type_id: selectedType.id,
      service_type_name: selectedType.name,
      // ADN-008 §4.3: identidad REAL del proveedor (no solo el nombre).
      supplier: supplier || null,
      supplier_id: supplierSelection?.supplierId ?? null,
      supplier_master_party_id: supplierSelection?.masterPartyId ?? null,
      supplier_meta: supplierMeta,
      total_amount: parseFloat(amount),
      reference_doc: referenceDoc || null,
      distribution_method: method,
      observations: observations || null,
      // MISIÓN POLÍTICA TEMPORAL: fecha operativa del documento. HOY → null
      // (convención canónica: la ruta estampa el día de negocio Habana y el
      // RPC aplica COALESCE); fecha distinta → 'YYYY-MM-DD' (columna DATE).
      service_date: serviceDate === maxServiceDate ? null : serviceDate,
      // v2.18.0 — Vinculación operativa (opcional, ambas pueden coexistir)
      receipt_ids: rcptSelected.map(r => r.id),
      production_order_ids: otSelected.map(o => o.id),
    };

    if (saveAsDraft) {
      // Borrador: CERO efectos financieros. Sin filas de pago; el desglose
      // se configura al confirmar. Idempotencia anti doble-clic: la clave es
      // ESTABLE por operación (§7) — el reintento devuelve el mismo borrador.
      payload.save_as_draft = true;
      payload.creation_key = creationKey;
      payload.paymentRows = [];
    } else {
      // CP-FIN-003 (anexo §3.2): liquidación al confirmar (si el operador la
      // registra aquí). Pendiente → sin filas → la obligación queda pendiente
      // y NO se genera ningún egreso ficticio.
      const totalNum = parseFloat(amount) || 0;
      if (payNow) {
        if (!rowsAreValid(payRows)) {
          toast.error('Revisa el pago: importes > 0 y tasa > 1 para moneda extranjera.');
          return null;
        }
        if (rowsCupTotal(payRows) > totalNum + 0.005) {
          toast.error(`El pago (${rowsCupTotal(payRows).toFixed(2)} CUP) excede el importe del servicio (${totalNum.toFixed(2)} CUP).`);
          return null;
        }
        // MISIÓN SRV-PAYMENT-DATE (FASE 1): la fecha del pago es obligatoria y
        // válida antes de enviar (never future, tope HOY Habana).
        if (!paymentDateValidation.valid) {
          toast.error(paymentDateValidation.error || 'Fecha del pago no válida');
          return null;
        }
        payload.payment_date = formatOperationDateForRPC(paymentDate);
        // ADN-009 (§8): clave estable del intento de liquidación.
        payload.payment_idempotency_key = payAttemptKeyRef.current || crypto.randomUUID();
      }
      // CP-OPS-ENERVIDA §4: la CONFIRMACIÓN también viaja con creation_key —
      // un reintento (respuesta perdida, error de red tras crear) devuelve el
      // MISMO servicio en lugar de crear un borrador duplicado.
      payload.creation_key = creationKey;
      payload.paymentRows = payNow ? payRows : [];
    }
    return payload;
  };

  /** Guardar BORRADOR (creación o edición) — sin confirmar, sin efectos.
   *  ADN-009 (§7): asíncrono — ESPERA la promesa del handler antes de liberar
   *  el bloqueo visual (el finally ya no suelta submitting inmediatamente);
   *  tras un guardado EXITOSO renueva la creation_key (operación nueva); ante
   *  fallo la CONSERVA para que el reintento devuelva el mismo borrador. */
  const handleSaveDraft = async () => {
    if (submitting) return;
    const payload = buildPayload(true);
    if (!payload) return;
    const message = isEdit
      ? '¿Guardar los cambios del BORRADOR? Sin confirmar el servicio y sin efectos financieros.'
      : '¿Guardar como BORRADOR? No se confirmará el servicio ni se generarán efectos financieros (obligación, gasto o pagos).';
    // CP-UX-FINAL-POLISH-003 §3.1: confirmación propia (antes confirm() nativo).
    const okConfirm = await dialogs.confirm({
      title: isEdit ? 'Guardar cambios' : 'Guardar borrador',
      message,
      variant: 'default',
      confirmLabel: isEdit ? 'Guardar cambios' : 'Guardar borrador',
    });
    if (!okConfirm) return;
    setSubmitting(true);
    try {
      if (isEdit && editService && onSaveEdit) {
        await onSaveEdit(editService.id, payload, 'draft');
      } else {
        const ok = await onCreate(payload);
        // ADN-009 (§7): éxito → operación nueva (clave nueva); fallo/reintento
        // → MISMA clave (la BD devuelve el mismo borrador, nunca duplicados).
        if (ok !== false) setCreationKey(crypto.randomUUID());
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // doble envío bloqueado (submitting se mantiene
    // HASTA que la operación asíncrona completa termina — ADN-009 §7).
    // La CONFIRMACIÓN exige proveedor (misión §4.2/§7): el borrador pudo
    // guardarse sin él, pero el servicio operativo no puede quedar sin tercero.
    if (!supplier || !supplier.trim()) {
      toast.error('El proveedor es obligatorio para confirmar el servicio');
      return;
    }
    const payload = buildPayload(false);
    if (!payload) return;
    const nComp = (payload.paymentRows || []).length;
    const message = nComp > 0
      ? `¿CONFIRMAR el servicio y LIQUIDAR al confirmar (${nComp} componente${nComp === 1 ? '' : 's'} de pago)? Se registrará la obligación y sus pagos.`
      : '¿CONFIRMAR el servicio? Quedará pendiente de pago: se registra la obligación y NO se genera ningún egreso de caja o banco.';
    // CP-UX-FINAL-POLISH-003 §3.1: confirmación propia (antes confirm() nativo).
    // La operación se procesa DESPUÉS de aceptar; el éxito/fracaso real se
    // comunica con toasts tras la respuesta del servidor (nunca antes).
    const okConfirm = await dialogs.confirm({
      title: 'Confirmar servicio',
      message,
      variant: 'default',
      confirmLabel: nComp > 0 ? 'Confirmar y liquidar' : 'Confirmar servicio',
    });
    if (!okConfirm) return;
    setSubmitting(true);
    let confirmOk = false;
    try {
      if (isEdit && editService && onSaveEdit) {
        // ADN-008 §3.3 + MISIÓN SRV-PAYMENT-DATE (FASE 1): la fecha financiera
        // del pago al confirmar el borrador es la ELEGIDA por el operador en
        // el modal (selector «Fecha del pago») — antes se forzaba HOY y un
        // pago ejecutado en un día anterior quedaba mal fechado.
        confirmOk = (await onSaveEdit(editService.id, { ...payload, payment_date: payNow ? formatOperationDateForRPC(paymentDate) : undefined }, 'confirm')) !== false;
      } else {
        confirmOk = (await onCreate(payload)) !== false;
      }
    } finally {
      setSubmitting(false);
    }
    // Reset SOLO tras éxito (solo modo creación: la edición se cierra desde el
    // padre). Con fallo el formulario conserva los datos para el reintento.
    if (!isEdit && confirmOk) {
      setSupplier(''); setSupplierSelection(null); setAmount(''); setReferenceDoc(''); setObservations('');
      setServiceDate(todayBusinessDay());
      setPayNow(false); setPayRows([newPaymentRow(storeRates)]);
      setPaymentDate(todayBusinessDay());
      setOtSelected([]); setRcptSelected([]); setOtSearch(''); setRcptSearch('');
      setLinksOpen(false);
      // CP-OPS-ENERVIDA §4: la confirmación exitosa consume su creation_key —
      // la siguiente operación del modal es una operación NUEVA (clave nueva).
      setCreationKey(crypto.randomUUID());
    }
  };

  const linksConfigured = otSelected.length > 0 || rcptSelected.length > 0;

  return (
    <BaseModal open={isOpen} onOpenChange={(o) => !o && onClose()} title={<span className="flex items-center gap-2">{isEdit ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />} {isEdit ? `Continuar Borrador ${editService?.service_number || ''}` : 'Nuevo Servicio Recibido'}</span>} maxWidth="sm:max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ─── Complemento §2: Tipo de servicio = combobox con búsqueda ─── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Tipo de servicio <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <button
              type="button"
              onClick={onOpenManager}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/10 hover:border-primary/50 transition-all min-h-[36px]"
              aria-label="Gestionar tipos de servicio"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Gestionar tipos
            </button>
          </div>
          {typesLoading ? (
            <p className="text-xs text-muted-foreground py-2 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando tipos de servicio…
            </p>
          ) : activeTypes.length === 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                No hay tipos de servicio activos en el catálogo.
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Usa «Gestionar tipos» para agregar uno o contacta a un administrador.
              </p>
            </div>
          ) : (
            <ServiceTypeCombobox types={activeTypes} value={typeId} onChange={setTypeId} />
          )}
        </div>

        {/* ─── ADN-008 §4: Proveedor = MISMO selector de Recepciones ─── */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">
            Proveedor <span aria-hidden="true" className="text-destructive">*</span>
            <span className="ml-2 text-[10px] font-bold normal-case tracking-normal text-muted-foreground">
              obligatorio para confirmar — opcional en el borrador
            </span>
          </label>
          <div data-testid="supplier-selector">
            <SupplierSelector
              value={supplier}
              onChange={(name, detail) => { setSupplier(name); setSupplierSelection(detail ?? null); }}
            />
          </div>
        </div>

        {/* Importe */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="received-service-amount" className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Importe total</label>
            <input id="received-service-amount" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold min-h-[44px]" placeholder="0.00" required />
          </div>
          <div>
            <label htmlFor="received-service-ref" className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Documento ref.</label>
            <input id="received-service-ref" type="text" value={referenceDoc} onChange={e => setReferenceDoc(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium min-h-[44px]" placeholder="Factura N°" />
          </div>
        </div>

        {/* MISIÓN POLÍTICA TEMPORAL: fecha del servicio (operativa, seleccionable).
            Min per-store (forward-only inclusivo por día) · max HOY Habana.
            Antes el documento se fechaba solo con CURRENT_DATE del servidor
            (UTC) — tras las 20:00 Habana quedaba fechado al día siguiente. */}
        <OperationDatePicker
          value={serviceDate}
          onChange={(d) => { setServiceDateTouched(true); setServiceDate(d); }}
          label="Fecha del servicio"
          storeId={user?.activeStoreId}
          max={maxServiceDate}
          inputId="received-service-date"
        />

        {/* ─── ADN-008 §5/§6: Información del pago con los DOS modos claros ─── */}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-3" data-testid="service-payment-section">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-foreground">Información del pago</span>
            <label className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={payNow}
                onChange={(e) => {
                  setPayNow(e.target.checked);
                  if (e.target.checked) {
                    // Default del operador (§5.1): Efectivo + CUP por el importe
                    // total del servicio — editable libremente en el editor.
                    const total = parseFloat(amount) || 0;
                    setPayRows([newPaymentRow(storeRates, { amount: total })]);
                  }
                }}
                className="w-4 h-4 accent-primary"
                data-testid="pay-now-toggle"
              />
              Liquidar al confirmar
            </label>
          </div>
          {!payNow ? (
            /* ─── Modo B: Dejar pendiente de pago ─── */
            <p className="text-[11px] text-muted-foreground leading-relaxed" data-testid="payment-mode-pending-text">
              <span className="font-black uppercase tracking-wide text-foreground">Dejar pendiente de pago.</span>{' '}
              El servicio se confirmará y se registrará la obligación correspondiente. No se generará ningún egreso de caja o banco.
              Podrás liquidarlo posteriormente desde el detalle, utilizando uno o varios pagos, diferentes monedas y formas de pago.
            </p>
          ) : (
            /* ─── Modo A: Liquidar al confirmar (editor multipago del sistema) ─── */
            <div className="space-y-2" data-testid="payment-mode-paynow-text">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-black uppercase tracking-wide text-foreground">Liquidar al confirmar.</span>{' '}
                El servicio se registrará como pagado al confirmar. Puedes utilizar efectivo, transferencia u otros medios disponibles,
                combinar monedas y distribuir el importe en varios pagos. Por defecto se utiliza Efectivo en CUP.
              </p>
              <PaymentRowsEditor
                rows={payRows}
                onChange={setPayRows}
                storeRates={storeRates}
                maxCupTotal={parseFloat(amount) || undefined}
              />
              {/* MISIÓN SRV-PAYMENT-DATE (FASE 1, causa raíz): fecha financiera
                  del pago con el MISMO componente y contrato V2.12.32 del modal
                  de pago del detalle — never future, backdating legítimo. */}
              <OperationDatePicker
                label="Fecha del pago"
                value={paymentDate}
                onChange={setPaymentDate}
                storeId={user?.activeStoreId}
                max={maxPaymentDate}
                inputId="payment-date-service-create"
              />
              {(() => {
                const totalNum = parseFloat(amount) || 0;
                const covered = rowsCupTotal(payRows);
                const pending = Math.max(0, totalNum - covered);
                return (
                  <p className="text-[10px] font-bold text-muted-foreground text-right" data-testid="payment-coverage-hint">
                    {pending > 0.005
                      ? `Saldo pendiente tras la liquidación: ${formatCurrency(pending)} CUP (el servicio quedará Parcial)`
                      : 'Liquidación completa del servicio'}
                  </p>
                );
              })()}
            </div>
          )}
        </div>

        {/* ─── Complemento §1: Vinculación operativa — acordeón contraído ─── */}
        <Collapsible open={linksOpen} onOpenChange={setLinksOpen} data-testid="operational-links-collapsible">
          <div className="rounded-xl border border-primary/25 bg-primary/[0.03]">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left min-h-[44px] hover:bg-primary/5 transition-colors rounded-xl"
                aria-expanded={linksOpen}
                data-testid="operational-links-trigger"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Link2 className="w-4 h-4 text-primary shrink-0" />
                  <span className="min-w-0">
                    <span className="text-xs font-black uppercase tracking-widest text-foreground block">Vinculación operativa <span className="text-[10px] font-bold text-muted-foreground normal-case tracking-normal">(opcional)</span></span>
                    <span className="text-[10px] text-muted-foreground block normal-case tracking-normal">Configurar OT, recepción y distribución de costos</span>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {linksConfigured && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-black uppercase" data-testid="links-configured-badge">Configurado</span>
                  )}
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", linksOpen && "rotate-180")} aria-hidden="true" />
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-3 space-y-3">
                {/* Orden de Trabajo */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block">Orden de Trabajo / Producción (OT)</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={otSearch}
                      onChange={e => { setOtSearch(e.target.value); setShowOtList(true); }}
                      onFocus={() => setShowOtList(true)}
                      placeholder="Buscar por número, cliente o descripción..."
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm min-h-[44px]"
                    />
                  </div>
                  {showOtList && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border/50 bg-background">
                      {otSearching ? (
                        <p className="text-xs text-muted-foreground text-center py-3">Buscando...</p>
                      ) : otResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">Sin órdenes disponibles</p>
                      ) : otResults.map(ot => {
                        const selected = otSelected.some(x => x.id === ot.id);
                        return (
                          <button
                            type="button"
                            key={ot.id}
                            onClick={() => toggleOT(ot)}
                            className={cn("w-full text-left px-3 py-2 hover:bg-primary/5 transition-colors flex items-center justify-between gap-2 min-h-[44px]", selected && "bg-primary/10")}
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold font-mono truncate">{ot.order_number} <span className="text-muted-foreground font-sans font-medium">· {ot.customer_name || 'Sin cliente'}</span></p>
                              <p className="text-[10px] text-muted-foreground">{ot.order_type === 'production' ? 'Producción' : 'Trabajo'} · {OT_STATUS_LABELS[ot.status] || ot.status} · {ot.order_date}</p>
                            </div>
                            {selected && <span className="text-[10px] font-black uppercase text-primary shrink-0">✓ Vinculada</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {otSelected.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {otSelected.map(ot => (
                        <span key={ot.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                          {ot.order_number}
                          <button type="button" onClick={() => toggleOT(ot)} className="hover:text-destructive" aria-label={`Quitar ${ot.order_number}`}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recepción de almacén */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block">Recepción de almacén</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={rcptSearch}
                      onChange={e => { setRcptSearch(e.target.value); setShowRcptList(true); }}
                      onFocus={() => setShowRcptList(true)}
                      placeholder="Buscar por factura o proveedor..."
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm min-h-[44px]"
                    />
                  </div>
                  {showRcptList && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border/50 bg-background">
                      {rcptSearching ? (
                        <p className="text-xs text-muted-foreground text-center py-3">Buscando...</p>
                      ) : rcptResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">Sin recepciones activas</p>
                      ) : rcptResults.map(rc => {
                        const selected = rcptSelected.some(x => x.id === rc.id);
                        return (
                          <button
                            type="button"
                            key={rc.id}
                            onClick={() => toggleRcpt(rc)}
                            className={cn("w-full text-left px-3 py-2 hover:bg-primary/5 transition-colors flex items-center justify-between gap-2 min-h-[44px]", selected && "bg-primary/10")}
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate">{rc.reference_doc || 'Sin factura'} <span className="text-muted-foreground font-medium">· {rc.supplier || 'Sin proveedor'}</span></p>
                              <p className="text-[10px] text-muted-foreground">Activa · {String(rc.created_at).slice(0, 10)}</p>
                            </div>
                            {selected && <span className="text-[10px] font-black uppercase text-primary shrink-0">✓ Vinculada</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {rcptSelected.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {rcptSelected.map(rc => (
                        <span key={rc.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                          {rc.reference_doc || rc.id.slice(0, 8)}
                          <button type="button" onClick={() => toggleRcpt(rc)} className="hover:text-destructive" aria-label="Quitar recepción">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Complemento §1.2: método de distribución — SOLO con recepción
                    vinculada (sin efecto operativo si no la hay). Tres
                    modalidades intactas; se aplica después con «Recalcular». */}
                {rcptSelected.length > 0 ? (
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Método de distribución</label>
                    <select value={method} onChange={e => setMethod(e.target.value as any)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold min-h-[44px]" data-testid="distribution-method-select">
                      <option value="amount">Por importe (proporcional al valor)</option>
                      <option value="quantity">Por cantidad (proporcional a unidades)</option>
                      <option value="manual">Manual (definir porcentajes)</option>
                    </select>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    Vincula una Recepción de almacén para configurar la distribución del costo (por importe, por cantidad o manual).
                  </p>
                )}

                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  La vinculación es <span className="font-bold">documental</span>: no genera movimientos de almacén ni contabilidad.
                  La distribución del costo sobre la recepción se ejecuta después con «Recalcular» y el pago se registra en la pestaña Pagos del servicio.
                </p>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Observaciones */}
        <div>
          <label htmlFor="received-service-observations" className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Observaciones</label>
          <textarea id="received-service-observations" value={observations} onChange={e => setObservations(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm min-h-[44px]" placeholder="Notas adicionales..." />
        </div>

        {/* ─── ADN-008 §6.1: las TRES salidas claramente diferenciadas ─── */}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs">Cancelar</Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={submitting}
            className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs gap-2 border-warning/50 text-warning hover:bg-warning/10 hover:border-warning disabled:opacity-50"
            data-testid="save-draft-button"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
            {isEdit ? 'Guardar cambios' : 'Guardar borrador'}
          </Button>
          <Button type="submit" disabled={submitting} className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs gap-2" data-testid="confirm-service-button">
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {isEdit ? 'Confirmar servicio' : (payNow ? 'Confirmar y liquidar' : 'Confirmar servicio')}
          </Button>
        </div>
      </form>
    </BaseModal>
  );
}
