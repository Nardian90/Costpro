'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product, type IPVSettings, ReconciliationLine } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Download,
    FileText,
    Printer,
    Settings2,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Image as ImageIcon
} from 'lucide-react';
import { IncomeReceiptPreview } from './IncomeReceiptPreview';
import { generateLegalPdf } from '../legal/LegalPdfExporter';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

export function IncomeReceiptSection() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedReceiptIndex, setSelectedReceiptIndex] = useState(0);

  const products = useLiveQuery(() => db.products.toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const settings = useLiveQuery(() => db.ipv_settings.get('current'));

  // Ensure settings exist
  React.useEffect(() => {
    const initSettings = async () => {
      const existing = await db.ipv_settings.get('current');
      if (!existing) {
        await db.ipv_settings.add({
          id: 'current',
          updated_at: new Date().toISOString(),
          paper_size: 'LETTER',
          entidad_nombre: 'ENTIDAD POR DEFECTO',
          entidad_codigo: '0000',
          persona_entrega: 'RESPONSABLE',
          consecutivo_inicio: 1,
          agrupacion_modo: 'GLOBAL',
          desglose_modo: 'TRANSACCION',
          copiloto_activo: true
        });
      }
    };
    initSettings();
  }, []);

  const receipts = useMemo(() => {
    if (!reconciliationLines || !products) return [];

    // Group lines by transaction_ref
    const grouped = reconciliationLines.reduce((acc, line) => {
      if ((line.cash_amount_cents || 0) <= 0) return acc;

      const dateStr = line.fecha_operacion.split('T')[0];
      if (dateStr < dateFrom || dateStr > dateTo) return acc;

      if (!acc[line.transaction_ref]) {
        acc[line.transaction_ref] = {
          ref: line.transaction_ref,
          fecha: line.fecha_operacion,
          lines: [],
          persona: 'CLIENTE MOSTRADOR'
        };
      }
      acc[line.transaction_ref].lines.push(line);
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped).map((group: any, idx) => {
      const total = group.lines.reduce((sum: number, l: any) => sum + (l.cash_amount_cents || 0), 0);
      return {
        entidad_nombre: settings?.entidad_nombre || 'SUCURSAL COSTPRO',
        entidad_codigo: settings?.entidad_codigo || 'SC-01',
        fecha_emision: group.fecha,
        numero_consecutivo: `00${idx + 1}`.slice(-4),
        persona_entrega: group.persona,
        conceptos_tabla: group.lines.map((l: any) => {
          const p = products.find(prod => prod.cod === l.product_cod);
          return {
            concepto: p ? p.descripcion : `PRODUCTO ${l.product_cod}`,
            importe: l.cash_amount_cents
          };
        }),
        total,
        cantidad_letras: 'CANTIDAD POR DETERMINAR',
        logo_url: settings?.logo_url
      };
    });
  }, [reconciliationLines, products, dateFrom, dateTo, settings]);

  const currentReceipt = receipts[selectedReceiptIndex];

  const handleUpdateSettings = async (updates: Partial<IPVSettings>) => {
    if (!settings) return;
    await db.ipv_settings.update('current', {
      ...updates,
      updated_at: new Date().toISOString()
    });
    toast.success('Configuración actualizada');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      toast.error('El logo no debe superar 1MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      await handleUpdateSettings({ logo_url: base64 });
    };
    reader.readAsDataURL(file);
  };

  const formatDate = (d: string) => format(new Date(d), 'dd/MM/yyyy', { locale: es });

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
        fecha_emision: formatDate(currentReceipt.fecha_emision),
        paper_size: settings?.paper_size || 'LETTER'
      };

      await generateLegalPdf(model, dataForPdf);
      toast.success('PDF generado correctamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    }
  };

  const handleMassExport = async () => {
    if (receipts.length === 0) return;

    try {
      const model = {
        code: 'SC-3-01',
        name: 'RECIBO DE INGRESO DE EFECTIVO',
        fields: []
      };

      const data = {
        isMassExport: true,
        paper_size: settings?.paper_size || 'LETTER',
        receipts: receipts.map(r => ({
          ...r,
          fecha_emision: formatDate(r.fecha_emision)
        }))
      };

      await generateLegalPdf(model, data);
      toast.success('Exportación masiva completada');
    } catch (error) {
      toast.error('Error en exportación masiva');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left Panel: Configuration */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="p-6 border-2 border-primary/10 shadow-lg rounded-[2.5rem] bg-card/50 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-primary/10 rounded-2xl">
                    <Settings2 className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em]">Configuración del Modelo</h3>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Entidad (Nombre)</Label>
                    <Input
                        value={settings?.entidad_nombre || ''}
                        onChange={(e) => handleUpdateSettings({ entidad_nombre: e.target.value })}
                        className="h-11 rounded-xl bg-background/50 font-bold"
                        placeholder="Ej: SUCURSAL CENTRO"
                    />
                </div>

                <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Código Entidad</Label>
                    <Input
                        value={settings?.entidad_codigo || ''}
                        onChange={(e) => handleUpdateSettings({ entidad_codigo: e.target.value })}
                        className="h-11 rounded-xl bg-background/50 font-bold"
                        placeholder="Ej: SC-01"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Papel</Label>
                        <select
                            value={settings?.paper_size || 'LETTER'}
                            onChange={(e) => handleUpdateSettings({ paper_size: e.target.value as any })}
                            className="w-full h-11 rounded-xl bg-background/50 border border-input px-3 text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="LETTER">CARTA</option>
                            <option value="A4">A4</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Logo Corporativo</Label>
                        <Button
                            variant="outline"
                            className="w-full h-11 rounded-xl gap-2 font-bold relative overflow-hidden"
                            onClick={() => document.getElementById('logo-upload')?.click()}
                        >
                            <ImageIcon className="w-4 h-4" />
                            {settings?.logo_url ? 'CAMBIAR' : 'SUBIR'}
                            <input
                                id="logo-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleLogoUpload}
                            />
                        </Button>
                    </div>
                </div>

                <div className="pt-4 border-t border-primary/5 mt-4">
                    <div className="flex items-center gap-3 mb-4">
                        <Calendar className="w-4 h-4 text-primary" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest">Rango de Datos</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-xl bg-background/50 text-xs" />
                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-xl bg-background/50 text-xs" />
                    </div>
                </div>
            </div>
        </Card>

        <Card className="p-6 border-2 border-primary/10 shadow-lg rounded-[2.5rem] bg-card/50 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-primary/10 rounded-2xl">
                    <Printer className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em]">Acciones Masivas</h3>
            </div>

            <p className="text-[10px] font-medium text-muted-foreground uppercase leading-relaxed mb-6">
                Genera un PDF consolidado con todos los recibos del período seleccionado (2 por página para ahorro de papel).
            </p>

            <Button
                onClick={handleMassExport}
                disabled={receipts.length === 0}
                className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs gap-3 shadow-xl active:scale-95 transition-all"
            >
                <Download className="w-4 h-4" />
                Exportar {receipts.length} Recibos
            </Button>
        </Card>
      </div>

      {/* Right Panel: Preview */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 px-2">
            <div className="flex items-center gap-4">
                <div className="flex items-center bg-card/80 backdrop-blur-sm border-2 border-primary/10 rounded-2xl p-1 shadow-sm">
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={selectedReceiptIndex === 0}
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
                className="h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-xs gap-3 shadow-xl active:scale-95 transition-all bg-primary text-foreground hover:bg-primary/90"
            >
                <Download className="w-4 h-4" />
                Exportar Original PDF
            </Button>
        </div>

        {currentReceipt ? (
            <div className="relative group">
                <IncomeReceiptPreview
                    data={{
                        ...currentReceipt,
                        fecha_emision: formatDate(currentReceipt.fecha_emision)
                    }}
                    className="shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-lg transition-transform duration-500"
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
