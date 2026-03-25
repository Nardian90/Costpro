import React, { useState, useMemo } from "react";
import {
  FileText, Download, Settings2, Calendar, AlertCircle,
  CheckCircle2, Play, Loader2, History, X, Search,
  ArrowRight
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, isWithinInterval, parseISO, isBefore, addDays } from "date-fns";
import { toast } from "sonner";

import { db, Product, ReconciliationLine, ProductMovement } from "@/lib/dexie";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";

import { generateMVTContent, downloadMVT, MVTExportContext } from "@/lib/ipv/mvt/engine";
import { STANDARD_MVT_TEMPLATE } from "@/lib/ipv/mvt/defaults";
import { MVTTemplate, MVTExportLog } from "@/lib/ipv/mvt/types";
import { MVTPreview } from "./MVTPreview";
import { TemplateEditor } from "./TemplateEditor";

export const MVTExportView = () => {
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-01'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<MVTTemplate>(STANDARD_MVT_TEMPLATE);

  // DB Data
  const templates = useLiveQuery(() => db.mvt_templates.toArray()) || [];
  const settings = useLiveQuery(() => db.mvt_settings.get('current'));
  const exportLogs = useLiveQuery(() => db.mvt_exports_log.orderBy('timestamp').reverse().limit(20).toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];

  // We need ALL movements and lines to calculate dynamic stock
  const allReconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray()) || [];
  const allProductMovements = useLiveQuery(() => db.product_movements.toArray()) || [];

  // Filtered data for the CURRENT export (movements section)
  const reconciliationLinesInRange = useMemo(() => {
    return allReconciliationLines.filter(line => {
      const date = line.fecha_operacion;
      return date >= dateRange.start && date <= dateRange.end;
    });
  }, [allReconciliationLines, dateRange]);

  const prepareExportContext = (): MVTExportContext => {
    // 1. Calculate Dynamic Existence for each product at the END date
    const productData = products.map(p => {
      let stock = p.stock_inicial_manual || 0;

      // Add entries (Movements) up to end date
      allProductMovements.forEach(m => {
        if (isBefore(parseISO(m.fecha), addDays(parseISO(dateRange.end), 1))) {
           if (m.producto_destino_cod === p.cod) stock += m.cantidad_destino;
           if (m.producto_origen_cod === p.cod) stock -= m.cantidad_origen;
        }
      });

      // Subtract sales (Reconciliation Lines) up to end date
      allReconciliationLines.forEach(l => {
        if (l.product_cod === p.cod && isBefore(parseISO(l.fecha_operacion), addDays(parseISO(dateRange.end), 1))) {
           stock -= l.cantidad;
        }
      });

      return { ...p, existencia: stock };
    });

    // 2. Group movements in range for the [Movimientos] section
    const movementMap = new Map<string, { cantidad: number, total_cents: number }>();
    reconciliationLinesInRange.forEach(line => {
      const existing = movementMap.get(line.product_cod) || { cantidad: 0, total_cents: 0 };
      movementMap.set(line.product_cod, {
        cantidad: existing.cantidad + line.cantidad,
        total_cents: existing.total_cents + line.importe_linea_cents
      });
    });

    const contextMovements = Array.from(movementMap.entries()).map(([cod, data]) => {
      const prod = productData.find(p => p.cod === cod);
      return {
        product: prod || { cod, descripcion: 'Desconocido', um: 'U', existencia: 0 },
        cantidad: data.cantidad,
        importe_cents: data.total_cents,
        costo_unitario: prod?.costo_unitario_cents ? prod.costo_unitario_cents / 100 : 0
      };
    });

    return {
      global: {
        numero: (settings?.lastExportNumber || 0) + 1,
        fecha: format(parseISO(dateRange.end), 'dd/MM/yyyy'),
        almacen: settings?.almacen || '0109',
        centro: settings?.centro || '0110200012611',
        concepto: settings?.concepto || '210',
        cuenta_mn: settings?.globalCuenta || '7000050'
      },
      products: contextMovements.map(m => m.product),
      movements: contextMovements
    };
  };

  const previewContent = useMemo(() => {
    if (products.length === 0) return "Cargando datos...";
    try {
      return generateMVTContent(currentTemplate, prepareExportContext());
    } catch (e) {
      return "Error generando vista previa: " + (e as Error).message;
    }
  }, [currentTemplate, products, reconciliationLinesInRange, settings, dateRange]);

  const handleExport = async () => {
    setIsGenerating(true);
    try {
      const context = prepareExportContext();
      const content = generateMVTContent(currentTemplate, context);
      const fileName = `MVT_EXP_${context.global.numero}_${format(new Date(), 'yyyyMMdd')}.mvt`;

      downloadMVT(content, fileName);

      // Log export
      const log: MVTExportLog = {
        id: crypto.randomUUID(),
        templateId: currentTemplate.id,
        exportNumber: context.global.numero,
        fileName,
        dateRange,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS'
      };

      await db.mvt_exports_log.add(log);
      await db.mvt_settings.update('current', {
        lastExportNumber: context.global.numero
      });

      toast.success("Archivo MVT generado con éxito");
    } catch (error) {
      console.error(error);
      toast.error("Error al generar el archivo MVT");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 border-slate-200">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center">
            <FileText className="mr-3 w-7 h-7 text-indigo-600" />
            Exportación Contable MVT
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Generación de archivos de movimientos contables estructurados para Versat y otros sistemas ERP.
          </p>
        </div>
        <div className="flex items-center gap-2">
           <Button
            variant="outline"
            size="sm"
            className="bg-white border-slate-200 shadow-sm h-9"
            onClick={() => setShowHistory(true)}
           >
              <History className="w-4 h-4 mr-2 text-slate-500" />
              Historial
           </Button>
           <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 h-9"
            onClick={handleExport}
            disabled={isGenerating || products.length === 0}
           >
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Generar y Descargar .MVT
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card className="border-slate-200/60 shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold flex items-center">
                <Settings2 className="w-4 h-4 mr-2 text-indigo-500" />
                Parámetros de Exportación
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-700">Fecha Inicio</Label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                      <Input
                        type="date"
                        className="pl-9 h-10 border-slate-200 focus:ring-indigo-500"
                        value={dateRange.start}
                        onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-700">Fecha Fin</Label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                      <Input
                        type="date"
                        className="pl-9 h-10 border-slate-200 focus:ring-indigo-500"
                        value={dateRange.end}
                        onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <Label className="text-xs font-medium text-slate-700">Plantilla Activa</Label>
                  <select
                    className="w-full h-10 border border-slate-200 rounded-md bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={currentTemplate.id}
                    onChange={(e) => {
                      const selected = templates.find(t => t.id === e.target.value);
                      if (selected) setCurrentTemplate(selected);
                    }}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                    <option value={STANDARD_MVT_TEMPLATE.id}>{STANDARD_MVT_TEMPLATE.name}</option>
                  </select>
                </div>

                <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-lg flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-amber-900 uppercase">Resumen de Datos</p>
                    <p className="text-xs text-amber-800/80 leading-relaxed">
                      Se detectaron <strong>{reconciliationLinesInRange.length}</strong> transacciones de venta en el rango.
                      La existencia se calculará dinámicamente al <strong>{dateRange.end}</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" />
                Valores Globales
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-slate-400">Concepto</Label>
                    <Input className="h-9" value={settings?.concepto || '210'} readOnly />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-slate-400">Almacén</Label>
                    <Input className="h-9" value={settings?.almacen || '0109'} readOnly />
                  </div>
               </div>
               <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-slate-400">Centro de Costo</Label>
                  <Input className="h-9" value={settings?.centro || '0110200012611'} readOnly />
               </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-8 space-y-6">
          <Tabs defaultValue="preview" className="w-full">
            <div className="flex items-center justify-between mb-2">
              <TabsList className="bg-slate-200/50 p-1">
                <TabsTrigger value="preview" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Play className="w-3.5 h-3.5 mr-2" />
                  Vista Previa
                </TabsTrigger>
                <TabsTrigger value="editor" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Settings2 className="w-3.5 h-3.5 mr-2" />
                  Configurar Estructura
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="preview" className="mt-0">
              <MVTPreview content={previewContent} />
            </TabsContent>

            <TabsContent value="editor" className="mt-0">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <TemplateEditor
                    template={currentTemplate}
                    onSave={async (newT) => {
                      await db.mvt_templates.put(newT);
                      toast.success("Plantilla actualizada correctamente");
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Historial de Exportaciones</DialogTitle>
            <DialogDescription>
              Últimas 20 exportaciones generadas por el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 border-b">
                <tr>
                  <th className="p-3 text-left font-medium text-slate-500">No.</th>
                  <th className="p-3 text-left font-medium text-slate-500">Fecha Gen</th>
                  <th className="p-3 text-left font-medium text-slate-500">Archivo</th>
                  <th className="p-3 text-left font-medium text-slate-500">Rango</th>
                  <th className="p-3 text-left font-medium text-slate-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {exportLogs.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No hay registros aún</td></tr>
                ) : exportLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold text-indigo-600">#{log.exportNumber}</td>
                    <td className="p-3 text-slate-600">{format(parseISO(log.timestamp), 'dd/MM/yy HH:mm')}</td>
                    <td className="p-3 text-slate-900 font-medium truncate max-w-[150px]">{log.fileName}</td>
                    <td className="p-3 text-slate-500 flex items-center gap-1">
                      {log.dateRange.start} <ArrowRight className="w-3 h-3" /> {log.dateRange.end}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100">
                        {log.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowHistory(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
