import { Card } from '@/components/ui/card';
import React, { useState, useCallback, useRef } from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { useDropzone } from 'react-dropzone';
import { db, type BankTransaction } from '@/lib/dexie';
import { generateHash } from '@/lib/ipv/engine';
import { parseBandecTxt } from '@/lib/ipv/bandecParser';
import { extractCommission, standardizeDate } from '@/lib/ipv/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, Database } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { exportFullBackup, importFullBackup } from '@/lib/ipv/backup';
import { importProducts } from '@/lib/ipv/importUtils';

export default function BankIngestion() {
  const [confirmation, setConfirmation] = useState<{ open: boolean, title: string, message: string, onConfirm: () => void, variant?: 'default' | 'destructive' }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const fileBackupRef = useRef<HTMLInputElement>(null);

  const askConfirmation = (title: string, message: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmation({ open: true, title, message, onConfirm, variant });
  };

  const handleBackupImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        await importFullBackup(db, file);
        toast.success("Respaldo importado correctamente");
    } catch (error) {
        console.error("Error importing backup:", error);
        toast.error("Error al importar el respaldo");
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result;
        if (!content) return;

        if (file.name.endsWith('.txt')) {
            const data = parseBandecTxt(content as string);
            await processBankData(await data);
        } else if (file.name.endsWith('.csv')) {
            Papa.parse(content as string, {
              header: true,
              complete: async (results) => {
                const lowerHeaders = Object.keys(results.data[0] || {}).map(k => k.toLowerCase());
                if (lowerHeaders.includes('cod') || lowerHeaders.includes('código')) {
                    const importedCount = await importProducts(results.data, 'INGESTA_CSV');
                    toast.success(`${importedCount} productos importados`);
                } else {
                    await processBankData(results.data);
                }
              }
            });
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const data = new Uint8Array(content as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.SheetNames[0];
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

            const lowerHeaders = Object.keys(jsonData[0] || {}).map(k => k.toLowerCase());
            if (lowerHeaders.includes('cod') || lowerHeaders.includes('código')) {
                const importedCount = await importProducts(jsonData, 'INGESTA_EXCEL');
                toast.success(`${importedCount} productos importados`);
            } else {
                await processBankData(jsonData);
            }
        }
      };

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          reader.readAsArrayBuffer(file);
      } else {
          reader.readAsText(file);
      }
    });
  }, []);

  const resetAllMatching = () => {
    askConfirmation('Reiniciar Matching', '¿Desea limpiar todas las conciliaciones actuales?', async () => {
        const transactions = await db.bank_statements.toArray();
        await db.bank_statements.bulkPut(transactions.map(tx => ({ ...tx, estado_conciliacion: 'PENDIENTE' })));
        await db.reconciliation_lines.clear();
        await db.product_movements.where('tipo').equals('DECOMPOSITION').delete();
        toast.success('Conciliaciones reiniciadas');
    });
  };

  const resetBankData = () => {
    askConfirmation('Limpiar Banco', '¿Desea borrar todas las transacciones bancarias?', async () => {
        await db.bank_statements.clear();
        await db.reconciliation_lines.clear();
        toast.success('Banco limpio');
    });
  };

  const resetCatalog = () => {
      askConfirmation('Vaciar Catálogo', '¿Desea borrar todos los productos del catálogo?', async () => {
          await db.products.clear();
          toast.success('Catálogo vacío');
      });
  };

  const resetEverything = () => {
    askConfirmation('Confirmar Acción', '¿REINICIO TOTAL DEL SISTEMA?', async () => {
        await Promise.all([
            db.bank_statements.clear(), db.products.clear(), db.reconciliation_lines.clear(),
            db.ipv_reports.clear(), db.matching_rules.clear(), db.cash_adjustments.clear(),
            db.daily_aggregates.clear(), db.matching_cache.clear(), db.product_movements.clear()
        ]);
        toast.success('Sistema reiniciado');
    }, 'destructive');
  };

  const processBankData = async (data: any[]) => {
    let imported = 0;
    let errorsCount = 0;

    for (const row of data) {
      try {
        const fecha = standardizeDate(row.fecha || row['Fecha'] || row['FECHA']);
        const importe = row.importe_cents || parseFloat(String(row['Importe'] || 0).replace(',', '.'));
        const originalRef = String(row.referencia_origen || row['Referencia'] || row['REFERENCIA'] || '').trim();

        if (!fecha || !originalRef) continue;

        let finalRef = originalRef;
        let exists = await db.bank_statements.get(finalRef);
        if (exists) {
            let counter = 1;
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
                  <p className="text-[10px] font-black uppercase tracking-widest text-center opacity-50">Acciones Rápidas</p>
                  <Button variant="outline" className="neu-btn w-full h-12 text-xs font-black uppercase" onClick={resetAllMatching}>Reset Conciliaciones</Button>
                  <Button variant="outline" className="neu-btn w-full h-12 text-xs font-black uppercase" onClick={resetBankData}>Limpiar Banco</Button>
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
                    Toda la información reside exclusivamente en su navegador bajo el motor DexieDB.
                </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10">
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => exportFullBackup(db)} className="h-12 px-6 text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm border-2 rounded-2xl"><Download className="w-4 h-4" /> Respaldar</Button>
                    <Button variant="outline" onClick={() => fileBackupRef.current?.click()} className="h-12 px-6 text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm border-2 border-emerald-500/20 rounded-2xl"><Upload className="w-4 h-4" /> Importar</Button>
                    <input type="file" ref={fileBackupRef} onChange={handleBackupImport} accept=".json" className="hidden" />
                </div>
            </div>
        </Card>

        <div className="p-6 bg-destructive/5 rounded-3xl border border-destructive/20 space-y-4">
            <Button variant="destructive" className="w-full text-foreground font-black bg-red-600 hover:bg-red-700 shadow-lg" onClick={resetEverything}>REINICIO TOTAL</Button>
            <Button variant="outline" className="w-full text-destructive font-bold uppercase text-xs" onClick={resetCatalog}>Vaciar Catálogo</Button>
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
