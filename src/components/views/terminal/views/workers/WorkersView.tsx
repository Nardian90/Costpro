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
  UserX,
  UserCheck,
  Save,
  Package,
  Search,
  Filter,
  Layers,
} from 'lucide-react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { BaseModal } from '@/components/ui/BaseModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CUBAN_PROVINCES, validateCubanCI, getMunicipalitiesForProvince } from './worker-helpers';

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

interface ProRatedSubPeriod {
  period: string;
  rule_type: string;
  rule_value: string;
  sales_cash: number;
  sales_transfer: number;
  sales_total: number;
  commission: number;
}

/** Línea de producto vendida (para modo manual del modal de pago) */
interface WorkerProductLine {
  line_item_id: string;
  transaction_id: string | null;
  sale_date: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  cash_paid: number;
  transfer_paid: number;
  currency: string;
}

/** Desglose por producto devuelto por el motor avanzado */
interface ProductCommissionDetail {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  rule_id: string | null;
  rule_type: string;
  commission: number;
  excluded_from_percentage: boolean;
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
  // FIX-A5 (2026-07-15): campos opcionales cuando el backend aplicó pro-rateo
  pro_rated?: boolean;
  pro_rated_breakdown?: ProRatedSubPeriod[];
  // v2 (2026-07-15): campos opcionales del motor avanzado
  product_breakdown?: ProductCommissionDetail[];
  excluded_sales_total?: number;
  calculation_mode?: 'rules' | 'manual';
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
  // v2 (2026-07-15)
  min_price?: number | null;
  max_price?: number | null;
  product_commission_amount?: number | null;
  product_ids?: string[];
  products?: Array<{ id: string; name: string; sku: string | null; price: number; price_currency?: string }>;
  // v3 (2026-07-17)
  product_commission_mode?: 'per_sale' | 'per_unit' | null;
  product_configs?: Record<string, { amount: number | null; mode: 'per_sale' | 'per_unit' }>;
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
  product_specific: 'Por Producto',
  scale_percentage: 'Por Escala',
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
  // FIX (2026-07-15): las fechas vienen como 'YYYY-MM-DD' (sin timezone).
  // new Date('2026-07-01') las interpreta como UTC midnight, y toLocaleDateString
  // en zona horaria negativa (Havana UTC-5) las convierte al día anterior (30/06).
  // Solución: si la fecha tiene formato YYYY-MM-DD, construir como local.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
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

  // v2 (2026-07-15): Modal de edición de trabajador
  const [editModalWorker, setEditModalWorker] = useState<WorkerSummary | null>(null);

