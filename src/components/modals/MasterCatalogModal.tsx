/**
 * MasterCatalogModal — MISIÓN CATÁLOGO MAESTRO (PR 4) · CORRECCIÓN FUNCIONAL
 * (2026-11-12): administración completa de la identidad compartida.
 *
 * Vista del catálogo de la organización para la tienda activa:
 *  · Estado del enlace (conectada / no conectada).
 *  · Identidad disponible (maestros activos no activados aquí) con acción
 *    «Activar en esta tienda» (RPC activate_master_product: fila local con
 *    defaults de alta manual, existencia 0, sin movimientos).
 *  · Productos ya activados (muestra el vínculo local).
 *  · Edición de identidad compartida (nombre, imagen, descripción) vía
 *    MasterIdentityEditModal.
 *  · «+ Crear producto» (brief §4): creación directa de un nuevo producto
 *    maestro desde este diálogo con CreateMasterProductModal — MISMO
 *    servicio de creación que la pestaña «Catálogo» de Inventario
 *    (useCreateMasterProduct → RPC create_master_product), sin cerrar la
 *    ventana ni recargar la aplicación.
 * Los datos comerciales (precio/costo/existencias) SIEMPRE de la fila local:
 * la activación no copia nada de otras tiendas.
 */
import { useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Search, Store, Pencil } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseUrl } from '@/lib/utils';
import {
  useActivateMasterProduct,
  useCatalogStoreLink,
  useIsCatalogGovernor,
  useSearchMasterProducts,
} from '@/hooks/api/useMasterCatalog';
import { useUIStore, useAuthStore } from '@/store';
import { toast } from 'sonner';
// GESTIÓN-MAESTRO (2026-11-11): edición de identidad compartida desde este
// modal (interfaz alternativa del brief §3: además de consultar y activar,
// editar imagen y descripción del registro maestro).
import { MasterIdentityEditModal } from '@/components/views/terminal/views/catalog/MasterIdentityEditModal';
// CORRECCIÓN FUNCIONAL (2026-11-12) §4: creación de productos maestros desde
// este diálogo — mismo servicio de creación que la pestaña «Catálogo» de
// Inventario (useCreateMasterProduct → RPC create_master_product).
import { CreateMasterProductModal } from '@/components/views/terminal/views/catalog/CreateMasterProductModal';
import type { Product } from '@/types';

