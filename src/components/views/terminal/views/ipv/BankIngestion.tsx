'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { db, type BankTransaction } from '@/lib/dexie';
import { generateHash } from '@/lib/ipv/engine';
import { parseBandecTxt } from '@/lib/ipv/bandecParser';
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
                await db.bank_statements.add(tx);
                imported++;
              } catch (error: any) {
                if (error.name === 'ConstraintError') {
                  skipped++;
                }
              }
            }
            toast.success(`BANDEC TXT: ${imported} importados, ${skipped} omitidos`);
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
            stock_inicial_manual: Number(row.stock_inicial_manual || 0),
            created_at: new Date().toISOString()
        }));

        await db.products.bulkPut(productsToImport);
        toast.success(`${productsToImport.length} productos importados al catálogo`);
    } catch (error) {
        console.error('Error importing catalog:', error);
        toast.error('Error al importar el catálogo. Verifica el formato.');
    }
  };

  const standardizeDate = (dateStr: string) => {
    if (!dateStr) return '';
    // Handle DD/MM/YYYY
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${month}-${day}`;
        }
    }
    // Already YYYY-MM-DD or other
    return dateStr;
  };

  const processBankData = async (data: any[]) => {
    let imported = 0;
    let skipped = 0;

    for (const row of data) {
      try {
        // Mapeo flexible basado en los nombres de columnas del ejemplo
        const fechaRaw = row['Fecha'] || row['fecha'];
        const fecha = standardizeDate(fechaRaw);
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
          referencia_corta: row['Ref_Corriente'] || ref_origen,
          referencia_origen: ref_origen,
          observaciones,
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

  const loadDemoStatement = async () => {
      const products = await db.products.toArray();
      if (products.length === 0) {
          toast.error('Primero debes cargar el catálogo (puedes usar el botón Productos Demo)');
          return;
      }

      const today = new Date();
      const demoTxs: BankTransaction[] = [];

      // Estandarizado a YYYY-MM-DD
      const fmtDate = (date: Date) => {
          return date.toISOString().split('T')[0];
      };

      // 1. Transacción con Referencia Directa (HARD_REF)
      const beer = products.find(p => p.cod === '1');
      if (beer) {
          const ref = `VB${Math.random().toString(36).substring(7).toUpperCase()}`;
          const cents = beer.precio_cents * 5; // 5 cervezas
          demoTxs.push({
              id: uuidv4(),
              fecha: fmtDate(today),
              referencia_corta: ref,
              referencia_origen: ref,
              observaciones: `PAGO A COMERCIO: 4277505 - COMPRA 5 UNID COD:${beer.cod}`,
              importe_cents: cents,
              tipo: 'Cr',
              estado_conciliacion: 'PENDIENTE',
              created_at: new Date().toISOString(),
              ingestion_hash: await generateHash(`DEMO-HARD-${ref}`)
          });
      }

      // 2. Transacción para Suma Exacta (EXACT_SUM)
      // Buscamos una combinación: 1 Caja de Windmil ($5,760) + 1 Tigon ($320) = $6,080
      const box = products.find(p => p.cod === '1-C');
      const tigon = products.find(p => p.cod === '3');
      if (box && tigon) {
          const ref = `VB${Math.random().toString(36).substring(7).toUpperCase()}`;
          const cents = box.precio_cents + tigon.precio_cents;
          demoTxs.push({
              id: uuidv4(),
              fecha: fmtDate(today),
              referencia_corta: ref,
              referencia_origen: ref,
              observaciones: `TRANSFERENCIA RECIBIDA - CLIENTE: JUAN PEREZ`,
              importe_cents: cents,
              tipo: 'Cr',
              estado_conciliacion: 'PENDIENTE',
              created_at: new Date().toISOString(),
              ingestion_hash: await generateHash(`DEMO-SUM-${ref}`)
          });
      }

      // 3. Comisión Bancaria (Debito)
      const refDb = `VB${Math.random().toString(36).substring(7).toUpperCase()}`;
      demoTxs.push({
          id: uuidv4(),
          fecha: fmtDate(today),
          referencia_corta: refDb,
          referencia_origen: refDb,
          observaciones: `Cobro por utilizacion del Servicio de Banca Remota. Comision 100.00`,
          importe_cents: 10000,
          tipo: 'Db',
          estado_conciliacion: 'PENDIENTE',
          created_at: new Date().toISOString(),
          ingestion_hash: await generateHash(`DEMO-DB-${refDb}`)
      });

      // 4. Transacción con Tolerancia
      // Caja Bavaria ($6,000) pero recibimos $5,999 (-$1.00 de supuesta comisión extra)
      const bavaria = products.find(p => p.cod === '4-C');
      if (bavaria) {
          const ref = `VB${Math.random().toString(36).substring(7).toUpperCase()}`;
          demoTxs.push({
              id: uuidv4(),
              fecha: fmtDate(today),
              referencia_corta: ref,
              referencia_origen: ref,
              observaciones: `PAGO QR COMERCIO - REF: ${ref}`,
              importe_cents: bavaria.precio_cents - 100, // Falta $1.00
              tipo: 'Cr',
              estado_conciliacion: 'PENDIENTE',
              created_at: new Date().toISOString(),
              ingestion_hash: await generateHash(`DEMO-TOL-${ref}`)
          });
      }

      try {
          await db.bank_statements.bulkAdd(demoTxs);
          toast.success(`Se han generado ${demoTxs.length} transacciones demo`);
      } catch (error) {
          toast.error('Error al generar transacciones demo');
      }
  };

  const importDefaultProducts = async () => {
      const defaultProducts = [
          { cod: '1', descripcion: 'Cerveza Windmil', um: 'Unidades', precio_cents: 26000, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 100 },
          { cod: '1-C', descripcion: 'Cerveza Windmil Caja', um: 'Caja (24Unid)', precio_cents: 576000, prioridad_algoritmo: 1, activo: true, es_paquete: true, contenido_paquete: 24, stock_inicial_manual: 10 },
          { cod: '2', descripcion: 'Cerveza 8,6', um: 'Unidades', precio_cents: 50000, prioridad_algoritmo: 2, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 50 },
          { cod: '2-C', descripcion: 'Cerveza 8,6 Caja', um: 'Caja (24Unid)', precio_cents: 1080000, prioridad_algoritmo: 2, activo: true, es_paquete: true, contenido_paquete: 24, stock_inicial_manual: 5 },
          { cod: '3', descripcion: 'Tigon', um: 'Unidades', precio_cents: 32000, prioridad_algoritmo: 3, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 200 },
          { cod: '3-C', descripcion: 'Tigon Caja', um: 'Caja (24Unid)', precio_cents: 720000, prioridad_algoritmo: 3, activo: true, es_paquete: true, contenido_paquete: 24, stock_inicial_manual: 20 },
          { cod: '4', descripcion: 'Bavaria', um: 'Unidades', precio_cents: 26000, prioridad_algoritmo: 4, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 150 },
          { cod: '4-C', descripcion: 'Bavaria Caja', um: 'Caja (24Unid)', precio_cents: 600000, prioridad_algoritmo: 4, activo: true, es_paquete: true, contenido_paquete: 24, stock_inicial_manual: 15 },
          { cod: '5', descripcion: 'Wiski', um: 'Unidades', precio_cents: 150000, prioridad_algoritmo: 5, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 40 },
          { cod: '5-C', descripcion: 'Wiski Caja', um: 'Caja (6Unidades)', precio_cents: 810000, prioridad_algoritmo: 5, activo: true, es_paquete: true, contenido_paquete: 6, stock_inicial_manual: 8 },
          { cod: 'CASH', descripcion: 'Venta Manual / Varios', um: 'U', precio_cents: 0, prioridad_algoritmo: 99, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 0 },
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
      'application/vnd.ms-excel': ['.xls'],
      'text/plain': ['.txt']
    }
  });

  return (
    <div className="space-y-8">
      {/* Guía Profesional Principal */}
      <div className="px-6 py-4 bg-primary/5 border-l-4 border-primary mx-4 rounded-r-2xl flex items-start gap-4">
        <Info className="w-6 h-6 text-primary mt-1 shrink-0" />
        <div className="space-y-1">
            <h4 className="font-black text-primary uppercase text-xs tracking-widest">Guía Profesional: Flujo de Ingesta</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
                El flujo ideal comienza cargando el <strong>Catálogo de Productos</strong>. Una vez listo, arrastra tu <strong>Estado de Cuenta</strong>.
                El sistema aplicará ingeniería inversa para encontrar combinaciones de productos que cuadren con cada transferencia.
                Si el match no es exacto, podrás realizar <strong>Ajustes Manuales</strong> para lograr el cuadre perfecto.
            </p>
        </div>
      </div>

      <div className="bg-primary/5 rounded-3xl border-2 border-dashed border-primary/20 p-12 text-center transition-colors hover:bg-primary/10">
        <div {...getRootProps()} className="cursor-pointer">
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <FileUp className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-xl font-black uppercase tracking-tight text-primary">Arrastra tu extracto bancario</p>
              <p className="text-sm text-muted-foreground font-medium">Soporta CSV, XLSX, XLS y TXT (BANDEC)</p>
            </div>
            <Button className="neu-btn-primary mt-4">
                Seleccionar Archivo
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card: Catálogo */}
        <div className="p-6 bg-card/50 rounded-3xl border border-border/50 space-y-6 flex flex-col">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                    <FileSpreadsheet className="w-5 h-5" />
                    <h4 className="font-black uppercase text-sm tracking-widest">Maestro de Catálogo</h4>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase font-bold">Paso 1</Badge>
            </div>

            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Define los productos, precios y prioridades. El algoritmo usará estos datos para "reconstruir" las ventas.
            </p>

            <div className="grid grid-cols-2 gap-3 flex-1">
                <Button variant="outline" className="neu-btn text-[10px]" onClick={importDefaultProducts} title="Carga un set de productos de prueba">
                    <Plus className="w-3 h-3 mr-2" />
                    Productos Demo
                </Button>

                <label className="cursor-pointer">
                    <div className="flex items-center justify-center h-full px-2 py-2 border border-input bg-background rounded-xl hover:bg-accent hover:text-accent-foreground text-[10px] font-bold transition-colors uppercase">
                        <Upload className="w-3 h-3 mr-2" />
                        Importar CSV
                    </div>
                    <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleImportCatalog} />
                </label>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="neu-btn w-full text-[10px]">
                            <Download className="w-3 h-3 mr-2" />
                            Exportar
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

                <Button variant="outline" className="neu-btn text-[10px] text-destructive hover:bg-destructive/5" onClick={resetCatalog}>
                    <Trash2 className="w-3 h-3 mr-2" />
                    Vaciar
                </Button>
            </div>

            <div className="p-3 bg-primary/5 rounded-xl border-l-2 border-primary text-[10px] text-muted-foreground">
                <span className="font-bold text-primary">TIP:</span> Exporta el catálogo actual para usarlo como plantilla de importación.
            </div>
        </div>

        {/* Card: Estado de Cuenta */}
        <div className="p-6 bg-card/50 rounded-3xl border border-border/50 space-y-6 flex flex-col">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                    <FileText className="w-5 h-5" />
                    <h4 className="font-black uppercase text-sm tracking-widest">Estado de Cuenta</h4>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase font-bold">Paso 2</Badge>
            </div>

            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Descarga la plantilla o carga transacciones de prueba para validar el motor de matching.
            </p>

            <div className="grid grid-cols-2 gap-3 flex-1">
                <Button variant="outline" className="neu-btn text-[10px]" onClick={loadDemoStatement}>
                    <RefreshCw className="w-3 h-3 mr-2 text-primary" />
                    Extracto Demo
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="neu-btn w-full text-[10px]">
                            <Download className="w-3 h-3 mr-2" />
                            Plantillas
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem onClick={() => downloadTemplate('csv')} className="cursor-pointer gap-2">
                            <FileText className="w-4 h-4" />
                            <span>Descargar CSV</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadTemplate('xlsx')} className="cursor-pointer gap-2">
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>Descargar Excel</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="outline" className="neu-btn text-[10px]" onClick={resetAllMatching}>
                    <RefreshCw className="w-3 h-3 mr-2" />
                    Reset Matching
                </Button>

                <Button variant="outline" className="neu-btn text-[10px] text-destructive hover:bg-destructive/5" onClick={resetBankData}>
                    <Trash2 className="w-3 h-3 mr-2" />
                    Limpiar Banco
                </Button>
            </div>

            <div className="p-3 bg-orange-500/5 rounded-xl border-l-2 border-orange-500 text-[10px] text-muted-foreground">
                <span className="font-bold text-orange-500">IMPORTANTE:</span> El motor requiere que la columna <strong>Ref_Origen</strong> sea única por transacción.
            </div>
        </div>

        <div className="p-6 bg-destructive/5 rounded-3xl border border-destructive/20 space-y-4 md:col-span-2">
            <div className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                <h4 className="font-black uppercase text-sm tracking-widest">Zona de Peligro / Mantenimiento</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Button variant="destructive" className="w-full text-[10px] font-bold gap-2" onClick={resetEverything}>
                    <Trash2 className="w-4 h-4" />
                    REINICIO TOTAL
                </Button>
                <Button variant="destructive" className="w-full text-[10px] font-bold gap-2" onClick={resetBankData}>
                    <Trash2 className="w-4 h-4" />
                    Limpiar Banco
                </Button>
                <Button variant="destructive" className="w-full text-[10px] font-bold gap-2" onClick={resetCatalog}>
                    <Trash2 className="w-4 h-4" />
                    Vaciar Catálogo
                </Button>
                <Button variant="outline" className="w-full text-[10px] font-bold gap-2 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={resetAllMatching}>
                    <RefreshCw className="w-4 h-4" />
                    Resetear Matching
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
            <HelpItem
                title="Soporte BANDEC"
                desc="Los archivos .txt exportados de la Banca Remota BANDEC son compatibles y se parsean automáticamente."
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
