'use client';

/**
 * RecommendedActions — "Acciones recomendadas" del Inicio.
 *
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions) — FASE 12/13/14:
 *
 * Cuando NO hay acciones recientes, el bloque se convierte automáticamente
 * en Acciones recomendadas (nunca queda un espacio vacío). Las
 * recomendaciones combinan:
 *
 *   1. CONTEXTO REAL (datos ya cargados — FASE 20):
 *      - Productos bajo mínimo (useProducts — cache compartida con
 *        DashboardAlertsSection) → "Revisar stock bajo" con conteo.
 *      - Turno de caja cerrado (useActiveShift, consultado SOLO para roles
 *        con acciones de caja) → "Revisar caja".
 *      - Carrito pendiente (Zustand — sin consultas) → "Retomar venta".
 *   2. ROL + PERMISOS (FASE 13): perfiles admin / manager-encargado /
 *      ventas (usuario, clerk) / almacén (warehouse) / costo. Nunca se
 *      muestra una acción que el usuario no pueda ejecutar: cada
 *      candidato pasa por el guard canónico isViewAllowedForRole
 *      (sidebar.structure — el mismo que aplica TerminalShell al render)
 *      y, cuando aplica, por la lista de roles de la entrada canónica
 *      (hasRole — jerarquía certificada de src/lib/roles.ts).
 *
 * Destinos: SIEMPRE vistas existentes (ViewType canónicos) vía
 * setCurrentView — cero rutas nuevas (FASE 14: "la recomendación debe
 * llevar al destino real existente").
 *
 * Máximo 4 recomendaciones visibles. Señales sin base de datos local
 * (inventario sin conteo reciente, ventas sin reporte) se documentan como
 * no disponibles sin inventar datos.
 */

import { useMemo } from 'react';
import {
  Sparkles,
  ShoppingCart,
  ReceiptText,
  RotateCcw,
  Banknote,
  Package,
  PackagePlus,
  ClipboardList,
  BarChart3,
  Users,
  Wallet,
  LayoutDashboard,
  FileSpreadsheet,
  Layers,
  Calculator,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore, useUIStore, type ViewType } from '@/store';
import { useCartStore } from '@/store/cart';
import { useProducts } from '@/hooks/api/useProducts';
import { useActiveShift } from '@/hooks/api/useActiveShift';
import { isViewAllowedForRole } from '@/config/navigation/sidebar.structure';
import { hasRole } from '@/lib/roles';

const MAX_RECOMMENDATIONS = 4;

interface RecommendedAction {
  id: string;
  label: string;
  reason?: string;
  icon: LucideIcon;
  view: ViewType;
  /** Roles canónicos de la entrada (ACTION_EXTENSIONS) — además del guard. */
  allowedRoles?: string[];
  priority: number; // menor = antes
}

type Profile = 'admin' | 'manager' | 'ventas' | 'almacen' | 'costo' | 'generic';

function resolveProfile(effectiveRoles: string[]): Profile {
  // Prioridad certificada (ROLES_HIERARCHY): admin > manager > encargado > …
  if (effectiveRoles.includes('admin')) return 'admin';
  if (effectiveRoles.includes('manager') || effectiveRoles.includes('encargado')) return 'manager';
  if (effectiveRoles.includes('clerk') || effectiveRoles.includes('usuario')) return 'ventas';
  if (effectiveRoles.includes('warehouse')) return 'almacen';
  if (effectiveRoles.includes('costo')) return 'costo';
  return 'generic';
}

