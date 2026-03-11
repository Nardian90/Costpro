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
import { BaseModal } from "@/components/ui/BaseModal";
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Trash2, Search, HelpCircle, Info, Edit2, Check, X, Plus, RefreshCw, LayoutGrid, List, AlertTriangle, Brain, Sparkles, Star, Percent, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, Download, Upload } from 'lucide-react';
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
import * as XLSX from 'xlsx';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function CatalogTable() {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>('table');
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [stockFilter, setStockFilter] = useState<'all' | 'with_stock' | 'without_stock'>('all');

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

  const { data: stores } = useStores(user?.id || '', isAdmin, isEncargado);
  const products = useLiveQuery(() => db.products.toArray());

  React.useEffect(() => {
    if (products && products.length > 0 && selectedProductIds.length === 0) {
        setSelectedProductIds(products.map(p => p.cod));
    }
  }, [products]);

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
        stats[p.cod] = { initial, sales, final: initial - sales };
    });
    return stats;
  }, [products, reports, reconciliationLines]);

  const sortedAndFiltered = React.useMemo(() => {
    let result = products?.filter(p =>
      p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.cod.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    if (stockFilter !== 'all') {
        result = result.filter(p => {
            const stats = inventoryStats[p.cod] || { final: 0 };
            return stockFilter === 'with_stock' ? stats.final > 0 : stats.final <= 0;
        });
    }

    if (sortConfig) {
        result.sort((a, b) => {
            let aValue: any;
            let bValue: any;
            if (sortConfig.key === 'final_stock') {
                aValue = inventoryStats[a.cod]?.final || 0;
                bValue = inventoryStats[b.cod]?.final || 0;
            } else if (sortConfig.key === 'sales') {
                aValue = inventoryStats[a.cod]?.sales || 0;
                bValue = inventoryStats[b.cod]?.sales || 0;
            } else if (sortConfig.key === 'initial') {
                aValue = inventoryStats[a.cod]?.initial || 0;
                bValue = inventoryStats[b.cod]?.initial || 0;
            } else {
                aValue = (a as any)[sortConfig.key];
                bValue = (b as any)[sortConfig.key];
            }
            if (aValue === undefined) return 1;
            if (bValue === undefined) return -1;
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    return result;
  }, [products, searchTerm, stockFilter, sortConfig, inventoryStats]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortButton = ({ column, label, className = "" }: { column: string, label: string, className?: string }) => {
    const isActive = sortConfig?.key === column;
    return (
        <Button variant="ghost" size="sm" onClick={() => handleSort(column)} className={`h-7 px-2 text-xs font-black uppercase tracking-widest hover:bg-primary/5 gap-1 ${isActive ? 'text-primary' : 'text-muted-foreground'} ${className}`}>
            {label}
            {isActive ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : (<ArrowUpDown className="w-3 h-3 opacity-30" />)}
        </Button>
    );
  };

  const handleDelete = async (cod: string) => {
    askConfirmation('¿Eliminar producto?', '¿Estás seguro de que deseas eliminar este producto del catálogo?', async () => {
      await db.products.delete(cod);
      toast.success('Producto eliminado');
    }, 'destructive');
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
          cod: '', descripcion: '', um: 'Unidades', es_paquete: false, contenido_paquete: 1, precio_cents: 0, prioridad_algoritmo: 3, activo: true, stock_inicial_manual: 0, created_at: new Date().toISOString(), priorityMode: 'manual', isWildcardCandidate: false
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
    askConfirmation('Normalizar Existencias', `¿Normalizar ${negativeProducts.length} productos con stock negativo? Se ajustará el stock inicial para que el final sea positivo.`, async () => {
        try {
            for (const p of negativeProducts) {
                const stats = inventoryStats[p.cod];
                const currentNegative = stats.final;
                const adjustment = Math.abs(currentNegative);
                const newInitial = (p.stock_inicial_manual || 0) + adjustment;
                await db.products.update(p.cod, { stock_inicial_manual: newInitial });
            }
            toast.success('Existencias normalizadas exitosamente');
        } catch (error) {
            toast.error('Error al normalizar existencias');
        }
    });
  };

  const clearCatalog = async () => {
    askConfirmation('Vaciar Catálogo', '¿ESTÁS SEGURO? Se borrará TODO el catálogo cargado actualmente.', async () => {
        await db.products.clear();
    }, 'destructive');
  };

  const handleAcceptSuggestions = async () => {
    if (!products) return;
    const targetProducts = products.filter(p => selectedProductIds.includes(p.cod));
    const withSuggestions = targetProducts.filter(p => p.suggestedPrice && p.suggestedPrice !== p.precio_cents);
    if (withSuggestions.length === 0) {
        toast.info('No hay sugerencias de precio pendientes para los productos seleccionados');
        return;
    }
    askConfirmation('Aplicar Sugerencias', `¿Aplicar ${withSuggestions.length} sugerencias de precio inteligentes a los productos seleccionados?`, async () => {
        try {
            const updates = withSuggestions.map(p => ({
                ...p,
                precio_base_cents: p.precio_base_cents || p.precio_cents,
                precio_cents: p.suggestedPrice as number,
                updated_at: new Date().toISOString()
            }));
            await db.products.bulkPut(updates);
            toast.success('Sugerencias aplicadas');
        } catch (error) {
            toast.error('Error al aplicar sugerencias');
        }
    });
  };

  const handleBulkPriority = async (mode: 'auto' | 'hybrid' | 'manual') => {
    if (!products) return;
    const targetProducts = products.filter(p => selectedProductIds.includes(p.cod));
    if (targetProducts.length === 0) {
        toast.error('Selecciona al menos un producto');
        return;
    }
    askConfirmation('Cambiar Prioridad', `¿Establecer modo de prioridad "${mode}" para ${targetProducts.length} productos seleccionados?`, async () => {
        try {
            const updates = targetProducts.map(p => ({ ...p, priorityMode: mode }));
            await db.products.bulkPut(updates);
            toast.success(`Prioridad ${mode} aplicada`);
            handleRecalculateIntelligence();
        } catch (error) {
            toast.error('Error al actualizar prioridades');
        }
    });
  };

  const handleBulkPercentageAdjustment = async () => {
    const targetProducts = selectedProductIds.length > 0 ? products?.filter(p => selectedProductIds.includes(p.cod)) || [] : products || [];
    if (targetProducts.length === 0) return;
    const percentStr = prompt(`Aplicar ajuste porcentual a ${targetProducts.length} productos. Ejemplo: 50 para el 50% del valor, 110 para incremento del 10%.`, "100");
    if (percentStr === null) return;
    const factor = parseFloat(percentStr) / 100;
    if (isNaN(factor)) {
        toast.error('Porcentaje inválido');
        return;
    }
    try {
        const updates = targetProducts.map(p => ({
            ...p,
            precio_base_cents: p.precio_base_cents || p.precio_cents,
            precio_cents: parseFloat((p.precio_cents * factor).toFixed(2)),
            updated_at: new Date().toISOString()
        }));
        await db.products.bulkPut(updates);
        toast.success(`Ajuste del ${percentStr}% aplicado correctamente`);
        setSelectedProductIds([]);
    } catch (error) {
        toast.error('Error al aplicar ajuste masivo');
    }
  };

  const handleResetPrices = async () => {
      const targetProducts = (products || []).filter(p => selectedProductIds.includes(p.cod));
      if (targetProducts.length === 0) return;
      askConfirmation('Restablecer Precios', `¿Restablecer precios base para ${targetProducts.length} productos seleccionados?`, async () => {
          try {
              const updates = targetProducts
                  .filter(p => p.precio_base_cents !== undefined)
                  .map(p => ({
                      ...p,
                      precio_cents: p.precio_base_cents as number,
                      precio_base_cents: undefined
                  }));
              if (updates.length > 0) {
                  await db.products.bulkPut(updates);
              }
              toast.success('Precios restablecidos');
          } catch (error) {
              toast.error('Error al restablecer precios');
          }
      });
  };

  const handleRecalculateIntelligence = async () => {
    if (!products || !reconciliationLines) return;
    const targetProducts = products.filter(p => selectedProductIds.includes(p.cod));
    if (targetProducts.length === 0) {
        toast.error('Selecciona productos para analizar');
        return;
    }
    setIsSyncing(true);
    toast.loading('Analizando catálogo...', { id: 'intel' });
    try {
        for (const p of targetProducts) {
            const score = calculatePriceEffectiveness(p, reconciliationLines);
            const suggestion = suggestAlternativePrice(p);
            const isWildcard = checkWildcardCandidate(p);
            const stats = inventoryStats[p.cod] || { initial: 0, sales: 0, final: 0 };
            const autoPriority = calculateDynamicPriority(p, { stock: stats.final, salesQty: stats.sales, salesValue: stats.sales * p.precio_cents });
            await db.products.update(p.cod, {
                priceEffectivenessScore: score, suggestedPrice: suggestion.price, suggestionReason: suggestion.reason, isWildcardCandidate: isWildcard,
                prioridad_algoritmo: p.priorityMode === 'auto' || p.priorityMode === 'hybrid' ? autoPriority : p.prioridad_algoritmo,
                ventas_qty_historico: stats.sales, ventas_valor_historico: stats.sales * p.precio_cents
            });
        }
        toast.success('Inteligencia de catálogo actualizada', { id: 'intel' });
    } catch (error) {
        toast.error('Error al calcular inteligencia');
    } finally {
        setIsSyncing(false);
    }
  };

  const syncWithSystemCatalog = async () => {
    if (!stores || stores.length === 0) {
        toast.error('No se encontró tienda activa para sincronizar');
        return;
    }
    askConfirmation('Sincronizar Catálogo', '¿Sincronizar con el catálogo real del sistema? Los productos locales con el mismo código serán actualizados.', async () => {
        setIsSyncing(true);
        toast.loading('Sincronizando catálogo...', { id: 'sync-catalog' });
        try {
            const { data, error } = await supabase.rpc('get_products_for_pos', { p_store_id: stores[0].id, p_search_term: '', p_category: '' });
            if (error) throw new Error(`Error del servidor: ${error.message}`);
            const systemProducts = (data || []).map((p: any) => ({
                cod: p.sku || p.id, descripcion: p.name, um: 'UNIDADES', es_paquete: false, contenido_paquete: 1, precio_cents: p.price || 0, prioridad_algoritmo: 3, activo: true, stock_inicial_manual: Math.round(p.stock_quantity || 0), created_at: new Date().toISOString()
            }));
            await db.products.bulkPut(systemProducts);
            toast.success(`Sincronización completa: ${systemProducts.length} productos cargados`, { id: 'sync-catalog' });
        } catch (error) {
            console.error(error);
            toast.error('Error al sincronizar con el sistema', { id: 'sync-catalog' });
        } finally {
            setIsSyncing(false);
        }
    });
  };

  const handleRecalculateReportsChain = async () => {
    askConfirmation('Recalcular IPVs', '¿Recalcular toda la cadena de reportes IPV?', async () => {
        try {
            await recalculateIPVReportsChain(db);
            toast.success('Cadena de reportes recalculada exitosamente');
        } catch (error) {
            toast.error('Error al recalcular los reportes');
        }
    });
  };

  const handleExportCatalog = () => {
    const exportData = (products && products.length > 0)
        ? products.map(p => ({
            'Código': p.cod,
            'Descripción': p.descripcion,
            'UM': p.um,
            'Precio ($)': p.precio_cents,
            'Prioridad': p.prioridad_algoritmo,
            'Stock Inicial': p.stock_inicial_manual,
            'Es Paquete (S/N)': p.es_paquete ? 'S' : 'N',
            'Contenido Paquete': p.contenido_paquete
          }))
        : [{
            'Código': 'SKU-001',
            'Descripción': 'Producto de Ejemplo',
            'UM': 'UNIDADES',
            'Precio ($)': 100.00,
            'Prioridad': 3,
            'Stock Inicial': 10,
            'Es Paquete (S/N)': 'N',
            'Contenido Paquete': 1
          }];

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catalogo");

    XLSX.writeFile(wb, `catalogo_ipv_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(products && products.length > 0 ? 'Catálogo exportado (Excel)' : 'Plantilla de catálogo exportada (Excel)');
  };

  const handleImportCatalog = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

            if (!jsonData || jsonData.length === 0) {
                toast.error('El archivo está vacío');
                return;
            }

            const validProducts: Product[] = [];
            const now = new Date().toISOString();

            for (const row of jsonData) {
                // Map from Spanish headers or generic headers
                const cod = row['Código'] || row['cod'] || row['CODIGO'];
                const descripcion = row['Descripción'] || row['descripcion'] || row['DESCRIPCION'];

                if (!cod || !descripcion) continue;

                validProducts.push({
                    cod: String(cod).toUpperCase(),
                    descripcion: String(descripcion),
                    um: String(row['UM'] || row['um'] || 'UNIDADES').toUpperCase(),
                    precio_cents: parseFloat(row['Precio ($)'] || row['precio_cents'] || row['PRECIO'] || 0),
                    prioridad_algoritmo: parseInt(row['Prioridad'] || row['prioridad_algoritmo'] || 3),
                    stock_inicial_manual: parseFloat(row['Stock Inicial'] || row['stock_inicial_manual'] || 0),
                    es_paquete: String(row['Es Paquete (S/N)'] || row['es_paquete'] || '').toUpperCase() === 'S',
                    contenido_paquete: parseInt(row['Contenido Paquete'] || row['contenido_paquete'] || 1),
                    activo: true,
                    created_at: now,
                    priorityMode: 'manual',
                    isWildcardCandidate: false
                });
            }

            if (validProducts.length > 0) {
                db.products.bulkPut(validProducts).then(() => {
                    toast.success(`Se importaron ${validProducts.length} productos correctamente`);
                    event.target.value = '';
                }).catch(err => {
                    toast.error('Error al guardar los productos');
                    console.error(err);
                });
            } else {
                toast.error('No se encontraron productos válidos. Verifique las columnas Código y Descripción.');
            }
        } catch (error) {
            toast.error('Error al procesar el archivo Excel');
            console.error(error);
        }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <>
      <div className="space-y-4">
        <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-4 bg-background/50 border-b items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 flex-1 w-full lg:max-w-3xl items-center">
              <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar..." className="pl-10 h-10 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex bg-muted/50 p-1 rounded-xl border w-full sm:w-auto overflow-x-auto no-scrollbar">
                  {[{ id: 'all', label: 'Todos' }, { id: 'with_stock', label: 'Con Stock' }, { id: 'without_stock', label: 'Sin Stock' }].map((f) => (
                      <button key={f.id} onClick={() => setStockFilter(f.id as any)} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all whitespace-nowrap flex-1 sm:flex-none ${stockFilter === f.id ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{f.label}</button>
                  ))}
              </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full lg:w-auto justify-end">
              <div className="flex gap-2 mr-auto lg:mr-0">
                  <Button variant="outline" size="icon" onClick={() => setLayoutMode('table')} className={`h-10 w-10 ${layoutMode === 'table' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}><List className="w-4 h-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => setLayoutMode('cards')} className={`h-10 w-10 ${layoutMode === 'cards' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}><LayoutGrid className="w-4 h-4" /></Button>
              </div>
              <Tooltip>
                  <TooltipTrigger asChild><Button variant="outline" size="icon" className="rounded-full h-10 w-10"><HelpCircle className="w-4 h-4" /></Button></TooltipTrigger>
                  <TooltipContent className="max-w-xs p-4 bg-popover text-popover-foreground border shadow-xl"><p className="font-bold text-primary mb-2">Ayuda de Columnas:</p><ul className="text-xs space-y-1 list-disc pl-4 uppercase font-bold"><li><strong>cod:</strong> Identificador único.</li><li><strong>Precio:</strong> Valor unitario en centavos.</li><li><strong>Prioridad:</strong> 1-5.</li><li><strong>Stock Inicial:</strong> Punto de partida.</li></ul></TooltipContent>
              </Tooltip>
              <Button variant="outline" size="sm" onClick={handleNormalizeNegatives} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 text-red-500 border-red-200 hover:bg-red-50 flex-1 sm:flex-none"><AlertTriangle className="w-4 h-4" />Normalizar</Button>
              <Button variant="outline" size="sm" onClick={syncWithSystemCatalog} disabled={isSyncing} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 text-primary border-primary/20 flex-1 sm:flex-none"><RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />Catálogo Real</Button>
              <Button variant="outline" size="sm" onClick={handleAddNew} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 flex-1 sm:flex-none"><Plus className="w-4 h-4" />Nuevo</Button>
              <Button variant="outline" size="sm" onClick={handleRecalculateReportsChain} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 text-primary border-primary/20 flex-1 sm:flex-none"><RefreshCw className="w-4 h-4" />Recalcular IPVs</Button>
              <Button variant="outline" size="sm" onClick={handleRecalculateIntelligence} disabled={isSyncing} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 text-purple-500 border-purple-200 hover:bg-purple-50 flex-1 sm:flex-none"><Brain className={`w-4 h-4 ${isSyncing ? 'animate-pulse' : ''}`} />Inteligencia</Button>
              <Button variant="outline" size="sm" onClick={handleExportCatalog} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 flex-1 sm:flex-none"><Download className="w-4 h-4" /> Exportar</Button>
              <div className="relative flex-1 sm:flex-none">
                  <input type="file" accept=".xlsx, .xls" onChange={handleImportCatalog} className="hidden" id="catalog-import-input" />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('catalog-import-input')?.click()} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 w-full"><Upload className="w-4 h-4" /> Importar</Button>
              </div>

          </div>
        </div>

        {layoutMode === 'table' ? (
          <div className="table-scroll-wrapper">
              <Table className="data-table">
              <TableHeader>
                  <TableRow>
                  <TableHead className="w-8"><input type="checkbox" onChange={(e) => { if (e.target.checked) setSelectedProductIds(sortedAndFiltered.map(p => p.cod)); else setSelectedProductIds([]); }} checked={selectedProductIds.length === sortedAndFiltered.length && sortedAndFiltered.length > 0} /></TableHead>
                  <TableHead className="sticky-column-1"><SortButton column="cod" label="Código" /></TableHead>
                  <TableHead><SortButton column="descripcion" label="Descripción" /></TableHead>
                  <TableHead><SortButton column="priceEffectivenessScore" label="Efectividad" /></TableHead>
                  <TableHead>Sugerencia</TableHead>
                  <TableHead className="text-right"><SortButton column="precio_cents" label="Precio" className="justify-end w-full" /></TableHead>
                  <TableHead className="text-right"><SortButton column="initial" label="Inicial" className="justify-end w-full" /></TableHead>
                  <TableHead className="text-right"><SortButton column="sales" label="Ventas" className="justify-end w-full" /></TableHead>
                  <TableHead className="text-right"><SortButton column="final_stock" label="Stock Final" className="justify-end w-full" /></TableHead>
                  <TableHead className="text-center"><SortButton column="prioridad_algoritmo" label="Prio" className="justify-center w-full" /></TableHead>
                  <TableHead className="text-center">Comodín</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                  {sortedAndFiltered.length === 0 && editingId !== 'NEW' ? (
                  <TableRow><TableCell colSpan={13} className="h-24 text-center text-muted-foreground font-bold uppercase text-xs">No hay productos.</TableCell></TableRow>
                  ) : (
                  <>
                  {editingId === 'NEW' && (
                      <TableRow className="bg-primary/10">
                          <TableCell className="sticky-column-1"><Input value={editForm.cod} onChange={e => setEditForm({...editForm, cod: e.target.value})} placeholder="CÓDIGO" className="h-8 w-24 text-xs font-bold" /></TableCell>
                          <TableCell><Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} placeholder="Descripción..." className="h-8 text-xs min-w-[200px]" /></TableCell>
                          <TableCell><Input value={editForm.um} onChange={e => setEditForm({...editForm, um: e.target.value})} className="h-8 w-24 text-xs uppercase" /></TableCell>
                          <TableCell className="text-center"><Switch checked={editForm.es_paquete} onCheckedChange={checked => setEditForm({...editForm, es_paquete: checked})} /></TableCell>
                          <TableCell className="text-right"><Input type="number" step="0.01" value={editForm.precio_cents || 0} onChange={e => setEditForm({...editForm, precio_cents: parseFloat(e.target.value) || 0})} className="h-8 w-24 text-right text-xs font-black" /></TableCell>
                          <TableCell className="text-right"><Input type="number" min="0" value={editForm.stock_inicial_manual || 0} onChange={e => setEditForm({...editForm, stock_inicial_manual: Math.max(0, Number(e.target.value))})} className="h-8 w-16 text-right text-xs" /></TableCell>
                          <TableCell colSpan={2}></TableCell>
                          <TableCell className="text-center"><select value={editForm.prioridad_algoritmo} onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})} className="h-8 rounded-md border border-input bg-background px-2 text-xs">{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select></TableCell>
                          <TableCell className="text-center"><Switch checked={editForm.activo} onCheckedChange={checked => setEditForm({...editForm, activo: checked})} /></TableCell>
                          <TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" className="h-8 w-8 text-green-500" onClick={saveEditing}><Check className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={cancelEditing}><X className="w-4 h-4" /></Button></div></TableCell>
                      </TableRow>
                  )}
                  {sortedAndFiltered.map((p) => {
                      const isEditing = editingId === p.cod;
                      const stats = inventoryStats[p.cod] || { initial: 0, sales: 0, final: 0 };
                      const isSelected = selectedProductIds.includes(p.cod);
                      return (
                      <TableRow key={p.cod} className={`${isEditing ? "bg-primary/5" : ""} ${isSelected ? "bg-purple-50" : ""}`}>
                          <TableCell><input type="checkbox" checked={isSelected} onChange={(e) => { if (e.target.checked) setSelectedProductIds([...selectedProductIds, p.cod]); else setSelectedProductIds(selectedProductIds.filter(id => id !== p.cod)); }} /></TableCell>
                          <TableCell className="sticky-column-1 font-mono text-xs font-bold text-primary">{p.cod}</TableCell>
                          <TableCell>{isEditing ? (<div className="space-y-2"><Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} className="h-8 text-xs min-w-[200px]" /><Input placeholder="Categoría" value={editForm.categoria || ''} onChange={e => setEditForm({...editForm, categoria: e.target.value})} className="h-7 text-xs w-full" /></div>) : (<div><div className="text-xs font-bold">{p.descripcion}</div>{p.categoria && <Badge variant="secondary" className="text-xs h-3 px-1 mt-1 opacity-70 uppercase">{p.categoria}</Badge>}</div>)}</TableCell>
                          <TableCell>{!isEditing && p.priceEffectivenessScore !== undefined && (<div className="flex items-center gap-2"><div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full ${p.priceEffectivenessScore > 70 ? 'bg-green-500' : p.priceEffectivenessScore > 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${p.priceEffectivenessScore}%` }} /></div><span className="text-xs font-black">{p.priceEffectivenessScore}</span></div>)}</TableCell>
                          <TableCell>{!isEditing && p.suggestedPrice && (<Tooltip><TooltipTrigger asChild><Badge className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border-purple-500/20 gap-1 cursor-help"><Sparkles className="w-3 h-3" />{p.suggestedPrice}</Badge></TooltipTrigger><TooltipContent className="bg-popover text-popover-foreground border shadow-xl"><p className="text-xs max-w-xs">{p.suggestionReason}</p></TooltipContent></Tooltip>)}</TableCell>
                          <TableCell className="text-right">{isEditing ? (<Input type="number" step="0.01" value={editForm.precio_cents || 0} onChange={e => setEditForm({...editForm, precio_cents: parseFloat(e.target.value) || 0})} className="h-8 w-24 text-right text-xs font-black" />) : (<div className="flex flex-col items-end"><span className={`font-black text-xs ${p.precio_base_cents ? 'text-purple-600' : ''}`}>{p.precio_cents}</span>{p.precio_base_cents && (<span className="text-xs text-muted-foreground line-through">Base: {p.precio_base_cents}</span>)}</div>)}</TableCell>
                          <TableCell className="text-right text-xs font-bold text-muted-foreground">{stats.initial}</TableCell>
                          <TableCell className="text-right text-xs font-bold text-orange-500">{stats.sales}</TableCell>
                          <TableCell className={`text-right text-xs font-black ${stats.final < 0 ? 'text-red-500' : 'text-primary'}`}><div className="flex items-center justify-end gap-1">{stats.final < 0 && <AlertTriangle className="w-3 h-3" />}{stats.final}</div></TableCell>
                          <TableCell className="text-center">{isEditing ? (<div className="flex flex-col gap-1 items-center"><select value={editForm.priorityMode || 'manual'} onChange={e => setEditForm({...editForm, priorityMode: e.target.value as any})} className="h-7 rounded border bg-background px-1 text-xs uppercase font-bold"><option value="manual">Manual</option><option value="auto">Auto</option><option value="hybrid">Híbrido</option></select><select value={editForm.prioridad_algoritmo} onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})} className="h-7 rounded-md border border-input bg-background px-2 text-xs" disabled={editForm.priorityMode === 'auto'}>{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select></div>) : (<div className="flex flex-col items-center gap-1"><span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${p.priorityMode === 'auto' ? 'bg-purple-100 text-purple-700' : 'bg-primary/10 text-primary'} text-xs font-black shadow-sm`}>{p.prioridad_algoritmo}</span>{p.priorityMode && p.priorityMode !== 'manual' && (<span className="text-xs font-bold text-muted-foreground uppercase opacity-50">{p.priorityMode}</span>)}</div>)}</TableCell>
                          <TableCell className="text-center">{isEditing ? (<Switch checked={editForm.isWildcardCandidate} onCheckedChange={checked => setEditForm({...editForm, isWildcardCandidate: checked})} />) : (p.isWildcardCandidate ? <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 mx-auto" /> : <span className="opacity-10">-</span>)}</TableCell>
                          <TableCell className="text-center"><Switch checked={isEditing ? editForm.activo : p.activo} onCheckedChange={checked => isEditing ? setEditForm({...editForm, activo: checked}) : db.products.update(p.cod, { activo: checked })} disabled={!isEditing && editingId !== null} /></TableCell>
                          <TableCell className="text-right"><div className="flex justify-end gap-1">{isEditing ? (<Button variant="ghost" size="icon" className="h-8 w-8 text-green-500" onClick={saveEditing}><Check className="w-4 h-4" /></Button>) : (<Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => startEditing(p)}><Edit2 className="w-4 h-4" /></Button>)}<Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.cod)}><Trash2 className="w-4 h-4" /></Button></div></TableCell>
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
              {sortedAndFiltered.length === 0 && editingId !== 'NEW' ? (
                  <div className="h-24 flex items-center justify-center text-muted-foreground uppercase font-black text-xs">No hay productos</div>
              ) : (
                  <>
                  {editingId === 'NEW' && <NewProductCard editForm={editForm} setEditForm={setEditForm} onSave={saveEditing} onCancel={cancelEditing} />}
                  {sortedAndFiltered.map(p => (
                      <ProductCard key={p.cod} product={p} stats={inventoryStats[p.cod] || { initial: 0, sales: 0, final: 0 }} isEditing={editingId === p.cod} editForm={editForm} setEditForm={setEditForm} onSave={saveEditing} onCancel={cancelEditing} onEdit={() => startEditing(p)} onDelete={() => handleDelete(p.cod)} />
                  ))}
                  </>
              )}
          </div>
        )}
      </div>
      <BaseModal
        open={confirmation.open}
        onOpenChange={(open) => setConfirmation(prev => ({ ...prev, open }))}
        title={confirmation.title}
        footer={
          <div className="flex gap-2 w-full pt-4">
            <Button variant="outline" onClick={() => setConfirmation(prev => ({ ...prev, open: false }))} className="flex-1 h-11 font-black uppercase text-xs tracking-widest">Cancelar</Button>
            <Button variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'} onClick={() => { confirmation.onConfirm(); setConfirmation(prev => ({ ...prev, open: false })); }} className="flex-1 h-11 font-black uppercase text-xs tracking-widest">Confirmar</Button>
          </div>
        }
      >
        <div className="py-4"><p className="text-sm text-muted-foreground font-medium">{confirmation.message}</p></div>
      </BaseModal>
    </>
  );
}

function ProductCard({ product, stats, isEditing, editForm, setEditForm, onSave, onCancel, onEdit, onDelete }: any) {
    return (
        <Card className={`p-4 space-y-4 border-none shadow-md bg-card/50 backdrop-blur-sm relative overflow-hidden ${isEditing ? 'ring-2 ring-primary' : ''}`}>
            {product.isWildcardCandidate && (<div className="absolute top-0 right-0 p-1"><Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /></div>)}
            <div className="flex justify-between items-start">
                <div><div className="flex items-center gap-2"><p className="text-xs font-black text-primary uppercase tracking-widest">{product.cod}</p>{product.priceEffectivenessScore !== undefined && (<Badge variant="outline" className="text-xs h-3 px-1 border-primary/20 bg-primary/5">Eff: {product.priceEffectivenessScore}%</Badge>)}</div>{isEditing ? (<Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} className="h-8 mt-1 text-xs font-bold" />) : (<h4 className="font-bold text-sm leading-tight">{product.descripcion}</h4>)}</div>
                <div className="flex flex-col items-end gap-1">{isEditing ? (<div className="flex flex-col items-end gap-1"><Input value={editForm.um} onChange={e => setEditForm({...editForm, um: e.target.value})} className="h-7 w-20 text-xs uppercase text-right" placeholder="UM" /><select value={editForm.prioridad_algoritmo} onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})} className="h-7 rounded-md border border-input bg-background px-1 text-xs">{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>Prio {v}</option>)}</select></div>) : (<><Badge variant="outline" className="text-xs uppercase font-black">{product.um}</Badge><span className="text-xs font-bold text-muted-foreground uppercase opacity-50">Prio {product.prioridad_algoritmo}</span></>)}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 py-3 border-y border-border/50">
                <div className="text-center"><p className="text-xs font-black text-muted-foreground uppercase mb-1">Inicial</p>{isEditing ? (<Input type="number" min="0" value={editForm.stock_inicial_manual} onChange={e => setEditForm({...editForm, stock_inicial_manual: Math.max(0, Number(e.target.value))})} className="h-7 text-xs text-center" />) : (<p className="font-black text-lg">{stats.initial}</p>)}</div>
                <div className="text-center border-x border-border/50"><p className="text-xs font-black text-muted-foreground uppercase mb-1">Ventas</p><p className="font-black text-lg text-orange-500">{stats.sales}</p></div>
                <div className="text-center"><p className="text-xs font-black text-muted-foreground uppercase mb-1">Final</p><p className={`font-black text-lg ${stats.final < 0 ? 'text-red-500' : 'text-primary'}`}>{stats.final}</p></div>
            </div>
            <div className="flex justify-between items-center"><div className="flex flex-col gap-2">{isEditing ? (<div className="flex items-center gap-2"><Switch checked={editForm.es_paquete} onCheckedChange={checked => setEditForm({...editForm, es_paquete: checked})} /><Label className="text-xs uppercase font-black">Paquete</Label>{editForm.es_paquete && (<Input type="number" value={editForm.contenido_paquete} onChange={e => setEditForm({...editForm, contenido_paquete: Number(e.target.value)})} className="h-7 w-12 text-xs text-center" />)}</div>) : (product.es_paquete && (<div className="flex items-center gap-1"><Badge className="bg-primary/10 text-primary text-xs font-black uppercase">Pack X{product.contenido_paquete}</Badge></div>))}</div></div>
            <div className="flex justify-between items-center">
                <div><p className="text-xs font-bold text-muted-foreground uppercase">Precio</p>{isEditing ? (<div className="flex items-center gap-1"><Input type="number" step="0.01" value={editForm.precio_cents || 0} onChange={e => setEditForm({...editForm, precio_cents: parseFloat(e.target.value) || 0})} className="h-7 text-xs w-24 font-black" /></div>) : (<div className="flex flex-col items-end"><p className={`font-black text-base ${product.precio_base_cents ? 'text-purple-600' : ''}`}>{product.precio_cents}</p>{product.precio_base_cents && (<p className="text-xs text-muted-foreground line-through">Base: {product.precio_base_cents}</p>)}</div>)}</div>
                <div className="flex gap-2">{isEditing ? (<Button size="sm" className="h-11 w-11 sm:h-9 sm:w-9 neu-btn-primary" onClick={onSave}><Check className="w-4 h-4" /></Button>) : (<Button size="sm" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9 neu-btn" onClick={onEdit}><Edit2 className="w-4 h-4" /></Button>)}<Button size="sm" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button></div>
            </div>
        </Card>
    );
}

function NewProductCard({ editForm, setEditForm, onSave, onCancel }: any) {
    return (
        <Card className="p-4 space-y-4 border-2 border-dashed border-primary/50 bg-primary/5 relative">
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label className="text-xs uppercase font-black">Código</Label><Input value={editForm.cod} onChange={e => setEditForm({...editForm, cod: e.target.value})} className="h-8 text-xs font-bold uppercase" placeholder="SKU-123" /></div><div className="space-y-1"><Label className="text-xs uppercase font-black">UM</Label><Input value={editForm.um} onChange={e => setEditForm({...editForm, um: e.target.value})} className="h-8 text-xs uppercase" placeholder="UNIDADES" /></div></div>
            <div className="space-y-1"><Label className="text-xs uppercase font-black">Descripción</Label><Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} className="h-8 text-xs" placeholder="Nombre del producto..." /></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label className="text-xs uppercase font-black">Precio de Venta</Label><Input type="number" step="0.01" value={editForm.precio_cents || 0} onChange={e => setEditForm({...editForm, precio_cents: parseFloat(e.target.value) || 0})} className="h-8 text-xs font-black" /></div><div className="space-y-1"><Label className="text-xs uppercase font-black">Prioridad</Label><select value={editForm.prioridad_algoritmo} onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})} className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-xs">{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>Prioridad {v}</option>)}</select></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label className="text-xs uppercase font-black">Stock Inicial</Label><Input type="number" min="0" value={editForm.stock_inicial_manual} onChange={e => setEditForm({...editForm, stock_inicial_manual: Math.max(0, Number(e.target.value))})} className="h-8 text-xs" /></div><div className="space-y-1 flex flex-col justify-end"><div className="flex items-center gap-2 pb-1"><Switch checked={editForm.es_paquete} onCheckedChange={checked => setEditForm({...editForm, es_paquete: checked})} /><Label className="text-xs uppercase font-black">¿Es Paquete?</Label></div>{editForm.es_paquete && (<Input type="number" placeholder="Contenido..." value={editForm.contenido_paquete} onChange={e => setEditForm({...editForm, contenido_paquete: Number(e.target.value)})} className="h-7 text-xs" />)}</div></div>
            <div className="flex gap-2 pt-2"><Button className="flex-1 neu-btn-primary h-12 sm:h-10 font-black text-xs uppercase" onClick={onSave}><Check className="w-4 h-4 mr-2" /> Guardar</Button><Button variant="ghost" className="h-12 sm:h-10 text-xs uppercase font-bold" onClick={onCancel}>Cancelar</Button></div>
        </Card>
    );
}
