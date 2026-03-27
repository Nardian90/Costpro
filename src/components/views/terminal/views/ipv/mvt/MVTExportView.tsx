import React, { useState, useMemo } from "react";
import {
  FileText, Download, FolderArchive, Layers, Settings2, Calendar, AlertCircle,
  CheckCircle2, Play, Loader2, History, X, Search,
  ArrowRight, Layout
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

import JSZip from "jszip";
import { generateMVTContent, downloadMVT, MVTExportContext } from "@/lib/ipv/mvt/engine";
import {
  STANDARD_MVT_TEMPLATE,
  MVT_INVENTARIO_TEMPLATE,
  MVT_RECEPCION_TEMPLATE,
  MVT_RECEPCION_ALT_TEMPLATE,
  CYP_COMEDOR_TEMPLATE,
  CYP_DEPOSITO_TEMPLATE,
  DEFAULT_MVT_SETTINGS
} from "@/lib/ipv/mvt/defaults";
import { MVTTemplate, MVTExportLog, MVTSettings } from "@/lib/ipv/mvt/types";
import { MVTPreview } from "./MVTPreview";
import { TemplateManager } from "./TemplateManager";
import { TemplateEditor } from "./TemplateEditor";

const SYSTEM_TEMPLATES = [
    STANDARD_MVT_TEMPLATE,
    MVT_INVENTARIO_TEMPLATE,
    MVT_RECEPCION_TEMPLATE,
    MVT_RECEPCION_ALT_TEMPLATE,
    CYP_COMEDOR_TEMPLATE,
    CYP_DEPOSITO_TEMPLATE
];

export const MVTExportView = () => {
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-01'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showManager, setShowManager] = useState(false);
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

  const prepareExportContexts = (): MVTExportContext[] => {
    const grouping = settings?.grouping || "range";
    const baseExportNumber = (settings?.lastExportNumber || 0) + 1;

    const getProductDataAt = (cutoffDate: string) => {
      return products.map(p => {
        let stock = p.stock_inicial_manual || 0;

        allProductMovements.forEach(m => {
          if (isBefore(parseISO(m.fecha), addDays(parseISO(cutoffDate), 1))) {
             if (m.producto_destino_cod === p.cod) stock += m.cantidad_destino;
             if (m.producto_origen_cod === p.cod) stock -= m.cantidad_origen;
          }
        });

        allReconciliationLines.forEach(l => {
          if (l.product_cod === p.cod && isBefore(parseISO(l.fecha_operacion), addDays(parseISO(cutoffDate), 1))) {
             stock -= l.cantidad;
          }
        });

        return { ...p, existencia: stock };
      });
    };

    const createSingleContext = (lines: ReconciliationLine[], date: string, num: number, description?: string): MVTExportContext => {
      const productData = getProductDataAt(date);
      const movementMap = new Map<string, { cantidad: number, total_cents: number }>();
      lines.forEach(line => {
        const existing = movementMap.get(line.product_cod) || { cantidad: 0, total_cents: 0 };
        movementMap.set(line.product_cod, {
          cantidad: existing.cantidad + line.cantidad,
          total_cents: existing.total_cents + line.importe_linea_cents
        });
      });

      const contextMovements = Array.from(movementMap.entries()).map(([cod, data]) => {
        const prod = productData.find(p => p.cod === cod);
        return {
          product: prod || { cod, descripcion: "Desconocido", um: "U", existencia: 0 },
          cantidad: data.cantidad,
          importe_cents: data.total_cents,
          costo_unitario: prod?.costo_unitario_cents ? prod.costo_unitario_cents / 100 : 0
        };
      });

      const totalImporte = lines.reduce((acc, l) => acc + (l.importe_linea_cents / 100), 0);

      return {
        global: {
          numero: num,
          fecha: format(parseISO(date), "dd/MM/yyyy"),
          almacen: settings?.almacen || "0109",
          centro: settings?.centro || "0110200012611",
          concepto: settings?.concepto || "210",
          cuenta_mn: settings?.globalCuenta || "7000050",
          importe: totalImporte,
          entregado_a: "ADMINISTRADOR",
          deposito: "10140",
          descripcion: description || settings?.concepto || "210"
        },
        products: productData,
        movements: contextMovements
      };
    };

    if (grouping === "range") {
      return [createSingleContext(reconciliationLinesInRange, dateRange.end, baseExportNumber)];
    }

    if (grouping === "day") {
      const daysMap = new Map<string, ReconciliationLine[]>();
      reconciliationLinesInRange.forEach(line => {
        const date = line.fecha_operacion;
        const existing = daysMap.get(date) || [];
        daysMap.set(date, [...existing, line]);
      });

      const sortedDates = Array.from(daysMap.keys()).sort();
      return sortedDates.map((date, idx) => createSingleContext(daysMap.get(date)!, date, baseExportNumber + idx));
    }

    if (grouping === "transaction") {
      const txMap = new Map<string, ReconciliationLine[]>();
      const txOrder: string[] = [];
      reconciliationLinesInRange.forEach(line => {
        const txRef = line.transaction_ref;
        if (!txMap.has(txRef)) {
          txMap.set(txRef, []);
          txOrder.push(txRef);
        }
        txMap.get(txRef)!.push(line);
      });

      return txOrder.map((txRef, idx) => {
        const lines = txMap.get(txRef)!;
        const date = lines[0].fecha_operacion;
        return createSingleContext(lines, date, baseExportNumber + idx, `TRX: ${txRef}`);
      });
    }
    return [];
  };

  const previewContent = useMemo(() => {
    try {
      const contexts = prepareExportContexts();
      if (contexts.length === 0) return "No hay datos para el rango seleccionado";
      return contexts.map(ctx => generateMVTContent(currentTemplate, ctx)).join("\r\n" + "=".repeat(40) + "\r\n");
    } catch (e) {
      return "Error generando vista previa: " + (e as Error).message;
    }
  }, [currentTemplate, reconciliationLinesInRange, products, settings, dateRange]);

  const handleExport = async () => {
    setIsGenerating(true);
    try {
      const contexts = prepareExportContexts();
      if (contexts.length === 0) {
        toast.error("No hay datos para exportar en este rango");
        return;
      }

      const structure = settings?.fileStructure || "single";
      const ext = currentTemplate.fileExtension || "mvt";

      if (structure === "single") {
        const content = contexts.map(ctx => generateMVTContent(currentTemplate, ctx)).join("\r\n");
        const firstNum = contexts[0].global.numero;
        const lastNum = contexts[contexts.length - 1].global.numero;
        const fileName = contexts.length > 1
          ? `EXP_${firstNum}_TO_${lastNum}_${format(new Date(), "yyyyMMdd")}.${ext}`
          : `EXP_${firstNum}_${format(new Date(), "yyyyMMdd")}.${ext}`;

        downloadMVT(content, fileName);

        const log: MVTExportLog = {
          id: crypto.randomUUID(),
          templateId: currentTemplate.id,
          exportNumber: lastNum,
          fileName,
          dateRange: { ...dateRange },
          timestamp: new Date().toISOString(),
          status: "SUCCESS"
        };
        await db.mvt_exports_log.add(log);
        await db.mvt_settings.put({ ...(settings || DEFAULT_MVT_SETTINGS), id: "current", lastExportNumber: lastNum });

      } else {
        const zip = new JSZip();
        contexts.forEach(ctx => {
          const content = generateMVTContent(currentTemplate, ctx);
          const fileName = `EXP_${ctx.global.numero}_${ctx.global.fecha.replace(/\//g, "")}.${ext}`;
          zip.file(fileName, content);
        });

        const blob = await zip.generateAsync({ type: "blob" });
        const zipFileName = `EXPORT_MVT_${format(new Date(), "yyyyMMdd_HHmm")}.zip`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        const lastNum = contexts[contexts.length - 1].global.numero;
        const log: MVTExportLog = {
          id: crypto.randomUUID(),
          templateId: currentTemplate.id,
          exportNumber: lastNum,
          fileName: zipFileName,
          dateRange: { ...dateRange },
          timestamp: new Date().toISOString(),
          status: "SUCCESS"
        };
        await db.mvt_exports_log.add(log);
        await db.mvt_settings.put({ ...(settings || DEFAULT_MVT_SETTINGS), id: "current", lastExportNumber: lastNum });
      }

      toast.success(`Exportación completada (${contexts.length} registros)`);
    } catch (error) {
      console.error(error);
      toast.error("Error en la exportación contable");
    } finally {
      setIsGenerating(false);
    }
  };
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-8 h-8 text-indigo-600" />
            EXPORTACIÓN MVT / CYP
          </h2>
          <p className="text-slate-500 text-sm font-medium">Generación de archivos contables para Versat ERP</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(true)}
            className="h-10 px-4 rounded-xl font-bold text-xs uppercase tracking-widest gap-2 bg-white hover:bg-slate-50 border-slate-200"
          >
            <History className="w-4 h-4 text-indigo-500" />
            Historial
          </Button>
          <Button
            onClick={handleExport}
            disabled={isGenerating || reconciliationLinesInRange.length === 0}
            className="h-10 px-6 rounded-xl font-black text-xs uppercase tracking-widest gap-2 neu-btn-primary"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Ejecutar Exportación
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card className="border-slate-200/60 shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold flex items-center">
                <Settings2 className="w-4 h-4 mr-2 text-indigo-500" />
                Configuración
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-medium text-slate-700">Plantilla Activa</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-indigo-600 hover:text-indigo-700"
                      onClick={() => setShowManager(true)}
                    >
                      <Layout className="w-3 h-3 mr-1" />
                      Gestionar
                    </Button>
                  </div>
                  <select
                    className="w-full h-10 border border-slate-200 rounded-md bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={currentTemplate.id}
                    onChange={(e) => {
                      const sysTemplate = SYSTEM_TEMPLATES.find(t => t.id === e.target.value);
                      if (sysTemplate) {
                        setCurrentTemplate(sysTemplate);
                        return;
                      }
                      const selected = templates.find(t => t.id === e.target.value);
                      if (selected) setCurrentTemplate(selected);
                    }}
                  >
                    <optgroup label="Plantillas del Sistema">
                        {SYSTEM_TEMPLATES.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </optgroup>
                    {templates.length > 0 && (
                      <optgroup label="Personalizadas">
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                    )}
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
                <Settings2 className="w-4 h-4 mr-2 text-indigo-500" />
                Configuración de Reportes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
               <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-slate-400">Agrupación de Datos</Label>
                  <select
                    className="w-full h-9 border border-slate-200 rounded-md bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={settings?.grouping || "range"}
                    onChange={async (e) => {
                      await db.mvt_settings.put({
                        ...(settings || DEFAULT_MVT_SETTINGS),
                        id: "current",
                        grouping: e.target.value as any
                      });
                    }}
                  >
                    <option value="range">Un solo comprobante (Rango completo)</option>
                    <option value="day">Un comprobante por día</option>
                    <option value="transaction">Un comprobante por transferencia</option>
                  </select>
               </div>

               <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-slate-400">Estructura de Archivos</Label>
                  <select
                    className="w-full h-9 border border-slate-200 rounded-md bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={settings?.fileStructure || "single"}
                    onChange={async (e) => {
                      await db.mvt_settings.put({
                        ...(settings || DEFAULT_MVT_SETTINGS),
                        id: "current",
                        fileStructure: e.target.value as any
                      });
                    }}
                  >
                    <option value="single">Un solo archivo (.mvt / .cyp)</option>
                    <option value="multiple">Varios archivos (empaquetados en .zip)</option>
                  </select>
               </div>

               <div className="pt-2 border-t border-slate-100 mt-2">
                 <div className="flex items-center gap-2 mb-2">
                   <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                   <span className="text-[10px] uppercase font-bold text-slate-500">Valores Globales</span>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-slate-400">Concepto</Label>
                      <Input className="h-9 bg-slate-50" value={settings?.concepto || "210"} readOnly />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-slate-400">Almacén</Label>
                      <Input className="h-9 bg-slate-50" value={settings?.almacen || "0109"} readOnly />
                    </div>
                 </div>
                 <div className="space-y-1 mt-2">
                    <Label className="text-[10px] uppercase text-slate-400">Centro de Costo</Label>
                    <Input className="h-9 bg-slate-50" value={settings?.centro || "0110200012611"} readOnly />
                 </div>
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

      {/* Template Manager Dialog */}
      <Dialog open={showManager} onOpenChange={setShowManager}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Gestión de Plantillas</DialogTitle>
            <DialogDescription>
              Configura, duplica o importa/exporta tus estructuras MVT personalizadas.
            </DialogDescription>
          </DialogHeader>
          <TemplateManager
            templates={templates}
            currentTemplateId={currentTemplate.id}
            onSelect={(t) => {
              setCurrentTemplate(t);
              setShowManager(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