export default function RecommendedActions({ className }: { className?: string }) {
  const user = useAuthStore((s) => s.user);
  const activeStoreId = useAuthStore((s) => s.user?.activeStoreId);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  // Contexto real (FASE 14) — fuentes ya cargadas o gated por rol (FASE 20).
  const { data: products } = useProducts(activeStoreId);
  const cartItems = useCartStore((s) => s.items);
  const cartStoreId = useCartStore((s) => s.storeId);

  const effectiveRoles = useMemo(() => {
    const roles = new Set<string>();
    if (user?.role) roles.add(user.role);
    (user?.roles ?? []).forEach((r) => roles.add(r));
    (user?.memberships ?? []).forEach((m) => {
      if ((m as { status?: string }).status === 'active') roles.add(m.role);
    });
    return [...roles];
  }, [user]);

  const profile = resolveProfile(effectiveRoles);

  // El turno de caja solo interesa a perfiles con acciones de caja (FASE 20).
  const shiftRelevant = profile === 'ventas' || profile === 'manager';
  const { data: activeShift, isLoading: shiftLoading } = useActiveShift(activeStoreId, {
    enabled: shiftRelevant,
  });

  const lowStockCount = useMemo(() => {
    if (!products) return 0;
    return products.filter((p) => (p.stock_current ?? 0) <= (p.min_stock ?? 0)).length;
  }, [products]);

  const cartCount =
    cartStoreId && cartStoreId === activeStoreId ? cartItems.length : 0;

  const recommendations = useMemo(() => {
    const candidates: RecommendedAction[] = [];

    // ── Contextuales primero (FASE 14) ───────────────────────────────────
    if (lowStockCount > 0) {
      candidates.push({
        id: 'low-stock',
        label: 'Revisar stock bajo',
        reason: `${lowStockCount} ${lowStockCount === 1 ? 'producto requiere' : 'productos requieren'} atención`,
        icon: Package,
        view: 'inventory',
        priority: 0,
      });
    }
    if (cartCount > 0 && (profile === 'ventas' || profile === 'manager' || profile === 'admin')) {
      candidates.push({
        id: 'cart-pending',
        label: 'Retomar venta en curso',
        reason: `Tienes ${cartCount} ${cartCount === 1 ? 'artículo' : 'artículos'} en el carrito`,
        icon: ShoppingCart,
        view: 'pos',
        priority: 1,
      });
    }
    if (shiftRelevant && !shiftLoading && !activeShift) {
      candidates.push({
        id: 'open-shift',
        label: 'Revisar caja',
        reason: 'No hay turno de caja abierto',
        icon: Banknote,
        view: 'cash',
        priority: 2,
      });
    }

    // ── Por rol (FASE 13) — listas priorizadas, máx relevantes ───────────
    const push = (a: Omit<RecommendedAction, 'priority'>) =>
      candidates.push({ ...a, priority: candidates.length + 10 });

    switch (profile) {
      case 'admin':
        push({ id: 'sales-report', label: 'Ver reporte de ventas', icon: BarChart3, view: 'reports' });
        push({ id: 'receivables', label: 'Revisar cuentas por cobrar', icon: Wallet, view: 'accounts_receivable' });
        if (lowStockCount === 0) {
          push({ id: 'inventory', label: 'Revisar inventario', icon: Package, view: 'inventory' });
        }
        push({ id: 'users', label: 'Gestionar usuarios', icon: Users, view: 'users' });
        break;
      case 'manager':
        if (lowStockCount === 0) {
          push({ id: 'inventory', label: 'Revisar inventario', icon: Package, view: 'inventory' });
        }
        push({ id: 'sales', label: 'Ver ventas', icon: ReceiptText, view: 'sales' });
        push({
          id: 'reception',
          label: 'Registrar entrada',
          icon: PackagePlus,
          view: 'recepcion',
          allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'],
        });
        if (!candidates.some((c) => c.id === 'open-shift')) {
          push({ id: 'cash', label: 'Revisar caja', icon: Banknote, view: 'cash' });
        }
        break;
      case 'ventas':
        if (!candidates.some((c) => c.id === 'cart-pending')) {
          push({ id: 'new-sale', label: 'Nueva venta', icon: ShoppingCart, view: 'pos' });
        }
        push({ id: 'sales-history', label: 'Historial de ventas', icon: ReceiptText, view: 'sales' });
        push({ id: 'devolutions', label: 'Devoluciones', icon: RotateCcw, view: 'devolutions' });
        if (!candidates.some((c) => c.id === 'open-shift')) {
          push({ id: 'cash', label: 'Caja', icon: Banknote, view: 'cash' });
        }
        break;
      case 'almacen':
        if (lowStockCount === 0) {
          push({ id: 'stock-current', label: 'Stock actual', icon: Package, view: 'inventory' });
        }
        push({ id: 'count', label: 'Realizar conteo', icon: ClipboardList, view: 'inventory_count' });
        push({
          id: 'reception',
          label: 'Registrar entrada',
          icon: PackagePlus,
          view: 'recepcion',
          allowedRoles: ['admin', 'manager', 'encargado', 'warehouse'],
        });
        break;
      case 'costo':
        push({ id: 'cost-sheets', label: 'Hojas de costo', icon: FileSpreadsheet, view: 'cost-sheets' });
        push({ id: 'cost-structure', label: 'Estructura de costo', icon: Layers, view: 'estructura-costo' });
        push({ id: 'cost-dynamic', label: 'Costeo dinámico', icon: Calculator, view: 'costeo-dinamico' });
        break;
      case 'generic':
      default:
        push({ id: 'store-dashboard', label: 'Ver dashboard de la tienda', icon: LayoutDashboard, view: 'store-dashboard' });
        break;
    }

    // Dedupe por destino (la primera aparición gana) + filtro de permisos
    // (FASE 13: nunca mostrar acciones que el usuario no pueda ejecutar).
    const seen = new Set<ViewType>();
    return candidates
      .sort((a, b) => a.priority - b.priority)
      .filter((c) => {
        if (seen.has(c.view)) return false;
        if (!isViewAllowedForRole(c.view, user?.role)) return false;
        if (c.allowedRoles && !c.allowedRoles.some((r) => hasRole(user, r))) return false;
        seen.add(c.view);
        return true;
      })
      .slice(0, MAX_RECOMMENDATIONS);
  }, [profile, lowStockCount, cartCount, shiftRelevant, shiftLoading, activeShift, user]);

  return (
    <section
      className={className}
      aria-label="Acciones recomendadas"
      data-testid="recent-activity-empty"
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-3.5 h-3.5 text-muted-foreground/50" aria-hidden="true" />
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
          Acciones recomendadas
        </h3>
      </div>

      {recommendations.length === 0 ? (
        <p className="text-xs text-muted-foreground/40 py-6 text-center border border-dashed border-border/60 rounded-xl">
          Pídele algo a Darian y aparecerá aquí para retomarla.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="recommended-actions-list">
          {recommendations.map((rec) => {
            const Icon = rec.icon;
            return (
              <li key={rec.id}>
                <button
                  type="button"
                  onClick={() => setCurrentView(rec.view)}
                  className="
                    w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl
                    border border-border/70 bg-card/40 hover:bg-muted/40
                    active:scale-[0.99] transition-all text-left
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  "
                  data-testid={`recommended-action-${rec.id}`}
                >
                  <span className="text-base leading-none shrink-0 text-muted-foreground" aria-hidden="true">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-foreground truncate">{rec.label}</span>
                    {rec.reason && (
                      <span className="block text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                        {rec.reason}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
