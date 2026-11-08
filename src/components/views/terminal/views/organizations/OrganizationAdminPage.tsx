'use client';

/**
 * CP-UX-ORG-STORES-002 — OrganizationAdminPage: página DEDICADA de
 * administración de una organización (sustituye el acceso por modal).
 *
 * ENTRADA (misión §2.A): SISTEMA → Organizaciones → tres puntos de la
 * organización → «Tiendas» (o «Clientes y Proveedores») → navega a esta
 * página (nunca un modal/drawer superpuesto).
 *
 * CONTEXTO EN LA URL: /?view=organization-detail&org=<uuid>&tab=<tiendas|terceros>
 * (useViewUrlSync) — refresh, deep-link y Back/Forward restauran la
 * organización y la pestaña. La autorización NO depende de la URL: cada API
 * valida el alcance server-side (superadmin todas / admin su empresa / otros
 * 403-404); un orgId manipulado solo produce un error de carga o un 404.
 *
 * PESTAÑAS (ambas reutilizan los módulos existentes — cero duplicación):
 *  · Tiendas          → StoresManagementView scoped a la organización
 *                       (misma vista del hub, autorización server-side por
 *                       organization_id — misión CP-UX-ORG-STORES-001).
 *  · Clientes y       → ClientesProveedoresView (Clasificador Maestro) con
 *    Proveedores        tienda ANCLA de la organización: la identidad del
 *                       tercero ya vive por organización (master_parties
 *                       .tenant_id) y las RPCs derivan el tenant de la
 *                       tienda pasada, por lo que la autorización y las
 *                       reglas de negocio son EXACTAMENTE las del módulo
 *                       de Operación (acceso OPERACIÓN intacto y sin props).
 *
 * SIN DATOS RESIDUALES: todo el contenido depende de useOrganizationDetail
 * (query key ['organization-detail', orgId]) — al cambiar de organización la
 * clave cambia y, mientras carga, se muestra skeleton (nunca datos de la org
 * anterior). Las caches hijas quedan separadas por org:<id> / storeId.
 */

import React, { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Building2, Store, Users, AlertTriangle, RefreshCw, Loader2, Store as StoreIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useUIStore } from '@/store';
import { isAdminLevel } from '@/lib/roles';
import { useOrganizationDetail } from '@/hooks/api/useOrganizations';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { OrganizationDetailTab } from '@/store';

// Sub-vistas (módulos existentes, no se reconstruyen). Lazy como en el hub.
const StoresManagementView = dynamic(() => import('@/components/views/terminal/views/stores/StoresManagementView'), { ssr: false });
const ClientesProveedoresView = dynamic(() => import('@/components/views/terminal/views/classifier/ClientesProveedoresView').then(m => ({ default: m.ClientesProveedoresView })), { ssr: false });
// Dashboard avanzado por tienda — overlay de la tarjeta «Ver Dashboard» del
// tab Tiendas (position:fixed, anfitrión movido del modal a esta página).
const StoreDashboardView = dynamic(
  () => import('@/components/views/terminal/views/dashboard/StoreDashboardView'),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    ),
  }
);

const TABS: Array<{ id: OrganizationDetailTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'tiendas', label: 'Tiendas', icon: Store },
  { id: 'terceros', label: 'Clientes y Proveedores', icon: Users },
];

