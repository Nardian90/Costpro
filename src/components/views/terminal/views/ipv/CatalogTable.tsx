'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product } from '@/lib/dexie';
import { MatchingEngine } from '@/lib/ipv/engine';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BaseModal } from "@/components/ui/BaseModal";
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Trash2, Search, Workflow,  HelpCircle, Info, Edit2, Check, X, Plus, RefreshCw, LayoutGrid, List, AlertTriangle, Brain, Sparkles, Star, Percent, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, Download, Upload, ArrowRight, CornerDownRight, AlertTriangle as AlertTriangleIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useStores } from '@/hooks/api/useStores';
import { useAuthStore } from '@/store';
import { hasRole } from '@/lib/roles';
import {
    calculatePriceEffectiveness,
    suggestAlternativePrice,
    checkWildcardCandidate,
    calculateDynamicPriority
} from '@/lib/ipv/intelligence';
import { recalculateIPVReportsChain } from '@/lib/ipv/utils';
import { logAction } from "@/lib/ipv/audit";
import { importCatalogProducts } from '@/lib/ipv/importUtils';
import ActionMenu, { Action } from "@/components/ui/ActionMenu";
import * as XLSX from 'xlsx';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ImportValidator } from "@/lib/ipv/import-validator";

export function CatalogTable() {
  const [searchTerm, setSearchTerm] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('catalog_searchTerm') || '' : ''));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('catalog_layoutMode') as 'table' | 'cards') || 'table' : 'table'));
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() => (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('catalog_selectedProductIds') || '[]') : []));
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(() => (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('catalog_sortConfig') || 'null') : null));
  const [stockFilter, setStockFilter] = useState<'all' | 'with_stock' | 'without_stock' | 'negative_stock'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('catalog_stockFilter') as any) || 'all' : 'all'));
  const [pageSize, setPageSize] = useState(() => (typeof window !== "undefined" ? Number(localStorage.getItem("catalog_pageSize")) || 15 : 15));
  const [currentPage, setCurrentPage] = useState(1);

  const [confirmation, setConfirmation] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive';
  }>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmation({ open: true, title, message, onConfirm, variant });
  };

  const user = useAuthStore(state => state.user);
  const isAdmin = hasRole(user, 'admin');
  const isEncargado = hasRole(user, 'encargado');

  const products = useLiveQuery(() => db.products.toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const productMovements = useLiveQuery(() => db.product_movements.toArray());

  const inventoryStats = React.useMemo(() => {
    const stats: Record<string, { initial: number, entradas: number, salidas: number, sales: number, final: number }> = {};
    if (!products || !reconciliationLines || !productMovements) return stats;

    products.forEach(p => {
        const sales = reconciliationLines
            .filter(l => l.product_cod === p.cod)
            .reduce((sum, l) => sum + (l.cantidad || 0), 0);

        const entries = productMovements
            .filter(m => m.producto_destino_cod === p.cod)
            .reduce((sum, m) => sum + (m.cantidad_destino || 0), 0);

        const exits = productMovements
            .filter(m => m.producto_origen_cod === p.cod)
            .reduce((sum, m) => sum + (m.cantidad_origen || 0), 0);

        const initial = p.stock_inicial_manual || 0;
        stats[p.cod] = {
            initial,
            entradas: entries,
            salidas: exits,
            sales,
            final: initial + entries - exits - sales
        };
    });
    return stats;
  }, [products, reconciliationLines, productMovements]);

  const sortedAndFiltered = React.useMemo(() => {
      if (!products) return [];
      let result = [...products];

      if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          result = result.filter(p =>
              p.cod.toLowerCase().includes(lower) ||
              p.descripcion.toLowerCase().includes(lower) ||
              p.id_grupo?.toLowerCase().includes(lower)
          );
      }

      if (stockFilter === 'with_stock') {
          result = result.filter(p => (inventoryStats[p.cod]?.final || 0) > 0);
      } else if (stockFilter === 'without_stock') {
          result = result.filter(p => (inventoryStats[p.cod]?.final || 0) <= 0);
      } else if (stockFilter === 'negative_stock') {
          result = result.filter(p => (inventoryStats[p.cod]?.final || 0) < 0);
      }

      if (sortConfig) {
          result.sort((a, b) => {
              const { key, direction } = sortConfig;
              let valA: any = (a as any)[key];
              let valB: any = (b as any)[key];

              if (key === 'final_stock') {
                  valA = inventoryStats[a.cod]?.final || 0;
                  valB = inventoryStats[b.cod]?.final || 0;
              }

              if (valA < valB) return direction === 'asc' ? -1 : 1;
              if (valA > valB) return direction === 'asc' ? 1 : -1;
              return 0;
          });
      } else {
          result.sort((a, b) => (a.prioridad_algoritmo || 3) - (b.prioridad_algoritmo || 3));
      }

      return result;
  }, [products, searchTerm, stockFilter, sortConfig, inventoryStats]);

  const totalPages = Math.ceil(sortedAndFiltered.length / pageSize);
  const paginatedResult = sortedAndFiltered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleAddNew = () => {
    setEditingId('NEW');
    setEditForm({
        cod: '',
        descripcion: '',
        um: 'UNIDADES',
        precio_cents: 0,
        prioridad_algoritmo: 3,
        activo: true,
        stock_inicial_manual: 0,
        es_paquete: false,
        contenido_paquete: 1
    });
  };

  const startEditing = (p: Product) => {
    setEditingId(p.cod);
    setEditForm({ ...p });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEditing = async () => {
    if (!editForm.cod || !editForm.descripcion) {
        toast.error('Código y descripción son obligatorios');
        return;
    }

    try {
        if (editingId === 'NEW') {
            await db.products.add({
                ...editForm,
                created_at: new Date().toISOString()
            } as Product);
            await logAction({ type: "CREATE", entity: "PRODUCT", after: editForm, context: { source: "MANUAL" } });
            toast.success('Producto creado');
        } else {
            const before = products?.find(p => p.cod === editingId);
            await db.products.update(editingId!, {
                ...editForm,
                updated_at: new Date().toISOString()
            });
            await logAction({ type: "UPDATE", entity: "PRODUCT", before, after: editForm, context: { source: "MANUAL" } });
            toast.success('Producto actualizado');
        }
        setEditingId(null);
        setEditForm({});
    } catch (e: any) {
        toast.error(`Error: ${e.message}`);
    }
  };

  const handleDelete = async (cod: string) => {
    const p = products?.find(prod => prod.cod === cod);
    askConfirmation('Eliminar Producto', `¿Seguro que desea eliminar el producto ${cod}?`, async () => {
      await db.products.delete(cod);
      await logAction({ type: "DELETE", entity: "PRODUCT", before: p });
      toast.success('Producto eliminado');
    }, 'destructive');
  };

  const clearCatalog = () => {
    askConfirmation('Vaciar Catálogo', '¿Seguro que desea eliminar TODOS los productos? Esta acción no se puede deshacer.', async () => {
        await db.products.clear();
        await logAction({ type: "CLEAR", entity: "CATALOG" });
        toast.success('Catálogo vaciado');
    }, 'destructive');
  };

  const handleRecalculateIntelligence = async () => {
    if (!products) return;
    setIsSyncing(true);
    const loadingToast = toast.loading('Calculando indicadores inteligentes...');
    try {
        for (const p of products) {
            const effectiveness = calculatePriceEffectiveness(p, reconciliationLines || []);
            const suggestion = suggestAlternativePrice(p);
            const isWildcard = checkWildcardCandidate(p);
            const dynamicPriority = calculateDynamicPriority(p, { stock: inventoryStats[p.cod]?.final || 0, salesQty: p.ventas_qty_historico || 0, salesValue: p.ventas_valor_historico || 0 });

            await db.products.update(p.cod, {
                priceEffectivenessScore: effectiveness,
                suggestedPrice: suggestion.price,
                suggestionReason: suggestion.reason,
                isWildcardCandidate: isWildcard,
                prioridad_algoritmo: dynamicPriority,
                priorityMode: 'auto',
                updated_at: new Date().toISOString()
            });
        }
        toast.success('Inteligencia de catálogo actualizada', { id: loadingToast });
    } catch (error) {
        toast.error('Error al procesar inteligencia', { id: loadingToast });
    } finally {
        setIsSyncing(false);
    }
  };

  const handleNormalizeNegatives = async () => {
    const negativeProducts = products?.filter(p => (inventoryStats[p.cod]?.final || 0) < 0) || [];
    if (negativeProducts.length === 0) {
        toast.info('No hay productos con stock negativo');
        return;
    }
    askConfirmation('Normalizar Existencias', `¿Normalizar ${negativeProducts.length} productos con stock negativo? Se ajustará el stock inicial para que el final sea positivo.`, async () => {
        try {
            for (const p of negativeProducts) {
                const stats = inventoryStats[p.cod];
                const currentNegative = stats.final;
                const adjustment = Math.abs(currentNegative);
                const newInitial = (p.stock_inicial_manual || 0) + adjustment;
                await db.products.update(p.cod, {
                    stock_inicial_manual: newInitial,
                    updated_at: new Date().toISOString()
                });
                await logAction({ type: "UPDATE", entity: "PRODUCT", before: p, after: { ...p, stock_inicial_manual: newInitial }, context: { reason: "NORMALIZATION" } });
            }
            toast.success('Existencias normalizadas exitosamente');
        } catch (error) {
            toast.error('Error al normalizar existencias');
        }
    });
  };

  const catalogActions: Action[] = React.useMemo(() => [
    { id: "add", label: "Nuevo", icon: Plus, onClick: handleAddNew },
    { id: "normalize", label: "Normalizar", icon: AlertTriangle, onClick: handleNormalizeNegatives, variant: "danger" },
    { id: "intel", label: "Inteligencia", icon: Brain, onClick: handleRecalculateIntelligence, disabled: isSyncing, variant: "outline", className: "text-purple-500" },
    { id: "export", label: "Exportar", icon: Download, onClick: () => {} },
    { id: "import", label: "Importar", icon: Upload, onClick: () => {} },
    { id: "clear", label: "Vaciar", icon: Trash2, onClick: clearCatalog, variant: "danger" }
  ], [isSyncing, handleAddNew, handleNormalizeNegatives, handleRecalculateIntelligence, clearCatalog]);

  return (
    <>
      <div className="space-y-4">
        <ActionMenu
            actions={catalogActions}
            sticky={false}
            className="mb-2 !-mx-4 px-4 py-2"
        />

        <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-4 bg-background/50 border-b items-center justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por código o descripción..." className="pl-10 h-10 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant={layoutMode === 'table' ? 'secondary' : 'ghost'} size="icon" onClick={() => setLayoutMode('table')} className="h-10 w-10"><List className="w-4 h-4" /></Button>
            <Button variant={layoutMode === 'cards' ? 'secondary' : 'ghost'} size="icon" onClick={() => setLayoutMode('cards')} className="h-10 w-10"><LayoutGrid className="w-4 h-4" /></Button>
          </div>
        </div>

        {layoutMode === 'table' ? (
          <div className="catalog-table-container overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[100px]">Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>UM</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Stock Act.</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedResult.map(p => {
                    const stats = inventoryStats[p.cod] || { initial: 0, entradas: 0, salidas: 0, sales: 0, final: 0 };
                    const isEditing = editingId === p.cod;
                    return (
                        <TableRow key={p.cod} className={isEditing ? 'bg-primary/5' : ''}>
                            <TableCell className="font-mono text-xs">{p.cod}</TableCell>
                            <TableCell className="max-w-md truncate font-medium">{p.descripcion}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px] uppercase font-black">{p.um}</Badge></TableCell>
                            <TableCell className="text-right font-black">{p.precio_cents}</TableCell>
                            <TableCell className={`text-right font-bold ${stats.final < 0 ? 'text-red-500' : 'text-primary'}`}>{stats.final}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => startEditing(p)}><Edit2 className="w-4 h-4" /></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.cod)}><Trash2 className="w-4 h-4" /></Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {paginatedResult.map(p => (
                  <ProductCard key={p.cod} product={p} stats={inventoryStats[p.cod] || { initial: 0, entradas: 0, salidas: 0, sales: 0, final: 0 }} isEditing={editingId === p.cod} editForm={editForm} setEditForm={setEditForm} onSave={saveEditing} onCancel={cancelEditing} onEdit={() => startEditing(p)} onDelete={() => handleDelete(p.cod)} />
              ))}
          </div>
        )}
      </div>

      <BaseModal open={confirmation.open} onOpenChange={(open) => setConfirmation(prev => ({ ...prev, open }))} title={confirmation.title}>
          <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">{confirmation.message}</p>
              <div className="flex justify-end gap-3 pt-4">
                  <Button variant="ghost" onClick={() => setConfirmation(prev => ({ ...prev, open: false }))}>Cancelar</Button>
                  <Button variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'} onClick={() => { confirmation.onConfirm(); setConfirmation(prev => ({ ...prev, open: false })); }}>Confirmar</Button>
              </div>
          </div>
      </BaseModal>
    </>
  );
}

