'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ReconciliationLine, type IPVSettings } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Settings,
  Download,
  Calendar,
  User,
  Hash,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  List, Image as ImageIcon
} from 'lucide-react';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { numeroALetras } from '@/lib/utils/number-to-words-es';
import { generateLegalPdf } from '../legal/LegalPdfExporter';
import { IncomeReceiptPreview } from './IncomeReceiptPreview';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { CostProLoader } from '@/components/ui/CostProLoader';

export function IncomeReceiptSection() {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedReceiptIndex, setSelectedReceiptIndex] = useState(0);

  // Dexie Data
  const lines = useLiveQuery(() => db.reconciliation_lines.where('clasificacion').anyOf(['Efectivo', 'Cash', 'cash', 'efectivo']).toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const settings = useLiveQuery(() => db.ipv_settings.get('current'));

  const productMap = useMemo(() => {
    if (!products) return new Map();
    return new Map(products.map(p => [p.cod, p]));
  }, [products]);

  // Default Settings if not exists
  useEffect(() => {
    const initSettings = async () => {
      const existing = await db.ipv_settings.get('current');
      if (!existing) {
        await db.ipv_settings.add({
          id: 'current',
          entidad_nombre: 'NOMBRE DE LA ENTIDAD',
          entidad_codigo: '0001',
          persona_entrega: 'CAJERO PRINCIPAL',
          consecutivo_inicio: 1,
          agrupacion_modo: 'GLOBAL',
          desglose_modo: 'DIA',
          updated_at: new Date().toISOString()
        });
      }
    };
    initSettings();
  }, []);

  // Grouping Logic
  const receipts = useMemo(() => {
    if (!lines || !settings) return [];

    const grouped: Record<string, ReconciliationLine[]> = {};
    const mode = settings.desglose_modo;

    lines.forEach(line => {
      const key = mode === 'DIA' ? line.fecha_operacion : line.transaction_ref;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(line);
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, groupLines], index) => {
        const total = groupLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);

        // Conceptos
        let conceptos_tabla: { concepto: string; importe: number }[] = [];
        if (settings.agrupacion_modo === 'GLOBAL') {
          conceptos_tabla = [{
            concepto: mode === 'DIA'
              ? `VENTA EN EFECTIVO DEL DÍA ${formatDate(key)}`
              : `VENTA EN EFECTIVO REF: ${key}`,
            importe: total
          }];
        } else {
          // Detallado por producto
          const prodGroup: Record<string, number> = {};
          groupLines.forEach(l => {
            const p = productMap.get(l.product_cod);
            const label = p ? p.descripcion : (l.product_cod === 'CASH_FILLER' ? 'AJUSTE DE CAJA' : l.product_cod);
            prodGroup[label] = (prodGroup[label] || 0) + l.importe_linea_cents;
          });
          conceptos_tabla = Object.entries(prodGroup).map(([concepto, importe]) => ({ concepto, importe }));
        }

        return {
          id: key,
          fecha_emision: mode === 'DIA' ? key : groupLines[0].fecha_operacion,
          numero_consecutivo: String(settings.consecutivo_inicio + index).padStart(5, '0'),
          persona_entrega: settings.persona_entrega,
          entidad_nombre: settings.entidad_nombre,
          entidad_codigo: settings.entidad_codigo,
          conceptos_tabla,
          total,
          logo_url: settings.logo_url,
          cantidad_letras: numeroALetras(total)
        };
      });
  }, [lines, settings, productMap]);

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <CostProLoader />
      </div>
    );
  }

  const currentReceipt = receipts[selectedReceiptIndex];

  const handleUpdateSettings = async (updates: Partial<IPVSettings>) => {
    await db.ipv_settings.update('current', {
      ...updates,
      updated_at: new Date().toISOString()
    });
    toast.success('Configuración actualizada');
  };

  const handleExportPdf = async () => {
    if (!currentReceipt) return;

    try {
      const model = {
        code: 'SC-3-01',
        name: 'RECIBO DE INGRESO DE EFECTIVO',
        fields: []
      };

      const dataForPdf = {
        ...currentReceipt,
        fecha_emision: formatDate(currentReceipt.fecha_emision)
      };

      await generateLegalPdf(model, dataForPdf, { skipCopy: true });
      toast.success('PDF generado con éxito');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Error al generar PDF');
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-8 items-start">
      {/* Sidebar: Controls & List */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="p-6 rounded-[2.5rem] shadow-xl border-none bg-card/50 backdrop-blur-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" />
              Gestión de Recibos
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className={cn("h-8 px-3 rounded-xl text-[10px] font-black uppercase transition-all", isConfigOpen ? "bg-primary text-white" : "hover:bg-primary/10")}
            >
              Configurar
            </Button>
          </div>

          <AnimatePresence mode="wait">
            {isConfigOpen ? (
              <motion.div
                key="config"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Entidad</label>
                  <Input
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">URL Logo Empresa</label>
                  <div className="relative">
                    <Input
                        value={settings.logo_url || ""}
                        onChange={(e) => handleUpdateSettings({ logo_url: e.target.value })}
                        className="h-10 text-xs font-bold pl-10"
                        placeholder="https://..."
                    />
                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                    value={settings.entidad_nombre}
                    onChange={(e) => handleUpdateSettings({ entidad_nombre: e.target.value })}
                    className="h-10 text-xs font-bold uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Código Entidad</label>
                  <Input
                    value={settings.entidad_codigo}
                    onChange={(e) => handleUpdateSettings({ entidad_codigo: e.target.value })}
                    className="h-10 text-xs font-bold uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Entrega (Recibí de)</label>
                  <Input
                    value={settings.persona_entrega}
                    onChange={(e) => handleUpdateSettings({ persona_entrega: e.target.value })}
                    className="h-10 text-xs font-bold uppercase"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Inicio Consecutivo</label>
                        <Input
                            type="number"
                            value={settings.consecutivo_inicio}
                            onChange={(e) => handleUpdateSettings({ consecutivo_inicio: Number(e.target.value) })}
                            className="h-10 text-xs font-bold"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Modo Desglose</label>
                        <select
                            value={settings.desglose_modo}
                            onChange={(e) => handleUpdateSettings({ desglose_modo: e.target.value as any })}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-xs font-bold focus:outline-none"
                        >
                            <option value="DIA">POR DÍA</option>
                            <option value="TRANSACCION">POR TRANSACCIÓN</option>
                        </select>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Modo Agrupación</label>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            variant={settings.agrupacion_modo === 'GLOBAL' ? 'default' : 'outline'}
                            onClick={() => handleUpdateSettings({ agrupacion_modo: 'GLOBAL' })}
                            className="h-10 text-[10px] font-black uppercase gap-2 rounded-xl"
                        >
                            <LayoutGrid className="w-3 h-3" />
                            Global
                        </Button>
                        <Button
                            variant={settings.agrupacion_modo === 'DETALLADO' ? 'default' : 'outline'}
                            onClick={() => handleUpdateSettings({ agrupacion_modo: 'DETALLADO' })}
                            className="h-10 text-[10px] font-black uppercase gap-2 rounded-xl"
                        >
                            <List className="w-3 h-3" />
                            Detallado
                        </Button>
                    </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar"
              >
                {receipts.length === 0 ? (
                    <div className="text-center py-12 px-4 opacity-50 space-y-2">
                        <div className="w-12 h-12 rounded-full bg-muted mx-auto flex items-center justify-center">
                            <FileText className="w-6 h-6" />
                        </div>
                        <p className="text-xs font-black uppercase tracking-widest">No hay datos en efectivo</p>
                        <p className="text-[10px] font-medium leading-relaxed">Procesa o añade líneas de efectivo en el desglose para ver recibos.</p>
                    </div>
                ) : (
                    receipts.map((r, i) => (
                    <button
                        key={r.id}
                        onClick={() => setSelectedReceiptIndex(i)}
                        className={cn(
                            "w-full text-left p-3 rounded-2xl transition-all border-2 group relative overflow-hidden",
                            selectedReceiptIndex === i
                            ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
                            : "border-transparent hover:bg-muted/50"
                        )}
                    >
                        <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                            {settings.desglose_modo === 'DIA' ? 'Fecha' : 'Ref'}
                        </span>
                        <Badge variant="outline" className="h-5 text-[9px] font-black border-primary/20 bg-primary/5 text-primary">
                            #{r.numero_consecutivo}
                        </Badge>
                        </div>
                        <div className="text-sm font-black uppercase truncate mb-1">
                            {settings.desglose_modo === 'DIA' ? formatDate(r.id) : r.id}
                        </div>
                        <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-primary">{formatCurrency(r.total)}</span>
                        <ArrowRight className={cn("w-4 h-4 text-primary transition-transform", selectedReceiptIndex === i ? "translate-x-0" : "-translate-x-4 opacity-0")} />
                        </div>
                    </button>
                    ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <div className="p-4 rounded-3xl bg-blue-500/5 border border-blue-500/10 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                Info de Gestión
            </h4>
            <div className="space-y-1">
                <p className="text-[11px] font-bold text-blue-800/80 leading-relaxed">
                    Los recibos se generan automáticamente basándose en las líneas clasificadas como <strong className="text-blue-900 underline underline-offset-2">"Efectivo"</strong> en la pestaña Desglose.
                </p>
                <p className="text-[11px] font-bold text-blue-800/80 leading-relaxed">
                    Puedes alternar entre agrupar toda la venta diaria o desglosar cada producto vendido en cash.
                </p>
            </div>
        </div>
      </div>

      {/* Main Content: Preview */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-4">
                <div className="flex items-center bg-muted/50 rounded-xl p-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={selectedReceiptIndex <= 0}
                        onClick={() => setSelectedReceiptIndex(prev => prev - 1)}
                        className="h-8 w-8 rounded-lg"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-[10px] font-black px-3 uppercase tracking-widest">
                        {receipts.length > 0 ? `${selectedReceiptIndex + 1} de ${receipts.length}` : '0 de 0'}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={selectedReceiptIndex >= receipts.length - 1}
                        onClick={() => setSelectedReceiptIndex(prev => prev + 1)}
                        className="h-8 w-8 rounded-lg"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <Button
                disabled={!currentReceipt}
                onClick={handleExportPdf}
                className="h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-xs gap-3 shadow-xl active:scale-95 transition-all bg-primary text-white hover:bg-primary/90"
            >
                <Download className="w-4 h-4" />
                Exportar Original PDF
            </Button>
        </div>

        {currentReceipt ? (
            <div className="relative group perspective-1000">
                <IncomeReceiptPreview
                    data={{
                        ...currentReceipt,
                        fecha_emision: formatDate(currentReceipt.fecha_emision)
                    }}
                    className="shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-lg transition-transform duration-500 group-hover:rotate-x-1"
                />
            </div>
        ) : (
            <div className="h-[600px] border-4 border-dashed border-muted rounded-[2rem] flex flex-col items-center justify-center text-muted-foreground gap-4 bg-muted/5">
                <div className="p-6 rounded-full bg-muted/20">
                    <FileText className="w-12 h-12 opacity-20" />
                </div>
                <div className="text-center">
                    <p className="text-sm font-black uppercase tracking-widest opacity-40">Vista Previa no disponible</p>
                    <p className="text-xs font-medium opacity-30 mt-1">Selecciona o genera datos de efectivo para previsualizar el modelo.</p>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