export default function OrganizationAdminPage() {
  const { user } = useAuthStore();
  const setCurrentView = useUIStore(s => s.setCurrentView);
  const { orgId, tab } = useUIStore(s => s.organizationDetailState);
  const setOrganizationDetailTab = useUIStore(s => s.setOrganizationDetailTab);

  const isAuthorizedViewer = isAdminLevel(user?.role);

  // Sin contexto (entrada directa sin org) → listado de organizaciones.
  // Sin permisos de administración → estado denegado (el listado de
  // organizaciones es admin-only y sus APIs responden 403/404 server-side).
  useEffect(() => {
    if (!isAuthorizedViewer || !orgId) {
      setCurrentView('organizations');
    }
  }, [isAuthorizedViewer, orgId, setCurrentView]);

  const { data, isLoading, isError, error, refetch, isFetching } = useOrganizationDetail(
    isAuthorizedViewer ? orgId : null,
  );

  const org = data?.organization;
  const stores = data?.stores || [];

  // Tienda ANCLA para el contexto operativo del Clasificador Maestro:
  // preferimos una tienda ACTIVA CONECTADA al catálogo de la organización
  // (el maestro es por organización y la RPC exige acceso a una tienda);
  // si no hay ninguna conectada, la primera activa (la vista mostrará su
  // estado de conexión real — sin fingir alcance que no existe).
  const anchorStore = useMemo(() => {
    const active = stores.filter(s => s.is_active && !s.is_archived);
    return (
      active.find(s => s.classifier_connected) ??
      active[0] ??
      stores[0] ??
      null
    );
  }, [stores]);

  // WAI-APG tabs (roving tabindex + flechas) — mismo patrón del hub.
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = TABS.findIndex(t => t.id === tab);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % TABS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = TABS[nextIndex];
    if (next) setOrganizationDetailTab(next.id);
  };

  const goBackToList = () => setCurrentView('organizations');

  // Dashboard avanzado por tienda (overlay del tab Tiendas)
  const [dashboardStore, setDashboardStore] = useState<{ id: string; name: string } | null>(null);

  // ── Guard: sin autorización de administración ──
  if (!isAuthorizedViewer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-destructive/30 rounded-xl bg-destructive/5 px-4">
        <AlertTriangle className="w-12 h-12 text-destructive/60 mb-4" aria-hidden="true" />
        <p className="font-black uppercase tracking-widest text-sm text-destructive mb-2">No autorizado</p>
        <p className="text-sm text-muted-foreground font-bold max-w-md">
          La administración de organizaciones está reservada a administradores.
        </p>
      </div>
    );
  }

  // ── Guard: sin organización en el contexto (redirigiendo) ──
  if (!orgId) {
    return (
      <div className="py-24 flex items-center justify-center" role="status" aria-label="Redirigiendo a Organizaciones">
        <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Encabezado de contexto de la organización ── */}
      <div className="border-b border-border pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={goBackToList}
                className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Volver al listado de organizaciones"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                SISTEMA · Organizaciones
              </button>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase flex items-center gap-2 min-w-0">
              <Building2 className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
              <span className="truncate">{org ? org.name : 'Organización'}</span>
            </h2>
            {org && (
              <p className="text-xs text-muted-foreground mt-1">
                Administración de la organización — tiendas y terceros asociados
                {isFetching ? ' · actualizando…' : ''}
              </p>
            )}
          </div>
          {org && (
            <div className="flex items-center gap-2">
              <span className={cn('px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest', org.is_active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                {org.is_active ? 'Activa' : 'Inactiva'}
              </span>
              <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary">
                {org.plan}
              </span>
              <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-muted text-muted-foreground">
                {stores.length} tienda(s)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Estados de carga / error ── */}
      {isLoading && (
        <div className="space-y-4" role="status" aria-label="Cargando organización">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/40 p-8 text-center space-y-3" role="alert">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto" aria-hidden="true" />
          <p className="text-sm font-black uppercase tracking-widest text-destructive">No se pudo cargar la organización</p>
          <p className="text-xs text-muted-foreground font-bold">
            {error instanceof Error ? error.message : 'Error desconocido'} — puede que la organización no exista,
            esté fuera de tu alcance o haya sido eliminada.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 uppercase text-xs font-black tracking-widest">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Reintentar
            </Button>
            <Button variant="outline" size="sm" onClick={goBackToList} className="uppercase text-xs font-black tracking-widest">
              Volver a Organizaciones
            </Button>
          </div>
        </div>
      )}

      {/* ── Contenido (solo con la org del contexto cargada — sin datos residuales) ── */}
      {!isLoading && !isError && org && (
        <>
          {/* Pestañas WAI-APG (patrón del producto: tabs con roving tabindex) */}
          <div className="border-b border-border">
            <div className="flex gap-1 -mb-px overflow-x-auto" role="tablist" aria-label="Secciones de la organización">
              {TABS.map((t, index) => {
                const Icon = t.icon;
                const isActive = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`org-panel-${t.id}`}
                    id={`org-tab-${t.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setOrganizationDetailTab(t.id)}
                    onKeyDown={handleTabKeyDown}
                    className={cn(
                      'flex items-center gap-2 px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-0',
                      isActive
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            role="tabpanel"
            id={`org-panel-${tab}`}
            aria-labelledby={`org-tab-${tab}`}
          >
            {tab === 'tiendas' && (
              <StoresManagementView
                organization={{ id: org.id, name: org.name }}
                onOpenDashboard={setDashboardStore}
              />
            )}

            {tab === 'terceros' && (
              stores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border rounded-xl bg-muted/10 px-4">
                  <StoreIcon className="w-14 h-14 text-muted-foreground/30 mb-4" aria-hidden="true" />
                  <p className="font-black uppercase tracking-widest text-sm text-foreground mb-2">
                    Esta organización no tiene tiendas
                  </p>
                  <p className="text-sm text-muted-foreground font-bold max-w-md">
                    El Clasificador Maestro de terceros se ancla en una tienda de la organización:
                    crea la primera tienda desde la pestaña Tiendas para administrar clientes y proveedores.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOrganizationDetailTab('tiendas')}
                    className="mt-5 uppercase text-xs font-black tracking-widest"
                  >
                    Ir a la pestaña Tiendas
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Contexto operativo del módulo: la tienda ancla de la
                      organización (la identidad de los terceros es de la
                      ORGANIZACIÓN; el módulo la deriva de esta tienda). */}
                  {anchorStore && (
                    <div
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5"
                      role="note"
                      aria-label={`Contexto operativo: catálogo de terceros anclado en la tienda ${anchorStore.name}`}
                    >
                      <StoreIcon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                      <p className="text-xs font-black uppercase tracking-widest text-foreground">
                        Catálogo de <span className="text-primary">{org.name}</span> · contexto operativo:{' '}
                        <span className="text-primary">{anchorStore.name}</span>
                      </p>
                    </div>
                  )}
                  <ClientesProveedoresView storeId={anchorStore?.id ?? null} />
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* Dashboard avanzado overlay — «Ver Dashboard» desde una tarjeta del tab Tiendas */}
      {dashboardStore && (
        <StoreDashboardView
          storeId={dashboardStore.id}
          storeName={dashboardStore.name}
          onClose={() => setDashboardStore(null)}
        />
      )}
    </div>
  );
}
