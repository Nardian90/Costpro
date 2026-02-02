'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { db, type BankTransaction } from '@/lib/dexie';
import { generateHash } from '@/lib/ipv/engine';
import { parseBandecTxt } from '@/lib/ipv/bandecParser';
import { extractCommission, standardizeDate } from '@/lib/ipv/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileUp, Download, Info, FileSpreadsheet, FileText, Upload, HelpCircle, Trash2, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { v4 as uuidv4 } from 'uuid';

export function BankIngestion() {
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            const data = results.data as any[];
            if (data.length > 0) {
                const headers = Object.keys(data[0]).map(h => h.toLowerCase());
                const isCatalog = headers.includes('precio') || headers.includes('precio_cents') || headers.includes('cod');
                if (isCatalog) {
                    await processCatalogData(data);
                } else {
                    await processBankData(data);
                }
            }
          }
        });
      } else if (extension === 'xlsx' || extension === 'xls') {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet) as any[];

          if (jsonData.length > 0) {
              const headers = Object.keys(jsonData[0]).map(h => h.toLowerCase());
              const isCatalog = headers.includes('precio') || headers.includes('precio_cents') || headers.includes('cod');
              if (isCatalog) {
                  await processCatalogData(jsonData);
              } else {
                  await processBankData(jsonData);
              }
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (extension === 'txt') {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const text = e.target?.result as string;
          const transactions = await parseBandecTxt(text);
          if (transactions.length > 0) {
            let imported = 0;
            let skipped = 0;
            for (const tx of transactions) {
              try {
                await db.bank_statements.put(tx);
                imported++;
              } catch (error: any) {
                  console.error('Error importing TXT row:', error);
                  skipped++;
              }
            }
            toast.success(`BANDEC TXT: ${imported} procesados/actualizados`);
          } else {
            toast.error('No se encontraron transacciones válidas en el archivo TXT');
          }
        };
        reader.readAsText(file);
      }
    }
  }, []);

  const resetBankData = async () => {
    if (confirm('¿ELIMINAR TODAS LAS TRANSACCIONES? Esta acción borrará todo el historial bancario cargado y no se puede deshacer.')) {
      await db.bank_statements.clear();
      await db.reconciliation_lines.clear();
      toast.success('Datos bancarios y conciliaciones eliminados correctamente');
    }
  };

  const resetCatalog = async () => {
    if (confirm('¿ELIMINAR TODO EL CATÁLOGO? Se borrarán todos los productos y configuraciones de matching.')) {
      await db.products.clear();
      toast.success('Catálogo de productos vaciado');
    }
  };

  const resetAllMatching = async () => {
    if (confirm('¿REINICIAR TODAS LAS CONCILIACIONES? Se borrarán los resultados de matching pero se mantendrán las transacciones y el catálogo.')) {
      await db.reconciliation_lines.clear();
      await db.bank_statements.toCollection().modify({ estado_conciliacion: 'PENDIENTE' });
      toast.success('Todas las transacciones han vuelto al estado PENDIENTE');
    }
  };

  const resetEverything = async () => {
    if (confirm('¿REINICIO TOTAL DEL SISTEMA? Se borrará TODO: Transacciones, Catálogo, Reportes, Reglas y Conciliaciones. Esta acción es irreversible.')) {
        await Promise.all([
            db.bank_statements.clear(),
            db.products.clear(),
            db.reconciliation_lines.clear(),
            db.ipv_reports.clear(),
            db.matching_rules.clear(),
            db.cash_adjustments.clear(),
            db.daily_aggregates.clear(),
            db.matching_cache.clear()
        ]);
        toast.success('Sistema IPV reiniciado completamente');
    }
  };

  const downloadTemplate = (format: 'csv' | 'xlsx') => {
    const headers = ['Fecha', 'Ref_Corriente', 'Ref_Origen', 'Observaciones', 'Importe', 'Tipo'];
    const sampleData = [
      { Fecha: '01/08/2025', Ref_Corriente: 'HC50000147646', Ref_Origen: 'HC50000147646', Observaciones: 'CIERRE DE LA CUENTA A NOMBRE DE: Jesús Alejandro Morales', Importe: '150,000.00', Tipo: 'Cr' },
      { Fecha: '11/09/2025', Ref_Corriente: 'VB50052672646', Ref_Origen: 'VB50052672646', Observaciones: 'Ordenante: jesmarkmc S.U.R.L. Acreditando a: 0664642122740113', Importe: '2,040.00', Tipo: 'Db' },
      { Fecha: '17/10/2025', Ref_Corriente: 'YY50110793646', Ref_Origen: 'KW502013PU999', Observaciones: 'TRANSFERENCIA RECIBIDA - BEXI C. CALDERON TAMAYO', Importe: '800.00', Tipo: 'Cr' }
    ];

    if (format === 'csv') {
      const csv = Papa.unparse({ fields: headers, data: sampleData });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'plantilla_banco_ipv.csv';
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, 'plantilla_banco_ipv.xlsx');
    }
    toast.success(`Plantilla ${format.toUpperCase()} descargada`);
  };

  const exportCatalog = async (format: 'csv' | 'xlsx') => {
    const products = await db.products.toArray();
    if (products.length === 0) {
        toast.error('No hay productos para exportar');
        return;
    }

    // Limpiar metadatos de Dexie para la exportación
    const data = products.map(({ created_at, updated_at, ...p }) => p);

    if (format === 'csv') {
        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'catalogo_productos_ipv.csv';
        link.click();
        URL.revokeObjectURL(url);
    } else {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Productos');
        XLSX.writeFile(wb, 'catalogo_productos_ipv.xlsx');
    }
    toast.success(`Catálogo ${format.toUpperCase()} exportado`);
  };

  const processCatalogData = async (data: any[]) => {
    try {
        const productsToImport: any[] = [];
        const errors: string[] = [];

        data.forEach((row, index) => {
            try {
                const cod = String(row.cod || row.COD || row.Código || row.codigo || '').trim();
                if (!cod) return;

                const precio_raw = String(row.precio_cents !== undefined ? row.precio_cents : (row.precio || row.Precio || 0)).trim().replace(',', '.');

                const precio_cents = parseFloat(precio_raw);
                if (isNaN(precio_cents)) {
                    errors.push(`Producto ${cod}: Precio inválido (${precio_raw}).`);
                    return;
                }

                productsToImport.push({
                    cod: cod,
                    descripcion: String(row.descripcion || row.Descripción || row.desc || ''),
                    um: String(row.um || row.UM || 'Unidades'),
                    precio_cents: precio_cents,
                    prioridad_algoritmo: Number(row.prioridad_algoritmo || row.prioridad || 1),
                    activo: row.activo === true || String(row.activo).toLowerCase() === 'true' || row.activo === 1 || row.activo === undefined,
                    es_paquete: row.es_paquete === true || String(row.es_paquete).toLowerCase() === 'true' || row.es_paquete === 1,
                    contenido_paquete: Number(row.contenido_paquete || 1),
                    stock_inicial_manual: Number(row.stock_inicial_manual || row.stock || 0),
                    created_at: new Date().toISOString()
                });
            } catch (err: any) {
                errors.push(`Fila ${index + 1}: ${err.message}`);
            }
        });

        if (productsToImport.length > 0) {
            await db.products.bulkPut(productsToImport);
            toast.success(`${productsToImport.length} productos procesados/actualizados.`);
        }

        if (errors.length > 0) {
            toast.error(`Se encontraron ${errors.length} errores en la importación.`, {
                description: errors.slice(0, 3).join('\n'),
                duration: 5000
            });
        }
    } catch (error: any) {
        console.error('Error importing catalog:', error);
        toast.error('Error crítico al procesar el catálogo.');
    }
  };

  const processBankData = async (data: any[]) => {
    let imported = 0;
    let skipped = 0;

    for (const row of data) {
      try {
        const fechaRaw = row['Fecha'] || row['fecha'];
        const fecha = standardizeDate(fechaRaw);
        const ref_origen = row['Ref_Origen'] || row['Ref_origen'] || row['referencia_origen'];
        const importe_str = String(row['Importe'] || row['importe'] || '0').replace(/[^0-9.,]/g, '');
        const tipo = row['Tipo'] || row['tipo'];
        const observaciones = row['Observaciones'] || row['observaciones'] || '';

        if (!fecha || !ref_origen || !importe_str) continue;

        const importe_cents = parseFloat(importe_str.replace(',', ''));
        const comision_cents = extractCommission(observaciones);
        const importe_venta_cents = importe_cents + comision_cents;
        const ingestion_hash = await generateHash(`${ref_origen}-${fecha}-${importe_cents}`);

        const tx: BankTransaction = {
          id: uuidv4(),
          fecha,
          referencia_corta: row['Ref_Corriente'] || ref_origen,
          referencia_origen: ref_origen,
          observaciones,
          importe_cents,
          comision_cents,
          importe_venta_cents,
          tipo: tipo === 'Cr' ? 'Cr' : 'Db',
          estado_conciliacion: 'PENDIENTE',
          excluido: false,
          created_at: new Date().toISOString(),
          ingestion_hash
        };

        await db.bank_statements.put(tx);
        imported++;
      } catch (error: any) {
          console.error('Error processing bank row:', error);
          skipped++;
      }
    }

    toast.success(`Ingesta finalizada: ${imported} procesados/actualizados`);
  };

  const loadDemoStatement = async () => {
      const products = await db.products.toArray();
      if (products.length === 0) {
          toast.error('Primero debes cargar el catálogo');
          return;
      }

      const today = new Date();
      const demoTxs: BankTransaction[] = [];
      const fmtDate = (date: Date) => date.toISOString().split('T')[0];

      // Demo logic...
      const beer = products[0];
      if (beer) {
          const ref = `VB${Math.random().toString(36).substring(7).toUpperCase()}`;
          demoTxs.push({
              id: uuidv4(),
              fecha: fmtDate(today),
              referencia_corta: ref,
              referencia_origen: ref,
              observaciones: `PAGO A COMERCIO COD:${beer.cod}`,
              importe_cents: beer.precio_cents * 2,
              tipo: 'Cr',
              estado_conciliacion: 'PENDIENTE',
              created_at: new Date().toISOString(),
              ingestion_hash: await generateHash(`DEMO-${ref}`)
          });
      }

      await db.bank_statements.bulkPut(demoTxs);
      toast.success('Extracto demo generado');
  };

  const importDefaultProducts = async () => {
      const defaultProducts = [
          { cod: '1', descripcion: 'Cerveza Windmil', um: 'Unidades', precio_cents: 260, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 100 },
          { cod: '2', descripcion: 'Tigon', um: 'Unidades', precio_cents: 320, prioridad_algoritmo: 2, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 200 },
      ];

      await db.products.bulkPut(defaultProducts.map(p => ({ ...p, created_at: new Date().toISOString() })));
      toast.success('Productos demo cargados');
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/plain': ['.txt']
    }
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-primary/5 rounded-3xl border-2 border-dashed border-primary/20 p-10 text-center transition-all hover:bg-primary/10 hover:border-primary/40 group">
                <div {...getRootProps()} className="cursor-pointer">
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <FileUp className="w-10 h-10 text-primary" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-2xl font-black uppercase tracking-tight text-primary italic">Central de Inteligencia de Datos</p>
                            <p className="text-sm text-muted-foreground font-medium">Suelta aquí tu <span className="text-primary font-bold">Catálogo</span> o tu <span className="text-primary font-bold">Extracto</span></p>
                            <p className="text-[10px] text-muted-foreground/60 uppercase font-black tracking-widest mt-2">Soporta CSV, XLSX, XLS y TXT</p>
                        </div>
                        <Button className="neu-btn-primary mt-4 h-12 px-8 text-xs">Seleccionar Archivo</Button>
                    </div>
                </div>
            </div>

            <div className="px-6 py-4 bg-primary/5 border-l-4 border-primary rounded-r-2xl flex items-start gap-4">
                <Info className="w-6 h-6 text-primary mt-1 shrink-0" />
                <div className="space-y-1">
                    <h4 className="font-black text-primary uppercase text-xs tracking-widest italic">Inteligencia Artificial de Matching</h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        El sistema detecta automáticamente el tipo de archivo y realiza un <strong>upsert</strong> (actualiza si ya existe).
                    </p>
                </div>
            </div>
        </div>

        <div className="space-y-4">
            <div className="p-6 bg-card border rounded-3xl shadow-sm space-y-4">
                <h4 className="font-black uppercase text-xs tracking-[0.2em] text-muted-foreground border-b pb-2">Acciones Rápidas</h4>
                <div className="grid grid-cols-1 gap-2">
                    <Button variant="outline" className="neu-btn justify-start h-12 text-[10px] font-black uppercase" onClick={importDefaultProducts}>
                        <Plus className="w-4 h-4 mr-3 text-primary" /> Cargar Productos Demo
                    </Button>
                    <Button variant="outline" className="neu-btn justify-start h-12 text-[10px] font-black uppercase" onClick={loadDemoStatement}>
                        <RefreshCw className="w-4 h-4 mr-3 text-primary" /> Generar Extracto Demo
                    </Button>
                    <div className="pt-2 flex gap-2">
                        <Button variant="outline" className="neu-btn flex-1 h-10 text-[10px]" onClick={() => downloadTemplate('xlsx')}>
                            <Download className="w-3 h-3 mr-2" /> Plantilla
                        </Button>
                        <Button variant="outline" className="neu-btn flex-1 h-10 text-[10px]" onClick={() => exportCatalog('xlsx')}>
                            <Download className="w-3 h-3 mr-2" /> Backup
                        </Button>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-orange-500/5 border border-orange-500/20 rounded-3xl space-y-3">
                <div className="flex items-center gap-2 text-orange-600">
                    <RefreshCw className="w-4 h-4" />
                    <h4 className="font-black uppercase text-[10px] tracking-widest">Mantenimiento</h4>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    <Button variant="outline" className="h-9 text-[9px] font-bold border-orange-200 text-orange-700 hover:bg-orange-50" onClick={resetAllMatching}>
                        Resetear Todas las Conciliaciones
                    </Button>
                    <Button variant="outline" className="h-9 text-[9px] font-bold border-red-200 text-red-700 hover:bg-red-50" onClick={resetBankData}>
                        Limpiar Historial Bancario
                    </Button>
                </div>
            </div>
        </div>
      </div>

      <div className="p-6 bg-destructive/5 rounded-3xl border border-destructive/20 space-y-4">
          <div className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              <h4 className="font-black uppercase text-sm tracking-widest">Zona de Peligro</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="destructive" className="text-[10px] font-bold" onClick={resetEverything}>REINICIO TOTAL</Button>
              <Button variant="outline" className="text-[10px] font-bold border-destructive text-destructive hover:bg-destructive/10" onClick={resetCatalog}>VACIAR CATÁLOGO</Button>
          </div>
      </div>
    </div>
  );
}
