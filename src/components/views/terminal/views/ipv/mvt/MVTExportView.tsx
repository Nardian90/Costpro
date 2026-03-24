import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, Play, Settings2, History, AlertCircle, CheckCircle2, Loader2, Calendar } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/dexie";
import { MVTTemplate, MVTSettings, MVTExportLog } from "@/lib/ipv/mvt/types";
import { STANDARD_MVT_TEMPLATE, DEFAULT_MVT_SETTINGS } from "@/lib/ipv/mvt/defaults";
import { generateMVTContent, downloadMVT } from "@/lib/ipv/mvt/engine";
import { MVTPreview } from "./MVTPreview";
import { TemplateEditor } from "./TemplateEditor";
import { toast } from "sonner";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

export const MVTExportView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("export");
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  // DB Data
  const templates = useLiveQuery(() => db.mvt_templates.toArray()) || [];
  const settings = useLiveQuery(() => db.mvt_settings.get('current'));
  const exportLogs = useLiveQuery(() => db.mvt_exports_log.orderBy('timestamp').reverse().limit(10).toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const reconciliationLines = useLiveQuery(() =>
    db.reconciliation_lines
      .where('fecha_operacion')
      .between(dateRange.start, dateRange.end, true, true)
      .toArray()
  ) || [];

  const [currentTemplate, setCurrentTemplate] = useState<MVTTemplate>(STANDARD_MVT_TEMPLATE);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>("");

  useEffect(() => {
    if (templates.length === 0) {
      db.mvt_templates.put(STANDARD_MVT_TEMPLATE);
    } else {
      const active = templates.find(t => t.id === settings?.defaultTemplateId) || templates[0];
      setCurrentTemplate(active);
    }

    if (!settings) {
      db.mvt_settings.put(DEFAULT_MVT_SETTINGS);
    }
  }, [templates, settings]);

  // Generate Preview
  useEffect(() => {
    if (products.length > 0) {
      const context = prepareExportContext();
      const content = generateMVTContent(currentTemplate, context);
      setPreviewContent(content);
    }
  }, [currentTemplate, products, reconciliationLines, dateRange]);

  const prepareExportContext = () => {
    // Aggregate movements by product
    const movementMap = new Map();
    reconciliationLines.forEach(line => {
      const existing = movementMap.get(line.product_cod) || { cantidad: 0, total_cents: 0 };
      movementMap.set(line.product_cod, {
        cantidad: existing.cantidad + line.cantidad,
        total_cents: existing.total_cents + line.importe_linea_cents
      });
    });

    const contextMovements = Array.from(movementMap.entries()).map(([cod, data]) => ({
      product: products.find(p => p.cod === cod) || { cod, descripcion: 'Desconocido', um: 'U' },
      cantidad: data.cantidad,
      importe_cents: data.total_cents
    }));

    return {
      global: {
        numero: (settings?.lastExportNumber || 0) + 1,
        fecha: format(new Date(), 'dd/MM/yyyy'),
        almacen: settings?.almacen || '0109',
        centro: settings?.centro || '0110200012611',
        concepto: settings?.concepto || '210',
        cuenta_mn: settings?.globalCuenta || '7000050'
      },
      products: products.map(p => ({
        ...p,
        existencia: 0 // In real app, calculate from movements + initial
      })),
      movements: contextMovements
    };
  };

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

      toast.success("Archivo MVT generado y descargado con éxito");
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
            Generación de archivos de movimientos contables estructurados para integración con sistemas ERP (SAP/Microsoft Dynamics).
          </p>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" className="bg-white border-slate-200 shadow-sm h-9">
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
        {/* Sidebar / Configuration */}
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
                  </select>
                </div>

                <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-lg flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-amber-900 uppercase">Resumen de Datos</p>
                    <p className="text-xs text-amber-800/80 leading-relaxed">
                      Se detectaron <strong>{reconciliationLines.length}</strong> transacciones en el rango seleccionado
                      cubriendo <strong>{new Set(reconciliationLines.map(l => l.product_cod)).size}</strong> productos.
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

        {/* Main Content / Tabs */}
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
    </div>
  );
};
