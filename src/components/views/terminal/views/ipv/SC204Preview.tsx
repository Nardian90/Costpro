'use client';

import React from 'react';
import Image from 'next/image';
import { cn, formatCurrencyCents } from '@/lib/utils';
import { SC204Metadata, Product } from '@/lib/dexie';

interface SC204PreviewProps {
  data: {
    entidad_nombre: string;
    entidad_codigo: string;
    almacen_nombre: string;
    almacen_codigo: string;
    fecha_emision: string;
    numero_consecutivo: string;
    metadata: SC204Metadata;
    productos: {
        product: Product;
        quantity: number;
        total_units: number;
        unit_price_cents: number;
        total_price_cents: number;
        stock_after: number;
    }[];
    total_importe_cents: number;
    logo_url?: string;
  };
  className?: string;
}

export function SC204Preview({ data, className }: SC204PreviewProps) {
  return (
    <div className={cn("bg-background text-foreground p-6 shadow-2xl border border-border font-sans max-w-[900px] mx-auto text-[10px]", className)}>
      {/* Header section */}
      <div className="flex justify-between items-start mb-4 border-b-2 border-black pb-2">
        <div className="flex gap-4">
            {data.logo_url && <Image src={data.logo_url} alt="Logo de entidad" width={48} height={48} className="w-12 h-12 object-contain" unoptimized />}
            <div>
                <div className="font-bold">ENTIDAD RECEPTORA: <span className="font-normal border-b border-black inline-block min-w-[150px]">{data.entidad_nombre} ({data.entidad_codigo})</span></div>
                <div className="font-bold mt-1">ALMACÉN RECEPTOR: <span className="font-normal border-b border-black inline-block min-w-[150px]">{data.almacen_nombre} ({data.almacen_codigo})</span></div>
            </div>
        </div>
        <div className="text-right">
            <div className="font-bold text-base">MODELO SC-2-04</div>
            <div className="font-bold">INFORME DE RECEPCIÓN</div>
            <div className="text-[8px] italic">No. Consecutivo: <span className="border-b border-black px-2">{data.numero_consecutivo}</span></div>
            <div className="text-[8px] italic">Fecha: <span className="border-b border-black px-2">{data.fecha_emision}</span></div>
        </div>
      </div>

      {/* Provider and Document info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-black p-2 space-y-1">
            <div className="font-bold uppercase border-b border-black mb-1">Datos del Proveedor</div>
            <div>NOMBRE: <span className="font-bold">{data.metadata.proveedor_nombre}</span></div>
            <div>CÓDIGO: <span className="font-bold">{data.metadata.proveedor_codigo}</span></div>
        </div>
        <div className="border border-black p-2 space-y-1">
            <div className="font-bold uppercase border-b border-black mb-1">Documento que Ampara</div>
            <div>TIPO: <span className="font-bold">{data.metadata.documento_tipo}</span></div>
            <div>NÚMERO: <span className="font-bold">{data.metadata.documento_numero}</span></div>
        </div>
      </div>

      {/* Transporter info */}
      <div className="border border-black p-2 mb-4">
        <div className="font-bold uppercase border-b border-black mb-1">Datos del Transportador</div>
        <div className="grid grid-cols-3 gap-2">
            <div>NOMBRE: <span className="font-bold">{data.metadata.transportador_nombre}</span></div>
            <div>C.I.: <span className="font-bold">{data.metadata.transportador_ci}</span></div>
            <div>CHAPA: <span className="font-bold">{data.metadata.chapa}</span></div>
            {data.metadata.casilla && <div>CASILLA: <span className="font-bold">{data.metadata.casilla}</span></div>}
            {data.metadata.guia_aerea && <div>GUÍA AÉREA: <span className="font-bold">{data.metadata.guia_aerea}</span></div>}
        </div>
      </div>

      {/* Main Table */}
      <table className="w-full border-collapse border border-black mb-4">
        <thead>
            <tr className="bg-muted/50">
                <th className="border border-black p-1">Código</th>
                <th className="border border-black p-1">Descripción</th>
                <th className="border border-black p-1">UM</th>
                <th className="border border-black p-1">Cantidad</th>
                <th className="border border-black p-1">Precio Unit.</th>
                <th className="border border-black p-1">Importe</th>
                <th className="border border-black p-1">Existencia</th>
            </tr>
        </thead>
        <tbody>
            {data.productos.map((item, i) => (
                <tr key={i}>
                    <td className="border border-black p-1 text-center">{item.product.cod}</td>
                    <td className="border border-black p-1 uppercase">{item.product.descripcion}</td>
                    <td className="border border-black p-1 text-center">{item.product.um}</td>
                    <td className="border border-black p-1 text-right font-bold">{item.quantity}</td>
                    <td className="border border-black p-1 text-right">{formatCurrencyCents(item.unit_price_cents)}</td>
                    <td className="border border-black p-1 text-right font-bold">{formatCurrencyCents(item.total_price_cents)}</td>
                    <td className="border border-black p-1 text-right italic">{item.stock_after}</td>
                </tr>
            ))}
            <tr>
                <td colSpan={5} className="border border-black p-1 font-bold text-right uppercase">Importe Total del Modelo:</td>
                <td className="border border-black p-1 font-black text-right bg-muted/30">{formatCurrencyCents(data.total_importe_cents)}</td>
                <td className="border border-black p-1 bg-muted/10" aria-hidden="true"></td>
            </tr>
        </tbody>
      </table>

      {/* Signatures */}
      <div className="grid grid-cols-4 gap-4 mt-12 text-[8px] uppercase font-bold text-center">
        <div className="space-y-8">
            <div className="border-t border-black pt-1">Jefe de Almacén</div>
        </div>
        <div className="space-y-8">
            <div className="border-t border-black pt-1">Transportador</div>
        </div>
        <div className="space-y-8">
            <div className="border-t border-black pt-1">Empleado Recepciona</div>
        </div>
        <div className="space-y-8">
            <div className="border-t border-black pt-1">Contabiliza / Anota Inv.</div>
        </div>
      </div>

      <div className="mt-8 text-[7px] text-muted-foreground flex justify-between italic">
        <span>MODELO SC-2-04 (Uso Obligatorio)</span>
        <span>Generado por Sistema de Inteligencia de Productos y Ventas (IPV)</span>
      </div>
    </div>
  );
}
