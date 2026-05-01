'use client';

import React from 'react';
import Image from 'next/image';
import { cn, formatCurrencyCents } from '@/lib/utils';

interface IncomeReceiptPreviewProps {
  data: {
    entidad_nombre: string;
    entidad_codigo: string;
    fecha_emision: string;
    numero_consecutivo: string;
    persona_entrega: string;
    conceptos_tabla: { concepto: string; importe: number }[];
    total: number;
    cantidad_letras: string;
    logo_url?: string;
  };
  className?: string;
}

export function IncomeReceiptPreview({ data, className }: IncomeReceiptPreviewProps) {
  return (
    <div className={cn("bg-background text-foreground p-8 shadow-2xl border border-border font-sans max-w-[800px] mx-auto", className)}>
      {/* Header Box */}
      <div className="border-2 border-black p-4 mb-6">
        <div className="flex justify-between items-start">
          <div className="flex gap-4 items-start">
            {data.logo_url && (
              <div className="w-16 h-16 flex-shrink-0 border border-black/10 p-1">
                <Image src={data.logo_url} alt="Logo de entidad" width={64} height={64} className="w-full h-full object-contain" unoptimized />
              </div>
            )}
            <div className="space-y-1">
              <div className="flex gap-2 text-sm">
                <span className="font-bold">ENTIDAD:</span>
                <span className="border-b border-black flex-1 min-w-[200px] uppercase font-medium">{data.entidad_nombre}</span>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="font-bold">CÓDIGO:</span>
                <span className="border-b border-black flex-1 min-w-[200px] uppercase font-medium">{data.entidad_codigo}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-lg">MODELO SC-3-01</div>
            <div className="text-[10px] italic">Uso Obligatorio - ORIGINAL</div>
          </div>
        </div>

        {/* Dates Row */}
        <div className="grid grid-cols-2 gap-4 mt-4 border-t border-black/10 pt-3">
          <div className="flex gap-2 text-[10px] items-center">
            <span className="font-black uppercase text-muted-foreground whitespace-nowrap">Fecha de Emisión:</span>
            <span className="border-b border-black flex-1 font-bold uppercase">{data.fecha_emision}</span>
          </div>
          <div className="flex gap-2 text-[10px] items-center">
            <span className="font-black uppercase text-muted-foreground whitespace-nowrap">Fecha del Cobro:</span>
            <span className="border-b border-black flex-1 font-bold uppercase">{data.fecha_emision}</span>
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <div className="flex gap-2 text-sm items-center">
            <span className="font-bold">NO. CONSECUTIVO:</span>
            <span className="border-b border-black min-w-[80px] text-center font-bold">{data.numero_consecutivo}</span>
          </div>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-xl font-bold text-center mb-8 uppercase tracking-widest border-b-2 border-black pb-2">RECIBO DE INGRESO DE EFECTIVO</h2>

      {/* Recibi de */}
      <div className="flex gap-2 mb-6 text-sm items-baseline">
        <span className="font-bold shrink-0">RECIBÍ DE:</span>
        <span className="border-b border-black flex-1 uppercase font-medium tracking-wide">{data.persona_entrega}</span>
      </div>

      {/* Table */}
      <table className="w-full border-collapse mb-6 text-sm">
        <thead>
          <tr>
            <th className="border border-black bg-background text-foreground p-2 text-left uppercase text-xs tracking-widest">Concepto</th>
            <th className="border border-black bg-background text-foreground p-2 text-right uppercase text-xs w-32 tracking-widest">Importe ($)</th>
          </tr>
        </thead>
        <tbody>
          {data.conceptos_tabla.length > 0 ? (
            data.conceptos_tabla.map((row, i) => (
              <tr key={i}>
                <td className="border border-black p-2 uppercase font-medium">{row.concepto}</td>
                <td className="border border-black p-2 text-right font-bold">
                  {formatCurrencyCents(row.importe)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="border border-black p-2 text-center text-muted-foreground italic" colSpan={2}>Sin conceptos registrados</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Total */}
      <div className="flex justify-end gap-4 mb-6 items-center">
        <span className="font-bold text-lg tracking-tighter">TOTAL:</span>
        <span className="font-black text-xl border-b-2 border-black min-w-[140px] text-right bg-muted/50 px-2">
          {formatCurrencyCents(data.total)}
        </span>
      </div>

      {/* Amount in words */}
      <div className="mb-12 bg-muted/50 p-3 border-l-4 border-black">
        <div className="text-[10px] font-black uppercase mb-1 text-muted-foreground tracking-widest">Cantidad en letras:</div>
        <div className="text-sm font-bold border-b border-black/20 pb-1 uppercase italic tracking-tight">{data.cantidad_letras}</div>
      </div>

      {/* Signatures */}
      <div className="flex justify-around items-end pt-16 pb-4 gap-12">
        <div className="flex flex-col items-center flex-1">
          <div className="w-full border-t border-black mb-2"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-center">Firma Cajero</span>
        </div>
        <div className="flex flex-col items-center flex-1">
          <div className="w-full border-t border-black mb-2"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-center">Firma de la persona que entrega el efectivo</span>
        </div>
      </div>

      {/* Footer info - CLEANED */}
      <div className="text-[9px] text-muted-foreground mt-12 flex justify-between border-t border-gray-100 pt-2 font-medium">
        <span className="uppercase tracking-widest">Modelo Oficial SC-3-01</span>
        <span className="uppercase tracking-widest">Previsualización del Sistema</span>
      </div>
    </div>
  );
}
