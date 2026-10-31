/**
 * @file Contrato de datos estricto para Ofertas Comerciales.
 * @description Define la estructura de datos que el frontend DEBE esperar
 * para una oferta comercial completa, junto con fábricas para crear
 * instancias con valores por defecto.
 */

import type {
  Oferta,
  OfertaItem,
  OfertaSuministrador,
  OfertaCliente,
  OfertaStatus,
} from '@/types/oferta';

// ============================================
// Tipos Base y Contratos
// ============================================

export interface OfertaItemContract {
  _uid: string; // stable key for React rendering (client-only, stripped before API call)
  codigo: string;
  descripcion: string;
  um: string;
  cantidad: number;
  precio_unitario: number;
}

/** API-safe item type (without _uid) for sending to the backend */
export type OfertaItemApi = Omit<OfertaItemContract, '_uid'>;

export interface OfertaSuministradorContract {
  empresa: string;
  codigo_reup: string;
  codigo_nit: string;
  direccion: string;
  telefono: string;
  cuenta_bancaria: string;
  email: string;
}

export interface OfertaClienteContract {
  empresa: string;
  codigo_reup: string;
  codigo_nit: string;
  direccion: string;
  telefono: string;
  email: string;
  contacto: string;
}

export interface OfertaContract {
  id: string;
  store_id: string;
  numero: string;
  fecha: string;
  objeto: string;
  suministrador: OfertaSuministradorContract;
  cliente: OfertaClienteContract;
  productos: OfertaItemContract[];
  status: OfertaStatus;
  stamp_url: string | null;
  sign_url: string | null;
  stamp_scale: number;
  sign_scale: number;
  subtotal: number;
  descuento: number;
  /** Tasa de impuesto en % (ej: 18 significa 18%). Se almacena en BD como `itbis`.
   *  El cálculo es inclusivo: impuesto = base * rate / (100 - rate) */
  impuesto_rate: number;
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

// ============================================
// Fábricas para Contratos
// ============================================

let _uidCounter = 0;

export const OfertaItemFactory = {
  create: (initialValues?: Partial<OfertaItemContract>): OfertaItemContract => ({
    _uid: `item-${Date.now()}-${++_uidCounter}`,
    codigo: '',
    descripcion: '',
    um: 'U',
    cantidad: 1,
    precio_unitario: 0,
    ...initialValues,
  }),
};

export const OfertaSuministradorFactory = {
  create: (initialValues?: Partial<OfertaSuministradorContract>): OfertaSuministradorContract => ({
    empresa: '',
    codigo_reup: '',
    codigo_nit: '',
    direccion: '',
    telefono: '',
    cuenta_bancaria: '',
    email: '',
    ...initialValues,
  }),
};

export const OfertaClienteFactory = {
  create: (initialValues?: Partial<OfertaClienteContract>): OfertaClienteContract => ({
    empresa: '',
    codigo_reup: '',
    codigo_nit: '',
    direccion: '',
    telefono: '',
    email: '',
    contacto: '',
    ...initialValues,
  }),
};

export const OfertaFactory = {
  /**
   * Crea una oferta comercial completa con valores por defecto.
   */
  create: (initialValues?: Partial<OfertaContract>): OfertaContract => ({
    id: '',
    store_id: '',
    numero: '',
    fecha: new Date().toLocaleDateString('en-CA'), // en-CA = YYYY-MM-DD in local timezone
    objeto: '',
    suministrador: OfertaSuministradorFactory.create(),
    cliente: OfertaClienteFactory.create(),
    productos: [OfertaItemFactory.create()],
    status: 'draft',
    stamp_url: null,
    sign_url: null,
    stamp_scale: 100,
    sign_scale: 100,
    subtotal: 0,
    descuento: 0,
    impuesto_rate: 0,
    total: 0,
    moneda: 'CUP',
    validez: '30 días',
    condiciones_pago: 'Pago en la fecha de entrega',
    condiciones_entrega: 'Según acuerdo entre las partes',
    notas: '',
    created_by: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...initialValues,
  }),
};

/** Calculate subtotal from a list of oferta items */
export function calculateSubtotal(productos: OfertaItemContract[]): number {
  return productos.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0);
}

/** Calculate total: (subtotal - descuento) + impuesto
 *  Impuesto uses tax-inclusive calculation: rate is the % of the TOTAL.
 *  Example: base=100, rate=10 → impuesto = 100/0.90 - 100 = 11.11, total = 111.11
 */
export function calculateTotal(subtotal: number, descuento: number, impuestoRate: number): number {
  const baseAfterDiscount = subtotal - descuento;
  const impuestoAmount = baseAfterDiscount * impuestoRate / (100 - impuestoRate || 100);
  return baseAfterDiscount + impuestoAmount;
}

/** Calculate Impuesto amount (tax-inclusive: rate is % of the total, not of the base)
 *  Formula: base * rate / (100 - rate)
 *  Guarantees that impuesto = rate% of the grand total.
 */
export function calculateItbis(subtotal: number, descuento: number, impuestoRate: number): number {
  if (impuestoRate <= 0 || impuestoRate >= 100) return 0;
  const baseAfterDiscount = subtotal - descuento;
  return baseAfterDiscount * impuestoRate / (100 - impuestoRate);
}

// ============================================
// Validación del formulario (contrato compartido)
// ============================================

/**
 * Valida el formulario de Ofertas y devuelve un mapa campo → mensaje.
 * Contrato: {} = válido. Las claves coinciden con los data-field del DOM:
 *   'numero' | 'objeto' | 'suministrador.empresa' | 'cliente.empresa'
 *   | 'productos' | `productos.${i}.descripcion` | `productos.${i}.cantidad`
 *   | `productos.${i}.precio_unitario`
 *
 * Reglas de negocio EXACTAS del modelo vigente (Zod ofertaCreateSchema +
 * validación histórica del formulario) — no se añaden requisitos nuevos:
 *   - numero, objeto, suministrador.empresa, cliente.empresa: no vacíos (trim)
 *   - al menos 1 producto
 *   - por producto: descripción no vacía, cantidad > 0, precio_unitario > 0
 *
 * CP-OFFERS-PUERTOPADRE-001: los mensajes identifican campo y producto para
 * que el usuario sepa QUÉ corregir sin mensajes genéricos.
 */
export function validateOfertaForm(formData: OfertaContract): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!formData.numero.trim()) {
    errors.numero = 'El número de oferta es obligatorio (ej. OF-2026-001)';
  }
  if (!formData.objeto.trim()) {
    errors.objeto = 'El objeto de la oferta es obligatorio';
  }
  if (!formData.suministrador.empresa.trim()) {
    errors['suministrador.empresa'] = 'La empresa del suministrador es obligatoria';
  }
  if (!formData.cliente.empresa.trim()) {
    errors['cliente.empresa'] = 'La empresa del cliente es obligatoria';
  }
  if (formData.productos.length === 0) {
    errors.productos = 'Agrega al menos un producto a la oferta';
  }
  formData.productos.forEach((p, i) => {
    const n = i + 1;
    if (!p.descripcion.trim()) {
      errors[`productos.${i}.descripcion`] = `La descripción del producto ${n} es obligatoria`;
    }
    if (p.cantidad <= 0) {
      errors[`productos.${i}.cantidad`] = `La cantidad del producto ${n} debe ser mayor que 0`;
    }
    if (p.precio_unitario <= 0) {
      errors[`productos.${i}.precio_unitario`] = `El precio unitario del producto ${n} debe ser mayor que 0`;
    }
  });

  return errors;
}
