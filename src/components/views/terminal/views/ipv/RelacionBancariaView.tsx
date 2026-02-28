'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BankTransaction } from '@/lib/dexie';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Search, Printer, Calendar, Building, CreditCard, Hash } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

export function RelacionBancariaView() {
  const transactions = useLiveQuery(() => db.bank_statements.where('tipo').equals('Cr').toArray());

  const [headerInfo, setHeaderInfo] = useState({
    comercio: 'MPM JESMARKMC SURL',
    reeup: '50004478172',
    cuenta: '0664-6340-0042-1716',
    anio: new Date().getFullYear().toString()
  });

  const [searchTerm, setSearchTerm] = useState('');

  const transferencias = useMemo(() => {
    return (transactions || []).filter(tx =>
      (tx.comision_cents || 0) === 0 &&
      (tx.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
       (tx.payer_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [transactions, searchTerm]);

  const qrOperations = useMemo(() => {
    return (transactions || []).filter(tx =>
      (tx.comision_cents || 0) > 0 &&
      (tx.referencia_origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
       (tx.payer_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [transactions, searchTerm]);

  const exportPDF = (type: 'TRANSFERENCIA' | 'QR') => {
    const data = type === 'TRANSFERENCIA' ? transferencias : qrOperations;
    const title = type === 'TRANSFERENCIA'
      ? 'RELACIÓN DE OPERACIONES DE TRANSFERENCIA DE EFECTIVO RECIBIDAS'
      : 'RELACIÓN DE OPERACIONES DE TRANSFERENCIA DE EFECTIVO RECIBIDAS POR CODIGO QR';

    if (data.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const doc = new jsPDF('l', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageWidth / 2, 40, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nombre del comercio: ${headerInfo.comercio}`, 40, 70);
    doc.text(`Código Reeup: ${headerInfo.reeup}`, pageWidth - 200, 70);

    if (type === 'TRANSFERENCIA') {
      doc.text(`Cuenta: ${headerInfo.cuenta}`, 40, 90);
    } else {
      doc.text(`Código QR`, 40, 90);
    }
    doc.text(`Año: ${headerInfo.anio}`, pageWidth - 200, 90);

    const tableRows = data.map((tx, index) => [
      index + 1,
      formatDate(tx.fecha),
      tx.payer_ci || '',
      tx.payer_name || '',
      tx.importe_cents.toFixed(2),
      tx.referencia_origen,
      tx.payer_phone || '',
      '', // Firma cliente
      ''  // Firma dependiente
    ]);

    autoTable(doc, {
      startY: 110,
      head: [['No', 'FECHA', 'Carnet de Identidad', 'Nombres y Apellidos', 'Importe', 'Transferencia', 'Teléfono', 'Firma cliente', 'Firma dependiente']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 5 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 60 },
        2: { cellWidth: 80 },
        4: { cellWidth: 60, halign: 'right' },
        5: { cellWidth: 80 },
        6: { cellWidth: 70 },
        7: { cellWidth: 80 },
        8: { cellWidth: 80 }
      }
    });

    doc.save(`Relacion_${type}_${headerInfo.anio}.pdf`);
    toast.success('PDF generado exitosamente');
  };

  return (
    <div className="space-y-6 p-6">
      <Card className="p-6 bg-primary/5 border-primary/20 rounded-[2rem]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Building className="w-3 h-3" /> Nombre del Comercio
            </Label>
            <Input
              value={headerInfo.comercio}
              onChange={(e) => setHeaderInfo({...headerInfo, comercio: e.target.value})}
              className="h-10 text-sm font-bold bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Hash className="w-3 h-3" /> Código Reeup
            </Label>
            <Input
              value={headerInfo.reeup}
              onChange={(e) => setHeaderInfo({...headerInfo, reeup: e.target.value})}
              className="h-10 text-sm font-bold bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <CreditCard className="w-3 h-3" /> Cuenta Bancaria
            </Label>
            <Input
              value={headerInfo.cuenta}
              onChange={(e) => setHeaderInfo({...headerInfo, cuenta: e.target.value})}
              className="h-10 text-sm font-bold bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Calendar className="w-3 h-3" /> Año
            </Label>
            <Input
              value={headerInfo.anio}
              onChange={(e) => setHeaderInfo({...headerInfo, anio: e.target.value})}
              className="h-10 text-sm font-bold bg-background"
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-between items-center bg-card/50 backdrop-blur-sm p-4 rounded-2xl border">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por referencia o pagador..."
            className="pl-10 h-10 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => exportPDF('TRANSFERENCIA')} className="neu-btn-primary h-10 text-[10px] font-black uppercase gap-2">
            <Printer className="w-4 h-4" /> Exportar Transferencias
          </Button>
          <Button onClick={() => exportPDF('QR')} variant="outline" className="h-10 text-[10px] font-black uppercase gap-2 border-primary/20 text-primary hover:bg-primary/5">
            <Printer className="w-4 h-4" /> Exportar QR
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <div className="w-1 h-6 bg-green-500 rounded-full" />
            <h3 className="text-lg font-black uppercase tracking-tighter">Transferencias (Comisión 0)</h3>
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{transferencias.length}</Badge>
          </div>
          <div className="border rounded-2xl overflow-hidden bg-background">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Pagador / CI</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Teléfono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferencias.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No hay transferencias encontradas.</TableCell></TableRow>
                ) : (
                  transferencias.map((tx, i) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-center font-bold text-xs">{i + 1}</TableCell>
                      <TableCell className="text-xs">{formatDate(tx.fecha)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-black uppercase">{tx.payer_name || 'Desconocido'}</span>
                          <span className="text-[10px] text-muted-foreground">{tx.payer_ci || 'Sin CI'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-black text-sm">{formatCurrency(tx.importe_cents)}</TableCell>
                      <TableCell className="font-mono text-xs text-primary">{tx.referencia_origen}</TableCell>
                      <TableCell className="text-xs">{tx.payer_phone || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <div className="w-1 h-6 bg-blue-500 rounded-full" />
            <h3 className="text-lg font-black uppercase tracking-tighter">Código QR (Comisión {'>'} 0)</h3>
            <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">{qrOperations.length}</Badge>
          </div>
          <div className="border rounded-2xl overflow-hidden bg-background">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Pagador / CI</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Teléfono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qrOperations.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No hay operaciones QR encontradas.</TableCell></TableRow>
                ) : (
                  qrOperations.map((tx, i) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-center font-bold text-xs">{i + 1}</TableCell>
                      <TableCell className="text-xs">{formatDate(tx.fecha)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-black uppercase">{tx.payer_name || 'Desconocido'}</span>
                          <span className="text-[10px] text-muted-foreground">{tx.payer_ci || 'Sin CI'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-black text-sm">{formatCurrency(tx.importe_cents)}</TableCell>
                      <TableCell className="font-mono text-xs text-primary">{tx.referencia_origen}</TableCell>
                      <TableCell className="text-xs">{tx.payer_phone || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