export const MasterCatalogModal = () => {
  const { isMasterCatalogModalOpen, setIsMasterCatalogModalOpen } = useUIStore();
  const activeStoreId = useAuthStore(s => s.user?.activeStoreId) || null;
  const userId = useAuthStore(s => s.user?.id) || null;
  const [search, setSearch] = useState('');
  // GESTIÓN-MAESTRO (2026-11-11): fila cuya identidad compartida se edita.
  const [editingMaster, setEditingMaster] = useState<Product | null>(null);
  // CORRECCIÓN FUNCIONAL (2026-11-12) §4: formulario de creación de productos
  // maestros desde este mismo diálogo.
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const link = useCatalogStoreLink(isMasterCatalogModalOpen ? activeStoreId : null);
  const masters = useSearchMasterProducts(
    isMasterCatalogModalOpen && link.data?.status === 'connected' ? activeStoreId : null,
    search
  );
  const activate = useActivateMasterProduct(activeStoreId);
  // Gobernador del catálogo de la organización (RPC fail-closed; solo informativo
  // para la UI — la autorización real vive en el servidor).
  const isGovernorQuery = useIsCatalogGovernor(
    link.data?.status === 'connected' ? link.data.tenant_id : null,
    userId
  );
  const isGovernor = isGovernorQuery.data === true;

  const connected = link.data?.status === 'connected';
  const rows = useMemo(() => masters.data ?? [], [masters.data]);

  const handleActivate = async (masterId: string, sku: string) => {
    try {
      const res = await activate.mutateAsync(masterId);
      if (res.already_active) {
        toast.info(`El producto ${sku} ya está activado en esta tienda`);
      } else {
        toast.success(`Producto ${sku} activado en esta tienda (existencia 0, sin movimientos)`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al activar';
      if (msg.includes('ERR_MASTER_ARCHIVED')) toast.error('El producto maestro está archivado');
      else if (msg.includes('ERR_STORE_NOT_CONNECTED')) toast.error('Esta tienda no está conectada al catálogo');
      else toast.error(msg);
    }
  };

  return (
    <BaseModal
      open={isMasterCatalogModalOpen}
      onOpenChange={setIsMasterCatalogModalOpen}
      title="Catálogo de la organización"
      description="Identidad compartida (SKU inmutable tras la creación; nombre, imagen y descripción editables). Los precios, costos y existencias de esta tienda nunca se comparten."
    >
      <div className="space-y-4">
        {link.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Verificando conexión…</div>
        ) : !connected ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            Esta tienda no está conectada al catálogo maestro de su organización. El administrador del catálogo puede conectarla desde Sistema → Organizaciones.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[12rem]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por SKU, nombre o código de barras…"
                  className="pl-8"
                  aria-label="Buscar en el catálogo de la organización"
                />
              </div>
              {/* CORRECCIÓN FUNCIONAL (2026-11-12) §4: botón visible «+ Crear
                  producto» — creación directa de identidad maestra desde
                  este diálogo, mismo servicio que Inventario → Catálogo. */}
              <Button
                onClick={() => setIsCreateOpen(true)}
                aria-label="Crear producto del catálogo maestro"
                title="Crear un nuevo producto del Catálogo Maestro y vincularlo a esta tienda"
                data-testid="master-catalog-create-product"
                className="shrink-0"
              >
                <Plus className="h-4 w-4 mr-1" />
                Crear producto
              </Button>
              <Button variant="outline" size="icon" onClick={() => masters.refetch()} aria-label="Actualizar" className="shrink-0">
                <RefreshCw className={`h-4 w-4 ${masters.isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {masters.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo…</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                Sin resultados en el catálogo de la organización.
              </div>
            ) : (
              <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1" role="list">
                {rows.map(m => {
                  // CP-CAT-MAESTRO-002 (Fase 3): la imagen compartida se resuelve
                  // por referencia al mismo objeto del bucket para todas las tiendas.
                  const sharedImage = getSupabaseUrl('product-images', m.image_path);
                  return (
                  <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {sharedImage ? (
                        <img
                          src={sharedImage}
                          alt={`Imagen de ${m.name}`}
                          className="h-10 w-10 rounded object-cover border shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center shrink-0" aria-hidden="true">
                          <Store className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-muted">{m.sku}</span>
                          {m.is_service && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">servicio</span>}
                          {m.status === 'archived' && <span className="text-[10px] uppercase tracking-wider text-destructive">archivado</span>}
                        </div>
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.unit_of_measure || 'unidad'}{m.barcode ? ` · ${m.barcode}` : ''}
                          {m.activated ? ' · activado en esta tienda' : ' · disponible'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* GESTIÓN-MAESTRO (2026-11-11): editar la identidad compartida
                          (imagen + descripción) del maestro desde este modal. */}
                      {m.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingMaster({
                            id: m.id,
                            sku: m.sku,
                            name: m.name,
                            source: 'master',
                            master_product_id: null,
                          } as Product)}
                          aria-label={`Editar identidad de ${m.sku}`}
                          title="Editar el nombre, la imagen y la descripción compartidos del catálogo"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                      )}
                      {!m.activated && m.status === 'active' && (
                        <Button
                          size="sm"
                          onClick={() => handleActivate(m.id, m.sku)}
                          disabled={activate.isPending}
                          aria-label={`Activar ${m.sku} en esta tienda`}
                        >
                          {activate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4 mr-1" />}
                          Activar
                        </Button>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {/* GESTIÓN-MAESTRO (2026-11-11): edición de identidad compartida
          (nombre, imagen y descripción del registro maestro) desde este modal. */}
      <MasterIdentityEditModal
        product={editingMaster}
        open={!!editingMaster}
        onClose={() => setEditingMaster(null)}
        storeId={activeStoreId}
        isGovernor={isGovernor}
      />

      {/* CORRECCIÓN FUNCIONAL (2026-11-12) §4: creación de productos
          maestros desde este diálogo (mismo servicio que Inventario →
          Catálogo). La lista se refresca por la invalidación del propio
          hook (useCreateMasterProduct onSuccess) — sin recarga manual. */}
      <CreateMasterProductModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        storeId={activeStoreId}
        isGovernor={isGovernor}
      />
    </BaseModal>
  );
};

export default MasterCatalogModal;
