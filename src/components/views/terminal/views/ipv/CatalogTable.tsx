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
import { Trash2, Search, HelpCircle, Info, Edit2, Check, X, Plus, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
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

  const products = useLiveQuery(() => db.products.toArray());
  const reports = useLiveQuery(() => db.ipv_reports.orderBy('fecha_reporte').reverse().toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());

  const inventoryStats = React.useMemo(() => {
    if (!products || !reports || !reconciliationLines) return {};

    const stats: Record<string, { initial: number; sales: number; final: number }> = {};
    const lastClosedReport = reports.find(r => r.estado === 'CERRADO');

    products.forEach(p => {
        // Saldo Inicial: Buscar en el último reporte cerrado, o usar stock_inicial_manual si no hay reportes
        let initial = p.stock_inicial_manual || 0;
        if (lastClosedReport) {
            const reportRow = lastClosedReport.filas.find(f => f.cod === p.cod);
            if (reportRow) initial = reportRow.existencia_final_qty;
        }

        // Ventas: Sumar líneas de conciliación posteriores al último reporte (o todas si no hay reporte)
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

  const clearCatalog = async () => {
    if (confirm('¿ESTÁS SEGURO? Se borrará TODO el catálogo cargado actualmente.')) {
        await db.products.clear();
    }
  };

  const handleRecalculateReportsChain = async () => {
    if (confirm('¿Recalcular toda la cadena de reportes IPV? Esto actualizará los saldos iniciales y finales de todos los reportes existentes basándose en el stock inicial del catálogo y las ventas registradas.')) {
        try {
            const allProducts = await db.products.toArray();
            const productMap = new Map(allProducts.map(p => [p.cod, p]));
            const allReports = await db.ipv_reports.orderBy('fecha_reporte').toArray();

            for (let i = 0; i < allReports.length; i++) {
                const report = allReports[i];
                const prevReport = i > 0 ? allReports[i - 1] : null;

                const updatedFilas = report.filas.map(f => {
                    const product = productMap.get(f.cod);
                    // Si es el primer reporte, usar stock_inicial_manual. Si no, usar existencia_final del anterior.
                    const initial = prevReport
                        ? (prevReport.filas.find(pf => pf.cod === f.cod)?.existencia_final_qty || 0)
                        : (product?.stock_inicial_manual || 0);

                    const venta = f.venta_cantidad_qty;
                    const final = initial - venta;

                    return {
                        ...f,
                        saldo_inicial_qty: initial,
                        total_disponible_qty: initial,
                        existencia_final_qty: final
                    };
                });

                await db.ipv_reports.update(report.id, {
                    filas: updatedFilas,
                    updated_at: new Date().toISOString()
                });

                // Actualizar el array local para la siguiente iteración
                allReports[i].filas = updatedFilas;
            }

            toast.success('Cadena de reportes recalculada exitosamente');
        } catch (error) {
            console.error(error);
            toast.error('Error al recalcular los reportes');
        }
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 flex flex-col md:flex-row gap-4 bg-background/50 border-b items-center justify-between">
        <div className="relative flex-1 max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o descripción..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full">
                            <HelpCircle className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs p-4 space-y-2">
                        <p className="font-bold text-primary">Ayuda de Columnas:</p>
                        <ul className="text-xs space-y-1 list-disc pl-4">
                            <li><strong>cod:</strong> Identificador único (EAN, SKU o ID interno).</li>
                            <li><strong>UM:</strong> Unidad de Medida (Unidades, Caja, etc).</li>
                            <li><strong>Precio:</strong> Valor unitario en centavos (ej: 26000 = $260.00).</li>
                            <li><strong>Prioridad:</strong> Del 1 al 5. El algoritmo prioriza matches con menor número.</li>
                            <li><strong>Es Paquete:</strong> Indica si contiene múltiples unidades físicas.</li>
                        </ul>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <Button
                variant="outline"
                size="sm"
                onClick={handleAddNew}
                className="text-xs uppercase font-black tracking-widest gap-2"
            >
                <Plus className="w-4 h-4" />
                Nuevo Producto
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleRecalculateReportsChain}
                className="text-xs uppercase font-black tracking-widest gap-2 text-primary border-primary/20"
            >
                <RefreshCw className="w-4 h-4" />
                Recalcular IPVs
            </Button>

            <Button
                variant="destructive"
                size="sm"
                onClick={clearCatalog}
                className="text-xs uppercase font-black tracking-widest"
            >
                Limpiar Catálogo
            </Button>
        </div>
      </div>

      {/* Mini Help Info */}
      <div className="px-4 py-2 bg-primary/5 border-l-4 border-primary mx-4 rounded-r-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-bold text-primary uppercase">Tip Profesional:</span> El motor de matching utiliza la <strong>Prioridad</strong> para resolver ambigüedades.
            Si tienes varios productos con el mismo precio, asegúrate de dar mayor prioridad (número menor) al producto que más se vende por transferencia.
        </div>
      </div>

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
                <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
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
                            {editForm.es_paquete && (
                                <Input
                                    type="number"
                                    value={editForm.contenido_paquete}
                                    onChange={e => setEditForm({...editForm, contenido_paquete: Number(e.target.value)})}
                                    className="h-6 w-12 text-[10px] text-center"
                                />
                            )}
                        </div>
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                            <span className="text-[10px] text-muted-foreground">$</span>
                            <Input
                                type="number"
                                value={(editForm.precio_cents || 0) / 100}
                                onChange={e => setEditForm({...editForm, precio_cents: Math.round(Number(e.target.value) * 100)})}
                                className="h-8 w-24 text-right text-xs"
                            />
                        </div>
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
                    <TableCell className="sticky-column-1 font-mono text-xs font-bold text-primary">
                      {isEditing ? (
                        <Input
                            value={editForm.cod}
                            readOnly
                            className="h-8 w-20 text-[10px] bg-muted"
                        />
                      ) : p.cod}
                    </TableCell>

                    <TableCell>
                      {isEditing ? (
                        <Input
                            value={editForm.descripcion}
                            onChange={e => setEditForm({...editForm, descripcion: e.target.value})}
                            className="h-8 text-xs min-w-[200px]"
                        />
                      ) : (
                        <div className="font-medium">{p.descripcion}</div>
                      )}
                    </TableCell>

                    <TableCell>
                      {isEditing ? (
                        <Input
                            value={editForm.um}
                            onChange={e => setEditForm({...editForm, um: e.target.value})}
                            className="h-8 w-24 text-[10px] uppercase"
                        />
                      ) : (
                        <Badge variant="outline" className="text-[10px] uppercase">{p.um}</Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      {isEditing ? (
                        <div className="flex flex-col items-center gap-1">
                            <Switch
                                checked={editForm.es_paquete}
                                onCheckedChange={checked => setEditForm({...editForm, es_paquete: checked})}
                            />
                            {editForm.es_paquete && (
                                <Input
                                    type="number"
                                    value={editForm.contenido_paquete}
                                    onChange={e => setEditForm({...editForm, contenido_paquete: Number(e.target.value)})}
                                    className="h-6 w-12 text-[10px] text-center"
                                />
                            )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                            <Badge variant={p.es_paquete ? "default" : "secondary"} className="text-[9px]">
                                {p.es_paquete ? "SÍ" : "NO"}
                            </Badge>
                            {p.es_paquete && <span className="text-[10px] font-bold">x{p.contenido_paquete}</span>}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                            <span className="text-[10px] text-muted-foreground">$</span>
                            <Input
                                type="number"
                                value={(editForm.precio_cents || 0) / 100}
                                onChange={e => setEditForm({...editForm, precio_cents: Math.round(Number(e.target.value) * 100)})}
                                className="h-8 w-24 text-right text-xs"
                            />
                        </div>
                      ) : (
                        <div className="font-black">{formatCurrency(p.precio_cents / 100)}</div>
                      )}
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
                            <span className="font-bold text-muted-foreground">{stats.initial}</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-orange-500">{stats.sales}</TableCell>
                    <TableCell className={`text-right font-black ${stats.final < 0 ? 'text-red-500' : 'text-primary'}`}>
                        {stats.final}
                    </TableCell>

                    <TableCell className="text-center">
                      {isEditing ? (
                        <select
                            value={editForm.prioridad_algoritmo}
                            onChange={e => setEditForm({...editForm, prioridad_algoritmo: Number(e.target.value)})}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                            {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
                            {p.prioridad_algoritmo}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      {isEditing ? (
                        <div className="flex justify-center">
                            <Switch
                                checked={editForm.activo}
                                onCheckedChange={checked => setEditForm({...editForm, activo: checked})}
                            />
                        </div>
                      ) : (
                        <Badge className={p.activo ? 'bg-green-500' : 'bg-red-500'}>
                            {p.activo ? 'ACTIVO' : 'INACTIVO'}
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {isEditing ? (
                          <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-500 hover:bg-green-500/10"
                                onClick={saveEditing}
                            >
                                <Check className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:bg-muted"
                                onClick={cancelEditing}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-primary hover:bg-primary/10"
                                onClick={() => startEditing(p)}
                            >
                                <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(p.cod)}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
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
    </div>
  );
}
