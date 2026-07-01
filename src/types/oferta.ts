/**
 * @file Type definitions for Ofertas Comerciales (Commercial Offers).
 * @description Defines the data structures for creating, reading, and managing
 * commercial offers within the CostPro multi-store platform.
 */

export type OfertaStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface OfertaItem {
  codigo: string;
  descripcion: string;
  um: string;
  cantidad: number;
  precio_unitario: number;
}

export interface OfertaSuministrador {
  empresa: string;
  codigo_reup: string;
  codigo_nit: string;
  direccion: string;
  telefono: string;
  cuenta_bancaria: string;
  email: string;
}

export interface OfertaCliente {
  empresa: string;
  codigo_reup: string;
  codigo_nit: string;
  direccion: string;
  telefono: string;
  email: string;
  contacto: string;
}

export interface Oferta {
  id: string;
  store_id: string;
  numero: string;
  fecha: string;
  objeto: string;
  suministrador: OfertaSuministrador;
  cliente: OfertaCliente;
  productos: OfertaItem[];
  status: OfertaStatus;
  stamp_url?: string | null;
  sign_url?: string | null;
  stamp_scale?: number;
  sign_scale?: number;
  subtotal: number;
  descuento: number;
  itbis: number;
  total: number;
  moneda: string;
  validez: string;
  condiciones_pago: string;
  condiciones_entrega: string;
  notas: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Lightweight list item used in the ofertas sidebar list */
export interface OfertaListItem {
  id: string;
  numero: string;
  fecha: string;
  objeto: string;
  status: OfertaStatus;
  subtotal: number;
  total: number;
  moneda: string;
  cliente: { empresa: string };
  created_at: string;
}
