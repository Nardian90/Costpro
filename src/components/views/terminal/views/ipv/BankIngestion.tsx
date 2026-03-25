'use client';
import { Card } from '@/components/ui/card';

import React, { useState, useCallback } from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { useDropzone } from 'react-dropzone';
import { db, type BankTransaction } from '@/lib/dexie';
import { generateHash } from '@/lib/ipv/engine';
import { enrichTransactions } from '@/lib/ipv/parser';
import { syncCatalogFromTransactions } from '@/lib/ipv/identity/registry';
import { parseBandecTxt } from '@/lib/ipv/bandecParser';
import { extractCommission, standardizeDate } from '@/lib/ipv/utils';
import { importCatalogProducts } from "@/lib/ipv/importUtils";
import { ImportValidator } from '@/lib/ipv/import-validator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, RotateCcw, FileUp, Download, Info, FileSpreadsheet, FileText, HelpCircle, Trash2, RefreshCw, Plus, Database } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { useColumnMapping } from '@/hooks/useColumnMapping';
import { exportFullBackup, importFullBackup } from '@/lib/ipv/backup';

export function BankIngestion() {
  const { applyMapping } = useColumnMapping('TRANSFER');
  const fileBackupRef = React.useRef<HTMLInputElement>(null);
  const handleBackupImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const loadingToast = toast.loading("Restaurando base de datos...");
      try {
        await importFullBackup(db, file);
        toast.success("Base de datos restaurada correctamente", { id: loadingToast });
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        console.error("Error importing backup:", error);
        toast.error("Error al restaurar la base de datos", { id: loadingToast });
      }
      if (event.target) event.target.value = "";
    }
  };
  const [confirmation, setConfirmation] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive';
  }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmation({ open: true, title, message, onConfirm, variant });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            if (results.data.length > 0) {
              const headers = Object.keys(results.data[0] as object).map(h => h.toLowerCase());
              const isCatalog = headers.includes('precio') || headers.includes('precio_cents') || headers.includes('cod');
              if (isCatalog) await processCatalogData(results.data);
              else await processBankData(results.data);
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
              const headers = Object.keys(jsonData[0] as object).map(h => h.toLowerCase());
              const isCatalog = headers.includes('precio') || headers.includes('precio_cents') || headers.includes('cod');
              if (isCatalog) await processCatalogData(jsonData);
              else await processBankData(jsonData);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (extension === 'txt') {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const text = e.target?.result as string;
          const transactions = await parseBandecTxt(text);
          if (transactions.length > 0) {
            await processBankData(transactions);
          } else toast.error('No se encontraron transacciones');
        };
        reader.readAsText(file);
      }
    }
  }, []);

  const resetBankData = async () => {
    askConfirmation('Confirmar Acción', '¿ELIMINAR TODAS LAS TRANSACCIONES?', async () => {
      await db.bank_statements.clear();
      await db.reconciliation_lines.clear();
      toast.success('Datos eliminados');
    }, 'destructive');
  };

  const resetCatalog = async () => {
    askConfirmation('Confirmar Acción', '¿ELIMINAR TODO EL CATÁLOGO?', async () => {
      await db.products.clear();
      toast.success('Catálogo vaciado');
    }, 'destructive');
  };

  const resetAllMatching = async () => {
    askConfirmation('Confirmar Acción', '¿REINICIAR TODAS LAS CONCILIACIONES?', async () => {
      await db.reconciliation_lines.clear();
      await db.bank_statements.toCollection().modify({ estado_conciliacion: 'PENDIENTE' });
      toast.success('Conciliaciones reiniciadas');
    }, 'destructive');
  };

  const resetEverything = async () => {
    askConfirmation('Confirmar Acción', '¿REINICIO TOTAL DEL SISTEMA?', async () => {
        await Promise.all([
            db.bank_statements.clear(), db.products.clear(), db.reconciliation_lines.clear(),
            db.ipv_reports.clear(), db.matching_rules.clear(), db.cash_adjustments.clear(),
            db.daily_aggregates.clear(), db.matching_cache.clear()
        ]);
        toast.success('Sistema reiniciado');
    }, 'destructive');
  };

  const processCatalogData = async (data: any[]) => {
    try {
        const normalized: any[] = [];
        const validationErrors: string[] = [];

        for (const row of data) {
            try {
                const product = ImportValidator.normalizeProduct(row);
                normalized.push(product);
            } catch (error: any) {
                validationErrors.push(`Fila: ${error.message}`);
            }
        }

        if (validationErrors.length > 0) {
            toast.error(`${validationErrors.length} filas con error. Ver consola para detalles.`);
            console.error("Errores de normalización:", validationErrors);
            if (normalized.length === 0) return;
        }

        const existing = await db.products.toArray();
        const validation = await ImportValidator.validateImport(normalized, existing);

        if (!validation.valid) {
            const errorMsgs = validation.errors.map(e => e.message).join('\n');
            toast.error(`Errores de validación:\n${errorMsgs}`);
            return;
        }

        if (validation.warnings.length > 0) {
            toast.warning(`Atención: ${validation.warnings.length} advertencias detectadas.`);
            console.warn("Advertencias de importación:", validation.warnings);
        }

        if (normalized.length > 0) {
            await importCatalogProducts(normalized);
            toast.success(`Se importaron ${normalized.length} productos correctamente`);
        } else {
            toast.error('No se encontraron productos válidos');
        }
    } catch (error) {
        console.error(error);
        toast.error("Error al procesar catálogo");
    }
  };

  const processBankData = async (data: any[]) => {
    const { mappedData: mappedRows } = await applyMapping(data);
    const processingRows = (mappedRows || data).map((r: any) => ({ ...r, fecha: r.date || r.fecha, importe_cents: r.amount || r.importe_cents, referencia_origen: r.reference || r.transaction_id || r.referencia_origen, observaciones: r.description || r.observaciones, nombre_cliente: r.customer_name || r.nombre_cliente, carnet: r.customer_id || r.carnet }));
    let imported = 0;
    let errorsCount = 0;

    const lastTx = await db.bank_statements.orderBy('fecha').last();
    const lastDate = lastTx ? lastTx.fecha : null;

    for (const row of processingRows) {
      try {
        const fecha = row.fecha || standardizeDate(row['Fecha'] || row['fecha']);
        const ref_origen_raw = String(row.referencia_origen || row['Ref_Origen'] || row['referencia_origen'] || '').trim();
        const importe = row.importe_cents || parseFloat(String(row['Importe'] || 0).replace(',', ''));

        if (!fecha || !ref_origen_raw) continue;

        if (lastDate && fecha <= lastDate) {
            await db.ingestion_errors.add({
                id: uuidv4(),
                fecha,
                referencia_corta: ref_origen_raw,
                referencia_origen: ref_origen_raw,
                observaciones: String(row.observaciones || row['Observaciones'] || '').trim(),
                importe_cents: importe,
                tipo: importe < 0 ? 'Db' : 'Cr',
                error_note: `Fecha no íntegra: ${fecha} <= ${lastDate}`,
                raw_data: row,
                created_at: new Date().toISOString()
            });
            errorsCount++;
            continue;
        }

        let finalRef = ref_origen_raw;
        let exists = await db.bank_statements.get(finalRef);
        if (exists) {
            let counter = 1;
            const originalRef = finalRef;
            while (exists) {
                finalRef = `${originalRef}-${counter}`;
                exists = await db.bank_statements.get(finalRef);
                counter++;
            }
        }

        const tx: BankTransaction = {
          id: uuidv4(),
          fecha,
          referencia_corta: row.referencia_corta || row['Ref_Corriente'] || finalRef,
          referencia_origen: finalRef,
          observaciones: String(row.observaciones || row['Observaciones'] || '').trim(),
          importe_cents: importe,
          comision_cents: row.comision_cents || 0,
          importe_venta_cents: row.importe_venta_cents || importe,
          tipo: row.tipo || (importe < 0 ? 'Db' : 'Cr'),
          estado_conciliacion: 'PENDIENTE',
          excluido: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ingestion_hash: await generateHash(`${finalRef}-${fecha}-${importe}`)
        };

        const enriched = await enrichTransactions([tx]);
        const finalTx = enriched[0];
        await db.bank_statements.add(finalTx);
        imported++;
      } catch (error: any) {
          console.error('Error banco:', error);
          try {
              await db.ingestion_errors.add({
                  id: uuidv4(),
                  fecha: row.fecha || 'N/A',
                  referencia_corta: 'N/A',
                  referencia_origen: 'N/A',
                  observaciones: 'Error durante el procesamiento',
                  importe_cents: 0,
                  tipo: 'Cr',
                  error_note: error.message || 'Error desconocido',
                  raw_data: row,
                  created_at: new Date().toISOString()
              });
          } catch (e) {}
          errorsCount++;
      }
    }

    if (imported > 0) {
        const syncedCount = await syncCatalogFromTransactions();
        if (syncedCount > 0) {
            toast.info(`${syncedCount} clientes nuevos agregados al catálogo`);
        }
    }
    if (imported > 0) toast.success(`${imported} transacciones procesadas`);
    if (errorsCount > 0) toast.error(`${errorsCount} transacciones con errores`);
  };

  const loadDemoStatement = async () => {
      const prods = await db.products.toArray();
      if (prods.length === 0) { toast.error('Carga catálogo primero'); return; }

      const lastTx = await db.bank_statements.orderBy('fecha').last();
      let targetDate = new Date().toISOString().split('T')[0];
      if (lastTx && targetDate <= lastTx.fecha) {
          const d = new Date(lastTx.fecha);
          d.setDate(d.getDate() + 1);
          targetDate = d.toISOString().split('T')[0];
      }

      const ref = `VB${Math.random().toString(36).substring(7).toUpperCase()}`;
      const demo: BankTransaction = {
          id: uuidv4(), fecha: targetDate, referencia_corta: ref, referencia_origen: ref,
          observaciones: 'PAGO DEMO', importe_cents: prods[0].precio_cents, tipo: 'Cr',
          estado_conciliacion: 'PENDIENTE', created_at: new Date().toISOString(), ingestion_hash: 'DEMO'
      };
      await db.bank_statements.put(demo);
      toast.success('Demo generado');
  };

  const importDefaultProducts = async () => {
      const def = [
          { cod: '1', descripcion: 'Cerveza', um: 'Unidades', precio_cents: 260, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 100 },
      ];
      await db.products.bulkPut(def.map(p => ({ ...p, created_at: new Date().toISOString() })));
      toast.success('Demos cargados');
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'text/plain': ['.txt'] }
  });

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
              <div className="bg-gradient-to-br from-primary/10 via-background to-primary/5 rounded-[2.5rem] border-2 border-dashed border-primary/20 p-12 text-center">
                  <div {...getRootProps()} className="cursor-pointer">
                      <input {...getInputProps()} />
                      <div className="flex flex-col items-center gap-6">
                          <div className="w-24 h-24 rounded-3xl bg-primary flex items-center justify-center"><Upload className="w-10 h-10 text-primary-foreground" /></div>
                          <h3 className="text-3xl font-black uppercase text-primary italic">Central de Datos</h3>
                          <Button className="neu-btn-primary mt-2 h-14 px-10 text-sm font-black uppercase">Explorar Archivos</Button>
                      </div>
                  </div>
              </div>
          </div>
          <div className="space-y-4">
              <div className="p-6 bg-card border rounded-3xl space-y-4">
                  <Button variant="outline" className="neu-btn w-full h-12 text-xs font-black uppercase" onClick={importDefaultProducts}>Cargar Demo</Button>
                  <Button variant="outline" className="neu-btn w-full h-12 text-xs font-black uppercase" onClick={loadDemoStatement}>Generar Demo</Button>
              </div>
              <div className="p-6 bg-orange-500/5 border border-orange-500/20 rounded-3xl space-y-3">
                  <Button variant="outline" className="w-full h-9 text-xs font-bold" onClick={resetAllMatching}>Reset Conciliaciones</Button>
                  <Button variant="outline" className="w-full h-9 text-xs font-bold" onClick={resetBankData}>Limpiar Banco</Button>
              </div>
          </div>
        </div>

        <Card className="p-8 bg-gradient-to-br from-primary/10 via-background to-transparent border-2 border-primary/5 rounded-[3rem] flex flex-col xl:flex-row items-center justify-between gap-8 overflow-hidden relative">
            <div className="absolute -left-10 top-0 bottom-0 w-40 bg-primary/5 blur-[100px] rounded-full" />
            <div className="space-y-3 relative z-10 flex-1 text-center xl:text-left">
                <div className="flex items-center justify-center xl:justify-start gap-4">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                        <Database className="w-7 h-7" />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Base de Datos Local</h3>
                </div>
                <p className="text-xs text-muted-foreground font-medium max-w-xl mx-auto xl:mx-0">
                    Toda la información reside exclusivamente en su navegador bajo el motor DexieDB. Se recomienda realizar respaldos periódicos si planea limpiar su caché de navegación o cambiar de dispositivo.
                </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10">
                <div className="flex gap-6">
                    <div className="text-center">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 opacity-60">Caché</p>
                        <Badge variant="outline" className="font-black text-primary border-primary/30 px-3 py-1 bg-primary/5">ACTIVA</Badge>
                    </div>
                    <div className="text-center">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 opacity-60">Seguridad</p>
                        <Badge variant="outline" className="font-black text-blue-500 border-blue-500/30 px-3 py-1 bg-blue-500/5">CIFRADO LOCAL</Badge>
                    </div>
                </div>

                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        onClick={() => exportFullBackup(db)}
                        className="h-12 px-6 text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm hover:bg-primary hover:text-foreground transition-all border-2 rounded-2xl"
                    >
                        <Download className="w-4 h-4" />
                        Respaldar
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => fileBackupRef.current?.click()}
                        className="h-12 px-6 text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm hover:bg-emerald-500 hover:text-foreground transition-all border-2 border-emerald-500/20 rounded-2xl"
                    >
                        <Upload className="w-4 h-4" />
                        Importar
                    </Button>
                    <input
                        type="file"
                        ref={fileBackupRef}
                        onChange={handleBackupImport}
                        accept=".json"
                        className="hidden"
                    />
                </div>
            </div>
        </Card>

        <div className="p-6 bg-destructive/5 rounded-3xl border border-destructive/20 space-y-4">
            <Button variant="destructive" className="w-full text-foreground font-black bg-red-600 hover:bg-red-700 shadow-lg" onClick={resetEverything}>REINICIO TOTAL</Button>
            <Button variant="outline" className="w-full text-destructive" onClick={resetCatalog}>VACIAR CATÁLOGO</Button>
        </div>
      </div>
      <BaseModal
        open={confirmation.open}
        onOpenChange={(open) => setConfirmation(prev => ({ ...prev, open }))}
        title={confirmation.title}
        footer={
          <div className="flex gap-2 w-full pt-4">
            <Button variant="outline" onClick={() => setConfirmation(prev => ({ ...prev, open: false }))} className="flex-1">Cancelar</Button>
            <Button variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'} onClick={() => { confirmation.onConfirm(); setConfirmation(prev => ({ ...prev, open: false })); }} className="flex-1">Confirmar</Button>
          </div>
        }
      >
        <div className="py-4"><p className="text-sm text-muted-foreground font-medium">{confirmation.message}</p></div>
      </BaseModal>
    </>
  );
}
