'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product } from '@/lib/dexie';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Trash2, Search, HelpCircle, Info, Edit2, Check, X, Plus, RefreshCw, LayoutGrid, List, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useStores } from '@/hooks/api/useStores';
import { useAuthStore } from '@/store';
import { hasRole } from '@/lib/roles';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function CatalogTable() {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>('table');
  const [isSyncing, setIsSyncing] = useState(false);

  const user = useAuthStore(state => state.user);
  const isAdmin = hasRole(user, 'admin');
  const isEncargado = hasRole(user, 'encargado');

  const { data: stores } = useStores(user?.id || '', isAdmin, isEncargado);
  const products = useLiveQuery(() => db.products.toArray());
  const reports = useLiveQuery(() => db.ipv_reports.orderBy('fecha_reporte').reverse().toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());

  const inventoryStats = React.useMemo(() => {
    if (!products || !reports || !reconciliationLines) return {};

    const stats: Record<string, { initial: number; sales: number; final: number }> = {};
    const lastClosedReport = reports.find(r => r.estado === 'CERRADO');

    products.forEach(p => {
        let initial = p.stock_inicial_manual || 0;
        if (lastClosedReport) {
            const reportRow = lastClosedReport.filas.find(f => f.cod === p.cod);
            if (reportRow) initial = reportRow.existencia_final_qty;
        }

        const reportDate = lastClosedReport ? lastClosedReport.fecha_reporte : '0000-00-00';
        const sales = reconciliationLines
            .filter(l => l.product_cod === p.cod && l.fecha_operacion > reportDate)
            .reduce((sum, l) => sum + l.cantidad, 0);

        stats[p.cod] = {
            initial,
            sales,
            final: initial - sales
        };
    });

    return stats;
  }, [products, reports, reconciliationLines]);

  const filtered = products?.filter(p =>
    p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.cod.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleDelete = async (cod: string) => {
    if (confirm('¿Eliminar este producto del catálogo?')) {
      await db.products.delete(cod);
      toast.success('Producto eliminado');
    }
  };

  const startEditing = (product: Product) => {
    setEditingId(product.cod);
    setEditForm(product);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEditing = async () => {
    if (!editForm.cod) {
        toast.error('El código es obligatorio');
        return;
    }
    try {
        await db.products.put(editForm as Product);
        setEditingId(null);
        setEditForm({});
        toast.success('Producto guardado correctamente');
    } catch (error) {
        toast.error('Error al guardar el producto');
    }
  };

  const handleAddNew = () => {
      const newProd: Product = {
          cod: '',
          descripcion: '',
          um: 'Unidades',
          es_paquete: false,
          contenido_paquete: 1,
          precio_cents: 0,
          prioridad_algoritmo: 1,
          activo: true,
          stock_inicial_manual: 0,
          created_at: new Date().toISOString()
      };
      setEditingId('NEW');
      setEditForm(newProd);
  };

  const handleNormalizeNegatives = async () => {
    const negativeProducts = products?.filter(p => {
        const stats = inventoryStats[p.cod] || { final: 0 };
        return stats.final < 0;
    });

    if (!negativeProducts || negativeProducts.length === 0) {
        toast.info('No hay productos con existencias negativas');
        return;
    }

    if (!confirm(`¿Normalizar ${negativeProducts.length} productos con stock negativo? Se ajustará el stock inicial para que el final sea positivo.`)) return;

    try {
        for (const p of negativeProducts) {
            const stats = inventoryStats[p.cod];
            const currentNegative = stats.final;
            const adjustment = Math.abs(currentNegative);
            const newInitial = (p.stock_inicial_manual || 0) + adjustment;

            await db.products.update(p.cod, {
                stock_inicial_manual: newInitial
            });
        }
        toast.success('Existencias normalizadas exitosamente');
    } catch (error) {
        toast.error('Error al normalizar existencias');
    }
  };

  const clearCatalog = async () => {
    if (confirm('¿ESTÁS SEGURO? Se borrará TODO el catálogo cargado actualmente.')) {
        await db.products.clear();
    }
  };

  const syncWithSystemCatalog = async () => {
    if (!stores || stores.length === 0) {
        toast.error('No se encontró tienda activa para sincronizar');
        return;
    }

    if (!confirm('¿Sincronizar con el catálogo real del sistema? Los productos locales con el mismo código serán actualizados.')) return;

    setIsSyncing(true);
    toast.loading('Sincronizando catálogo...', { id: 'sync-catalog' });

    try {
        console.log('Sincronizando con tienda:', stores[0].name, stores[0].id);
        const { data, error } = await supabase.rpc('get_products_for_pos', {
            p_store_id: stores[0].id,
            p_search_term: '',
            p_category: ''
        });

        if (error) {
            console.error('RPC Error:', error);
            throw new Error(`Error del servidor: ${error.message}`);
        }

        const systemProducts = (data || []).map((p: any) => ({
            cod: p.sku || p.id, // Preferir SKU si existe
            descripcion: p.name,
            um: 'UNIDADES', // Valor por defecto
            es_paquete: false,
            contenido_paquete: 1,
            precio_cents: Math.round((p.price || 0) * 100),
            prioridad_algoritmo: 3,
            activo: true,
            stock_inicial_manual: Math.round(p.stock_quantity || 0),
            created_at: new Date().toISOString()
        }));

        await db.products.bulkPut(systemProducts);
        toast.success(`Sincronización completa: ${systemProducts.length} productos cargados`, { id: 'sync-catalog' });
    } catch (error) {
        console.error(error);
        toast.error('Error al sincronizar con el sistema', { id: 'sync-catalog' });
    } finally {
        setIsSyncing(false);
    }
  };

  const handleRecalculateReportsChain = async () => {
    if (confirm('¿Recalcular toda la cadena de reportes IPV?')) {
        try {
            const allProducts = await db.products.toArray();
            const productMap = new Map(allProducts.map(p => [p.cod, p]));
            const allReports = await db.ipv_reports.orderBy('fecha_reporte').toArray();
            for (let i = 0; i < allReports.length; i++) {
                const report = allReports[i];
                const prevReport = i > 0 ? allReports[i - 1] : null;
                const updatedFilas = report.filas.map(f => {
                    const product = productMap.get(f.cod);
                    const initial = prevReport
                        ? (prevReport.filas.find(pf => pf.cod === f.cod)?.existencia_final_qty || 0)
                        : (product?.stock_inicial_manual || 0);
                    const venta = f.venta_cantidad_qty;
                    const final = initial - venta;
                    return { ...f, saldo_inicial_qty: initial, total_disponible_qty: initial, existencia_final_qty: final };
                });
                await db.ipv_reports.update(report.id, { filas: updatedFilas, updated_at: new Date().toISOString() });
                allReports[i].filas = updatedFilas;
            }
            toast.success('Cadena de reportes recalculada exitosamente');
        } catch (error) {
            toast.error('Error al recalcular los reportes');
        }
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-4 bg-background/50 border-b items-center justify-between">
        <div className="relative flex-1 w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o descripción..."
            className="pl-10 h-10 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full lg:w-auto justify-end">
            <div className="flex gap-2 mr-auto lg:mr-0">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setLayoutMode('table')}
                    className={`h-10 w-10 ${layoutMode === 'table' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}
                >
                    <List className="w-4 h-4" />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setLayoutMode('cards')}
                    className={`h-10 w-10 ${layoutMode === 'cards' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}
                >
                    <LayoutGrid className="w-4 h-4" />
                </Button>
            </div>

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full h-10 w-10">
                            <HelpCircle className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs p-4">
                        <p className="font-bold text-primary mb-2">Ayuda de Columnas:</p>
                        <ul className="text-[10px] space-y-1 list-disc pl-4 uppercase font-bold">
                            <li><strong>cod:</strong> Identificador único.</li>
                            <li><strong>Precio:</strong> Valor unitario en centavos.</li>
                            <li><strong>Prioridad:</strong> 1-5 (Menor es mayor prioridad).</li>
                            <li><strong>Stock Inicial:</strong> Punto de partida manual.</li>
                        </ul>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <Button
                variant="outline"
                size="sm"
                onClick={handleNormalizeNegatives}
                className="h-12 sm:h-10 text-[10px] uppercase font-black tracking-widest gap-2 text-red-500 border-red-200 hover:bg-red-50 flex-1 sm:flex-none"
            >
                <AlertTriangle className="w-4 h-4" />
                <span className="hidden sm:inline">Normalizar Negativos</span>
                <span className="sm:hidden">Normalizar</span>
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={syncWithSystemCatalog}
                disabled={isSyncing}
                className="h-12 sm:h-10 text-[10px] uppercase font-black tracking-widest gap-2 text-primary border-primary/20 flex-1 sm:flex-none"
            >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                Catálogo Real
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleAddNew}
                className="h-12 sm:h-10 text-[10px] uppercase font-black tracking-widest gap-2 flex-1 sm:flex-none"
            >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Nuevo Producto</span>
                <span className="sm:hidden">Nuevo</span>
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleRecalculateReportsChain}
                className="h-12 sm:h-10 text-[10px] uppercase font-black tracking-widest gap-2 text-primary border-primary/20 flex-1 sm:flex-none"
            >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Recalcular IPVs</span>
                <span className="sm:hidden">Recalcular</span>
            </Button>
        </div>
      </div>

      <div className="px-4 py-2 bg-primary/5 border-l-4 border-primary mx-4 rounded-r-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="text-[10px] text-muted-foreground leading-relaxed font-medium uppercase tracking-tight">
            <span className="font-black text-primary">Tip:</span> La <strong>Prioridad</strong> resuelve ambigüedades de precio durante el matching automático.
        </div>
      </div>

      {layoutMode === 'table' ? (
        <div className="table-scroll-wrapper">
            <Table className="data-table">
            <TableHeader>
                <TableRow>
                <TableHead className="sticky-column-1">Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>UM</TableHead>
                <TableHead className="text-center">Paquete</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Inicial</TableHead>
                <TableHead className="text-right">Ventas</TableHead>
                <TableHead className="text-right">Final</TableHead>
                <TableHead className="text-center">Prioridad</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {filtered.length === 0 && editingId !== 'NEW' ? (
                <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-muted-foreground font-bold uppercase text-[10px]">
                    No hay productos en el catálogo.
                    </TableCell>
                </TableRow>
                ) : (
                <>
                {editingId === 'NEW' && (
                    <TableRow className="bg-primary/10">
                        <TableCell className="sticky-column-1">
                            <Input
                                value={editForm.cod}
                                onChange={e => setEditForm({...editForm, cod: e.target.value})}
                                placeholder="CÓDIGO"
                                className="h-8 w-24 text-[10px] font-bold"
                            />
                        </TableCell>
                        <TableCell>
                            <Input
                                value={editForm.descripcion}
                                onChange={e => setEditForm({...editForm, descripcion: e.target.value})}
                                placeholder="Descripción..."
                                className="h-8 text-xs min-w-[200px]"
                            />
                        </TableCell>
                        <TableCell>
                            <Input
                                value={editForm.um}
                                onChange={e => setEditForm({...editForm, um: e.target.value})}
                                className="h-8 w-24 text-[10px] uppercase"
                            />
                        </TableCell>
                        <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                                <Switch
                                    checked={editForm.es_paquete}
                                    onCheckedChange={checked => setEditForm({...editForm, es_paquete: checked})}
                                />
                            </div>
                        </TableCell>
                        <TableCell className="text-right">
                            <Input
                                type="number"
                                value={editForm.precio_cents || 0}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val.includes('.') || val.includes(',')) return;
                                    setEditForm({...editForm, precio_cents: parseInt(val, 10) || 0});
                                }}
                                className="h-8 w-24 text-right text-xs font-black"
                            />
                        </TableCell>
                        <TableCell className="text-right">
                            <Input
                                type="number"
                                value={editForm.stock_inicial_manual || 0}
                                onChange={e => setEditForm({...editForm, stock_inicial_manual: Number(e.target.value)})}
                                className="h-8 w-16 text-right text-xs"
                            />
                        </TableCell>
                        <TableCell colSpan={2}></TableCell>
                        <TableCell className="text-center">
                            <select
                                value={editForm.prioridad_algoritmo}
                                onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})}
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                                {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </TableCell>
                        <TableCell className="text-center">
                            <Switch
                                checked={editForm.activo}
                                onCheckedChange={checked => setEditForm({...editForm, activo: checked})}
                            />
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-500" onClick={saveEditing}>
                                    <Check className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={cancelEditing}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                )}
                {filtered.map((p) => {
                    const isEditing = editingId === p.cod;
                    const stats = inventoryStats[p.cod] || { initial: 0, sales: 0, final: 0 };

                    return (
                    <TableRow key={p.cod} className={isEditing ? "bg-primary/5" : ""}>
                        <TableCell className="sticky-column-1 font-mono text-[10px] font-bold text-primary">
                        {p.cod}
                        </TableCell>

                        <TableCell>
                        {isEditing ? (
                            <Input
                                value={editForm.descripcion}
                                onChange={e => setEditForm({...editForm, descripcion: e.target.value})}
                                className="h-8 text-xs min-w-[200px]"
                            />
                        ) : (
                            <div className="text-xs font-bold">{p.descripcion}</div>
                        )}
                        </TableCell>

                        <TableCell>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold">{p.um}</Badge>
                        </TableCell>

                        <TableCell className="text-center">
                            {p.es_paquete ? <span className="text-[10px] font-black text-primary">X{p.contenido_paquete}</span> : <span className="text-[10px] text-muted-foreground opacity-20">-</span>}
                        </TableCell>

                        <TableCell className="text-right font-black text-xs">
                            {p.precio_cents}
                        </TableCell>

                        <TableCell className="text-right">
                            {isEditing ? (
                                <Input
                                    type="number"
                                    value={editForm.stock_inicial_manual || 0}
                                    onChange={e => setEditForm({...editForm, stock_inicial_manual: Number(e.target.value)})}
                                    className="h-8 w-16 text-right text-xs"
                                />
                            ) : (
                                <span className="text-xs font-bold text-muted-foreground">{stats.initial}</span>
                            )}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-orange-500">{stats.sales}</TableCell>
                        <TableCell className={`text-right text-xs font-black ${stats.final < 0 ? 'text-red-500' : 'text-primary'}`}>
                            {stats.final}
                        </TableCell>

                        <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-black">
                                {p.prioridad_algoritmo}
                            </span>
                        </TableCell>

                        <TableCell className="text-center">
                            <Switch
                                checked={isEditing ? editForm.activo : p.activo}
                                onCheckedChange={checked => isEditing ? setEditForm({...editForm, activo: checked}) : db.products.update(p.cod, { activo: checked })}
                                disabled={!isEditing && editingId !== null}
                            />
                        </TableCell>

                        <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                            {isEditing ? (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-500" onClick={saveEditing}><Check className="w-4 h-4" /></Button>
                            ) : (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => startEditing(p)}><Edit2 className="w-4 h-4" /></Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.cod)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                        </TableCell>
                    </TableRow>
                    );
                })}
                </>
                )}
            </TableBody>
            </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            {filtered.length === 0 && editingId !== 'NEW' ? (
                <div className="h-24 flex items-center justify-center text-muted-foreground uppercase font-black text-xs">No hay productos</div>
            ) : (
                <>
                {editingId === 'NEW' && <NewProductCard editForm={editForm} setEditForm={setEditForm} onSave={saveEditing} onCancel={cancelEditing} />}
                {filtered.map(p => (
                    <ProductCard
                        key={p.cod}
                        product={p}
                        stats={inventoryStats[p.cod] || { initial: 0, sales: 0, final: 0 }}
                        isEditing={editingId === p.cod}
                        editForm={editForm}
                        setEditForm={setEditForm}
                        onSave={saveEditing}
                        onCancel={cancelEditing}
                        onEdit={() => startEditing(p)}
                        onDelete={() => handleDelete(p.cod)}
                    />
                ))}
                </>
            )}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, stats, isEditing, editForm, setEditForm, onSave, onCancel, onEdit, onDelete }: any) {
    return (
        <Card className={`p-4 space-y-4 border-none shadow-md bg-card/50 backdrop-blur-sm relative overflow-hidden ${isEditing ? 'ring-2 ring-primary' : ''}`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">{product.cod}</p>
                    {isEditing ? (
                        <Input
                            value={editForm.descripcion}
                            onChange={e => setEditForm({...editForm, descripcion: e.target.value})}
                            className="h-8 mt-1 text-xs font-bold"
                        />
                    ) : (
                        <h4 className="font-bold text-sm leading-tight">{product.descripcion}</h4>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="text-[9px] uppercase font-black">{product.um}</Badge>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-50">Prio {product.prioridad_algoritmo}</span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 py-3 border-y border-border/50">
                <div className="text-center">
                    <p className="text-[8px] font-black text-muted-foreground uppercase mb-1">Inicial</p>
                    {isEditing ? (
                        <Input
                            type="number"
                            value={editForm.stock_inicial_manual}
                            onChange={e => setEditForm({...editForm, stock_inicial_manual: Number(e.target.value)})}
                            className="h-7 text-[10px] text-center"
                        />
                    ) : (
                        <p className="font-black text-lg">{stats.initial}</p>
                    )}
                </div>
                <div className="text-center border-x border-border/50">
                    <p className="text-[8px] font-black text-muted-foreground uppercase mb-1">Ventas</p>
                    <p className="font-black text-lg text-orange-500">{stats.sales}</p>
                </div>
                <div className="text-center">
                    <p className="text-[8px] font-black text-muted-foreground uppercase mb-1">Final</p>
                    <p className={`font-black text-lg ${stats.final < 0 ? 'text-red-500' : 'text-primary'}`}>{stats.final}</p>
                </div>
            </div>

            <div className="flex justify-between items-center">
                <div>
                    <p className="text-[8px] font-bold text-muted-foreground uppercase">Precio (Cents)</p>
                    {isEditing ? (
                         <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={editForm.precio_cents || 0}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val.includes('.') || val.includes(',')) return;
                                    setEditForm({...editForm, precio_cents: parseInt(val, 10) || 0});
                                }}
                                className="h-7 text-[10px] w-24 font-black"
                            />
                         </div>
                    ) : (
                        <p className="font-black text-base">{product.precio_cents}</p>
                    )}
                </div>
                <div className="flex gap-2">
                    {isEditing ? (
                        <Button size="sm" className="h-11 w-11 sm:h-9 sm:w-9 neu-btn-primary" onClick={onSave}><Check className="w-4 h-4" /></Button>
                    ) : (
                        <Button size="sm" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9 neu-btn" onClick={onEdit}><Edit2 className="w-4 h-4" /></Button>
                    )}
                    <Button size="sm" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
                </div>
            </div>
        </Card>
    );
}

