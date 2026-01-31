'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { db, type BankTransaction } from '@/lib/dexie';
import { generateHash } from '@/lib/ipv/engine';
import { Button } from '@/components/ui/button';
import { FileUp, Download, Info, FileSpreadsheet, FileText, Upload } from 'lucide-react';
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
            await processBankData(results.data);
          }
        });
      } else if (extension === 'xlsx' || extension === 'xls') {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          await processBankData(jsonData);
        };
        reader.readAsArrayBuffer(file);
      }
    }
  }, []);

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

  const handleImportCatalog = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          await processCatalogData(results.data);
        }
      });
    } else if (extension === 'xlsx' || extension === 'xls') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        await processCatalogData(jsonData);
      };
      reader.readAsArrayBuffer(file);
    }

    // Reset input
    e.target.value = '';
  };

  const processCatalogData = async (data: any[]) => {
    try {
        const productsToImport = data.map(row => ({
            cod: String(row.cod),
            descripcion: String(row.descripcion),
            um: String(row.um),
            precio_cents: Math.round(Number(row.precio_cents || 0)),
            prioridad_algoritmo: Number(row.prioridad_algoritmo || 1),
            activo: row.activo === true || String(row.activo).toLowerCase() === 'true' || row.activo === 1,
            es_paquete: row.es_paquete === true || String(row.es_paquete).toLowerCase() === 'true' || row.es_paquete === 1,
            contenido_paquete: Number(row.contenido_paquete || 1),
            created_at: new Date().toISOString()
        }));

        await db.products.bulkPut(productsToImport);
        toast.success(`${productsToImport.length} productos importados al catálogo`);
    } catch (error) {
        console.error('Error importing catalog:', error);
        toast.error('Error al importar el catálogo. Verifica el formato.');
    }
  };

  const processBankData = async (data: any[]) => {
    let imported = 0;
    let skipped = 0;

    for (const row of data) {
      try {
        // Mapeo flexible basado en los nombres de columnas del ejemplo
        const fecha = row['Fecha'] || row['fecha'];
        const ref_origen = row['Ref_Origen'] || row['Ref_origen'] || row['referencia_origen'];
        const importe_str = String(row['Importe'] || row['importe'] || '0').replace(/[^0-9.,]/g, '');
        const tipo = row['Tipo'] || row['tipo'];
        const observaciones = row['Observaciones'] || row['observaciones'] || '';

        if (!fecha || !ref_origen || !importe_str) continue;

        // Convertir importe a centavos
        const importe_cents = Math.round(parseFloat(importe_str.replace(',', '')) * 100);

        const ingestion_hash = await generateHash(`${ref_origen}-${fecha}-${importe_cents}`);

        const tx: BankTransaction = {
          id: uuidv4(),
          fecha,
          referencia_corta: String(row['Ref_Corriente'] || ref_origen),
          referencia_origen: String(ref_origen),
          observaciones: String(observaciones),
          importe_cents,
          tipo: tipo === 'Cr' ? 'Cr' : 'Db',
          estado_conciliacion: 'PENDIENTE',
          created_at: new Date().toISOString(),
          ingestion_hash
        };

        await db.bank_statements.add(tx);
        imported++;
      } catch (error: any) {
        if (error.name === 'ConstraintError') {
          skipped++;
        } else {
          console.error('Error processing row:', error);
        }
      }
    }

    toast.success(`Ingesta finalizada: ${imported} importados, ${skipped} duplicados omitidos`);
  };

  const importDefaultProducts = async () => {
      const defaultProducts = [
          { cod: '1', descripcion: 'Cerveza Windmil', um: 'Unidades', precio_cents: 26000, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1 },
          { cod: '1-C', descripcion: 'Cerveza Windmil Caja', um: 'Caja (24Unid)', precio_cents: 576000, prioridad_algoritmo: 1, activo: true, es_paquete: true, contenido_paquete: 24 },
          { cod: '2', descripcion: 'Cerveza 8,6', um: 'Unidades', precio_cents: 50000, prioridad_algoritmo: 2, activo: true, es_paquete: false, contenido_paquete: 1 },
          { cod: '2-C', descripcion: 'Cerveza 8,6 Caja', um: 'Caja (24Unid)', precio_cents: 1080000, prioridad_algoritmo: 2, activo: true, es_paquete: true, contenido_paquete: 24 },
          { cod: '3', descripcion: 'Tigon', um: 'Unidades', precio_cents: 32000, prioridad_algoritmo: 3, activo: true, es_paquete: false, contenido_paquete: 1 },
          { cod: '3-C', descripcion: 'Tigon Caja', um: 'Caja (24Unid)', precio_cents: 720000, prioridad_algoritmo: 3, activo: true, es_paquete: true, contenido_paquete: 24 },
          { cod: '4', descripcion: 'Bavaria', um: 'Unidades', precio_cents: 26000, prioridad_algoritmo: 4, activo: true, es_paquete: false, contenido_paquete: 1 },
          { cod: '4-C', descripcion: 'Bavaria Caja', um: 'Caja (24Unid)', precio_cents: 600000, prioridad_algoritmo: 4, activo: true, es_paquete: true, contenido_paquete: 24 },
          { cod: '5', descripcion: 'Wiski', um: 'Unidades', precio_cents: 150000, prioridad_algoritmo: 5, activo: true, es_paquete: false, contenido_paquete: 1 },
          { cod: '5-C', descripcion: 'Wiski Caja', um: 'Caja (6Unidades)', precio_cents: 810000, prioridad_algoritmo: 5, activo: true, es_paquete: true, contenido_paquete: 6 },
      ];

      try {
          await db.products.bulkPut(defaultProducts.map(p => ({ ...p, created_at: new Date().toISOString() })));
          toast.success('Catálogo de productos cargado');
      } catch (error) {
          toast.error('Error al cargar productos');
      }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    }
  });

  return (
    <div className="space-y-8">
      <div className="bg-primary/5 rounded-3xl border-2 border-dashed border-primary/20 p-12 text-center transition-colors hover:bg-primary/10">
        <div {...getRootProps()} className="cursor-pointer">
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <FileUp className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-xl font-black uppercase tracking-tight text-primary">Arrastra tu extracto bancario</p>
              <p className="text-sm text-muted-foreground font-medium">Soporta CSV, XLSX y XLS</p>
            </div>
            <Button className="neu-btn-primary mt-4">
                Seleccionar Archivo
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-card/50 rounded-3xl border border-border/50 space-y-4">
            <div className="flex items-center gap-2 text-primary">
                <Info className="w-5 h-5" />
                <h4 className="font-black uppercase text-sm tracking-widest">Configuración Inicial</h4>
            </div>
            <p className="text-sm text-muted-foreground">
                Administra tu catálogo de productos para el matching.
            </p>

            <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="neu-btn text-xs" onClick={importDefaultProducts}>
                    Productos Demo
                </Button>

                <label className="cursor-pointer">
                    <div className="flex items-center justify-center h-full px-4 py-2 border border-input bg-background rounded-xl hover:bg-accent hover:text-accent-foreground text-xs font-medium transition-colors">
                        <Upload className="w-3 h-3 mr-2" />
                        Importar Catálogo
                    </div>
                    <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleImportCatalog} />
                </label>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="neu-btn w-full text-xs">
                            <Download className="w-3 h-3 mr-2" />
                            Exportar Catálogo
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl border-primary/20">
                        <DropdownMenuItem onClick={() => exportCatalog('csv')} className="cursor-pointer gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <span>Exportar como CSV</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportCatalog('xlsx')} className="cursor-pointer gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-primary" />
                            <span>Exportar como Excel</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>

        <div className="p-6 bg-card/50 rounded-3xl border border-border/50 space-y-4">
            <div className="flex items-center gap-2 text-primary">
                <Download className="w-5 h-5" />
                <h4 className="font-black uppercase text-sm tracking-widest">Plantilla</h4>
            </div>
            <p className="text-sm text-muted-foreground">
                Descarga una plantilla de ejemplo para el extracto bancario.
            </p>

            <div className="flex gap-3">
                <Button variant="outline" className="flex-1 neu-btn text-xs" onClick={() => downloadTemplate('csv')}>
                    <FileText className="w-3 h-3 mr-2 text-primary" />
                    CSV
                </Button>
                <Button variant="outline" className="flex-1 neu-btn text-xs" onClick={() => downloadTemplate('xlsx')}>
                    <FileSpreadsheet className="w-3 h-3 mr-2 text-primary" />
                    Excel
                </Button>
            </div>
        </div>
      </div>

      {/* Column Help Section */}
      <div className="p-6 bg-card/50 rounded-3xl border border-border/50 space-y-4">
        <div className="flex items-center gap-2 text-primary">
            <HelpCircle className="w-5 h-5" />
            <h4 className="font-black uppercase text-sm tracking-widest">Guía de Columnas (Estado de Cuenta)</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <HelpItem
                title="Fecha"
                desc="Fecha de la operación (ej: 17/10/2025). El sistema la normaliza automáticamente."
            />
            <HelpItem
                title="Ref_Origen"
                desc="Identificador único del banco (Número de transferencia o ID de mensaje)."
            />
            <HelpItem
                title="Ref_Corriente"
                desc="Referencia corta para visualización rápida en tablas."
            />
            <HelpItem
                title="Importe"
                desc="Monto con decimales (ej: 1,500.00). Se convierte a centavos internamente."
            />
            <HelpItem
                title="Tipo"
                desc="'Cr' para Créditos (Ingresos) y 'Db' para Débitos (Gastos/Comisiones)."
            />
            <HelpItem
                title="Observaciones"
                desc="Detalle del banco. Aquí se buscan códigos de producto para el matching automático."
            />
        </div>
      </div>
    </div>
  );
}

function HelpItem({ title, desc }: { title: string, desc: string }) {
    return (
        <div className="space-y-1">
            <p className="text-xs font-bold text-primary uppercase tracking-tighter">{title}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">{desc}</p>
        </div>
    );
}