function ProductCard({ product, stats, isEditing, editForm, setEditForm, onSave, onCancel, onEdit, onDelete }: any) {
    return (
        <Card className={`p-4 space-y-4 transition-all hover:shadow-lg ${isEditing ? 'border-primary ring-2 ring-primary/20' : ''} product-card`}>
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <Badge variant="secondary" className="font-mono text-[10px]">{product.cod}</Badge>
                    <h4 className="font-bold text-sm leading-tight">{product.descripcion}</h4>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase font-black">{product.um}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 py-2 border-y border-border/50">
                <div className="text-center">
                    <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Precio</p>
                    <p className="font-black text-sm">{product.precio_cents}</p>
                </div>
                <div className="text-center border-l border-border/50">
                    <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Existencia</p>
                    <p className={`font-black text-sm ${stats.final < 0 ? 'text-red-500' : 'text-primary'}`}>{stats.final}</p>
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9 neu-btn" onClick={onEdit}><Edit2 className="w-4 h-4" /></Button>
                <Button size="sm" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
            </div>
        </Card>
    );
}

function NewProductCard({ editForm, setEditForm, onSave, onCancel }: any) {
    return (
        <Card className="p-4 space-y-4 border-2 border-dashed border-primary/50 bg-primary/5 relative">
            <div className="space-y-2">
                <Label className="text-xs uppercase font-black">Código</Label>
                <Input value={editForm.cod} onChange={e => setEditForm({...editForm, cod: e.target.value})} className="h-10 text-sm font-bold uppercase" placeholder="SKU-123" />
            </div>
            <div className="space-y-2">
                <Label className="text-xs uppercase font-black">Descripción</Label>
                <Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} className="h-10 text-sm" placeholder="Nombre del producto..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs uppercase font-black">Precio</Label>
                    <Input type="number" step="0.01" value={editForm.precio_cents || 0} onChange={e => setEditForm({...editForm, precio_cents: parseFloat(e.target.value) || 0})} className="h-10 text-sm font-black" />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs uppercase font-black">UM</Label>
                    <Input value={editForm.um} onChange={e => setEditForm({...editForm, um: e.target.value})} className="h-10 text-sm uppercase" />
                </div>
            </div>
            <div className="flex gap-2 pt-2">
                <Button className="flex-1 neu-btn-primary h-12 font-black text-xs uppercase" onClick={onSave}><Check className="w-4 h-4 mr-2" /> Guardar</Button>
                <Button variant="ghost" className="h-12 text-xs uppercase font-bold" onClick={onCancel}>Cancelar</Button>
            </div>
        </Card>
    );
}
