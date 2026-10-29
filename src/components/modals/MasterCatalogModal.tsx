/**
 * MasterCatalogModal — MISIÓN CATÁLOGO MAESTRO (PR 4).
 *
 * Vista del catálogo de la organización para la tienda activa:
 *  · Estado del enlace (conectada / no conectada).
 *  · Identidad disponible (maestros activos no activados aquí) con acción
 *    «Activar en esta tienda» (RPC activate_master_product: fila local con
 *    defaults de alta manual, existencia 0, sin movimientos).
 *  · Productos ya activados (muestra el vínculo local).
 * Los datos comerciales (precio/costo/existencias) SIEMPRE de la fila local:
 * la activación no copia nada de otras tiendas.
 */
import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Store } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useActivateMasterProduct,
  useCatalogStoreLink,
  useSearchMasterProducts,
} from '@/hooks/api/useMasterCatalog';
import { useUIStore, useAuthStore } from '@/store';
import { toast } from 'sonner';

export const MasterCatalogModal = () => {
  const { isMasterCatalogModalOpen, setIsMasterCatalogModalOpen } = useUIStore();
  const activeStoreId = useAuthStore(s => s.user?.activeStoreId) || null;
  const [search, setSearch] = useState('');

  const link = useCatalogStoreLink(isMasterCatalogModalOpen ? activeStoreId : null);
  const masters = useSearchMasterProducts(
    isMasterCatalogModalOpen && link.data?.status === 'connected' ? activeStoreId : null,
    search
  );
  const activate = useActivateMasterProduct(activeStoreId);

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
      description="Identidad compartida (SKU, nombre, imagen). Los precios, costos y existencias de esta tienda nunca se comparten."
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
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por SKU, nombre o código de barras…"
                  className="pl-8"
                  aria-label="Buscar en el catálogo de la organización"
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => masters.refetch()} aria-label="Actualizar">
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
                {rows.map(m => (
                  <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
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
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </BaseModal>
  );
};

export default MasterCatalogModal;
