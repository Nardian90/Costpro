'use client';

/**
 * CP-UX-ORG-STORES-002/003 — OrganizationAdminPage: página DEDICADA de
 * administración de una organización («Administración de la organización»).
 *
 * 003 — CONSOLIDACIÓN: absorbe la TOTALIDAD de las pestañas del antiguo
 * modal «Ver detalle» (Resumen, Catálogo Maestro, Usuarios, Configuración),
 * que se elimina del producto. Centro ÚNICO de administración:
 *
 *   Tiendas                 → StoresManagementView scoped (server-side por org)
 *   Clientes y Proveedores  → ClientesProveedoresView con tienda ANCLA
 *   Catálogo Maestro        → CatalogGovernanceSection (gobernanza del
 *                             catálogo compartido de la organización)
 *   Resumen                 → identidad/estado/propietario/recuentos
 *   Usuarios                → listado de perfiles asignados (solo lectura;
 *                             la asignación vive en su módulo de SISTEMA)
 *   Configuración           → datos soportados + edición (OrganizationFormModal)
 *
 * ENTRADA: SISTEMA → Organizaciones → tres puntos → «Administración de la
 * organización» (o los accesos directos «Tiendas»/«Clientes y Proveedores»,
 * que abren ESTA MISMA página en la pestaña correspondiente — no existen
 * segundas implementaciones). Nunca un modal/drawer superpuesto.
 *
 * CONTEXTO EN LA URL: /?view=organization-detail&org=<uuid>&tab=<pestaña>
 * (useViewUrlSync; pestaña desconocida → 'tiendas'). La autorización NO
 * depende de la URL: cada API/RPC valida server-side (403/404).
 *
 * SIN DATOS RESIDUALES: todo depende de useOrganizationDetail
 * (['organization-detail', orgId]) — cambio de org → nueva clave →
 * skeleton mientras carga (nunca datos de la org anterior).
 */

import React, { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft, Building2, Store, Users, AlertTriangle, RefreshCw, Loader2,
  Store as StoreIcon, Package, LayoutDashboard, Settings,
} from 'lucide-react';
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
// CP-UX-ORG-STORES-003: pestañas absorbidas del antiguo «Ver detalle».
// CatalogGovernanceSection ya era el contenido del tab «Catálogo» del modal —
// mismos hooks (useMasterCatalog) y misma autorización server-side (RPCs
// SECURITY DEFINER + RLS SELECT). Cero duplicación de gobernanza.
const CatalogGovernanceSection = dynamic(() => import('@/components/views/terminal/views/organizations/CatalogGovernanceSection').then(m => ({ default: m.CatalogGovernanceSection })), { ssr: false });
// Edición de la organización (mismo formulario que usa el listado).
const OrganizationFormModal = dynamic(() => import('@/components/views/terminal/views/organizations/OrganizationFormModal').then(m => ({ default: m.OrganizationFormModal })), { ssr: false });
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
  { id: 'catalogo', label: 'Catálogo Maestro', icon: Package },
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
];

export default function OrganizationAdminPage() {
  const { user } = useAuthStore();
  const setCurrentView = useUIStore(s => s.setCurrentView);
  const { orgId, tab } = useUIStore(s => s.organizationDetailState);
  const setOrganizationDetailTab = useUIStore(s => s.setOrganizationDetailTab);

  const isAuthorizedViewer = isAdminLevel(user?.role);

  // Edición de la organización (absorbida del modal: «Editar configuración»).
  const [editOpen, setEditOpen] = useState(false);

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
                Administración de la organización — tiendas, terceros, catálogo y configuración
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
          {/* Pestañas WAI-APG (patrón del producto: tabs con roving tabindex;
              desplazamiento horizontal controlado para 6 secciones). */}
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

            {tab === 'catalogo' && (
              <CatalogGovernanceSection
                orgId={org.id}
                stores={stores.map(s => ({ id: s.id, name: s.name, is_active: s.is_active, is_archived: s.is_archived }))}
              />
            )}

            {tab === 'resumen' && (
              /* Absorbida del modal «Ver detalle»: identidad, estado,
                 propietario y recuentos reales (misma query del detalle). */
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</dt>
                  <dd className="font-bold">{org.name}</dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</dt>
                  <dd>
                    <span className={cn('px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest', org.is_active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                      {org.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Propietario</dt>
                  <dd className="font-bold">{org.owner_name || 'Sin propietario registrado'}</dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Creación</dt>
                  <dd className="font-mono text-xs">{org.created_at ? new Date(org.created_at).toLocaleString() : '-'}</dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tiendas</dt>
                  <dd className="font-black text-lg">{stores.length}</dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Usuarios asignados</dt>
                  <dd className="font-black text-lg">{(data?.users || []).length}</dd>
                </div>
              </dl>
            )}

            {tab === 'usuarios' && (
              /* Absorbida del modal: listado SOLO LECTURA de perfiles
                 asignados. La asignación/cambio de rol vive en su módulo de
                 SISTEMA (useAssignUserOrganization) — no se duplica aquí. */
              (data?.users || []).length === 0 ? (
                <p className="text-xs text-muted-foreground font-bold py-6 text-center uppercase tracking-widest">
                  Esta organización no tiene usuarios asignados
                </p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-xl border border-border" aria-label="Usuarios de la organización">
                  {(data?.users || []).map(u => (
                    <li key={u.id} className="flex items-center justify-between py-2.5 px-3 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{u.full_name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{u.email}</p>
                      </div>
                      <span className={cn('px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shrink-0', u.is_active ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive')}>
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === 'configuracion' && (
              /* Absorbida del modal: datos soportados por el modelo + edición
                 con el MISMO formulario del listado (OrganizationFormModal;
                 useUpdateOrganization invalida ['organization-detail']). */
              <div className="space-y-3 text-sm max-w-2xl">
                <p className="text-xs text-muted-foreground font-bold">
                  Opciones soportadas por el modelo actual: nombre y estado. La edición de planes/facturación no forma parte del alcance de esta vista.
                </p>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</p>
                  <p className="font-bold">{org.name}</p>
                </div>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</p>
                  <p className="font-bold">{org.is_active ? 'Activa' : 'Inactiva'}</p>
                </div>
                <Button size="sm" onClick={() => setEditOpen(true)} className="uppercase text-xs font-black tracking-widest gap-2">
                  <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                  Editar organización
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Edición de la organización (mismo formulario del listado) */}
      {org && (
        <OrganizationFormModal
          open={editOpen}
          onOpenChange={setEditOpen}
          organization={{ id: org.id, name: org.name, is_active: org.is_active }}
        />
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
