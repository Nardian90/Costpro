'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { UnifiedTabs } from '@/components/views/terminal/views/cost_sheet/UnifiedTabs';
import {
  Users,
  Calculator,
  Settings,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  History,
  Edit3,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { BaseModal } from '@/components/ui/BaseModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/**
 * WorkersView — Gestión de Trabajadores y Comisiones.
 *
 * 4 tabs:
 *   1. Trabajadores — tabla principal con último pago + botón "Pagar comisión"
 *   2. Reglas de Comisión — CRUD de commission_rules
 *   3. Pagos — historial de commission_payments
 *   4. Historial — versiones de reglas (auditabilidad)
 *
 * Modal de pago en 4 pasos:
 *   Paso 1: Selección de rango (default: desde último pago)
 *   Paso 2: Cálculo automático (backend-driven)
 *   Paso 3: Edición manual obligatoria (con justificación)
 *   Paso 4: Confirmación + guardado
 */

interface WorkerSummary {
  worker_id: string;
  first_name: string;
  last_name: string;
  ci: string;
  status: string;
  sales_cash: number;
  sales_transfer: number;
  sales_total: number;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  active_rule_id: string | null;
  active_rule_type: string | null;
  active_rule_value: number | null;
}

interface Calculation {
  worker_id: string;
  worker_name: string;
  worker_ci: string;
  worker_status: string;
  sales: { cash: number; transfer: number; total: number; base_used: number };
  rule_applied: any;
  rule_applied_id: string | null;
  breakdown: { percentage_component: number; fixed_component: number; salary_component: number };
  commission_suggested: number;
  calculation_explanation: string;
  period: { from: string; to: string };
}

interface CommissionRule {
  id: string;
  store_id: string;
  worker_id: string | null;
  type: string;
  value_percent: number | null;
  fixed_value: number | null;
  salary_amount: number | null;
  base_calculation: string;
  priority: number;
  valid_from: string;
  valid_to: string | null;
}

const TABS = [
  { id: 'workers', label: 'Trabajadores', icon: Users },
  { id: 'rules', label: 'Reglas Comisión', icon: Settings },
  { id: 'payments', label: 'Pagos', icon: DollarSign },
  { id: 'history', label: 'Historial', icon: History },
];

const RULE_TYPE_LABELS: Record<string, string> = {
  percentage_sales: '% Ventas',
  fixed_amount: 'Monto Fijo',
  salary_based: 'Salario',
  hybrid: 'Híbrido',
};

const BASE_CALC_LABELS: Record<string, string> = {
  total_sales: 'Total',
  cash_sales: 'Cash',
  transfer_sales: 'Transfer',
  net_sales: 'Neto',
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function WorkersView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;

  const [activeTab, setActiveTab] = useState('workers');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workers
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  // Modal de pago
  const [payModalWorker, setPayModalWorker] = useState<WorkerSummary | null>(null);

  // FIX-REGRESSION: Modal de creación de trabajador (UI perdida, API existe)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creatingWorker, setCreatingWorker] = useState(false);
  const [workerForm, setWorkerForm] = useState({
    first_name: '',
    last_name: '',
    ci: '',
    gender: '',
    address: '',
    province: '',
    municipality: '',
  });

  const handleCreateWorker = async () => {
    if (!storeId) {
      toast.error('No hay tienda activa');
      return;
    }
    if (!workerForm.first_name.trim() || !workerForm.last_name.trim() || !workerForm.ci.trim()) {
      toast.error('Nombre, apellidos y CI son obligatorios');
      return;
    }
    setCreatingWorker(true);
    try {
      await apiFetch('/api/workers', {
        method: 'POST',
        body: JSON.stringify({
          store_id: storeId,
          first_name: workerForm.first_name.trim(),
          last_name: workerForm.last_name.trim(),
          ci: workerForm.ci.trim(),
          gender: workerForm.gender || undefined,
          address: workerForm.address || undefined,
          province: workerForm.province || undefined,
          municipality: workerForm.municipality || undefined,
        }),
      });
      toast.success(`Trabajador "${workerForm.first_name} ${workerForm.last_name}" creado`);
      setCreateModalOpen(false);
      setWorkerForm({ first_name: '', last_name: '', ci: '', gender: '', address: '', province: '', municipality: '' });
      fetchWorkers();
    } catch (e: any) {
      toast.error('Error al crear trabajador: ' + e.message);
    } finally {
      setCreatingWorker(false);
    }
  };

  // Rules
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);

  // Payments
  const [payments, setPayments] = useState<any[]>([]);

  const fetchWorkers = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(
        `/api/commissions/summary?store_id=${storeId}&date_from=${dateFrom}&date_to=${dateTo}`,
      );
      setWorkers(data.workers || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [storeId, dateFrom, dateTo]);

  const fetchRules = useCallback(async () => {
    if (!storeId) return;
    try {
      const data = await apiFetch(`/api/commissions/rules?store_id=${storeId}&history=true`);
      setRules(data.rules || []);
    } catch (e: any) {
      toast.error('Error cargando reglas: ' + e.message);
    }
  }, [storeId]);

  const fetchPayments = useCallback(async () => {
    if (!storeId) return;
    try {
      const data = await apiFetch(`/api/commissions/payments?store_id=${storeId}&limit=50`);
      setPayments(data.payments || []);
    } catch (e: any) {
      toast.error('Error cargando pagos: ' + e.message);
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId) {
      fetchWorkers();
    }
  }, [storeId, fetchWorkers]);

  useEffect(() => {
    if (activeTab === 'rules' && rules.length === 0) fetchRules();
    if (activeTab === 'payments' && payments.length === 0) fetchPayments();
  }, [activeTab, rules.length, payments.length, fetchRules, fetchPayments]);

  if (!storeId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="w-12 h-12 text-warning" />
        <p className="text-base font-black uppercase tracking-widest text-foreground">
          Selecciona una tienda
        </p>
        <p className="text-sm text-muted-foreground">
          El módulo de trabajadores y comisiones requiere una tienda activa.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-4" aria-busy={loading}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-success flex items-center justify-center shrink-0 shadow-lg">
            <Users className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-foreground">
              Trabajadores y Comisiones
            </h1>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              {workers.length} trabajadores · tienda activa
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* FIX-REGRESSION: Botón "Nuevo trabajador" — UI perdida en regresión, API existe */}
          <Button
            onClick={() => setCreateModalOpen(true)}
            disabled={!storeId || loading}
            className="h-11 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-black text-xs uppercase tracking-widest flex items-center gap-2"
            aria-label="Crear nuevo trabajador"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo trabajador</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
          <button
            onClick={fetchWorkers}
            disabled={loading}
            className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors border border-border"
            aria-label="Refrescar"
          >
            <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <UnifiedTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="underline"
        ariaLabel="Secciones de trabajadores y comisiones"
      />

      {/* Contenido */}
      <div className="pt-4">
        {activeTab === 'workers' && (
          <WorkersTab
            workers={workers}
            loading={loading}
            error={error}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onRefresh={fetchWorkers}
            onPayCommission={(w: any) => setPayModalWorker(w)}
          />
        )}
        {activeTab === 'rules' && (
          <RulesTab
            rules={rules}
            onRefresh={fetchRules}
            onEdit={(r: any) => { setEditingRule(r); setShowRuleModal(true); }}
            onNew={() => { setEditingRule(null); setShowRuleModal(true); }}
          />
        )}
        {activeTab === 'payments' && (
          <PaymentsTab payments={payments} onRefresh={fetchPayments} />
        )}
        {activeTab === 'history' && (
          <HistoryTab rules={rules} onRefresh={fetchRules} />
        )}
      </div>

      {/* Modal de pago en 4 pasos */}
      {payModalWorker && (
        <PayCommissionModal
          worker={payModalWorker}
          onClose={() => setPayModalWorker(null)}
          onPaid={() => {
            setPayModalWorker(null);
            fetchWorkers();
            fetchPayments();
          }}
        />
      )}

      {/* FIX-REGRESSION: Modal de creación de trabajador */}
      <BaseModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        title="Nuevo trabajador"
        description={`Tienda: ${storeId || 'N/A'} · El CI deriva la fecha de nacimiento automáticamente`}
        maxWidth="sm:max-w-lg"
      >
        <div className="space-y-4 p-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="worker_first_name" className="text-xs font-bold uppercase tracking-widest">Nombre *</Label>
              <Input
                id="worker_first_name"
                value={workerForm.first_name}
                onChange={(e) => setWorkerForm({ ...workerForm, first_name: e.target.value })}
                placeholder="Juan"
                className="h-11"
                disabled={creatingWorker}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="worker_last_name" className="text-xs font-bold uppercase tracking-widest">Apellidos *</Label>
              <Input
                id="worker_last_name"
                value={workerForm.last_name}
                onChange={(e) => setWorkerForm({ ...workerForm, last_name: e.target.value })}
                placeholder="Pérez García"
                className="h-11"
                disabled={creatingWorker}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="worker_ci" className="text-xs font-bold uppercase tracking-widest">Carnet de Identidad *</Label>
              <Input
                id="worker_ci"
                value={workerForm.ci}
                onChange={(e) => setWorkerForm({ ...workerForm, ci: e.target.value })}
                placeholder="85010112345"
                className="h-11 font-mono"
                disabled={creatingWorker}
                maxLength={11}
              />
              <p className="text-[10px] text-muted-foreground">Formato cubano: 11 dígitos (YYMMDD#####)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="worker_gender" className="text-xs font-bold uppercase tracking-widest">Género</Label>
              <select
                id="worker_gender"
                value={workerForm.gender}
                onChange={(e) => setWorkerForm({ ...workerForm, gender: e.target.value })}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={creatingWorker}
              >
                <option value="">No especificar</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="worker_address" className="text-xs font-bold uppercase tracking-widest">Dirección</Label>
            <Input
              id="worker_address"
              value={workerForm.address}
              onChange={(e) => setWorkerForm({ ...workerForm, address: e.target.value })}
              placeholder="Calle 10 #25 e/ 3ra y 5ta"
              className="h-11"
              disabled={creatingWorker}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="worker_province" className="text-xs font-bold uppercase tracking-widest">Provincia</Label>
              <Input
                id="worker_province"
                value={workerForm.province}
                onChange={(e) => setWorkerForm({ ...workerForm, province: e.target.value })}
                placeholder="Las Tunas"
                className="h-11"
                disabled={creatingWorker}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="worker_municipality" className="text-xs font-bold uppercase tracking-widest">Municipio</Label>
              <Input
                id="worker_municipality"
                value={workerForm.municipality}
                onChange={(e) => setWorkerForm({ ...workerForm, municipality: e.target.value })}
                placeholder="Puerto Padre"
                className="h-11"
                disabled={creatingWorker}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
              disabled={creatingWorker}
              className="h-11 px-4"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateWorker}
              disabled={creatingWorker || !workerForm.first_name.trim() || !workerForm.last_name.trim() || !workerForm.ci.trim()}
              className="h-11 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-black text-xs uppercase tracking-widest flex items-center gap-2"
            >
              {creatingWorker ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {creatingWorker ? 'Creando...' : 'Crear trabajador'}
            </Button>
          </div>
        </div>
      </BaseModal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 1: Trabajadores
// ════════════════════════════════════════════════════════════════════
function WorkersTab({
  workers, loading, error, dateFrom, dateTo, onDateFromChange, onDateToChange, onRefresh, onPayCommission,
}: any) {
  if (loading && workers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border-2 border-destructive/50 bg-destructive/15 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <p className="text-sm text-foreground flex-1">{error}</p>
        <button onClick={onRefresh} className="px-3 py-2 min-h-[44px] rounded-lg bg-destructive text-destructive-foreground text-xs font-bold uppercase tracking-widest" aria-label="Reintentar carga de trabajadores">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Filtros de fecha */}
      <div className="bg-card rounded-2xl border-2 border-border p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-1">Desde</label>
          <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="h-11 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground" />
        </div>
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-1">Hasta</label>
          <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="h-11 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground" />
        </div>
        <button onClick={onRefresh} className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest hover:bg-primary/90 min-h-[44px]">
          Actualizar
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-card rounded-2xl border-2 border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="border-b-2 border-border text-left">
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Trabajador</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">CI</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-right">Cash</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-right">Transfer</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-right">Total</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Regla activa</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Último pago</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-center">Estado</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Sin trabajadores en esta tienda</p>
                  </td>
                </tr>
              ) : (
                workers.map((w: WorkerSummary) => (
                  <tr key={w.worker_id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 px-4 font-bold text-foreground">{w.first_name} {w.last_name}</td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">{w.ci}</td>
                    <td className="py-3 px-4 text-right font-mono text-foreground">{formatCurrency(w.sales_cash)}</td>
                    <td className="py-3 px-4 text-right font-mono text-foreground">{formatCurrency(w.sales_transfer)}</td>
                    <td className="py-3 px-4 text-right font-mono font-black text-foreground">{formatCurrency(w.sales_total)}</td>
                    <td className="py-3 px-4 text-xs">
                      {w.active_rule_type ? (
                        <span className="px-2 py-1 rounded-md bg-primary/15 text-primary font-bold border border-primary/30">
                          {RULE_TYPE_LABELS[w.active_rule_type] || w.active_rule_type}
                          {w.active_rule_value !== null && ` · ${w.active_rule_value}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {w.last_payment_date ? (
                        <div>
                          <div>{formatDate(w.last_payment_date)}</div>
                          <div className="font-mono font-bold text-foreground">{formatCurrency(w.last_payment_amount || 0)}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={cn(
                        'px-2 py-1 rounded-md text-xs font-bold uppercase border',
                        w.status === 'active'
                          ? 'bg-success/15 text-success border-success/30'
                          : 'bg-muted text-muted-foreground border-border'
                      )}>
                        {w.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => onPayCommission(w)}
                        disabled={w.status !== 'active'}
                        className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                      >
                        <DollarSign className="w-3 h-3 inline mr-1" />
                        Pagar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// MODAL: Pagar comisión en 4 pasos
// ════════════════════════════════════════════════════════════════════
function PayCommissionModal({ worker, onClose, onPaid }: {
  worker: WorkerSummary;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [step, setStep] = useState(1);
  // FIX C2+C3: obtener store_id real del auth store (no usar worker.worker_id)
  const activeStoreId = useAuthStore((s) => s.user?.activeStoreId);
  const [periodStart, setPeriodStart] = useState(() => {
    // Default: desde el último pago + 1 día
    if (worker.last_payment_date) {
      const d = new Date(worker.last_payment_date);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    // Si no hay último pago, desde el primer día del mes
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [calculation, setCalculation] = useState<Calculation | null>(null);
  const [finalAmount, setFinalAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Paso 2: calcular
  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const data = await apiFetch('/api/commissions/calculate', {
        method: 'POST',
        body: JSON.stringify({
          store_id: activeStoreId, // FIX C2: store_id real, no worker_id
          worker_ids: [worker.worker_id],
          date_from: periodStart,
          date_to: periodEnd,
        }),
      });
      const calc = data.calculations?.[0];
      if (!calc) throw new Error('Sin cálculo disponible');
      setCalculation(calc);
      setFinalAmount(calc.commission_suggested.toFixed(2));
      setStep(3);
    } catch (e: any) {
      toast.error('Error calculando: ' + e.message);
    } finally {
      setCalculating(false);
    }
  };

  // Paso 4: guardar
  const handleSave = async () => {
    setSaving(true);
    try {
      const finalAmt = parseFloat(finalAmount) || 0;
      const calcAmt = calculation?.commission_suggested || 0;
      const needsReason = Math.abs(finalAmt - calcAmt) > 0.01;

      if (needsReason && !adjustmentReason.trim()) {
        toast.error('Debes justificar el ajuste manual');
        setSaving(false);
        return;
      }

      const data = await apiFetch('/api/commissions/payments', {
        method: 'POST',
        body: JSON.stringify({
          store_id: activeStoreId, // FIX C3: store_id real, no worker_id
          worker_id: worker.worker_id,
          period_start: periodStart,
          period_end: periodEnd,
          calculated_amount: calcAmt,
          final_amount: finalAmt,
          manual_adjustment_reason: needsReason ? adjustmentReason : null,
          rule_applied_id: calculation?.rule_applied_id,
          calculated_breakdown: calculation,
          status: 'draft',
        }),
      });

      toast.success('Pago guardado como draft', {
        description: `${worker.first_name} ${worker.last_name}: ${formatCurrency(finalAmt)} CUP`,
      });
      onPaid();
    } catch (e: any) {
      toast.error('Error guardando: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card rounded-2xl border-2 border-border shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b-2 border-border p-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center border border-primary/30">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-widest text-foreground">
                Pagar Comisión
              </h3>
              <p className="text-sm text-muted-foreground">
                {worker.first_name} {worker.last_name} · CI: {worker.ci}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Cerrar modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-5 py-3 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2">
            {['Rango', 'Cálculo', 'Editar', 'Confirmar'].map((label, i) => {
              const stepNum = i + 1;
              const isActive = step === stepNum;
              const isDone = step > stepNum;
              return (
                <React.Fragment key={label}>
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest',
                    isActive ? 'bg-primary text-primary-foreground' :
                    isDone ? 'bg-success/15 text-success border border-success/30' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {isDone ? <CheckCircle2 className="w-3 h-3" /> : <span>{stepNum}</span>}
                    {label}
                  </div>
                  {i < 3 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Contenido del step */}
        <div className="p-5 space-y-4">
          {/* Paso 1: Rango */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                  Desde
                </label>
                <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground" />
                {worker.last_payment_date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Último pago: {formatDate(worker.last_payment_date)} (desde el día siguiente)
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                  Hasta
                </label>
                <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground" />
              </div>
              {periodStart > periodEnd && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">La fecha "Desde" no puede ser posterior a "Hasta"</p>
                </div>
              )}
            </div>
          )}

          {/* Paso 2: Cálculo automático */}
          {step === 2 && (
            <div className="text-center py-8">
              {calculating ? (
                <>
                  <RefreshCw className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    Calculando comisión...
                  </p>
                </>
              ) : (
                <>
                  <Calculator className="w-12 h-12 text-primary mx-auto mb-4" />
                  <p className="text-sm text-foreground mb-2">Listo para calcular comisión</p>
                  <p className="text-xs text-muted-foreground">
                    Periodo: {formatDate(periodStart)} → {formatDate(periodEnd)}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Paso 3: Edición manual */}
          {step === 3 && calculation && (
            <div className="space-y-4">
              {/* Tabla de ventas */}
              <div className="bg-muted/30 rounded-xl p-4 border border-border">
                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Ventas del periodo</h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Cash</p>
                    <p className="text-base font-black font-mono text-foreground">{formatCurrency(calculation.sales.cash)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Transfer</p>
                    <p className="text-base font-black font-mono text-foreground">{formatCurrency(calculation.sales.transfer)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total</p>
                    <p className="text-base font-black font-mono text-primary">{formatCurrency(calculation.sales.total)}</p>
                  </div>
                </div>
              </div>

              {/* Regla aplicada */}
              {calculation.rule_applied && (
                <div className="bg-primary/10 rounded-xl p-3 border border-primary/30">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Regla aplicada</p>
                  <p className="text-sm text-foreground">{calculation.calculation_explanation}</p>
                </div>
              )}

              {/* Monto sugerido */}
              <div className="bg-success/10 rounded-xl p-4 border border-success/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black uppercase tracking-widest text-success">Comisión sugerida</span>
                  <span className="text-2xl font-black font-mono text-success">{formatCurrency(calculation.commission_suggested)}</span>
                </div>
              </div>

              {/* Edición manual */}
              <div>
                <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                  Monto final (editable)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(e.target.value)}
                  className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                />
                {calculation && Math.abs((parseFloat(finalAmount) || 0) - calculation.commission_suggested) > 0.01 && (
                  <div className="mt-3">
                    <label className="text-sm font-black uppercase tracking-widest text-warning block mb-2">
                      Justificación del ajuste (obligatorio)
                    </label>
                    <textarea
                      value={adjustmentReason}
                      onChange={(e) => setAdjustmentReason(e.target.value)}
                      rows={2}
                      placeholder="Ej: Bono por desempeño, descuento por ausencia, ajuste manual..."
                      className="w-full px-3 py-2 rounded-xl border-2 border-warning/50 bg-background text-sm min-h-[44px] text-foreground"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Paso 4: Confirmación */}
          {step === 4 && calculation && (
            <div className="space-y-3">
              <div className="bg-muted/30 rounded-xl p-4 border border-border space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Trabajador</span>
                  <span className="text-sm font-bold text-foreground">{worker.first_name} {worker.last_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Periodo</span>
                  <span className="text-sm font-bold text-foreground">{formatDate(periodStart)} → {formatDate(periodEnd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Ventas total</span>
                  <span className="text-sm font-mono font-bold text-foreground">{formatCurrency(calculation.sales.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Comisión sugerida</span>
                  <span className="text-sm font-mono font-bold text-foreground">{formatCurrency(calculation.commission_suggested)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="text-sm font-black uppercase tracking-widest text-foreground">Monto final</span>
                  <span className="text-lg font-black font-mono text-primary">{formatCurrency(parseFloat(finalAmount) || 0)}</span>
                </div>
                {adjustmentReason && (
                  <div className="text-xs text-muted-foreground">
                    <strong>Ajuste:</strong> {adjustmentReason}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Se guardará como <strong>draft</strong>. Podrás aprobar y marcar como pagado desde la tab "Pagos".
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t-2 border-border p-4 flex items-center justify-between gap-2">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-bold min-h-[44px]"
          >
            {step === 1 ? 'Cancelar' : <><ChevronLeft className="w-4 h-4 inline" /> Atrás</>}
          </button>

          {step === 1 && (
            <button
              onClick={() => { setStep(2); handleCalculate(); }}
              disabled={periodStart > periodEnd}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              Calcular <ChevronRight className="w-4 h-4 inline" />
            </button>
          )}
          {step === 2 && calculating && (
            <span className="text-sm text-muted-foreground">Calculando...</span>
          )}
          {step === 3 && calculation && (
            <button
              onClick={() => {
                const finalAmt = parseFloat(finalAmount) || 0;
                if (Math.abs(finalAmt - calculation.commission_suggested) > 0.01 && !adjustmentReason.trim()) {
                  toast.error('Justifica el ajuste manual');
                  return;
                }
                setStep(4);
              }}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest hover:bg-primary/90 min-h-[44px]"
            >
              Revisar <ChevronRight className="w-4 h-4 inline" />
            </button>
          )}
          {step === 4 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-success text-success-foreground text-sm font-black uppercase tracking-widest hover:bg-success/90 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Guardando...' : <><CheckCircle2 className="w-4 h-4 inline" /> Guardar</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 2: Reglas de Comisión
// ════════════════════════════════════════════════════════════════════
function RulesTab({ rules, onRefresh, onEdit, onNew }: any) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black uppercase tracking-widest text-foreground">
          Reglas de comisión ({rules.length})
        </h3>
        <button
          onClick={onNew}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest hover:bg-primary/90 min-h-[44px] flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nueva regla
        </button>
      </div>

      <div className="bg-card rounded-2xl border-2 border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="border-b-2 border-border text-left">
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Tipo</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Aplica a</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Valor</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Base</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Prioridad</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Vigencia</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Sin reglas configuradas</td></tr>
              ) : rules.map((r: CommissionRule) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded-md bg-primary/15 text-primary font-bold border border-primary/30 text-xs">
                      {RULE_TYPE_LABELS[r.type] || r.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    {r.worker_id ? 'Worker específico' : <span className="text-primary font-bold">Toda la tienda</span>}
                  </td>
                  <td className="py-3 px-4 font-mono text-foreground">
                    {r.type === 'percentage_sales' && `${r.value_percent}%`}
                    {r.type === 'fixed_amount' && formatCurrency(r.fixed_value || 0)}
                    {r.type === 'salary_based' && formatCurrency(r.salary_amount || 0)}
                    {r.type === 'hybrid' && `${formatCurrency(r.salary_amount || 0)} + ${r.value_percent}%`}
                  </td>
                  <td className="py-3 px-4 text-xs">{BASE_CALC_LABELS[r.base_calculation] || r.base_calculation}</td>
                  <td className="py-3 px-4 font-mono text-center">{r.priority}</td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">
                    {formatDate(r.valid_from)} → {r.valid_to ? formatDate(r.valid_to) : '∞'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => onEdit(r)}
                      className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg hover:bg-muted text-muted-foreground hover:text-primary flex items-center justify-center"
                      aria-label="Editar regla"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 3: Pagos
// ════════════════════════════════════════════════════════════════════
function PaymentsTab({ payments, onRefresh }: any) {
  const statusLabels: Record<string, { label: string; color: string }> = {
    draft: { label: 'Borrador', color: 'bg-muted text-muted-foreground border-border' },
    approved: { label: 'Aprobado', color: 'bg-primary/15 text-primary border-primary/30' },
    paid: { label: 'Pagado', color: 'bg-success/15 text-success border-success/30' },
    cancelled: { label: 'Cancelado', color: 'bg-destructive/15 text-destructive border-destructive/30' },
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h3 className="text-base font-black uppercase tracking-widest text-foreground">
        Pagos de comisión ({payments.length})
      </h3>
      <div className="bg-card rounded-2xl border-2 border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="border-b-2 border-border text-left">
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Trabajador</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Periodo</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-right">Calculado</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-right">Final</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Estado</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Creado</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">Sin pagos registrados</td></tr>
              ) : payments.map((p: any) => {
                const s = statusLabels[p.status] || statusLabels.draft;
                return (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 px-4 font-bold text-foreground">
                      {p.worker ? `${p.worker.first_name} ${p.worker.last_name}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {formatDate(p.period_start)} → {formatDate(p.period_end)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-muted-foreground">{formatCurrency(p.calculated_amount)}</td>
                    <td className="py-3 px-4 text-right font-mono font-black text-foreground">{formatCurrency(p.final_amount)}</td>
                    <td className="py-3 px-4">
                      <span className={cn('px-2 py-1 rounded-md text-xs font-bold uppercase border', s.color)}>
                        {s.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString('es-ES')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 4: Historial (versiones de reglas)
// ════════════════════════════════════════════════════════════════════
function HistoryTab({ rules }: any) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-xl bg-primary/10 border border-primary/30 p-4">
        <p className="text-sm font-black text-primary uppercase tracking-widest mb-1">Auditabilidad</p>
        <p className="text-sm text-foreground">
          Cada cambio en una regla de comisión se versiona automáticamente en <code className="text-primary">commission_rule_versions</code>.
          Esto garantiza reproducibilidad histórica: cualquier cálculo pasado puede reconstruirse con la versión de la regla vigente en ese momento.
        </p>
      </div>

      <h3 className="text-base font-black uppercase tracking-widest text-foreground">
        Reglas activas ({rules.length})
      </h3>
      <div className="space-y-3">
        {rules.map((r: any) => (
          <div key={r.id} className="bg-card rounded-2xl border-2 border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-black text-foreground">
                  {RULE_TYPE_LABELS[r.type] || r.type}
                  {r.worker_id ? ' (worker específico)' : ' (toda la tienda)'}
                </p>
                <p className="text-xs text-muted-foreground">Vigencia: {formatDate(r.valid_from)} → {r.valid_to ? formatDate(r.valid_to) : '∞'}</p>
              </div>
              <a
                href={`/api/commissions/rules?store_id=${r.store_id}&history=true`}
                className="text-xs text-primary hover:underline"
              >
                Ver versiones →
              </a>
            </div>
            {r.versions && r.versions.length > 0 ? (
              <div className="text-xs text-muted-foreground">
                {r.versions.length} versión{r.versions.length !== 1 ? 'es' : ''} registrada{r.versions.length !== 1 ? 's' : ''}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Cargando versiones...</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default WorkersView;
