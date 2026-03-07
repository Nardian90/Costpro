'use client';

import React, { useState, useCallback } from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { useDropzone } from 'react-dropzone';
import { db, type BankTransaction } from '@/lib/dexie';
import { generateHash } from '@/lib/ipv/engine';
import { parseBandecTxt } from '@/lib/ipv/bandecParser';
import { extractCommission, standardizeDate } from '@/lib/ipv/utils';
import { Button } from '@/components/ui/button';
import { Upload, RotateCcw, FileUp, Download, Info, FileSpreadsheet, FileText, HelpCircle, Trash2, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

export function BankIngestion() {
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
              const headers = Object.keys(results.data[0]).map(h => h.toLowerCase());
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
              const headers = Object.keys(jsonData[0]).map(h => h.toLowerCase());
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
        let imported = 0;
        for (const row of data) {
            const cod = String(row.cod || row.COD || '').trim();
            if (!cod) continue;
            const precio = parseFloat(String(row.precio_cents || row.precio || 0).replace(',', '.'));
            const product = {
                cod, descripcion: String(row.descripcion || row.desc || ''), um: String(row.um || 'Unidades'),
                precio_cents: precio, prioridad_algoritmo: Number(row.prioridad || 1), activo: true,
                es_paquete: false, contenido_paquete: 1, stock_inicial_manual: Number(row.stock || 0),
                created_at: new Date().toISOString(), updated_at: new Date().toISOString()
            };
            await db.products.put(product);
            imported++;
        }
        toast.success(`${imported} productos procesados`);
    } catch (error) { toast.error('Error catálogo'); }
  };

  const processBankData = async (data: any[]) => {
    let imported = 0;
    let errorsCount = 0;

    const lastTx = await db.bank_statements.orderBy('fecha').last();
    const lastDate = lastTx ? lastTx.fecha : null;

    for (const row of data) {
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

        await db.bank_statements.add(tx);
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
        <div className="p-6 bg-destructive/5 rounded-3xl border border-destructive/20 space-y-4">
            <Button variant="destructive" className="w-full" onClick={resetEverything}>REINICIO TOTAL</Button>
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
