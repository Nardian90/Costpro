/**
 * CP-OFFERS-PUERTOPADRE-001 — Pruebas unitarias del contrato de Ofertas.
 *
 * Cubre:
 *   1. validateOfertaForm — el mapa de errores con mensajes ESPECÍFICOS por
 *      campo y por producto (causa raíz del defecto: mensaje genérico
 *      «Por favor, corrija los errores en el formulario» sin identificar
 *      el campo que falla).
 *   2. Paridad con las reglas REALES del backend (ofertaCreateSchema):
 *      las mismas condiciones de invalidez del form deben rebotar en Zod.
 *   3. Fábricas: valores por defecto del item (precio 0 → requiere entrada
 *      del usuario — documentado como comportamiento del modelo).
 */
import { describe, it, expect } from 'vitest';
import {
  OfertaFactory,
  OfertaItemFactory,
  validateOfertaForm,
  calculateSubtotal,
  calculateTotal,
  type OfertaContract,
  type OfertaItemContract,
} from '@/contracts/oferta';
import { ofertaCreateSchema } from '@/validation/api-schemas';

/** Oferta válida canónica (base para mutaciones por caso). */
function validOferta(): OfertaContract {
  return OfertaFactory.create({
    numero: 'OF-2026-001',
    objeto: 'Suministro de materiales',
    suministrador: {
      empresa: 'Suministradora Test S.A.',
      codigo_reup: '',
      codigo_nit: '',
      direccion: '',
      telefono: '',
      cuenta_bancaria: '',
      email: '',
    },
    cliente: {
      empresa: 'Cliente Constructora S.A.',
      codigo_reup: '',
      codigo_nit: '',
      direccion: '',
      telefono: '',
      email: '',
      contacto: '',
    },
    productos: [
      OfertaItemFactory.create({
        codigo: 'CEM-50',
        descripcion: 'Cemento gris 50kg',
        cantidad: 10,
        precio_unitario: 2500,
      }),
    ],
  });
}

describe('validateOfertaForm — mensajes específicos por campo', () => {
  it('una oferta completa NO produce errores', () => {
    const errors = validateOfertaForm(validOferta());
    expect(errors).toEqual({});
  });

  it('numero vacío → error que nombra el campo', () => {
    const errors = validateOfertaForm({ ...validOferta(), numero: '' });
    expect(errors.numero).toMatch(/número de oferta es obligatorio/i);
  });

  it('numero con solo espacios → inválido (trim)', () => {
    const errors = validateOfertaForm({ ...validOferta(), numero: '   ' });
    expect(errors.numero).toBeDefined();
  });

  it('objeto vacío → error que nombra el campo', () => {
    const errors = validateOfertaForm({ ...validOferta(), objeto: '' });
    expect(errors.objeto).toMatch(/objeto de la oferta es obligatorio/i);
  });

  it('suministrador.empresa vacía → error que nombra el campo', () => {
    const o = validOferta();
    const errors = validateOfertaForm({
      ...o,
      suministrador: { ...o.suministrador, empresa: '  ' },
    });
    expect(errors['suministrador.empresa']).toMatch(/empresa del suministrador es obligatoria/i);
  });

  it('cliente.empresa vacía → error que nombra el campo', () => {
    const o = validOferta();
    const errors = validateOfertaForm({
      ...o,
      cliente: { ...o.cliente, empresa: '' },
    });
    expect(errors['cliente.empresa']).toMatch(/empresa del cliente es obligatoria/i);
  });

  it('sin productos → error que lo indica', () => {
    const errors = validateOfertaForm({ ...validOferta(), productos: [] });
    expect(errors.productos).toMatch(/al menos un producto/i);
  });

  it('precio 0 (default de fábrica) → error que identifica producto 1', () => {
    // ESCENARIO DEL DEFECTO REPORTADO: el usuario completa el formulario
    // sin tocar el precio (default 0) y solo veía el mensaje genérico.
    const errors = validateOfertaForm({ ...validOferta(), productos: [OfertaItemFactory.create({ descripcion: 'Cemento' })] });
    expect(errors['productos.0.precio_unitario']).toMatch(/precio unitario del producto 1/i);
    expect(errors['productos.0.precio_unitario']).toMatch(/mayor que 0/i);
  });

  it('cantidad 0 → error que identifica producto y campo', () => {
    const errors = validateOfertaForm({
      ...validOferta(),
      productos: [OfertaItemFactory.create({ descripcion: 'Cemento', cantidad: 0, precio_unitario: 100 })],
    });
    expect(errors['productos.0.cantidad']).toMatch(/cantidad del producto 1/i);
  });

  it('descripción vacía del producto → error que la identifica', () => {
    const errors = validateOfertaForm({
      ...validOferta(),
      productos: [OfertaItemFactory.create({ descripcion: ' ', cantidad: 1, precio_unitario: 100 })],
    });
    expect(errors['productos.0.descripcion']).toMatch(/descripción del producto 1/i);
  });

  it('varios productos → los errores numeran el producto correcto', () => {
    const errors = validateOfertaForm({
      ...validOferta(),
      productos: [
        OfertaItemFactory.create({ descripcion: 'Válido', cantidad: 1, precio_unitario: 100 }),
        OfertaItemFactory.create({ descripcion: 'Sin precio', cantidad: 1, precio_unitario: 0 }),
      ],
    });
    expect(errors['productos.0.precio_unitario']).toBeUndefined();
    expect(errors['productos.1.precio_unitario']).toMatch(/producto 2/i);
  });

  it('acumula TODOS los errores (no solo el primero)', () => {
    const errors = validateOfertaForm(OfertaFactory.create());
    // numero + objeto + suministrador + cliente + precio del producto 1
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining([
        'numero',
        'objeto',
        'suministrador.empresa',
        'cliente.empresa',
        'productos.0.precio_unitario',
      ])
    );
    expect(Object.keys(errors).length).toBeGreaterThanOrEqual(5);
  });
});

