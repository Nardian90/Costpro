'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { db, type BankTransaction } from '@/lib/dexie';
import { generateHash } from '@/lib/ipv/engine';
import { Button } from '@/components/ui/button';
import { FileUp, Download, Info } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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

  const downloadTemplate = () => {
    const headers = ['Fecha', 'Ref_Corriente', 'Ref_Origen', 'Observaciones', 'Importe', 'Tipo'];
    const sampleRows = [
      ['01/08/2025', 'HC50000147646', 'HC50000147646', 'CIERRE DE LA CUENTA A NOMBRE DE: Jesús Alejandro Morales', '150,000.00', 'Cr'],
      ['11/09/2025', 'VB50052672646', 'VB50052672646', 'Ordenante: jesmarkmc S.U.R.L. Acreditando a: 0664642122740113', '2,040.00', 'Db'],
      ['17/10/2025', 'YY50110793646', 'KW502013PU999', 'TRANSFERENCIA RECIBIDA - BEXI C. CALDERON TAMAYO', '800.00', 'Cr']
    ];

    const csvContent = [
      headers.join(','),
      ...sampleRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_banco_ipv.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Plantilla descargada correctamente');
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
                Carga el catálogo de productos predeterminado para comenzar a realizar el matching de transacciones.
            </p>
            <Button variant="outline" className="w-full neu-btn" onClick={importDefaultProducts}>
                Cargar Productos Demo
            </Button>
        </div>

        <div className="p-6 bg-card/50 rounded-3xl border border-border/50 space-y-4">
            <div className="flex items-center gap-2 text-primary">
                <Download className="w-5 h-5" />
                <h4 className="font-black uppercase text-sm tracking-widest">Plantilla</h4>
            </div>
            <p className="text-sm text-muted-foreground">
                Descarga una plantilla de ejemplo para asegurarte de que el formato de tus datos es correcto.
            </p>
            <Button variant="outline" className="w-full neu-btn" onClick={downloadTemplate}>
                Descargar Plantilla CSV
            </Button>
        </div>
      </div>
    </div>
  );
}
