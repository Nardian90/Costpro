'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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
  };
  className?: string;
}

export function IncomeReceiptPreview({ data, className }: IncomeReceiptPreviewProps) {
  return (
    <div className={cn("bg-white text-black p-8 shadow-2xl border border-gray-200 font-sans max-w-[800px] mx-auto", className)}>
      {/* Header Box */}
      <div className="border-2 border-black p-4 mb-6">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex gap-2 text-sm">
              <span className="font-bold">ENTIDAD:</span>
              <span className="border-b border-black flex-1 min-w-[200px] uppercase">{data.entidad_nombre}</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="font-bold">CÓDIGO:</span>
              <span className="border-b border-black flex-1 min-w-[200px] uppercase">{data.entidad_codigo}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-lg">MODELO SC-3-01</div>
            <div className="text-[10px] italic">Uso Obligatorio - ORIGINAL</div>
          </div>
        </div>
        <div className="flex justify-between items-end mt-4">
          <div className="flex gap-2 text-sm">
            <span className="font-bold">FECHA:</span>
            <span className="border-b border-black uppercase">{data.fecha_emision}</span>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="font-bold">NO. CONSECUTIVO:</span>
            <span className="border-b border-black min-w-[80px] text-center">{data.numero_consecutivo}</span>
          </div>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-xl font-bold text-center mb-8 uppercase tracking-widest">RECIBO DE INGRESO DE EFECTIVO</h2>

      {/* Recibi de */}
      <div className="flex gap-2 mb-6 text-sm">
        <span className="font-bold shrink-0">RECIBÍ DE:</span>
        <span className="border-b border-black flex-1 uppercase font-medium">{data.persona_entrega}</span>
      </div>

      {/* Table */}
      <table className="w-full border-collapse mb-6 text-sm">
        <thead>
          <tr>
            <th className="border border-black bg-black text-white p-2 text-left uppercase text-xs">Concepto</th>
            <th className="border border-black bg-black text-white p-2 text-right uppercase text-xs w-32">Importe ($)</th>
          </tr>
        </thead>
        <tbody>
          {data.conceptos_tabla.length > 0 ? (
            data.conceptos_tabla.map((row, i) => (
              <tr key={i}>
                <td className="border border-black p-2 uppercase font-medium">{row.concepto}</td>
                <td className="border border-black p-2 text-right font-bold">
                  {row.importe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="border border-black p-2 text-center text-gray-400 italic" colSpan={2}>Sin conceptos registrados</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Total */}
      <div className="flex justify-end gap-4 mb-6">
        <span className="font-bold text-lg">TOTAL:</span>
        <span className="font-black text-xl border-b-2 border-black min-w-[120px] text-right">
          {data.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Amount in words */}
      <div className="mb-12">
        <div className="text-xs font-bold uppercase mb-1">Cantidad en letras:</div>
        <div className="text-sm italic border-b border-black pb-1 uppercase">{data.cantidad_letras}</div>
      </div>

      {/* Signatures */}
      <div className="flex justify-around items-end pt-12 pb-4">
        <div className="flex flex-col items-center w-48">
          <div className="w-full border-t border-black mb-2"></div>
          <span className="text-[10px] font-bold uppercase">Firma Cajero</span>
        </div>
        <div className="flex flex-col items-center w-48">
          <div className="w-full border-t border-black mb-2"></div>
          <span className="text-[10px] font-bold uppercase">Firma Entrega</span>
        </div>
      </div>

      {/* Footer info */}
      <div className="text-[8px] text-gray-400 mt-8 flex justify-between uppercase">
        <span>COSTPRO TERMINAL LEGAL - {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
        <span>Previsualización del Sistema</span>
      </div>
    </div>
  );
}