describe('validateOfertaForm ↔ ofertaCreateSchema (paridad frontend/backend)', () => {
  /**
   * El form y el backend NO validan el mismo subconjunto (Zod añade store_id,
   * longitudes máx, rangos), pero toda invalidez del FORM debe rebotar
   * también en el BACKEND: si el form dice inválido, el backend no debería
   * aceptar (y viceversa para los campos compartidos).
   */
  const cases: Array<{ name: string; mutate: (o: OfertaContract) => OfertaContract }> = [
    { name: 'numero vacío', mutate: o => ({ ...o, numero: '' }) },
    { name: 'objeto vacío', mutate: o => ({ ...o, objeto: '' }) },
    { name: 'suministrador.empresa vacía', mutate: o => ({ ...o, suministrador: { ...o.suministrador, empresa: '' } }) },
    { name: 'cliente.empresa vacía', mutate: o => ({ ...o, cliente: { ...o.cliente, empresa: '' } }) },
    { name: 'sin productos', mutate: o => ({ ...o, productos: [] }) },
    { name: 'precio_unitario 0', mutate: o => ({ ...o, productos: [{ ...o.productos[0], precio_unitario: 0 }] }) },
    { name: 'cantidad 0', mutate: o => ({ ...o, productos: [{ ...o.productos[0], cantidad: 0 }] }) },
    { name: 'descripción vacía', mutate: o => ({ ...o, productos: [{ ...o.productos[0], descripcion: '' }] }) },
  ];

  it.each(cases)('inválido en el form ⇒ inválido en Zod: $name', ({ mutate }) => {
    const invalid = mutate(validOferta());
    // 1. El form lo detecta
    expect(Object.keys(validateOfertaForm(invalid)).length).toBeGreaterThan(0);
    // 2. El backend también lo rechaza (payload con store_id válida)
    const payload = {
      ...invalid,
      store_id: '11111111-1111-1111-1111-111111111111',
      productos: invalid.productos.map(({ _uid, ...item }) => item),
    };
    expect(ofertaCreateSchema.safeParse(payload).success).toBe(false);
  });

  it('la oferta válida del form pasa la validación del backend', () => {
    const o = validOferta();
    const payload = {
      ...o,
      store_id: '11111111-1111-1111-1111-111111111111',
      productos: o.productos.map(({ _uid, ...item }) => item),
    };
    const parsed = ofertaCreateSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });
});

describe('OfertaItemFactory — defaults documentados', () => {
  it('precio_unitario default 0: exige entrada explícita del usuario', () => {
    // Documenta la causa raíz del defecto: el item nace con precio 0,
    // que el input renderiza como vacío. La validación ahora lo informa
    // con un mensaje específico (ver suite anterior).
    const item = OfertaItemFactory.create();
    expect(item.precio_unitario).toBe(0);
    expect(item.cantidad).toBe(1);
    expect(validateOfertaForm({ ...validOferta(), productos: [item] })['productos.0.precio_unitario']).toBeDefined();
  });
});

describe('Cálculos financieros (regresión — usados por el submit)', () => {
  it('calculateSubtotal suma cantidad × precio por producto', () => {
    const items: OfertaItemContract[] = [
      OfertaItemFactory.create({ cantidad: 10, precio_unitario: 2500 }),
      OfertaItemFactory.create({ cantidad: 2, precio_unitario: 500 }),
    ];
    expect(calculateSubtotal(items)).toBe(26000);
  });

  it('calculateTotal aplica descuento e impuesto inclusivo', () => {
    // base 100, descuento 0, impuesto 10% → total 111.11 (impuesto = 11.11)
    expect(calculateTotal(100, 0, 10)).toBeCloseTo(111.1111, 3);
    // base 100, descuento 20, impuesto 0 → total 80
    expect(calculateTotal(100, 20, 0)).toBe(80);
  });
});
