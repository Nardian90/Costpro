'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { StockService } from '@/lib/ipv/StockService';
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
import { ShieldCheck, CheckCircle2, Trash2, Search, Workflow,  HelpCircle, Info, Edit2, Check, X, Plus, RefreshCw, LayoutGrid, List, AlertTriangle, Brain, Sparkles, Star, Percent, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, Download, Upload, ArrowRight, CornerDownRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatCurrencyCents } from '@/lib/utils';
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
import { importCatalogProducts } from '@/lib/ipv/importUtils';
import ActionMenu, { Action } from "@/components/ui/ActionMenu";
import { createWorkbook } from '@/lib/export/lazy-excel';
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

    // Persistencia de estados
  React.useEffect(() => {
    localStorage.setItem('catalog_searchTerm', searchTerm);
    localStorage.setItem('catalog_layoutMode', layoutMode);
    localStorage.setItem('catalog_sortConfig', JSON.stringify(sortConfig));
    localStorage.setItem('catalog_stockFilter', stockFilter);
    localStorage.setItem('catalog_selectedProductIds', JSON.stringify(selectedProductIds));
  }, [searchTerm, layoutMode, sortConfig, stockFilter]);

  const user = useAuthStore(state => state.user);
  const isAdmin = hasRole(user, 'admin');
  const isEncargado = hasRole(user, 'encargado');

  const { data: stores } = useStores(user?.id || '', isAdmin, isEncargado);
  const products = useLiveQuery(() => db.products.toArray());

  React.useEffect(() => {
    if (products && products.length > 0 && selectedProductIds.length === 0) {
        setSelectedProductIds(products.filter(p => p.stock_inicial_manual > 0).map(p => p.cod));
    }
  }, [products]);

  const reports = useLiveQuery(() => db.ipv_reports.orderBy('fecha_reporte').reverse().toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const productMovements = useLiveQuery(() => db.product_movements.toArray());

    const inventoryStatsMap = useLiveQuery(
        () => StockService.getDetailedStockStatsMap(),
        [products, reconciliationLines, productMovements],
        new Map<string, any>()
    );

    const inventoryStats = React.useMemo(() => {
        const stats: Record<string, any> = {};
        inventoryStatsMap.forEach((v, k) => {
            stats[k] = v;
        });
        return stats;
    }, [inventoryStatsMap]);

    const sortedAndFiltered = React.useMemo(() => {
    let result = products?.filter(p =>
      p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.cod.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    if (stockFilter !== "all") {
        result = result.filter(p => {
            const stats = inventoryStats[p.cod] || { final: 0 };
            if (stockFilter === "with_stock") return stats.final > 0;
            if (stockFilter === "without_stock") return stats.final === 0;
            if (stockFilter === "negative_stock") return stats.final < 0;
            return true;
        });
    }

    if (sortConfig) {
        result.sort((a, b) => {
            if (sortConfig.key === 'cod') {
                const aNum = parseFloat(a.cod) || 0;
                const bNum = parseFloat(b.cod) || 0;
                if (aNum !== bNum) return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
                return sortConfig.direction === 'asc' ? a.cod.localeCompare(b.cod) : b.cod.localeCompare(a.cod);
            }
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
            } else if (sortConfig.key === 'entradas') {
                aValue = inventoryStats[a.cod]?.entradas || 0;
                bValue = inventoryStats[b.cod]?.entradas || 0;
            } else if (sortConfig.key === 'salidas') {
                aValue = inventoryStats[a.cod]?.salidas || 0;
                bValue = inventoryStats[b.cod]?.salidas || 0;
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

  const paginatedResult = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedAndFiltered.slice(start, start + pageSize);
  }, [sortedAndFiltered, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedAndFiltered.length / pageSize);

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

        // Si hay reportes IPV, debemos recalcular la cadena para que el nuevo saldo inicial se propague
        const reportsCount = await db.ipv_reports.count();
        if (reportsCount > 0) {
            await recalculateIPVReportsChain(db);
        }

        setEditingId(null);
        setEditForm({});
        toast.success('Producto guardado correctamente');
    } catch (error) {
        toast.error('Error al guardar el producto');
    }
  };

  const handleAddNew = () => {
      const newProd: Product = {
          cod: '', id_grupo: '', descripcion: '', um: 'Unidades', es_paquete: false, contenido_paquete: 1, precio_cents: 0, costo_unitario_cents: 0, cuenta_contable: '', prioridad_algoritmo: 3, activo: true, stock_inicial_manual: 0, created_at: new Date().toISOString(), priorityMode: 'manual', isWildcardCandidate: false, isEligibleForCashFill: true
      };
      setEditingId('NEW');
      setEditForm(newProd);
  };
  const handleCleanupNegative = async () => {
    const negativeProducts = products?.filter(p => {
        const stats = inventoryStats[p.cod] || { final: 0 };
        return stats.final < 0;
    });
    if (!negativeProducts || negativeProducts.length === 0) {
        toast.info("No hay productos con existencias negativas");
        return;
    }
    askConfirmation("Limpiar Stock Negativo", `¿Deseas eliminar las transacciones de los ${negativeProducts.length} productos con stock negativo? Esto pondrá sus existencias en cero y dejará las facturas correspondientes en proceso.`, async () => {
        try {
            for (const p of negativeProducts) {
                const lines = reconciliationLines?.filter(l => l.product_cod === p.cod) || [];
                if (lines.length > 0) {
                    await db.reconciliation_lines.bulkDelete(lines.map(l => l.id));
                    // Marcar transacciones como PENDIENTE si quedaron sin líneas
                    const txRefs = Array.from(new Set(lines.map(l => l.transaction_ref)));
                    for (const ref of txRefs) {
                        const remaining = await db.reconciliation_lines.where("transaction_ref").equals(ref).count();
                        if (remaining === 0) {
                            await db.bank_statements.where("referencia_origen").equals(ref).modify({ estado_conciliacion: "PENDIENTE" });
                        }
                    }
                }
            }
            toast.success("Limpieza de stock negativo completada");
        } catch (error) {
            toast.error("Error al limpiar stock negativo");
        }
    });
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
                await db.products.update(p.cod, {
                    stock_inicial_manual: newInitial,
                    updated_at: new Date().toISOString()
                });
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


  const handleAutoClassifyHierarchy = async () => {
    if (!products) return;
    askConfirmation('Auto-Clasificar Jerarquía', '¿Deseas clasificar inteligentemente la jerarquía de descomposiciones basándote en los precios de cada grupo?', async () => {
        try {
            const { classifyGroupHierarchy } = await import('@/lib/ipv/utils');
            const updated = classifyGroupHierarchy(products);
            await db.products.bulkPut(updated);
            toast.success('Jerarquía clasificada automáticamente');
        } catch (error) {
            toast.error('Error al clasificar jerarquía');
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
            const stats = inventoryStats[p.cod] || { initial: 0, entradas: 0, salidas: 0, sales: 0, final: 0 };
            const autoPriority = calculateDynamicPriority(p, { stock: stats.final, salesQty: stats.sales, salesValue: stats.sales * p.precio_cents });
            await db.products.update(p.cod, {
                priceEffectivenessScore: score, suggestedPrice: suggestion.price, suggestionReason: suggestion.reason, isWildcardCandidate: isWildcard,
                prioridad_algoritmo: autoPriority,
                priorityMode: "auto",
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
                cod: p.sku || p.id, descripcion: p.name, um: 'UNIDADES', es_paquete: false, contenido_paquete: 1, precio_cents: Math.round((p.price || 0) * 100), prioridad_algoritmo: 3, activo: true, stock_inicial_manual: Math.round(p.stock_quantity || 0), created_at: new Date().toISOString()
            }));
            await db.products.bulkPut(systemProducts);
            toast.success(`Sincronización completa: ${systemProducts.length} productos cargados`, { id: 'sync-catalog' });
        } catch (error) {
            toast.error('Error al sincronizar con el sistema', { id: 'sync-catalog' });
        } finally {
            setIsSyncing(false);
        }
    });
  };

    const handleRecalculateReportsChain = async () => {
    askConfirmation('Actualizar Datos', '¿Sincronizar existencias del catálogo con los datos de trabajo y reportes?', async () => {
        const loadingToast = toast.loading('Sincronizando datos...');
        try {
            // 1. Recalcular cadena de reportes IPV
            await recalculateIPVReportsChain(db);

            // 2. Obtener reportes actualizados
            const allReports = await db.ipv_reports.orderBy('fecha_reporte').toArray();

            // 3. Si hay reportes, sincronizar el stock inicial del catálogo con el primer reporte
            if (allReports.length > 0) {
                const firstReport = allReports[0];
                for (const fila of firstReport.filas) {
                    await db.products.update(fila.cod, {
                        stock_inicial_manual: fila.saldo_inicial_qty
                    });
                }
            }

            // 4. Actualizar estadísticas de ventas en la tabla de productos para Inteligencia
            const products = await db.products.toArray();
            const lines = await db.reconciliation_lines.toArray();

            for (const p of products) {
                const sales = lines
                    .filter(l => l.product_cod === p.cod)
                    .reduce((sum, l) => sum + (l.cantidad || 0), 0);

                await db.products.update(p.cod, {
                    ventas_qty_historico: sales,
                    ventas_valor_historico: sales * p.precio_cents,
                    updated_at: new Date().toISOString()
                });
            }

            toast.success('Sincronización completa: Catálogo, Conciliaciones e IPV alineados.', { id: loadingToast });
        } catch (error) {
            toast.error('Error al actualizar los datos', { id: loadingToast });
        }
    });
  };
const handleExportCatalog = async () => {
    const XLSX = await createWorkbook();
    const exportData = products && products.length > 0
        ? products.map(p => ({
            'cod': p.cod,
            'cuenta_contable': p.cuenta_contable || '',
            'costo_unitario': p.costo_unitario_cents || 0,
            'id_grupo': p.id_grupo || '',
            'cod_hijo': p.cod_hijo || '',
            'descripcion': p.descripcion,
            'um': p.um,
            'precio_cents': Number(p.precio_cents),
            'prioridad_alg': p.prioridad_algoritmo,
            'activo': p.activo ? 'VERDADERO' : 'FALSO',
            'es_paquete': p.es_paquete ? 'VERDADERO' : 'FALSO',
            'contenido_paquete': p.contenido_paquete,
            'stock_inicial_manual': Number(p.stock_inicial_manual)
          }))
        : [{
            'cod': 'SKU-001',
            'id_grupo': 'GRUPO-001',
            'cod_hijo': 'SKU-002',
            'descripcion': 'Producto de Ejemplo',
            'um': 'UNIDADES',
            'precio_cents': 100.00,
            'prioridad_alg': 3,
            'activo': 'VERDADERO',
            'es_paquete': 'FALSO',
            'contenido_paquete': 1,
            'stock_inicial_manual': 10
          }];

    const ws = XLSX.utils.json_to_sheet(exportData);

    // Apply numeric formatting to currency column (F) and stock (K)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        if (ws['F' + (R + 1)]) {
            ws['F' + (R + 1)].t = 'n';
            ws['F' + (R + 1)].z = '#,##0.00';
        }
        if (ws['K' + (R + 1)]) {
            ws['K' + (R + 1)].t = 'n';
            ws['K' + (R + 1)].z = '0.00';
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catalogo");

    XLSX.writeFile(wb, `catalogo_ipv_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Catálogo exportado");
  };

  const handleImportCatalog = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const XLSX = await createWorkbook();
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];

            if (!jsonData || jsonData.length === 0) {
                toast.error('El archivo está vacío');
                return;
            }

            const { products: validProducts, result: validation } = await ImportValidator.validateImport(jsonData);

            if (validProducts.length > 0) {
                await importCatalogProducts(validProducts as Product[]);
                toast.success(`Se importaron ${validProducts.length} productos correctamente`);
                if (validation.warnings.length > 0) {
                  toast.warning(`${validation.warnings.length} advertencias detectadas`);
                }
                event.target.value = '';
            } else {
                toast.error('No se encontraron productos válidos. Verifique las columnas Código y Descripción.');
            }
        } catch (error) {
            toast.error('Error al procesar el archivo Excel');
        }
    };
    reader.readAsArrayBuffer(file);
  };
  const catalogActions: Action[] = React.useMemo(() => [
    { id: "add", label: "Nuevo", icon: Plus, onClick: handleAddNew },

    { id: "update", label: "Actualizar", icon: RefreshCw, onClick: handleRecalculateReportsChain, variant: "primary" },
    { id: "sync-real", label: "Catálogo Real", icon: LayoutGrid, onClick: syncWithSystemCatalog, disabled: isSyncing },
    { id: "classify", label: "Clasificar", icon: Workflow, onClick: handleAutoClassifyHierarchy, variant: "outline", className: "text-blue-500" },
    { id: "intel", label: "Inteligencia", icon: Brain, onClick: handleRecalculateIntelligence, disabled: isSyncing, variant: "outline", className: "text-purple-500" },
    { id: "cleanup", label: "Saneamiento", icon: ShieldCheck, onClick: handleCleanupNegative, variant: "warning" },
    { id: "normalize", label: "Normalizar", icon: AlertTriangle, onClick: handleNormalizeNegatives, variant: "danger" },
    { id: "export", label: "Exportar", icon: Download, onClick: handleExportCatalog },
    { id: "import", label: "Importar", icon: Upload, onClick: () => document.getElementById("catalog-import-input")?.click() },
    { id: "clear", label: "Vaciar", icon: Trash2, onClick: clearCatalog, variant: "danger" }
  ], [isSyncing, handleAddNew, syncWithSystemCatalog, handleRecalculateReportsChain, handleRecalculateIntelligence, handleCleanupNegative, handleNormalizeNegatives, handleExportCatalog, clearCatalog]);

  return (
    <>
      <div className="space-y-4">
        <ActionMenu
            actions={catalogActions}
            sticky={false}
            topOffset="sticky top-[60px] sm:top-[92px]"
            className="mb-2 !-mx-4 px-4 py-2"
        />

        <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-4 bg-background/50 border-b items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 flex-1 w-full lg:max-w-3xl items-center">
              <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar..." className="pl-10 h-10 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex bg-muted/50 p-1 rounded-xl border w-full sm:w-auto overflow-x-auto no-scrollbar">
                  {[{ id: 'all', label: 'Todos' }, { id: 'with_stock', label: 'Con Stock' }, { id: 'without_stock', label: 'Sin Stock' }, { id: 'negative_stock', label: 'Negativo' }].map((f) => (
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
              <input type="file" accept=".xlsx, .xls" onChange={handleImportCatalog} className="hidden" id="catalog-import-input" aria-label="Importar catálogo desde archivo Excel" />
          </div>
        </div>
        {layoutMode === 'table' ? (
          <div className="table-scroll-wrapper">
              <Table className="data-table">
              <TableHeader>
                  <TableRow>
                  <TableHead className="w-8"><input type="checkbox" onChange={(e) => { if (e.target.checked) setSelectedProductIds(paginatedResult.map(p => p.cod)); else setSelectedProductIds([]); }} checked={selectedProductIds.length === sortedAndFiltered.length && sortedAndFiltered.length > 0} aria-label="Seleccionar todos los productos" /></TableHead>
                  <TableHead className="sticky top-0 left-0 bg-background z-30"><SortButton column="cod" label="Código" /></TableHead>
                  <TableHead className="sticky top-0 left-[100px] bg-background z-30"><SortButton column="descripcion" label="Descripción" /></TableHead>
                  <TableHead className="sticky top-0 bg-background z-20">UM</TableHead>
                  <TableHead className="sticky top-0 bg-background z-20"><SortButton column="priceEffectivenessScore" label="Efectividad" /></TableHead>
                  <TableHead className="sticky top-0 bg-background z-20">Sugerencia</TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-right"><SortButton column="precio_cents" label="Precio" className="justify-end w-full" /></TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-right">Costo</TableHead>
                  <TableHead className="sticky top-0 bg-background z-20">Cuenta</TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-right"><SortButton column="initial" label="Inicial" className="justify-end w-full" /></TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-right"><SortButton column="entradas" label="Entrada" className="justify-end w-full" /></TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-right"><SortButton column="salidas" label="Salida" className="justify-end w-full" /></TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-right"><SortButton column="sales" label="Ventas" className="justify-end w-full" /></TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-right"><SortButton column="final_stock" label="Stock Final" className="justify-end w-full" /></TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-center"><SortButton column="prioridad_algoritmo" label="Prio" className="justify-center w-full" /></TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-center">Cash Fill</TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-center">Comodín</TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-center">Estado</TableHead>
                  <TableHead className="sticky top-0 bg-background z-20 text-right">Acciones</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                  {paginatedResult.length === 0 && editingId !== 'NEW' ? (
                  <TableRow><TableCell colSpan={18} className="h-24 text-center text-muted-foreground font-bold uppercase text-xs">No hay productos.</TableCell></TableRow>
                  ) : (
                  <>
                  {editingId === 'NEW' && (
                      <TableRow className="bg-primary/10">
                          <TableCell></TableCell>
                          <TableCell className="sticky left-0 bg-background z-10">
                              <div className="flex flex-col gap-1">
                                  <Input value={editForm.cod} onChange={e => setEditForm({...editForm, cod: e.target.value})} placeholder="CÓDIGO" className="h-8 w-24 text-xs font-bold" />
                                  <Input value={editForm.id_grupo || ""} onChange={e => setEditForm({...editForm, id_grupo: e.target.value})} placeholder="GRUPO" className="h-6 w-24 text-[10px] font-bold" />
                                  <Input value={editForm.cod_hijo || ""} onChange={e => setEditForm({...editForm, cod_hijo: e.target.value})} placeholder="COD HIJO" className="h-6 w-24 text-[10px] font-bold" />
                              </div>
                          </TableCell>
                          <TableCell className="sticky left-[100px] bg-background z-10">
                              <div className="space-y-1">
                                  <Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} placeholder="Descripción..." className="h-8 text-xs min-w-[200px]" />
                                  <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-bold uppercase opacity-50">Pack</span>
                                      <Switch checked={editForm.es_paquete} onCheckedChange={checked => setEditForm({...editForm, es_paquete: checked})} className="scale-75" />
                                  </div>
                              </div>
                          </TableCell>
                          <TableCell>
                              <Input value={editForm.um} onChange={e => setEditForm({...editForm, um: e.target.value})} placeholder="UM" className="h-8 w-24 text-xs uppercase" />
                          </TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-right"><Input type="number" step="0.01" value={editForm.precio_cents ? editForm.precio_cents / 100 : 0} onChange={e => setEditForm({...editForm, precio_cents: Math.round(parseFloat(e.target.value) * 100) || 0})} className="h-8 w-24 text-right text-xs font-black" /></TableCell>
                          <TableCell className="text-right"><Input type="number" step="0.01" value={editForm.costo_unitario_cents ? editForm.costo_unitario_cents / 100 : 0} onChange={e => setEditForm({...editForm, costo_unitario_cents: Math.round(parseFloat(e.target.value) * 100) || 0})} className="h-8 w-20 text-right text-xs" /></TableCell>
                          <TableCell><Input value={editForm.cuenta_contable || ""} onChange={e => setEditForm({...editForm, cuenta_contable: e.target.value})} placeholder="CUENTA" className="h-8 w-24 text-xs font-mono" /></TableCell>
                          <TableCell className="text-right"><Input type="number" min="0" value={editForm.stock_inicial_manual || 0} onChange={e => setEditForm({...editForm, stock_inicial_manual: Math.max(0, Number(e.target.value))})} className="h-8 w-16 text-right text-xs" /></TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-center"><select value={editForm.prioridad_algoritmo} onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})} className="h-8 rounded-md border border-input bg-background px-2 text-xs">{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select></TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-center"><Switch checked={editForm.activo} onCheckedChange={checked => setEditForm({...editForm, activo: checked})} /></TableCell>
                          <TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" className="h-8 w-8 text-green-500" onClick={saveEditing}><Check className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={cancelEditing}><X className="w-4 h-4" /></Button></div></TableCell>
                      </TableRow>
                  )}
                  {paginatedResult.map((p) => {
                      const isEditing = editingId === p.cod;
                      const stats = inventoryStats[p.cod] || { initial: 0, entradas: 0, salidas: 0, sales: 0, final: 0 };
                      const isSelected = selectedProductIds.includes(p.cod);
                      return (
                      <TableRow key={p.cod} className={`${isEditing ? "bg-primary/5" : ""} ${isSelected ? "bg-purple-50" : ""}`}>
                          <TableCell><input type="checkbox" checked={isSelected} onChange={(e) => { if (e.target.checked) setSelectedProductIds([...selectedProductIds, p.cod]); else setSelectedProductIds(selectedProductIds.filter(id => id !== p.cod)); }} aria-label={`Seleccionar ${p.descripcion}`} /></TableCell>
                          <TableCell className="sticky left-0 bg-background z-10 font-mono text-xs font-bold text-primary">
                              <div className="flex flex-col">
                                  <div className="flex items-center gap-1">
                                    <span>{p.cod}</span>
                                    {p.cod_hijo && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="p-0.5 rounded-full bg-blue-100 text-blue-600 cursor-help"><CornerDownRight className="w-3 h-3" /></div>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="text-[10px] font-bold uppercase p-2 bg-blue-600 text-foreground border-none shadow-lg">
                                          Se descompone en: {p.cod_hijo}
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                  {p.id_grupo && <span className="text-[10px] text-muted-foreground opacity-70">G: {p.id_grupo}</span>}
                              </div>
                          </TableCell>
                          <TableCell className="sticky left-[100px] bg-background z-10">{isEditing ? (<div className="space-y-2"><Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} className="h-8 text-xs min-w-[200px]" /><Input placeholder="Categoría" value={editForm.categoria || ''} onChange={e => setEditForm({...editForm, categoria: e.target.value})} className="h-7 text-xs w-full" /></div>) : (<div><div className="text-xs font-bold">{p.descripcion}</div>{p.categoria && <Badge variant="secondary" className="text-xs h-3 px-1 mt-1 opacity-70 uppercase">{p.categoria}</Badge>}</div>)}</TableCell>
                          <TableCell>
                              {isEditing ? (
                                  <Input value={editForm.um} onChange={e => setEditForm({...editForm, um: e.target.value})} className="h-8 w-24 text-xs uppercase" />
                              ) : (
                                  <Badge variant="outline" className="text-[10px] uppercase font-black">{p.um}</Badge>
                              )}
                          </TableCell>
                          <TableCell>{!isEditing && p.priceEffectivenessScore !== undefined && (<div className="flex items-center gap-2"><div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full ${p.priceEffectivenessScore > 70 ? 'bg-green-500' : p.priceEffectivenessScore > 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${p.priceEffectivenessScore}%` }} /></div><span className="text-xs font-black">{p.priceEffectivenessScore}</span></div>)}</TableCell>
                          <TableCell>{!isEditing && p.suggestedPrice && (<Tooltip><TooltipTrigger asChild><Badge className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border-purple-500/20 gap-1 cursor-help"><Sparkles className="w-3 h-3" />{p.suggestedPrice}</Badge></TooltipTrigger><TooltipContent className="bg-popover text-popover-foreground border shadow-xl"><p className="text-xs max-w-xs">{p.suggestionReason}</p></TooltipContent></Tooltip>)}</TableCell>
                          <TableCell className="text-right">{isEditing ? (<Input type="number" step="0.01" value={editForm.precio_cents ? editForm.precio_cents / 100 : 0} onChange={e => setEditForm({...editForm, precio_cents: Math.round(parseFloat(e.target.value) * 100) || 0})} className="h-8 w-24 text-right text-xs font-black" />) : (<div className="flex flex-col items-end"><span className={`font-black text-xs ${p.precio_base_cents ? 'text-purple-600' : ''}`}>{formatCurrencyCents(p.precio_cents)}</span>{p.precio_base_cents && (<span className="text-xs text-muted-foreground line-through">Base: {formatCurrencyCents(p.precio_base_cents)}</span>)}</div>)}</TableCell>
                          <TableCell className="text-right">{isEditing ? (<Input type="number" step="0.01" value={editForm.costo_unitario_cents ? editForm.costo_unitario_cents / 100 : 0} onChange={e => setEditForm({...editForm, costo_unitario_cents: Math.round(parseFloat(e.target.value) * 100) || 0})} className="h-8 w-20 text-right text-xs" />) : (<span className="text-xs font-bold text-muted-foreground">{formatCurrencyCents(p.costo_unitario_cents || 0)}</span>)}</TableCell>
                          <TableCell>{isEditing ? (<Input value={editForm.cuenta_contable || ""} onChange={e => setEditForm({...editForm, cuenta_contable: e.target.value})} className="h-8 w-24 text-xs font-mono" />) : (<span className="text-xs font-mono opacity-70">{p.cuenta_contable || "-"}</span>)}</TableCell>
                          <TableCell className="text-right text-xs font-bold text-muted-foreground">{isEditing ? (<Input type="number" min="0" value={editForm.stock_inicial_manual || 0} onChange={e => setEditForm({...editForm, stock_inicial_manual: Math.max(0, Number(e.target.value))})} className="h-8 w-16 text-right text-xs ml-auto" />) : stats.initial}</TableCell>
                          <TableCell className="text-right text-xs font-bold text-green-600">{stats.entradas}</TableCell>
                          <TableCell className="text-right text-xs font-bold text-blue-600">{stats.salidas}</TableCell>
                          <TableCell className="text-right text-xs font-bold text-orange-500">{stats.sales}</TableCell>
                          <TableCell className={`text-right text-xs font-black ${stats.final < 0 ? 'text-red-500' : 'text-primary'}`}><div className="flex items-center justify-end gap-1">{stats.final < 0 && <AlertTriangle className="w-3 h-3" />}{stats.final}</div></TableCell>
                          <TableCell className="text-center">{isEditing ? (<div className="flex flex-col gap-1 items-center"><select value={editForm.priorityMode || 'manual'} onChange={e => setEditForm({...editForm, priorityMode: e.target.value as any})} className="h-7 rounded border bg-background px-1 text-xs uppercase font-bold"><option value="manual">Manual</option><option value="auto">Auto</option><option value="hybrid">Híbrido</option></select><select value={editForm.prioridad_algoritmo} onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})} className="h-7 rounded-md border border-input bg-background px-2 text-xs" disabled={editForm.priorityMode === 'auto'}>{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select></div>) : (<div className="flex flex-col items-center gap-1"><span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${p.priorityMode === 'auto' ? 'bg-purple-100 text-purple-700' : 'bg-primary/10 text-primary'} text-xs font-black shadow-sm`}>{p.prioridad_algoritmo}</span>{p.priorityMode && p.priorityMode !== 'manual' && (<span className="text-xs font-bold text-muted-foreground uppercase opacity-50">{p.priorityMode}</span>)}</div>)}</TableCell>
                          <TableCell className="text-center">{isEditing ? (<Switch checked={editForm.isEligibleForCashFill ?? true} onCheckedChange={checked => setEditForm({...editForm, isEligibleForCashFill: checked})} />) : (p.isEligibleForCashFill !== false ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <span className="opacity-10">-</span>)}</TableCell>
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
              {paginatedResult.length === 0 && editingId !== 'NEW' ? (
                  <div className="h-24 flex items-center justify-center text-muted-foreground uppercase font-black text-xs">No hay productos</div>
              ) : (
                  <>
                  {editingId === 'NEW' && <NewProductCard editForm={editForm} setEditForm={setEditForm} onSave={saveEditing} onCancel={cancelEditing} />}
                  {paginatedResult.map(p => (
                      <ProductCard key={p.cod} product={p} stats={inventoryStats[p.cod] || { initial: 0, entradas: 0, salidas: 0, sales: 0, final: 0 }} isEditing={editingId === p.cod} editForm={editForm} setEditForm={setEditForm} onSave={saveEditing} onCancel={cancelEditing} onEdit={() => startEditing(p)} onDelete={() => handleDelete(p.cod)} />
                  ))}
                  </>
              )}
          </div>
        )}
        <div className="flex items-center justify-between p-4 bg-background/50 border-t">
            <div className="text-xs font-bold text-muted-foreground uppercase">
                Página {currentPage} de {totalPages} ({sortedAndFiltered.length} productos)
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="h-8 text-xs font-black uppercase tracking-widest">Anterior</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="h-8 text-xs font-black uppercase tracking-widest">Siguiente</Button>
            </div>
        </div>
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
                <div><div className="flex items-center gap-2"><p className="text-xs font-black text-primary uppercase tracking-widest">{product.cod}</p>{product.id_grupo && <div className="flex items-center gap-1"><Badge variant="secondary" className="text-[10px] h-4 px-1 opacity-70">G: {product.id_grupo}</Badge>{product.cod_hijo && <Badge variant="outline" className="text-[8px] h-3 px-1 border-blue-200 text-blue-500 font-black"><CornerDownRight className="w-2 h-2 mr-1" /> {product.cod_hijo}</Badge>}</div>}{product.priceEffectivenessScore !== undefined && (<Badge variant="outline" className="text-xs h-3 px-1 border-primary/20 bg-primary/5">Eff: {product.priceEffectivenessScore}%</Badge>)}</div>{isEditing ? (<Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} className="h-8 mt-1 text-xs font-bold" />) : (<h4 className="font-bold text-sm leading-tight">{product.descripcion}</h4>)}</div>
                <div className="flex flex-col items-end gap-1">{isEditing ? (<div className="flex flex-col items-end gap-1"><Input value={editForm.um} onChange={e => setEditForm({...editForm, um: e.target.value})} className="h-7 w-20 text-xs uppercase text-right" placeholder="UM" /><select value={editForm.prioridad_algoritmo} onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})} className="h-7 rounded-md border border-input bg-background px-1 text-xs">{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>Prio {v}</option>)}</select></div>) : (<><Badge variant="outline" className="text-xs uppercase font-black">{product.um}</Badge><span className="text-xs font-bold text-muted-foreground uppercase opacity-50">Prio {product.prioridad_algoritmo}</span></>)}</div>
            </div>
                        <div className="grid grid-cols-5 gap-1 py-3 border-y border-border/50">
                <div className="text-center"><p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Inicial</p>{isEditing ? (<Input type="number" min="0" value={editForm.stock_inicial_manual} onChange={e => setEditForm({...editForm, stock_inicial_manual: Math.max(0, Number(e.target.value))})} className="h-7 text-[10px] text-center px-1" />) : (<p className="font-black text-sm">{stats.initial}</p>)}</div>
                <div className="text-center border-l border-border/50"><p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Entrada</p><p className="font-black text-sm text-green-600">{stats.entradas}</p></div>
                <div className="text-center border-l border-border/50"><p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Salida</p><p className="font-black text-sm text-blue-600">{stats.salidas}</p></div>
                <div className="text-center border-l border-border/50"><p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Ventas</p><p className="font-black text-sm text-orange-500">{stats.sales}</p></div>
                <div className="text-center border-l border-border/50"><p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Final</p><p className={`font-black text-sm ${stats.final < 0 ? 'text-red-500' : 'text-primary'}`}>{stats.final}</p></div>
            </div>
            <div className="flex justify-between items-center"><div className="flex flex-col gap-2">{isEditing ? (<div className="flex items-center gap-2"><Switch checked={editForm.es_paquete} onCheckedChange={checked => setEditForm({...editForm, es_paquete: checked})} /><Label className="text-xs uppercase font-black">Paquete</Label>{editForm.es_paquete && (<Input type="number" value={editForm.contenido_paquete} onChange={e => setEditForm({...editForm, contenido_paquete: Number(e.target.value)})} className="h-7 w-12 text-xs text-center" />)}</div>) : (product.es_paquete && (<div className="flex items-center gap-1"><Badge className="bg-primary/10 text-primary text-xs font-black uppercase">Pack X{product.contenido_paquete}</Badge></div>))}</div></div>
            <div className="flex justify-between items-center">
                <div className="flex gap-4">
                    <div><p className="text-xs font-bold text-muted-foreground uppercase">Precio</p>{isEditing ? (<div className="flex items-center gap-1"><Input type="number" step="0.01" value={editForm.precio_cents ? editForm.precio_cents / 100 : 0} onChange={e => setEditForm({...editForm, precio_cents: Math.round(parseFloat(e.target.value) * 100) || 0})} className="h-7 text-xs w-20 font-black" /></div>) : (<div className="flex flex-col items-end"><p className={`font-black text-sm ${product.precio_base_cents ? 'text-purple-600' : ''}`}>{formatCurrencyCents(product.precio_cents)}</p>{product.precio_base_cents && (<p className="text-[10px] text-muted-foreground line-through">Base: {formatCurrencyCents(product.precio_base_cents)}</p>)}</div>)}</div>
                    <div><p className="text-xs font-bold text-muted-foreground uppercase">Costo</p>{isEditing ? (<div className="flex items-center gap-1"><Input type="number" step="0.01" value={editForm.costo_unitario_cents ? editForm.costo_unitario_cents / 100 : 0} onChange={e => setEditForm({...editForm, costo_unitario_cents: Math.round(parseFloat(e.target.value) * 100) || 0})} className="h-7 text-xs w-20" /></div>) : (<p className="font-bold text-sm text-muted-foreground">{formatCurrencyCents(product.costo_unitario_cents || 0)}</p>)}</div>
                    <div><p className="text-xs font-bold text-muted-foreground uppercase">Cuenta</p>{isEditing ? (<div className="flex items-center gap-1"><Input value={editForm.cuenta_contable || ""} onChange={e => setEditForm({...editForm, cuenta_contable: e.target.value})} className="h-7 text-xs w-24 font-mono" /></div>) : (<p className="text-xs font-mono opacity-70">{product.cuenta_contable || "-"}</p>)}</div>
                </div>
                <div className="flex gap-2">{isEditing ? (<Button size="sm" className="h-11 w-11 sm:h-9 sm:w-9 neu-btn-primary" onClick={onSave}><Check className="w-4 h-4" /></Button>) : (<Button size="sm" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9 neu-btn" onClick={onEdit}><Edit2 className="w-4 h-4" /></Button>)}<Button size="sm" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button></div>
            </div>
        </Card>
    );
}

function NewProductCard({ editForm, setEditForm, onSave, onCancel }: any) {
    return (
        <Card className="p-4 space-y-4 border-2 border-dashed border-primary/50 bg-primary/5 relative">
            <div className="grid grid-cols-3 gap-3"><div className="space-y-1"><Label className="text-xs uppercase font-black">Código</Label><Input value={editForm.cod} onChange={e => setEditForm({...editForm, cod: e.target.value})} className="h-8 text-xs font-bold uppercase" placeholder="SKU-123" /></div><div className="space-y-1"><Label className="text-xs uppercase font-black">ID Grupo</Label><Input value={editForm.id_grupo || ""} onChange={e => setEditForm({...editForm, id_grupo: e.target.value})} className="h-8 text-xs font-bold uppercase" placeholder="OPCIONAL" /></div><div className="space-y-1"><Label className="text-xs uppercase font-black">Cód. Hijo</Label><Input value={editForm.cod_hijo || ""} onChange={e => setEditForm({...editForm, cod_hijo: e.target.value})} className="h-8 text-xs font-bold uppercase" placeholder="AUTO" /></div><div className="space-y-1"><Label className="text-xs uppercase font-black">UM</Label><Input value={editForm.um} onChange={e => setEditForm({...editForm, um: e.target.value})} className="h-8 text-xs uppercase" placeholder="UNIDADES" /></div></div>
            <div className="space-y-1"><Label className="text-xs uppercase font-black">Descripción</Label><Input value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} className="h-8 text-xs" placeholder="Nombre del producto..." /></div>
            <div className="grid grid-cols-3 gap-3"><div className="space-y-1"><Label className="text-xs uppercase font-black">Precio</Label><Input type="number" step="0.01" value={editForm.precio_cents ? editForm.precio_cents / 100 : 0} onChange={e => setEditForm({...editForm, precio_cents: Math.round(parseFloat(e.target.value) * 100) || 0})} className="h-8 text-xs font-black" /></div><div className="space-y-1"><Label className="text-xs uppercase font-black">Costo</Label><Input type="number" step="0.01" value={editForm.costo_unitario_cents ? editForm.costo_unitario_cents / 100 : 0} onChange={e => setEditForm({...editForm, costo_unitario_cents: Math.round(parseFloat(e.target.value) * 100) || 0})} className="h-8 text-xs" /></div><div className="space-y-1"><Label className="text-xs uppercase font-black">Cuenta</Label><Input value={editForm.cuenta_contable || ""} onChange={e => setEditForm({...editForm, cuenta_contable: e.target.value})} className="h-8 text-xs font-mono" placeholder="700..." /></div><div className="space-y-1"><Label className="text-xs uppercase font-black">Prioridad</Label><select value={editForm.prioridad_algoritmo} onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})} className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-xs">{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>Prioridad {v}</option>)}</select></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label className="text-xs uppercase font-black">Stock Inicial</Label><Input type="number" min="0" value={editForm.stock_inicial_manual} onChange={e => setEditForm({...editForm, stock_inicial_manual: Math.max(0, Number(e.target.value))})} className="h-8 text-xs" /></div><div className="space-y-1 flex flex-col justify-end"><div className="flex items-center gap-2 pb-1"><Switch checked={editForm.es_paquete} onCheckedChange={checked => setEditForm({...editForm, es_paquete: checked})} /><Label className="text-xs uppercase font-black">¿Es Paquete?</Label></div>{editForm.es_paquete && (<Input type="number" placeholder="Contenido..." value={editForm.contenido_paquete} onChange={e => setEditForm({...editForm, contenido_paquete: Number(e.target.value)})} className="h-7 text-xs" />)}</div></div>
            <div className="flex gap-2 pt-2"><Button className="flex-1 neu-btn-primary h-12 sm:h-10 font-black text-xs uppercase" onClick={onSave}><Check className="w-4 h-4 mr-2" /> Guardar</Button><Button variant="ghost" className="h-12 sm:h-10 text-xs uppercase font-bold" onClick={onCancel}>Cancelar</Button></div>
        </Card>
    );
}
