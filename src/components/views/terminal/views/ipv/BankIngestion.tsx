'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { db, type BankTransaction } from '@/lib/dexie';
import { generateHash } from '@/lib/ipv/engine';
import { Button } from '@/components/ui/button';
import { FileUp, Download, Info, FileSpreadsheet, FileText, Upload, HelpCircle, Trash2, RefreshCw } from 'lucide-react';
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
      const demoTxs = [
          { Fecha: '01/08/2025', Ref_Corriente: 'HC50000147646', Ref_Origen: 'HC50000147646', Observaciones: 'CIERRE DE LA CUENTA 40311950016301 A NOMBRE DE: Jesús Alejandro Morales Agramonte No. IDENT:97122416786 FECHA DE CIERRE: 01/08/25 Que se acredita a cuenta corriente de la MPM JESMARKMC SURL 40313480004217', Importe: '150,000.00', Tipo: 'Cr' },
          { Fecha: '11/09/2025', Ref_Corriente: 'VB50052672646', Ref_Origen: 'VB50052672646', Observaciones: 'Ordenante: jesmarkmc S.U.R.L. Acreditando a: 0664642122740113 Detalles: UPR ingreso registro central comercial Las tunas Firma: 67D1342C55DA523BF1F1A6E58E91F024 Ejecutado por: JESÚS ALEJANDRO MORALES AGRAMONTE Autorizado por: JESÚS ALEJANDRO MORALES AGRAMONTE', Importe: '2,040.00', Tipo: 'Db' },
          { Fecha: '11/09/2025', Ref_Corriente: 'VB50052681646', Ref_Origen: 'VB50052681646', Observaciones: 'Ordenante: jesmarkmc S.U.R.L. Acreditando a: 0664642122740113 Detalles: UPR ingreso registro central comercial las tunas Firma: D8B0E9DCA56C6DFD75F776335F06EB7C Ejecutado por: JESÚS ALEJANDRO MORALES AGRAMONTE Autorizado por: JESÚS ALEJANDRO MORALES AGRAMONTE', Importe: '150.00', Tipo: 'Db' },
          { Fecha: '12/09/2025', Ref_Corriente: 'VB50053024646', Ref_Origen: 'C525527238646', Observaciones: 'Cobro por utilizacion del Servicio de Banca Remota (VirtualBANDEC) correspondiente a Septiembre/2025. Comision (052) 100.00', Importe: '100.00', Tipo: 'Db' },
          { Fecha: '16/09/2025', Ref_Corriente: 'VB50054287646', Ref_Origen: 'VB50054287646', Observaciones: 'Ordenante: jesmarkmc S.U.R.L. Acreditando a: 0664655210964619 Detalles: Comisión por personalizar 4 tarjetas de salario mypime jesmarkmc Firma: 0ED0CBA2B8E6D6C718A40A1877993DE0 Ejecutado por: JESÚS ALEJANDRO MORALES AGRAMONTE Autorizado por: JESÚS ALEJANDRO MORALES AGRAMONTE', Importe: '60.00', Tipo: 'Db' },
          { Fecha: '13/10/2025', Ref_Corriente: 'VB50058853646', Ref_Origen: 'C528630901646', Observaciones: 'Cobro por utilizacion del Servicio de Banca Remota (VirtualBANDEC) correspondiente a Octubre/2025. Comision (052) 100.00', Importe: '100.00', Tipo: 'Db' },
          { Fecha: '09/09/2025', Ref_Corriente: 'YR50003264646', Ref_Origen: '98025A4426808', Observaciones: '[COD_ORIGEN:12]<RCSLBTR_102><ID_MENSAJE>000625009R8L</ID_MENSAJE><REF_TRASOC>98025A4426808</REF_TRASOC><REF_UNICA>98025A4426808</REF_UNICA><MON_TRANSA MONEDA="CUP" IMPORTE="0.98"/><CLI_ORDENA COD_SUCU="997" NUM_CUENTA="" OTR_DATOS="@|31|@"/><CLI_BENEFI COD_SUCU="646" NUM_CUENTA="0664634000421716" OTR_DATOS="BPA. PAGO A COMERCIO:4277505"/><DET_PAGO>BPA. PAGO A COMERCIO:4277505-JESMARKMC SURL. FECHA:08/09/25. CANT OPE:1 IMP:1.00. COMI:0.02. PAGO SERVICIO 20-PAGO EN LINEA</DET_PAGO><IMP_ORIGIN MONEDA=" " IMPORTE="0.00"/><DET_GASTO>SHA</DET_GASTO><TASA_CAMBIO>0.00000</TASA_CAMBIO></RCSLBTR_102>', Importe: '0.98', Tipo: 'Cr' },
          { Fecha: '17/10/2025', Ref_Corriente: 'YY50110793646', Ref_Origen: 'KW502013PU999', Observaciones: 'CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311150851399] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 922406XXXXXX3995ID:0664634000421716IDCUBACEL:2824577444TS:07-TransferenciaFECHA FACTURA: 1025INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA ORDENANTE NOMBRE:BEXI C. CALDERON TAMAYO| CI:94072441791 | Tarjeta RED:9224069997513995', Importe: '800.00', Tipo: 'Cr' },
          { Fecha: '17/10/2025', Ref_Corriente: 'YY50110803646', Ref_Origen: 'KW50201E99999', Observaciones: 'CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311250397534] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 920406XXXXXX8559ID:0664634000421716IDCUBACEL:2824800874TS:07-TransferenciaFECHA FACTURA: 1025INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA ORDENANTE NOMBRE:YORDANI NAPOLES TORRES| CI:85032819947 | Tarjeta RED:9204069995478559', Importe: '600.00', Tipo: 'Cr' },
          { Fecha: '17/10/2025', Ref_Corriente: 'YY50110833646', Ref_Origen: 'KW50201S2Q999', Observaciones: 'CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311250274353] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 920406XXXXXX8330ID:0664634000421716IDCUBACEL:2825115624TS:07-TransferenciaFECHA FACTURA: 1025INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA ORDENANTE NOMBRE:ALICIA YABOR PALOMO| CI:61100603319 | Tarjeta RED:9204069993868330', Importe: '980.00', Tipo: 'Cr' },
          { Fecha: '17/10/2025', Ref_Corriente: 'YY50110874646', Ref_Origen: 'KW50200HAZ999', Observaciones: 'CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311250596029] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 920406XXXXXX7861ID:0664634000421716IDCUBACEL:2824043522TS:07-TransferenciaFECHA FACTURA: 1025INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA ORDENANTE NOMBRE:YOEL O. MONTAQUE PEREZ| CI:75022317107 | Tarjeta RED:9204069998237861', Importe: '1,550.00', Tipo: 'Cr' },
          { Fecha: '17/10/2025', Ref_Corriente: 'YR50003746646', Ref_Origen: '98025A5075166', Observaciones: '[COD_ORIGEN:12]<RCSLBTR_102><ID_MENSAJE>00062500B0RF</ID_MENSAJE><REF_TRASOC>98025A5075166</REF_TRASOC><REF_UNICA>98025A5075166</REF_UNICA><MON_TRANSA MONEDA="CUP" IMPORTE="920.00"/><CLI_ORDENA COD_SUCU="997" NUM_CUENTA="9204129978181644" OTR_DATOS=""/><CLI_BENEFI COD_SUCU="646" NUM_CUENTA="0664634000421716" OTR_DATOS=""/><DET_PAGO>TRANSFERENCIA POR BANCAMOVIL-BPA. ORDENADA POR: JORGE J. FERNANDEZ T. PAN: 920412XXXXXX1644 ID_CUBACEL: 2825128684 5358156312 BENEFICIARIO: 0664634000421716</DET_PAGO><IMP_ORIGIN MONEDA=" " IMPORTE="0.00"/><DET_GASTO>SHA</DET_GASTO><TASA_CAMBIO>0.00000</TASA_CAMBIO></RCSLBTR_102>', Importe: '920.00', Tipo: 'Cr' },
          { Fecha: '20/10/2025', Ref_Corriente: 'YY50111409646', Ref_Origen: 'KW5020BL19999', Observaciones: 'CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311250643636] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 920406XXXXXX0800ID:0664634000421716IDCUBACEL:2833096714TS:07-TransferenciaFECHA FACTURA: 1025INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA ORDENANTE NOMBRE:MAGDELIVIA CRUZ DURAnON| CI:78090623854 | Tarjeta RED:9204069998890800', Importe: '520.00', Tipo: 'Cr' },
          { Fecha: '20/10/2025', Ref_Corriente: 'YY50111424646', Ref_Origen: 'KW5020C8G4999', Observaciones: 'CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40311250576143] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 920406XXXXXX2749ID:0664634000421716IDCUBACEL:2833622842TS:07-TransferenciaFECHA FACTURA: 1025INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA ORDENANTE NOMBRE:ANGEL M. VERANES ALONSO| CI:77090121269 | Tarjeta RED:9204069997982749', Importe: '1,470.00', Tipo: 'Cr' },
          { Fecha: '20/10/2025', Ref_Corriente: 'YY50111433646', Ref_Origen: 'KW5020CDXW999', Observaciones: 'CREDITO RECIBIDO POR CORREO ELECTRONICO [DEBITO:40313180209529] TRANSFERENCIA EMITIDA POR BANCA MOVIL Tarjeta#: 921206XXXXXX7748ID:0664634000421716IDCUBACEL:2833755982TS:07-TransferenciaFECHA FACTURA: 1025INF_RECIBO:TRANSFERENCIA A TERCEROS MEDIANTE TARJETA MAGNETICA ORDENANTE NOMBRE:YULEISIS WATSON GOULET| CI:80041817410 | Tarjeta RED:9212069991527748', Importe: '1,650.00', Tipo: 'Cr' },
      ];
      await processBankData(demoTxs);
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
          { cod: 'CASH', descripcion: 'Venta Manual / Varios', um: 'U', precio_cents: 0, prioridad_algoritmo: 99, activo: true, es_paquete: false, contenido_paquete: 1 },
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
                <Button variant="outline" className="neu-btn text-[10px] sm:text-xs" onClick={importDefaultProducts}>
                    Productos Demo
                </Button>

                <Button variant="outline" className="neu-btn text-[10px] sm:text-xs" onClick={loadDemoStatement}>
                    Extracto Demo
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

        <div className="p-6 bg-destructive/5 rounded-3xl border border-destructive/20 space-y-4 md:col-span-2">
            <div className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                <h4 className="font-black uppercase text-sm tracking-widest">Zona de Peligro / Mantenimiento</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Button variant="destructive" className="w-full text-xs font-bold gap-2" onClick={resetBankData}>
                    <Trash2 className="w-4 h-4" />
                    Reiniciar Datos Banco
                </Button>
                <Button variant="destructive" className="w-full text-xs font-bold gap-2" onClick={resetCatalog}>
                    <Trash2 className="w-4 h-4" />
                    Vaciar Catálogo
                </Button>
                <Button variant="outline" className="w-full text-xs font-bold gap-2 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={resetAllMatching}>
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