  // v2: Toggle de status (activo/inactivo)
  const handleToggleWorkerStatus = async (worker: WorkerSummary) => {
    const newStatus = worker.status === 'active' ? 'inactive' : 'active';
    try {
      await apiFetch(`/api/workers/${worker.worker_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(
        newStatus === 'active'
          ? `${worker.first_name} ${worker.last_name} activado`
          : `${worker.first_name} ${worker.last_name} inactivado`,
      );
      fetchWorkers();
    } catch (e: any) {
      toast.error('Error cambiando estado: ' + e.message);
    }
  };

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
    shirt_size: '',
    shoe_size: '',
    waist_size: '',
  });
  const [ciError, setCiError] = useState<string>('');

  const handleCreateWorker = async () => {
    if (!storeId) {
      toast.error('No hay tienda activa');
      return;
    }
    if (!workerForm.first_name.trim() || !workerForm.last_name.trim()) {
      toast.error('Nombre y apellidos son obligatorios');
      return;
    }
    const ciErr = validateCubanCI(workerForm.ci);
    if (ciErr) {
      setCiError(ciErr);
      toast.error(ciErr);
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
          shirt_size: workerForm.shirt_size || undefined,
          shoe_size: workerForm.shoe_size || undefined,
          waist_size: workerForm.waist_size || undefined,
        }),
      });
      toast.success(`Trabajador "${workerForm.first_name} ${workerForm.last_name}" creado`);
      setCreateModalOpen(false);
      setWorkerForm({
        first_name: '', last_name: '', ci: '', gender: '', address: '',
        province: '', municipality: '', shirt_size: '', shoe_size: '', waist_size: '',
      });
      setCiError('');
      fetchWorkers();
    } catch (e: any) {
      // FIX-AUDIT: Manejar 409 (CI duplicado) con mensaje específico
      if (e.message?.includes('duplicate') || e.message?.includes('unique') || e.message?.includes('ya existe')) {
        toast.error('Ya existe un trabajador con ese CI en esta tienda');
      } else {
        toast.error('Error al crear trabajador: ' + e.message);
      }
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
            onEditWorker={(w: WorkerSummary) => setEditModalWorker(w)}
            onToggleStatus={handleToggleWorkerStatus}
          />
        )}
        {activeTab === 'rules' && (
          <RulesTab
            rules={rules}
            storeId={storeId || ''}
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
        onOpenChange={(open) => {
          setCreateModalOpen(open);
          if (!open) setCiError('');
        }}
        title="Nuevo trabajador"
        description={`Tienda: ${storeId || 'N/A'} · El CI deriva la fecha de nacimiento automáticamente`}
        maxWidth="sm:max-w-2xl"
      >
        <div className="space-y-4 p-1 max-h-[70vh] overflow-y-auto">
          {/* Sección: Datos personales */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Datos personales</p>
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
          </div>

          {/* CI con validación en vivo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="worker_ci" className="text-xs font-bold uppercase tracking-widest">Carnet de Identidad *</Label>
              <Input
                id="worker_ci"
                value={workerForm.ci}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, '').slice(0, 11);
                  setWorkerForm({ ...workerForm, ci: clean });
                  setCiError(clean ? validateCubanCI(clean) : '');
                }}
                placeholder="85010112345"
                className={cn('h-11 font-mono', ciError && 'border-destructive focus-visible:ring-destructive')}
                disabled={creatingWorker}
                maxLength={11}
                inputMode="numeric"
              />
              {ciError ? (
                <p className="text-[10px] text-destructive font-bold">{ciError}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground">11 dígitos (YYMMDD#####)</p>
              )}
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

          {/* Sección: Ubicación */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Ubicación</p>
            <div className="space-y-3">
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
                  <select
                    id="worker_province"
                    value={workerForm.province}
                    onChange={(e) => {
                      // FIX-AUDIT: Reset municipality when province changes (cascada dropdown)
                      setWorkerForm({ ...workerForm, province: e.target.value, municipality: '' });
                    }}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                    disabled={creatingWorker}
                  >
                    <option value="">Seleccionar...</option>
                    {CUBAN_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="worker_municipality" className="text-xs font-bold uppercase tracking-widest">Municipio</Label>
                  <select
                    id="worker_municipality"
                    value={workerForm.municipality}
                    onChange={(e) => setWorkerForm({ ...workerForm, municipality: e.target.value })}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={creatingWorker || !workerForm.province}
                  >
                    <option value="">
                      {workerForm.province ? 'Seleccionar...' : 'Primero elige provincia'}
                    </option>
                    {workerForm.province && getMunicipalitiesForProvince(workerForm.province).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Sección: Tallas (uniformidad) */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Tallas (opcional)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="worker_shirt_size" className="text-xs font-bold uppercase tracking-widest">Camisa</Label>
                <select
                  id="worker_shirt_size"
                  value={workerForm.shirt_size}
                  onChange={(e) => setWorkerForm({ ...workerForm, shirt_size: e.target.value })}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={creatingWorker}
                >
                  <option value="">N/A</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="worker_shoe_size" className="text-xs font-bold uppercase tracking-widest">Calzado</Label>
                <Input
                  id="worker_shoe_size"
                  value={workerForm.shoe_size}
                  onChange={(e) => setWorkerForm({ ...workerForm, shoe_size: e.target.value })}
                  placeholder="42"
                  className="h-11"
                  disabled={creatingWorker}
                  inputMode="numeric"
                  maxLength={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="worker_waist_size" className="text-xs font-bold uppercase tracking-widest">Cintura</Label>
                <Input
                  id="worker_waist_size"
                  value={workerForm.waist_size}
                  onChange={(e) => setWorkerForm({ ...workerForm, waist_size: e.target.value })}
                  placeholder="32"
                  className="h-11"
                  disabled={creatingWorker}
                  inputMode="numeric"
                  maxLength={3}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
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
              disabled={creatingWorker || !workerForm.first_name.trim() || !workerForm.last_name.trim() || !!ciError || workerForm.ci.length !== 11}
              className="h-11 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-black text-xs uppercase tracking-widest flex items-center gap-2"
            >
              {creatingWorker ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {creatingWorker ? 'Creando...' : 'Crear trabajador'}
            </Button>
          </div>
        </div>
      </BaseModal>

      {/* v2 (2026-07-15): Modal de creación/edición de reglas de comisión */}
      {showRuleModal && (
        <RuleFormModal
          storeId={storeId || ''}
          workers={workers}
          editingRule={editingRule}
          onClose={() => { setShowRuleModal(false); setEditingRule(null); }}
          onSaved={() => {
            setShowRuleModal(false);
            setEditingRule(null);
            fetchRules();
          }}
        />
      )}

      {/* v2 (2026-07-15): Modal de edición de trabajador */}
      {editModalWorker && (
        <EditWorkerModal
          worker={editModalWorker}
          onClose={() => setEditModalWorker(null)}
          onSaved={() => {
            setEditModalWorker(null);
            fetchWorkers();
          }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB 1: Trabajadores
// ════════════════════════════════════════════════════════════════════
function WorkersTab({
  workers, loading, error, dateFrom, dateTo, onDateFromChange, onDateToChange, onRefresh, onPayCommission, onEditWorker, onToggleStatus,
}: any) {
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Helper: maneja el toggle de status activo/inactivo
  const handleToggleStatus = async (worker: WorkerSummary) => {
    if (!onToggleStatus) return;
    setTogglingId(worker.worker_id);
    try {
      await onToggleStatus(worker);
    } finally {
      setTogglingId(null);
    }
  };

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
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground hidden sm:table-cell">CI</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-right hidden md:table-cell">Cash</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-right hidden md:table-cell">Transfer</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-right">Total</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground hidden lg:table-cell">Regla activa</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground hidden lg:table-cell">Último pago</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-center">Estado</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-center">Acciones</th>
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
                  <tr key={w.worker_id} className={cn('border-b border-border/50 hover:bg-muted/30', w.status !== 'active' && 'opacity-60')}>
                    <td className="py-3 px-4 font-bold text-foreground">{w.first_name} {w.last_name}</td>
                    <td className="py-3 px-4 font-mono text-muted-foreground hidden sm:table-cell">{w.ci}</td>
                    <td className="py-3 px-4 text-right font-mono text-foreground hidden md:table-cell">{formatCurrency(w.sales_cash)}</td>
                    <td className="py-3 px-4 text-right font-mono text-foreground hidden md:table-cell">{formatCurrency(w.sales_transfer)}</td>
                    <td className="py-3 px-4 text-right font-mono font-black text-foreground">{formatCurrency(w.sales_total)}</td>
                    <td className="py-3 px-4 text-xs hidden lg:table-cell">
                      {w.active_rule_type ? (
                        <span className="px-2 py-1 rounded-md bg-primary/15 text-primary font-bold border border-primary/30">
                          {RULE_TYPE_LABELS[w.active_rule_type] || w.active_rule_type}
                          {w.active_rule_value !== null && ` · ${w.active_rule_value}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground hidden lg:table-cell">
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
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {/* Pagar comisión */}
                        <button
                          onClick={() => onPayCommission(w)}
                          disabled={w.status !== 'active'}
                          className="px-2 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wider hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] flex items-center gap-1"
                          title="Pagar comisión"
                          aria-label={`Pagar comisión a ${w.first_name}`}
                        >
                          <DollarSign className="w-3 h-3" />
                          <span className="hidden sm:inline">Pagar</span>
                        </button>
                        {/* Editar */}
                        <button
                          onClick={() => onEditWorker(w)}
                          className="p-2 rounded-lg bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary border border-border min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Editar datos del trabajador"
                          aria-label={`Editar ${w.first_name}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {/* Activar / Inactivar */}
                        <button
                          onClick={() => handleToggleStatus(w)}
                          disabled={togglingId === w.worker_id}
                          className={cn(
                            'p-2 rounded-lg border min-h-[36px] min-w-[36px] flex items-center justify-center disabled:opacity-50',
                            w.status === 'active'
                              ? 'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20'
                              : 'bg-success/10 text-success border-success/30 hover:bg-success/20'
                          )}
                          title={w.status === 'active' ? 'Inactivar trabajador' : 'Activar trabajador'}
                          aria-label={w.status === 'active' ? `Inactivar ${w.first_name}` : `Activar ${w.first_name}`}
                        >
                          {togglingId === w.worker_id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : w.status === 'active' ? (
                            <UserX className="w-3.5 h-3.5" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
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
    // FIX (2026-07-15): usar construcción local (no UTC) para evitar día anterior
    if (worker.last_payment_date) {
      const s = worker.last_payment_date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() + 1);
        return dt.toISOString().split('T')[0];
      }
      const d = new Date(s);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    // Si no hay último pago, desde el primer día del mes actual (local)
    const now = new Date();
    const dt = new Date(now.getFullYear(), now.getMonth(), 1);
    return dt.toISOString().split('T')[0];
  });
  // FIX (2026-07-15): usar fecha local, no UTC
  const [periodEnd, setPeriodEnd] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [calculation, setCalculation] = useState<Calculation | null>(null);
  const [finalAmount, setFinalAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  // v2 (2026-07-15): Modo manual vs reglas
  const [payMode, setPayMode] = useState<'rules' | 'manual'>('rules');
  const [workerProducts, setWorkerProducts] = useState<WorkerProductLine[]>([]);
  const [manualCommissions, setManualCommissions] = useState<Record<string, string>>({});
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Paso 2: calcular (modo reglas)
  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const data = await apiFetch('/api/commissions/calculate', {
        method: 'POST',
        body: JSON.stringify({
          store_id: activeStoreId,
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

  // v2: Paso 2 alternativo — cargar productos del worker (modo manual)
  const handleLoadProducts = async () => {
    setLoadingProducts(true);
    try {
      const data = await apiFetch(
        `/api/commissions/worker-products?store_id=${activeStoreId}&worker_id=${worker.worker_id}&date_from=${periodStart}&date_to=${periodEnd}`,
        { method: 'GET' },
      );
      setWorkerProducts(data.items || []);
      // Inicializar comisiones manuales en 0
      const initCommissions: Record<string, string> = {};
      for (const item of (data.items || [])) {
        initCommissions[item.line_item_id] = '0.00';
      }
      setManualCommissions(initCommissions);
      // Construir cálculo inicial con todo 0
      const calc: Calculation = {
        worker_id: worker.worker_id,
        worker_name: `${worker.first_name} ${worker.last_name}`,
        worker_ci: worker.ci,
        worker_status: worker.status,
        period: { from: periodStart, to: periodEnd },
        sales: {
          cash: data.totals?.cash || 0,
          transfer: data.totals?.transfer || 0,
          total: data.totals?.total || 0,
          base_used: data.totals?.total || 0,
        },
        rule_applied: null,
        rule_applied_id: null,
        breakdown: { percentage_component: 0, fixed_component: 0, salary_component: 0 },
        commission_suggested: 0,
        calculation_explanation: `Modo manual: ${data.items?.length || 0} producto(s) cargado(s) para edición`,
        calculation_mode: 'manual',
        product_breakdown: (data.items || []).map((it: WorkerProductLine) => ({
          product_id: it.product_id || '',
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.line_total,
          rule_id: null,
          rule_type: 'manual',
          commission: 0,
          excluded_from_percentage: false,
        })),
      };
      setCalculation(calc);
      setFinalAmount('0.00');
      setStep(3);
    } catch (e: any) {
      toast.error('Error cargando productos: ' + e.message);
    } finally {
      setLoadingProducts(false);
    }
  };

  // v2: Actualizar comisión manual de un producto
  const updateManualCommission = (lineItemId: string, value: string) => {
    setManualCommissions(prev => {
      const next = { ...prev, [lineItemId]: value };
      // Recalcular total
      const total = Object.values(next).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
      setFinalAmount(total.toFixed(2));
      // Actualizar product_breakdown del calculation
      if (calculation?.product_breakdown) {
        const newBreakdown = calculation.product_breakdown.map((pb, idx) => ({
          ...pb,
          commission: parseFloat(next[workerProducts[idx]?.line_item_id || '']) || 0,
        }));
        setCalculation({
          ...calculation,
          commission_suggested: total,
          product_breakdown: newBreakdown,
        });
      }
      return next;
    });
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
          store_id: activeStoreId,
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

              {/* v2 (2026-07-15): Toggle Modo Manual vs Reglas */}
              <div className="bg-muted/30 rounded-xl p-4 border border-border">
                <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-3">
                  Modo de cálculo
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMode('rules')}
                    className={cn(
                      'flex flex-col items-start gap-1 px-4 py-3 rounded-xl border-2 text-left min-h-[60px]',
                      payMode === 'rules'
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background hover:bg-muted/50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Calculator className={cn('w-4 h-4', payMode === 'rules' ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-sm font-black uppercase tracking-wider text-foreground">Reglas</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Cálculo automático según reglas configuradas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMode('manual')}
                    className={cn(
                      'flex flex-col items-start gap-1 px-4 py-3 rounded-xl border-2 text-left min-h-[60px]',
                      payMode === 'manual'
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background hover:bg-muted/50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Edit3 className={cn('w-4 h-4', payMode === 'manual' ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-sm font-black uppercase tracking-wider text-foreground">Manual</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Comisión por producto, editable línea a línea</span>
                  </button>
                </div>
                {payMode === 'manual' && (
                  <p className="text-xs text-warning mt-2 italic">
                    Se cargarán todos los productos vendidos por el trabajador en el periodo. Podrás asignar la comisión a cada uno individualmente.
                  </p>
                )}
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

              {/* FIX-A5 (2026-07-15): bloque de pro-rateo cuando hubo cambio de regla en el periodo */}
              {calculation.pro_rated && calculation.pro_rated_breakdown && calculation.pro_rated_breakdown.length > 0 && (
                <div className="bg-warning/10 rounded-xl p-4 border-2 border-warning/40">
                  {/* Encabezado con badge */}
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                    <span className="text-xs font-black uppercase tracking-widest text-warning">
                      Pro-rateo aplicado · {calculation.pro_rated_breakdown.length} sub-periodos
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    El periodo seleccionado incluye cambios de regla de comisión. El cálculo se dividió en sub-periodos, cada uno con su regla vigente.
                  </p>

                  {/* Tabla de desglose por sub-periodo */}
                  <div className="bg-background/60 rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr className="border-b border-border text-left">
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground">Periodo</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground">Regla</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground text-right">Ventas</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground text-right">Comisión</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calculation.pro_rated_breakdown.map((sub, idx) => (
                            <tr key={idx} className="border-b border-border/40 last:border-0">
                              <td className="py-2 px-2 text-foreground font-mono">{sub.period}</td>
                              <td className="py-2 px-2 text-foreground">
                                <span className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold border border-primary/20">
                                  {sub.rule_value}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-foreground">
                                {formatCurrency(sub.sales_total)}
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-bold text-foreground">
                                {formatCurrency(sub.commission)}
                              </td>
                            </tr>
                          ))}
                          {/* Fila de total */}
                          <tr className="bg-warning/10 border-t-2 border-warning/40">
                            <td className="py-2 px-2 font-black uppercase tracking-wider text-foreground" colSpan={3}>
                              Total pro-rateado
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-black text-warning">
                              {formatCurrency(calculation.commission_suggested)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Si necesitas ajustar manualmente, justifica el motivo abajo. El monto sugerido ya refleja la suma de los sub-periodos.
                  </p>
                </div>
              )}

              {/* v2 (2026-07-15): Tabla editable de productos en MODO MANUAL */}
              {calculation.calculation_mode === 'manual' && workerProducts.length > 0 && (
                <div className="bg-primary/5 rounded-xl p-4 border-2 border-primary/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-primary">
                      Comisión por producto · {workerProducts.length} ítem(s)
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      Total ventas: {formatCurrency(calculation.sales.total)} CUP
                    </span>
                  </div>

                  <div className="bg-background/60 rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 sticky top-0">
                          <tr className="border-b border-border text-left">
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground">Fecha</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground">Producto</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground text-right">Cant.</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground text-right">P.Unit</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground text-right">Total</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-primary text-right">Comisión $</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workerProducts.map((item) => (
                            <tr key={item.line_item_id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                              <td className="py-2 px-2 text-muted-foreground font-mono whitespace-nowrap">
                                {formatDate(item.sale_date)}
                              </td>
                              <td className="py-2 px-2 text-foreground">
                                <div className="font-bold">{item.product_name}</div>
                                {item.product_sku && (
                                  <div className="text-[10px] text-muted-foreground font-mono">SKU: {item.product_sku}</div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-foreground">
                                {item.quantity}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-foreground">
                                {formatCurrency(item.unit_price)}
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-bold text-foreground">
                                {formatCurrency(item.line_total)}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={manualCommissions[item.line_item_id] || '0.00'}
                                  onChange={(e) => updateManualCommission(item.line_item_id, e.target.value)}
                                  className="w-24 h-9 px-2 text-right rounded border-2 border-primary/40 bg-background text-xs font-mono font-bold text-primary focus:border-primary focus:outline-none min-h-[36px]"
                                  placeholder="0.00"
                                />
                              </td>
                            </tr>
                          ))}
                          {/* Fila de total */}
                          <tr className="bg-primary/10 border-t-2 border-primary/30 sticky bottom-0">
                            <td className="py-2 px-2 font-black uppercase tracking-wider text-foreground" colSpan={5}>
                              Total comisión manual
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-black text-primary">
                              {formatCurrency(parseFloat(finalAmount) || 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {workerProducts.length === 0 && (
                    <p className="text-xs text-muted-foreground italic mt-2">
                      No se encontraron productos vendidos por este trabajador en el periodo seleccionado.
                    </p>
                  )}
                </div>
              )}

              {/* v2: Tabla de desglose por producto en MODO REGLAS (solo lectura) */}
              {calculation.calculation_mode !== 'manual' && calculation.product_breakdown && calculation.product_breakdown.length > 0 && (
                <div className="bg-muted/20 rounded-xl p-3 border border-border">
                  <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Desglose por producto · {calculation.product_breakdown.length} ítem(s)
                    {calculation.excluded_sales_total && calculation.excluded_sales_total > 0 && (
                      <span className="ml-2 text-warning">· Excluido del %: {formatCurrency(calculation.excluded_sales_total)}</span>
                    )}
                  </h4>
                  <div className="bg-background/60 rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 sticky top-0">
                          <tr className="border-b border-border text-left">
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground">Producto</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground text-right">Cant.</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground text-right">Total</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground">Regla</th>
                            <th className="py-2 px-2 font-black uppercase tracking-wider text-muted-foreground text-right">Comisión</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calculation.product_breakdown.map((pb, idx) => (
                            <tr key={idx} className={cn(
                              'border-b border-border/40 last:border-0',
                              pb.excluded_from_percentage && 'bg-warning/5'
                            )}>
                              <td className="py-2 px-2 text-foreground font-bold">
                                {pb.product_name}
                                {pb.excluded_from_percentage && (
                                  <span className="ml-1 text-[10px] text-warning uppercase">★ excluida</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-foreground">{pb.quantity}</td>
                              <td className="py-2 px-2 text-right font-mono text-foreground">{formatCurrency(pb.line_total)}</td>
                              <td className="py-2 px-2 text-foreground">
                                <span className={cn(
                                  'inline-block px-1.5 py-0.5 rounded font-bold border text-[10px]',
                                  pb.rule_type === 'product_specific' && 'bg-warning/15 text-warning border-warning/30',
                                  pb.rule_type === 'scale_percentage' && 'bg-primary/10 text-primary border-primary/30',
                                  pb.rule_type === 'percentage_sales' && 'bg-primary/10 text-primary border-primary/30',
                                  pb.rule_type === 'none' && 'bg-muted text-muted-foreground border-border'
                                )}>
                                  {RULE_TYPE_LABELS[pb.rule_type] || pb.rule_type}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-bold text-foreground">
                                {formatCurrency(pb.commission)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
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
              onClick={() => {
                if (payMode === 'manual') {
                  setStep(2);
                  handleLoadProducts();
                } else {
                  setStep(2);
                  handleCalculate();
                }
              }}
              disabled={periodStart > periodEnd}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {payMode === 'manual' ? 'Cargar productos' : 'Calcular'} <ChevronRight className="w-4 h-4 inline" />
            </button>
          )}
          {step === 2 && (calculating || loadingProducts) && (
            <span className="text-sm text-muted-foreground">{payMode === 'manual' ? 'Cargando productos...' : 'Calculando...'}</span>
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
function RulesTab({ rules, storeId, onRefresh, onEdit, onNew }: any) {
  // v3 (2026-07-17): sub-tab "Por Producto" con catálogo virtualizado
  const [subTab, setSubTab] = useState<'list' | 'catalog'>('list');

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

      {/* Sub-tabs: Lista de reglas | Catálogo por producto */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setSubTab('list')}
          className={cn(
            'px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 transition-colors min-h-[44px] flex items-center gap-2',
            subTab === 'list'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Settings className="w-3.5 h-3.5" /> Lista de reglas
        </button>
        <button
          onClick={() => setSubTab('catalog')}
          className={cn(
            'px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 transition-colors min-h-[44px] flex items-center gap-2',
            subTab === 'catalog'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Package className="w-3.5 h-3.5" /> Por producto
        </button>
      </div>

      {subTab === 'list' ? (
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
                      {r.type === 'product_specific' && (
                        <span className="text-xs">
                          {formatCurrency(r.product_commission_amount || 0)}
                          {r.product_commission_mode === 'per_unit' ? ' /unidad' : ' /venta'}
                          {r.products && r.products.length > 0 && (
                            <span className="text-muted-foreground ml-1">· {r.products.length} prod.</span>
                          )}
                        </span>
                      )}
                      {r.type === 'scale_percentage' && (
                        <span className="text-xs">
                          {r.value_percent}%
                          <span className="text-muted-foreground ml-1">
                            ({r.min_price || 0}–{r.max_price || '∞'})
                          </span>
                        </span>
                      )}
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
      ) : (
        <ProductCommissionCatalog storeId={storeId} onRefresh={onRefresh} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// v3 (2026-07-17): Catálogo de comisiones por producto (sub-tab)
// Tabla virtualizada con @tanstack/react-virtual que carga TODO el catálogo,
// muestra precio original + moneda + precio CUP calculado, y permite
// configurar comisión por producto (modo per_sale o per_unit, monto fijo).
// Incluye bulk-apply por rango de precio o categoría.
// ════════════════════════════════════════════════════════════════════

interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  price_currency: string;
  category: string | null;
  stock_current: number;
  is_active: boolean;
}

interface ProductRuleConfig {
  amount: number | null;
  mode: 'per_sale' | 'per_unit';
  // ID de la regla product_specific que aplica a este producto (si existe)
  rule_id?: string;
}

function ProductCommissionCatalog({ storeId, onRefresh }: { storeId: string; onRefresh: () => void }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ USD: 1, EUR: 1, MLC: 1 });
  const [productConfigs, setProductConfigs] = useState<Record<string, ProductRuleConfig>>({});
  const [saving, setSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Cargar catálogo + tasas + configs existentes
  const loadCatalog = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Productos (RPC get_products_for_pos con price_currency)
      const productsData = await apiFetch(`/api/inventory/products?store_id=${storeId}`);
      const prods = (productsData.products || productsData || []).filter((p: any) => p.is_active !== false);
      setProducts(prods);

      // 2. Tasas de cambio de la tienda
      try {
        const ratesData = await apiFetch(`/api/store-rates?storeId=${storeId}`);
        const rates: Record<string, number> = { USD: 1, EUR: 1, MLC: 1 };
        if (ratesData.rates) {
          for (const [cur, rate] of Object.entries(ratesData.rates)) {
            rates[cur] = Number(rate) || 1;
          }
        }
        setExchangeRates(rates);
      } catch {
        // Sin tasas — fallback a 1:1
      }

      // 3. Configs existentes (reglas product_specific + joins)
      const rulesData = await apiFetch(`/api/commissions/rules?store_id=${storeId}`);
      const productSpecificRules = (rulesData.rules || []).filter((r: any) => r.type === 'product_specific');
      const configs: Record<string, ProductRuleConfig> = {};
      for (const rule of productSpecificRules) {
        if (rule.products && rule.products.length > 0) {
          for (const p of rule.products) {
            const cfg = rule.product_configs?.[p.id];
            configs[p.id] = {
              amount: cfg?.amount != null ? cfg.amount : rule.product_commission_amount,
              mode: cfg?.mode || rule.product_commission_mode || 'per_sale',
              rule_id: rule.id,
            };
          }
        }
      }
      setProductConfigs(configs);
    } catch (e: any) {
      setError(e.message || 'Error cargando catálogo');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Filtrar productos por búsqueda y categoría
  const filteredProducts = React.useMemo(() => {
    if (!searchTerm.trim() && !categoryFilter) return products;
    const term = searchTerm.toLowerCase().trim();
    return products.filter(p => {
      const matchSearch = !term
        || p.name.toLowerCase().includes(term)
        || (p.sku || '').toLowerCase().includes(term);
      const matchCategory = !categoryFilter || p.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [products, searchTerm, categoryFilter]);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => { if (p.category) set.add(p.category); });
    return Array.from(set).sort();
  }, [products]);

  // Calcular precio en CUP
  const priceInCup = (p: CatalogProduct): number => {
    if (p.price_currency === 'CUP') return p.price;
    const rate = exchangeRates[p.price_currency] || 1;
    return p.price * rate;
  };

  // Actualizar config de un producto (edición inline)
  const updateConfig = (productId: string, patch: Partial<ProductRuleConfig>) => {
    setProductConfigs(prev => ({
      ...prev,
      [productId]: {
        amount: prev[productId]?.amount ?? null,
        mode: prev[productId]?.mode ?? 'per_unit',
        ...patch,
      },
    }));
  };

  // Bulk apply
  const [bulkMode, setBulkMode] = useState<'per_sale' | 'per_unit'>('per_unit');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkScope, setBulkScope] = useState<'all' | 'category' | 'price_range'>('all');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkMinPrice, setBulkMinPrice] = useState('');
  const [bulkMaxPrice, setBulkMaxPrice] = useState('');
  const [bulkCurrency, setBulkCurrency] = useState<'CUP' | 'orig'>('CUP');

  const applyBulk = () => {
    const amount = parseFloat(bulkAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('Monto inválido');
      return;
    }
    const newConfigs = { ...productConfigs };
    let count = 0;
    for (const p of filteredProducts) {
      let matches = false;
      if (bulkScope === 'all') matches = true;
      else if (bulkScope === 'category') matches = p.category === bulkCategory;
      else if (bulkScope === 'price_range') {
        const cupPrice = priceInCup(p);
        const min = bulkMinPrice ? parseFloat(bulkMinPrice) : -Infinity;
        const max = bulkMaxPrice ? parseFloat(bulkMaxPrice) : Infinity;
        matches = cupPrice >= min && cupPrice <= max;
      }
      if (matches) {
        // Si bulkCurrency === 'orig' y el producto no es CUP, convertir a CUP
        const finalAmount = bulkCurrency === 'orig' && p.price_currency !== 'CUP'
          ? amount * (exchangeRates[p.price_currency] || 1)
          : amount;
        newConfigs[p.id] = {
          amount: finalAmount,
          mode: bulkMode,
        };
        count++;
      }
    }
    setProductConfigs(newConfigs);
    toast.success(`Aplicado a ${count} producto(s)`);
    setBulkOpen(false);
  };

  // Guardar todas las configs (crea/actualiza una regla product_specific por tienda)
  const handleSave = async () => {
    setSaving(true);
    try {
      const configsToSave = Object.entries(productConfigs)
        .filter(([_, cfg]) => cfg.amount != null && cfg.amount > 0)
        .map(([productId, cfg]) => ({ productId, ...cfg }));

      if (configsToSave.length === 0) {
        toast.error('No hay configs para guardar');
        setSaving(false);
        return;
      }

      // Llamar a un endpoint que haga upsert masivo
      // Usamos el endpoint POST existente con product_configs
      // Primero verificamos si ya existe una regla product_specific store-wide
      const rulesData = await apiFetch(`/api/commissions/rules?store_id=${storeId}`);
      const existingRule = (rulesData.rules || []).find(
        (r: any) => r.type === 'product_specific' && r.worker_id === null
      );

      const payload = {
        store_id: storeId,
        type: 'product_specific',
        worker_id: null,
        valid_from: new Date().toISOString().split('T')[0],
        product_commission_amount: configsToSave[0]?.amount || 0,
        product_commission_mode: configsToSave[0]?.mode || 'per_unit',
        product_ids: configsToSave.map(c => c.productId),
        product_configs: configsToSave.reduce((acc: Record<string, any>, c) => {
          acc[c.productId] = { amount: c.amount, mode: c.mode };
          return acc;
        }, {}),
      };

      if (existingRule) {
        // PATCH
        await apiFetch(`/api/commissions/rules/${existingRule.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        // POST
        await apiFetch('/api/commissions/rules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      toast.success(`${configsToSave.length} comisiones por producto guardadas`);
      onRefresh();
      loadCatalog();
    } catch (e: any) {
      toast.error('Error guardando: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const productCount = Object.values(productConfigs).filter(c => c.amount != null && c.amount > 0).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Cargando catálogo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border-2 border-destructive/50 bg-destructive/15 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <p className="text-sm text-foreground flex-1">{error}</p>
        <button onClick={loadCatalog} className="px-3 py-2 min-h-[44px] rounded-lg bg-destructive text-destructive-foreground text-xs font-bold uppercase tracking-widest">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header con tasas + guardado */}
      <div className="bg-card rounded-2xl border-2 border-border p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs">
            <span className="font-black uppercase tracking-widest text-muted-foreground">Tasas:</span>{' '}
            {Object.entries(exchangeRates).map(([cur, rate]) => (
              <span key={cur} className="ml-2 font-mono font-bold text-foreground">
                {cur}={rate}
              </span>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs">
            <span className="font-black uppercase tracking-widest text-muted-foreground">Configurados:</span>{' '}
            <span className="font-mono font-bold text-primary">{productCount}</span>
            <span className="text-muted-foreground"> / {products.length}</span>
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setBulkOpen(!bulkOpen)}
            className="px-3 py-2 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted min-h-[44px] flex items-center gap-2"
          >
            <Layers className="w-3.5 h-3.5" /> Aplicar en masa
          </button>
          <button
            onClick={handleSave}
            disabled={saving || productCount === 0}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 min-h-[44px] flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Guardando...' : `Guardar (${productCount})`}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card rounded-2xl border-2 border-border p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full h-11 pl-10 pr-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
          />
        </div>
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-11 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
          >
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span className="text-xs text-muted-foreground">
          {filteredProducts.length} producto(s)
        </span>
      </div>

      {/* Bulk apply panel */}
      {bulkOpen && (
        <div className="bg-card rounded-2xl border-2 border-primary/30 p-3 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-black uppercase tracking-widest text-primary">Aplicar comisión en masa</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Modo</label>
              <select
                value={bulkMode}
                onChange={(e) => setBulkMode(e.target.value as any)}
                className="w-full h-10 px-2 rounded-lg border-2 border-border bg-background text-xs font-bold min-h-[40px] text-foreground"
              >
                <option value="per_unit">Por unidad</option>
                <option value="per_sale">Por venta</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Monto</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bulkAmount}
                onChange={(e) => setBulkAmount(e.target.value)}
                placeholder="1000"
                className="w-full h-10 px-2 rounded-lg border-2 border-border bg-background text-xs font-mono font-bold min-h-[40px] text-foreground"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Moneda del monto</label>
              <select
                value={bulkCurrency}
                onChange={(e) => setBulkCurrency(e.target.value as any)}
                className="w-full h-10 px-2 rounded-lg border-2 border-border bg-background text-xs font-bold min-h-[40px] text-foreground"
              >
                <option value="CUP">CUP</option>
                <option value="orig">Moneda original (convierte)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Alcance</label>
              <select
                value={bulkScope}
                onChange={(e) => setBulkScope(e.target.value as any)}
                className="w-full h-10 px-2 rounded-lg border-2 border-border bg-background text-xs font-bold min-h-[40px] text-foreground"
              >
                <option value="all">Todos los filtrados</option>
                <option value="category">Por categoría</option>
                <option value="price_range">Por rango de precio CUP</option>
              </select>
            </div>
          </div>
          {bulkScope === 'category' && (
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="w-full h-10 px-2 rounded-lg border-2 border-border bg-background text-xs font-bold min-h-[40px] text-foreground"
            >
              <option value="">Selecciona categoría</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {bulkScope === 'price_range' && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Precio mín CUP"
                value={bulkMinPrice}
                onChange={(e) => setBulkMinPrice(e.target.value)}
                className="h-10 px-2 rounded-lg border-2 border-border bg-background text-xs font-mono min-h-[40px] text-foreground"
              />
              <input
                type="number"
                placeholder="Precio máx CUP"
                value={bulkMaxPrice}
                onChange={(e) => setBulkMaxPrice(e.target.value)}
                className="h-10 px-2 rounded-lg border-2 border-border bg-background text-xs font-mono min-h-[40px] text-foreground"
              />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setBulkOpen(false)} className="px-3 py-2 rounded-lg border border-border text-xs font-bold uppercase hover:bg-muted min-h-[40px]">Cancelar</button>
            <button onClick={applyBulk} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase hover:bg-primary/90 min-h-[40px]">Aplicar</button>
          </div>
        </div>
      )}

      {/* Tabla catálogo (sin virtualización — usa scroll nativo para simplicidad) */}
      <div className="bg-card rounded-2xl border-2 border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 sticky top-0 z-10">
              <tr className="border-b-2 border-border text-left">
                <th className="py-2 px-3 font-black uppercase tracking-widest text-[10px] text-muted-foreground">Producto</th>
                <th className="py-2 px-3 font-black uppercase tracking-widest text-[10px] text-muted-foreground text-right">Precio</th>
                <th className="py-2 px-3 font-black uppercase tracking-widest text-[10px] text-muted-foreground text-right">CUP</th>
                <th className="py-2 px-3 font-black uppercase tracking-widest text-[10px] text-muted-foreground">Modo</th>
                <th className="py-2 px-3 font-black uppercase tracking-widest text-[10px] text-muted-foreground text-right">Comisión</th>
                <th className="py-2 px-3 font-black uppercase tracking-widest text-[10px] text-muted-foreground text-right">Preview</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">Sin productos</td></tr>
              ) : filteredProducts.map((p) => {
                const cfg = productConfigs[p.id];
                const cupPrice = priceInCup(p);
                const preview = cfg?.amount != null && cfg.amount > 0
                  ? cfg.mode === 'per_unit' ? cfg.amount : cfg.amount
                  : 0;
                return (
                  <tr key={p.id} className={cn('border-b border-border/30 hover:bg-muted/20', cfg?.amount && 'bg-primary/5')}>
                    <td className="py-2 px-3">
                      <div className="font-bold text-foreground text-xs">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.sku || '—'} · {p.category || '—'} · Stock: {p.stock_current}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      <div className="font-bold text-foreground">{p.price}</div>
                      <div className="text-[10px] text-muted-foreground">{p.price_currency}</div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-muted-foreground">
                      {p.price_currency === 'CUP' ? '—' : cupPrice.toFixed(2)}
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={cfg?.mode || 'per_unit'}
                        onChange={(e) => updateConfig(p.id, { mode: e.target.value as 'per_sale' | 'per_unit' })}
                        className="h-9 px-2 rounded-lg border border-border bg-background text-[10px] font-bold min-h-[36px] text-foreground"
                      >
                        <option value="per_unit">Por unidad</option>
                        <option value="per_sale">Por venta</option>
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={cfg?.amount ?? ''}
                        onChange={(e) => updateConfig(p.id, { amount: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="0"
                        className="w-24 h-9 px-2 text-right rounded-lg border border-border bg-background text-xs font-mono font-bold min-h-[36px] text-foreground focus:border-primary focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      {preview > 0 ? (
                        <span className="text-primary font-bold">
                          {cfg.mode === 'per_unit' ? `${preview}/u` : `${preview}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
// TAB 3: Pagos
// ════════════════════════════════════════════════════════════════════
function PaymentsTab({ payments, onRefresh }: any) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer' | 'zelle'>('cash');
  const [payCurrency, setPayCurrency] = useState('CUP');
  // FIX-B2 (2026-07-12): exchange_rate para conversión correcta a CUP
  const [payRate, setPayRate] = useState('1.0');
  const statusLabels: Record<string, { label: string; color: string }> = {
    draft: { label: 'Borrador', color: 'bg-muted text-muted-foreground border-border' },
    approved: { label: 'Aprobado', color: 'bg-primary/15 text-primary border-primary/30' },
    paid: { label: 'Pagado', color: 'bg-success/15 text-success border-success/30' },
    cancelled: { label: 'Cancelado', color: 'bg-destructive/15 text-destructive border-destructive/30' },
  };

  const handleAction = async (id: string, action: 'approve' | 'pay' | 'cancel', method?: string, currency?: string, rate?: number) => {
    try {
      // FIX-C2 (2026-07-14): usar apiFetch con token JWT (antes fetch crudo → 401 en producción)
      const { apiFetch } = await import('@/lib/api-fetch');
      const { toast } = await import('sonner');
      await apiFetch(`/api/commissions/payments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, payment_method: method, currency: currency || 'CUP', exchange_rate: rate || 1.0 }),
      });
      toast.success(action === 'approve' ? 'Comisión aprobada' : action === 'pay' ? 'Comisión pagada' : 'Comisión cancelada');
      onRefresh();
      setPayingId(null);
    } catch (e: any) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Error al procesar acción');
    }
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
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground text-right">Final</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Estado</th>
                <th className="py-3 px-4 font-black uppercase tracking-widest text-xs text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">Sin pagos registrados</td></tr>
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
                    <td className="py-3 px-4 text-right font-mono font-black text-foreground">{formatCurrency(p.final_amount)}</td>
                    <td className="py-3 px-4">
                      <span className={cn('px-2 py-1 rounded-md text-xs font-bold uppercase border', s.color)}>
                        {s.label}
                      </span>
                      {p.payment_method && p.status === 'paid' && (
                        <span className="ml-1 text-xs">
                          {p.payment_method === 'cash' ? '💵' : p.payment_method === 'transfer' ? '📱' : '💳'} {p.currency}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {/* FIX-COMMISSION-PAY (2026-07-12): Acciones de aprobar/pagar/cancelar */}
                      {p.status === 'draft' && (
                        <button
                          onClick={() => handleAction(p.id, 'approve')}
                          className="px-2 py-1 rounded text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 mr-1"
                        >
                          ✓ Aprobar
                        </button>
                      )}
                      {(p.status === 'draft' || p.status === 'approved') && (
                        <button
                          onClick={() => setPayingId(payingId === p.id ? null : p.id)}
                          className="px-2 py-1 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/30 hover:bg-success/20 mr-1"
                        >
                          💰 Pagar
                        </button>
                      )}
                      {p.status !== 'cancelled' && p.status !== 'paid' && (
                        <button
                          onClick={() => handleAction(p.id, 'cancel')}
                          className="px-2 py-1 rounded text-[10px] font-black uppercase bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                        >
                          ✕
                        </button>
                      )}
                      {/* Formulario de pago */}
                      {payingId === p.id && (
                        <div className="mt-2 flex flex-col gap-1.5 p-2 rounded-lg border border-border/30 bg-muted/10">
                          <select
                            value={payMethod}
                            onChange={(e) => setPayMethod(e.target.value as any)}
                            className="h-8 bg-background border border-border/50 rounded px-2 text-xs font-bold"
                          >
                            <option value="cash">💵 Efectivo</option>
                            <option value="transfer">📱 Transferencia</option>
                            <option value="zelle">💳 Zelle</option>
                          </select>
                          <select
                            value={payCurrency}
                            onChange={(e) => {
                              setPayCurrency(e.target.value);
                              // FIX-B2: auto-set rate to 1.0 for CUP
                              if (e.target.value === 'CUP') setPayRate('1.0');
                            }}
                            className="h-8 bg-background border border-border/50 rounded px-2 text-xs font-bold"
                          >
                            <option value="CUP">CUP</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="MLC">MLC</option>
                          </select>
                          {/* FIX-B2: input de tasa de cambio para monedas no-CUP */}
                          {payCurrency !== 'CUP' && (
                            <input
                              type="number"
                              step="0.01"
                              value={payRate}
                              onChange={(e) => setPayRate(e.target.value)}
                              placeholder="Tasa CUP"
                              className="h-8 bg-background border border-border/50 rounded px-2 text-xs font-bold"
                            />
                          )}
                          <button
                            onClick={() => handleAction(p.id, 'pay', payMethod, payCurrency, parseFloat(payRate) || 1.0)}
                            className="h-8 rounded bg-success text-white text-[10px] font-black uppercase hover:opacity-90"
                          >
                            Confirmar Pago
                          </button>
                        </div>
                      )}
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
              {/* FIX-A3 (2026-07-14): removido link que navegaba fuera de la SPA.
                  El conteo de versiones se muestra abajo como info sin acción. */}
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

// ════════════════════════════════════════════════════════════════════
// v2 (2026-07-15): MODAL de creación/edición de reglas de comisión
// Soporta los 6 tipos: percentage_sales, fixed_amount, salary_based, hybrid,
// product_specific, scale_percentage
// ════════════════════════════════════════════════════════════════════
function RuleFormModal({
  storeId,
  workers,
  editingRule,
  onClose,
  onSaved,
}: {
  storeId: string;
  workers: WorkerSummary[];
  editingRule: CommissionRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    type: editingRule?.type || 'percentage_sales',
    worker_id: editingRule?.worker_id || '',
    value_percent: editingRule?.value_percent?.toString() || '',
    fixed_value: editingRule?.fixed_value?.toString() || '',
    salary_amount: editingRule?.salary_amount?.toString() || '',
    base_calculation: editingRule?.base_calculation || 'total_sales',
    priority: editingRule?.priority?.toString() || '0',
    valid_from: editingRule?.valid_from || new Date().toISOString().split('T')[0],
    valid_to: editingRule?.valid_to || '',
    // v2
    min_price: editingRule?.min_price?.toString() || '',
    max_price: editingRule?.max_price?.toString() || '',
    product_commission_amount: editingRule?.product_commission_amount?.toString() || '',
  });
  const [productIds, setProductIds] = useState<string[]>(editingRule?.product_ids || []);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; sku: string | null; price: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const updateForm = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  // Buscar productos
  const handleProductSearch = async (query: string) => {
    setProductSearch(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const data = await apiFetch(
        `/api/inventory/products?store_id=${storeId}`,
      );
      const allProducts = data.products || data || [];
      // Filtrar en el cliente por nombre o SKU
      const filtered = allProducts
        .filter((p: any) => {
          const q = query.toLowerCase();
          return (p.name || '').toLowerCase().includes(q)
              || (p.sku || '').toLowerCase().includes(q);
        })
        .slice(0, 10);
      setSearchResults(filtered);
    } catch {
      setSearchResults([]);
    }
  };

  const toggleProduct = (productId: string) => {
    setProductIds(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        store_id: storeId,
        worker_id: form.worker_id || null,
        type: form.type,
        base_calculation: form.base_calculation,
        priority: parseInt(form.priority) || 0,
        valid_from: form.valid_from,
        valid_to: form.valid_to || null,
        // v2
        min_price: form.min_price ? parseFloat(form.min_price) : null,
        max_price: form.max_price ? parseFloat(form.max_price) : null,
        product_commission_amount: form.product_commission_amount ? parseFloat(form.product_commission_amount) : null,
        // Type-specific
        value_percent: form.value_percent ? parseFloat(form.value_percent) : null,
        fixed_value: form.fixed_value ? parseFloat(form.fixed_value) : null,
        salary_amount: form.salary_amount ? parseFloat(form.salary_amount) : null,
        // v2: product_ids para product_specific
        product_ids: form.type === 'product_specific' ? productIds : [],
      };

      // Validaciones
      if (form.type === 'product_specific' && productIds.length === 0) {
        toast.error('Selecciona al menos un producto para la regla product_specific');
        setSaving(false);
        return;
      }
      if (form.type === 'scale_percentage' && !form.value_percent) {
        toast.error('Las reglas scale_percentage requieren un porcentaje');
        setSaving(false);
        return;
      }

      const url = editingRule
        ? `/api/commissions/rules/${editingRule.id}`
        : '/api/commissions/rules';
      const method = editingRule ? 'PATCH' : 'POST';

      await apiFetch(url, { method, body: JSON.stringify(payload) });
      toast.success(editingRule ? 'Regla actualizada' : 'Regla creada');
      onSaved();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingRule) return;
    if (!confirm('¿Eliminar esta regla? Esta acción no se puede deshacer.')) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/commissions/rules/${editingRule.id}`, { method: 'DELETE' });
      toast.success('Regla eliminada');
      onSaved();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card rounded-2xl border-2 border-border shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b-2 border-border p-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center border border-primary/30">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-widest text-foreground">
                {editingRule ? 'Editar regla' : 'Nueva regla de comisión'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {RULE_TYPE_LABELS[form.type] || form.type}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Tipo de regla */}
          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
              Tipo de comisión
            </label>
            <select
              value={form.type}
              onChange={(e) => updateForm('type', e.target.value)}
              className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
            >
              <option value="percentage_sales">% sobre Ventas (default)</option>
              <option value="fixed_amount">Monto Fijo</option>
              <option value="salary_based">Salario Fijo</option>
              <option value="hybrid">Híbrido (salario + %)</option>
              <option value="product_specific">Por Producto Específico (FIXED $/producto)</option>
              <option value="scale_percentage">Por Escala de Precio (%)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {form.type === 'percentage_sales' && 'Ej: 5% sobre el total de ventas. Aplica a todos los productos no cubiertos por reglas específicas.'}
              {form.type === 'fixed_amount' && 'Ej: $500 fijos sin importar las ventas.'}
              {form.type === 'salary_based' && 'Ej: $5000 de salario mensual.'}
              {form.type === 'hybrid' && 'Ej: $3000 salario + 2% sobre ventas.'}
              {form.type === 'product_specific' && 'Ej: producto X y Y generan $1000 de comisión por cada venta. Estas ventas se EXCLUYEN del cálculo % de otras reglas.'}
              {form.type === 'scale_percentage' && 'Ej: productos < $1000 → 5%, productos ≥ $1000 → 3%. Define el rango de precios y el % aplica a productos en ese rango.'}
            </p>
          </div>

          {/* Aplica a */}
          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
              Aplica a
            </label>
            <select
              value={form.worker_id}
              onChange={(e) => updateForm('worker_id', e.target.value)}
              className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
            >
              <option value="">Toda la tienda (todos los trabajadores)</option>
              {workers.map((w) => (
                <option key={w.worker_id} value={w.worker_id}>
                  {w.first_name} {w.last_name} (CI: {w.ci})
                </option>
              ))}
            </select>
          </div>

          {/* Campos específicos por tipo */}
          {form.type === 'percentage_sales' && (
            <div>
              <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                Porcentaje (%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.value_percent}
                onChange={(e) => updateForm('value_percent', e.target.value)}
                className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                placeholder="5.00"
              />
            </div>
          )}

          {form.type === 'fixed_amount' && (
            <div>
              <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                Monto fijo (CUP)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.fixed_value}
                onChange={(e) => updateForm('fixed_value', e.target.value)}
                className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                placeholder="500.00"
              />
            </div>
          )}

          {form.type === 'salary_based' && (
            <div>
              <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                Salario (CUP)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.salary_amount}
                onChange={(e) => updateForm('salary_amount', e.target.value)}
                className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                placeholder="5000.00"
              />
            </div>
          )}

          {form.type === 'hybrid' && (
            <>
              <div>
                <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                  Salario base (CUP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.salary_amount}
                  onChange={(e) => updateForm('salary_amount', e.target.value)}
                  className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                  placeholder="3000.00"
                />
              </div>
              <div>
                <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                  Porcentaje adicional (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.value_percent}
                  onChange={(e) => updateForm('value_percent', e.target.value)}
                  className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                  placeholder="2.00"
                />
              </div>
            </>
          )}

          {/* product_specific: monto por producto + selector */}
          {form.type === 'product_specific' && (
            <>
              <div>
                <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                  Comisión por venta de cada producto (CUP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.product_commission_amount}
                  onChange={(e) => updateForm('product_commission_amount', e.target.value)}
                  className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                  placeholder="1000.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Cada venta de los productos seleccionados generará este monto fijo. El precio y la cantidad no afectan la comisión.
                </p>
              </div>

              {/* Selector de productos */}
              <div>
                <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                  Productos asociados ({productIds.length})
                </label>
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => handleProductSearch(e.target.value)}
                  placeholder="Buscar producto por nombre o SKU..."
                  className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground mb-2"
                />
                {/* Resultados de búsqueda */}
                {searchResults.length > 0 && (
                  <div className="bg-muted/30 rounded-lg border border-border max-h-40 overflow-y-auto mb-2">
                    {searchResults.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          toggleProduct(p.id);
                          setProductSearch('');
                          setSearchResults([]);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b border-border/30 last:border-0"
                      >
                        <div className="text-sm font-bold text-foreground">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          SKU: {p.sku || '—'} · Precio: {formatCurrency(p.price || 0)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {/* Lista de productos seleccionados */}
                {productIds.length > 0 && (
                  <div className="space-y-1">
                    {productIds.map(pid => {
                      const prod = (editingRule?.products || []).find((p: any) => p.id === pid);
                      return (
                        <div key={pid} className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">
                          <span className="text-sm font-bold text-foreground">
                            {prod?.name || `Producto ${pid.substring(0, 8)}...`}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleProduct(pid)}
                            className="p-1 rounded hover:bg-destructive/10 text-destructive"
                            aria-label="Quitar producto"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* scale_percentage: rango de precios + % */}
          {form.type === 'scale_percentage' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                    Precio mínimo (CUP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.min_price}
                    onChange={(e) => updateForm('min_price', e.target.value)}
                    className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                    Precio máximo (CUP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.max_price}
                    onChange={(e) => updateForm('max_price', e.target.value)}
                    className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                    placeholder="Vacío = sin límite"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                  Porcentaje aplicado al rango (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.value_percent}
                  onChange={(e) => updateForm('value_percent', e.target.value)}
                  className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
                  placeholder="5.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ej: min=0, max=999.99, %=5 → productos hasta $999.99 ganan 5%. Crea otra regla para el siguiente rango.
                </p>
              </div>
            </>
          )}

          {/* Base de cálculo (solo para tipos %) */}
          {(form.type === 'percentage_sales' || form.type === 'hybrid' || form.type === 'scale_percentage') && (
            <div>
              <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                Base de cálculo
              </label>
              <select
                value={form.base_calculation}
                onChange={(e) => updateForm('base_calculation', e.target.value)}
                className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
              >
                <option value="total_sales">Total ventas (cash + transfer)</option>
                <option value="cash_sales">Solo ventas en efectivo</option>
                <option value="transfer_sales">Solo ventas por transferencia</option>
                <option value="net_sales">Ventas netas (v1 = total)</option>
              </select>
            </div>
          )}

          {/* Prioridad */}
          <div>
            <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
              Prioridad (mayor = más específica)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={form.priority}
              onChange={(e) => updateForm('priority', e.target.value)}
              className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-base font-black font-mono min-h-[44px] text-foreground"
              placeholder="0"
            />
          </div>

          {/* Vigencia */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                Vigente desde
              </label>
              <input
                type="date"
                value={form.valid_from}
                onChange={(e) => updateForm('valid_from', e.target.value)}
                className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
              />
            </div>
            <div>
              <label className="text-sm font-black uppercase tracking-widest text-foreground block mb-2">
                Vigente hasta (vacío = sin fin)
              </label>
              <input
                type="date"
                value={form.valid_to}
                onChange={(e) => updateForm('valid_to', e.target.value)}
                className="w-full h-12 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] text-foreground"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t-2 border-border p-4 flex items-center justify-between gap-2">
          <div>
            {editingRule && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-destructive/10 text-destructive border border-destructive/30 text-sm font-bold hover:bg-destructive/20 min-h-[44px]"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-bold min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Guardando...' : (editingRule ? 'Actualizar' : 'Crear regla')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// v2 (2026-07-15): MODAL de edición de trabajador
// ════════════════════════════════════════════════════════════════════
function EditWorkerModal({
  worker,
  onClose,
  onSaved,
}: {
  worker: WorkerSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    first_name: worker.first_name || '',
    last_name: worker.last_name || '',
    ci: worker.ci || '',
    gender: '',
    address: '',
    province: '',
    municipality: '',
    shirt_size: '',
    shoe_size: '',
    waist_size: '',
    status: worker.status || 'active',
  });
  const [saving, setSaving] = useState(false);
  const [ciError, setCiError] = useState('');

  // Cargar datos completos del trabajador al montar
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch(`/api/workers/${worker.worker_id}`);
        if (data.worker) {
          const w = data.worker;
          setForm({
            first_name: w.first_name || '',
            last_name: w.last_name || '',
            ci: w.ci || '',
            gender: w.gender || '',
            address: w.address || '',
            province: w.province || '',
            municipality: w.municipality || '',
            shirt_size: w.shirt_size || '',
            shoe_size: w.shoe_size?.toString() || '',
            waist_size: w.waist_size?.toString() || '',
            status: w.status || 'active',
          });
        }
      } catch (e) {
        // silencioso — usar defaults del summary
      }
    })();
  }, [worker.worker_id]);

  const updateForm = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (key === 'ci') setCiError('');
  };

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('Nombre y apellidos son obligatorios');
      return;
    }
    if (!form.ci || form.ci.length !== 11) {
      setCiError('CI debe tener 11 dígitos');
      toast.error('CI debe tener 11 dígitos');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        ci: form.ci.trim(),
        status: form.status,
      };
      if (form.gender) payload.gender = form.gender;
      if (form.address) payload.address = form.address;
      if (form.province) payload.province = form.province;
      if (form.municipality) payload.municipality = form.municipality;
      if (form.shirt_size) payload.shirt_size = form.shirt_size;
      if (form.shoe_size) payload.shoe_size = parseInt(form.shoe_size) || null;
      if (form.waist_size) payload.waist_size = parseInt(form.waist_size) || null;

      await apiFetch(`/api/workers/${worker.worker_id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success(`Trabajador "${form.first_name} ${form.last_name}" actualizado`);
      onSaved();
    } catch (e: any) {
      toast.error('Error actualizando: ' + e.message);
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
              <Edit3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-widest text-foreground">
                Editar trabajador
              </h3>
              <p className="text-sm text-muted-foreground">
                {worker.first_name} {worker.last_name} · CI: {worker.ci}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Datos personales */}
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Datos personales</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest">Nombre *</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => updateForm('first_name', e.target.value)}
                  className="h-11 min-h-[44px] mt-1"
                  placeholder="Nombre"
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest">Apellidos *</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => updateForm('last_name', e.target.value)}
                  className="h-11 min-h-[44px] mt-1"
                  placeholder="Apellidos"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest">CI (11 dígitos) *</Label>
                <Input
                  value={form.ci}
                  onChange={(e) => updateForm('ci', e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className={cn('h-11 min-h-[44px] mt-1 font-mono', ciError && 'border-destructive')}
                  placeholder="00000000000"
                  inputMode="numeric"
                />
                {ciError && <p className="text-xs text-destructive mt-1">{ciError}</p>}
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest">Género</Label>
                <select
                  value={form.gender}
                  onChange={(e) => updateForm('gender', e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] mt-1 text-foreground"
                >
                  <option value="">No especificar</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="other">Otro</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dirección */}
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Dirección</p>
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest">Calle y número</Label>
              <Input
                value={form.address}
                onChange={(e) => updateForm('address', e.target.value)}
                className="h-11 min-h-[44px] mt-1"
                placeholder="Calle 10 #25 entre 3ra y 5ta"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest">Provincia</Label>
                <Input
                  value={form.province}
                  onChange={(e) => updateForm('province', e.target.value)}
                  className="h-11 min-h-[44px] mt-1"
                  placeholder="Las Tunas"
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest">Municipio</Label>
                <Input
                  value={form.municipality}
                  onChange={(e) => updateForm('municipality', e.target.value)}
                  className="h-11 min-h-[44px] mt-1"
                  placeholder="Puerto Padre"
                />
              </div>
            </div>
          </div>

          {/* Tallas */}
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Tallas (opcional)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest">Camisa</Label>
                <select
                  value={form.shirt_size}
                  onChange={(e) => updateForm('shirt_size', e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border-2 border-border bg-background text-sm font-bold min-h-[44px] mt-1 text-foreground"
                >
                  <option value="">—</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest">Zapato</Label>
                <Input
                  type="number"
                  value={form.shoe_size}
                  onChange={(e) => updateForm('shoe_size', e.target.value)}
                  className="h-11 min-h-[44px] mt-1 font-mono"
                  placeholder="42"
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest">Cintura</Label>
                <Input
                  type="number"
                  value={form.waist_size}
                  onChange={(e) => updateForm('waist_size', e.target.value)}
                  className="h-11 min-h-[44px] mt-1 font-mono"
                  placeholder="32"
                />
              </div>
            </div>
          </div>

          {/* Estado */}
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Estado del trabajador</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateForm('status', 'active')}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 min-h-[44px]',
                  form.status === 'active'
                    ? 'border-success bg-success/10 text-success'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                )}
              >
                <UserCheck className="w-4 h-4" />
                <span className="text-sm font-black uppercase tracking-wider">Activo</span>
              </button>
              <button
                type="button"
                onClick={() => updateForm('status', 'inactive')}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 min-h-[44px]',
                  form.status === 'inactive'
                    ? 'border-warning bg-warning/10 text-warning'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                )}
              >
                <UserX className="w-4 h-4" />
                <span className="text-sm font-black uppercase tracking-wider">Inactivo</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground italic">
              Un trabajador inactivo no aparece en cálculos de comisión ni puede recibir pagos nuevos, pero su histórico se conserva.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t-2 border-border p-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-bold min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.first_name.trim() || !form.last_name.trim() || form.ci.length !== 11}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 min-h-[44px] flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkersView;