function NewProductCard({ editForm, setEditForm, onSave, onCancel }: any) {
    return (
        <Card className="p-4 space-y-4 border-2 border-dashed border-primary/50 bg-primary/5 relative">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <Label className="text-[9px] uppercase font-black">Código</Label>
                    <Input value={editForm.cod} onChange={e => setEditForm({...editForm, cod: e.target.value})} className="h-8 text-xs font-bold uppercase" placeholder="SKU-123" />
                </div>
                <div className="space-y-1">
                    <Label className="text-[9px] uppercase font-black">UM</Label>
                    <Input value={editForm.um} onChange={e => setEditForm({...editForm, um: e.target.value})} className="h-8 text-xs uppercase" placeholder="UNIDADES" />
                </div>
            </div>
            <div className="space-y-1">
                <Label className="text-[9px] uppercase font-black">Descripción</Label>
                <Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} className="h-8 text-xs" placeholder="Nombre del producto..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <Label className="text-[9px] uppercase font-black">Precio (Cents)</Label>
                    <Input
                        type="number"
                        value={editForm.precio_cents || 0}
                        onChange={e => {
                            const val = e.target.value;
                            if (val.includes('.') || val.includes(',')) return;
                            setEditForm({...editForm, precio_cents: parseInt(val, 10) || 0});
                        }}
                        className="h-8 text-xs font-black"
                    />
                </div>
                <div className="space-y-1">
                    <Label className="text-[9px] uppercase font-black">Stock Inicial</Label>
                    <Input type="number" value={editForm.stock_inicial_manual} onChange={e => setEditForm({...editForm, stock_inicial_manual: Number(e.target.value)})} className="h-8 text-xs" />
                </div>
            </div>
            <div className="flex gap-2 pt-2">
                <Button className="flex-1 neu-btn-primary h-12 sm:h-10 font-black text-[10px] uppercase" onClick={onSave}><Check className="w-4 h-4 mr-2" /> Guardar</Button>
                <Button variant="ghost" className="h-12 sm:h-10 text-[10px] uppercase font-bold" onClick={onCancel}>Cancelar</Button>
            </div>
        </Card>
    );
}
