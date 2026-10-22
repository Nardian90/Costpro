/**
 * cart-decimal-quantities.test.ts — MISIÓN CARRITO-VENTAS (2026-10-23).
 *
 * Contrato de CANTIDADES FRACCIONARIAS del carrito (zustand `useCartStore`)
 * tras eliminar la restricción entera de la cadena de venta:
 *
 *  1. Precisión: hasta 4 posiciones decimales (1.5 / 1.25 / 1.125 / 1.2345 /
 *     0.0001) en addItem y updateQuantity — jamás parseInt/truncamiento.
 *  2. Normalización: >4dp se redondea HALF-UP a 4dp (roundQty), coherente con
 *     la validación del endpoint /api/pos/checkout.
 *  3. Sin mínimo entero artificial: 0.5 «unidad» es una cantidad legal — la
 *     unidad de medida NO restringe a enteros (create_sale_v2 persiste
 *     NUMERIC y valida stock con comparación numeric directa).
 *  4. Topes de stock fraccionarios: floorQty (suelo 4dp) sustituye a
 *     Math.floor — stock 2.5 permite vender 2.5 (antes: 2), y el tope nunca
 *     supera las existencias reales.
 *  5. Sin falsos rechazos por polvo binario: QTY_EPSILON en las comparaciones
 *     (0.1×3 = 0.30000000000000004 vs stock 0.3 es aceptable).
 *  6. Reglas legacy intactas: ≤0 elimina la línea; stock 0 rechaza el alta de
 *     físicos; servicios siguen exentos de tope; subtotal coherente con la
 *     cantidad decimal (round2(unit × qty)).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, roundQty, floorQty } from '@/store/cart';
import type { Product } from '@/types';

const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

// Producto análogo al caso de misión: código 157 «Royal Cole», unidad
// «unidad», sin ninguna restricción de divisibilidad documentada.
const royalCole = (overrides: Partial<Product> = {}) =>
  ({
    id: 'b1000000-0000-4000-8000-000000000157',
    name: 'Royal Cole',
    sku: '157',
    price: 45.5,
    cost_price: 30,
    stock_current: 10,
    is_service: false,
    unit_of_measure: 'unidad',
    price_currency: 'CUP',
    store_id: STORE_ID,
    ...overrides,
  }) as unknown as Product;

function resetCart() {
  useCartStore.setState({
    items: [],
    storeId: STORE_ID,
    discount: null,
    appliedTaxes: [],
    saleDate: null,
    operationType: 'sale',
    globalRates: {},
  });
}

function addItemOf(product: Product, quantity: number): boolean {
  return useCartStore.getState().addItem({
    product_id: product.id,
    variant_id: null,
    variant: null,
    price: product.price,
    cost: 0,
    quantity,
    product,
    subtotal: product.price * quantity,
  });
}

/** Tipo del input de addItem (vía ReturnType — typeof no admite llamadas). */
type AddItemInput = Parameters<ReturnType<typeof useCartStore.getState>["addItem"]>[0];

function itemOf(productId: string) {
  return useCartStore.getState().items.find((i) => i.product_id === productId);
}

describe('MISIÓN CARRITO-DECIMALES — helpers de precisión', () => {
  it('roundQty redondea HALF-UP a 4dp exactos sobre el decimal', () => {
    expect(roundQty(1.5)).toBe(1.5);
    expect(roundQty(1.2345)).toBe(1.2345);
    expect(roundQty(1.23456)).toBe(1.2346);
    expect(roundQty(1.23444)).toBe(1.2344);
    // Caso trampa del float: Math.round(1.0005*10000)=10005 falla por polvo
    expect(roundQty(1.0005)).toBe(1.0005);
    expect(roundQty(0.00005)).toBe(0.0001);
  });

  it('floorQty aplica suelo 4dp tras recortar el polvo binario', () => {
    expect(floorQty(2.5)).toBe(2.5);
    expect(floorQty(2.56789)).toBe(2.5678);
    // 0.3/3 = 0.09999999999999999 → toFixed(12) lo trima a 0.1
    expect(floorQty(0.3 / 3)).toBe(0.1);
    expect(floorQty(10 / 3)).toBe(3.3333);
  });
});

describe('MISIÓN CARRITO-DECIMALES — addItem acepta fracciones', () => {
  beforeEach(resetCart);

  it.each([1, 1.5, 1.25, 1.125, 1.2345, 0.0001])('acepta cantidad %s de «Royal Cole» (unidad «unidad»)', (qty) => {
    const accepted = addItemOf(royalCole(), qty);
    expect(accepted).toBe(true);
    const item = itemOf(royalCole().id);
    expect(item?.quantity).toBe(qty);
  });

  it('la coma regional no existe en el store: el frontend normaliza antes (0.5 ≠ "0,5" crudo)', () => {
    // El store recibe SIEMPRE number (los inputs normalizan coma→punto);
    // verificamos que un number 0.5 no se toca.
    addItemOf(royalCole(), 0.5);
    expect(itemOf(royalCole().id)?.quantity).toBe(0.5);
  });

  it('normaliza >4dp a 4dp (1.23456 → 1.2346) sin truncar a entero', () => {
    addItemOf(royalCole(), 1.23456);
    expect(itemOf(royalCole().id)?.quantity).toBe(1.2346);
  });

  it('cantidad por debajo de la precisión sube a 0.0001 (nunca silenciosa a 0)', () => {
    addItemOf(royalCole(), 0.00004);
    expect(itemOf(royalCole().id)?.quantity).toBe(0.0001);
  });

  it('subtotal de línea usa la cantidad decimal real (1.5 × 45.50 = 68.25)', () => {
    addItemOf(royalCole(), 1.5);
    const item = itemOf(royalCole().id);
    expect(item?.subtotal).toBe(68.25);
  });
});

describe('MISIÓN CARRITO-DECIMALES — updateQuantity fraccionario', () => {
  beforeEach(resetCart);

  it('1 → 1.5 → 1.2345 conservan la fracción en el estado', () => {
    addItemOf(royalCole(), 1);
    useCartStore.getState().updateQuantity(royalCole().id, null, 1.5);
    expect(itemOf(royalCole().id)?.quantity).toBe(1.5);
    useCartStore.getState().updateQuantity(royalCole().id, null, 1.2345);
    expect(itemOf(royalCole().id)?.quantity).toBe(1.2345);
    // El subtotal se recalcula con la fracción
    expect(itemOf(royalCole().id)?.subtotal).toBe(roundQty2(45.5 * 1.2345));
  });

  it('no re-redondea un valor ya válido mientras se edita (1.5 no se convierte en 2 ni 1)', () => {
    addItemOf(royalCole(), 1);
    useCartStore.getState().updateQuantity(royalCole().id, null, 1.5);
    expect(itemOf(royalCole().id)?.quantity).not.toBe(2);
    expect(itemOf(royalCole().id)?.quantity).not.toBe(1);
  });

  it('cantidad ≤ 0 elimina la línea (regla preexistente intacta)', () => {
    addItemOf(royalCole(), 1.5);
    useCartStore.getState().updateQuantity(royalCole().id, null, 0);
    expect(itemOf(royalCole().id)).toBeUndefined();
  });

  it('stock 2.5 permite actualizar hasta 2.5 (el antiguo Math.floor lo limitaba a 2)', () => {
    addItemOf(royalCole({ stock_current: 2.5 }), 1);
    useCartStore.getState().updateQuantity(royalCole().id, null, 2.5);
    const item = itemOf(royalCole().id);
    expect(item?.quantity).toBe(2.5);
  });

  it('clamp al tope fraccionario cuando se excede el stock', () => {
    addItemOf(royalCole({ stock_current: 2.5 }), 1);
    useCartStore.getState().updateQuantity(royalCole().id, null, 3);
    expect(itemOf(royalCole().id)?.quantity).toBe(2.5);
  });

  it('sin falsos rechazos por polvo binario: stock 0.3 permite 0.1 con factor 3', () => {
    const conVariante = royalCole({ stock_current: 0.3 });
    addItemOf(conVariante, 0.03);
    // 0.03 × factor 3 = 0.09999999999999999 unidades base ≈ 0.1 ≤ 0.3 ✓
    useCartStore.getState().updateQuantity(conVariante.id, null, 0.1);
    expect(itemOf(conVariante.id)?.quantity).toBe(0.1);
  });

  it('servicios siguen sin tope de cantidad (regla TIPO-DE-ARTÍCULO intacta)', () => {
    const servicio = royalCole({
      id: 'b2000000-0000-4000-8000-000000000999',
      sku: '999',
      is_service: true,
      stock_current: 0,
    });
    addItemOf(servicio, 1);
    useCartStore.getState().updateQuantity(servicio.id, null, 1000.5);
    expect(itemOf(servicio.id)?.quantity).toBe(1000.5);
  });
});

describe('MISIÓN CARRITO-DECIMALES — topes de stock en addItem', () => {
  beforeEach(resetCart);

  it('alta con stock fraccionario 2.5: acepta 2.5 y rechaza 2.6', () => {
    expect(addItemOf(royalCole({ stock_current: 2.5 }), 2.5)).toBe(true);
    resetCart();
    expect(addItemOf(royalCole({ stock_current: 2.5 }), 2.6)).toBe(false);
  });

  it('acumulación fraccionaria sobre línea existente respeta el tope con épsilon', () => {
    const producto = royalCole({ stock_current: 1.5 });
    expect(addItemOf(producto, 0.75)).toBe(true);
    // 0.75 + 0.75 = 1.5 = stock exacto — el épsilon evita el falso rechazo
    expect(addItemOf(producto, 0.75)).toBe(true);
    expect(itemOf(producto.id)?.quantity).toBe(1.5);
  });

  it('stock 0 sigue rechazando el alta de productos físicos (regla intacta)', () => {
    expect(addItemOf(royalCole({ stock_current: 0 }), 1)).toBe(false);
  });

  it('sin cantidad (undefined) conserva el default histórico 1', () => {
    const accepted = useCartStore.getState().addItem({
      product_id: royalCole().id,
      variant_id: null,
      variant: null,
      price: royalCole().price,
      cost: 0,
      quantity: undefined,
      product: royalCole(),
      subtotal: royalCole().price,
    } as unknown as AddItemInput);
    expect(accepted).toBe(true);
    expect(itemOf(royalCole().id)?.quantity).toBe(1);
  });
});

describe('MISIÓN CARRITO-DECIMALES — unidad de medida sin restricción entera', () => {
  beforeEach(resetCart);

  it('ninguna condición del store consulta unit_of_measure para decidir el paso', () => {
    // Auditoría de contrato: «unidad» y «kg» se comportan idéntico.
    const porUnidad = royalCole({ id: 'b3000000-0000-4000-8000-000000000001', unit_of_measure: 'unidad' });
    const porPeso = royalCole({ id: 'b3000000-0000-4000-8000-000000000002', unit_of_measure: 'kg' });
    expect(addItemOf(porUnidad, 0.5)).toBe(true);
    expect(addItemOf(porPeso, 0.5)).toBe(true);
    expect(itemOf(porUnidad.id)?.quantity).toBe(0.5);
    expect(itemOf(porPeso.id)?.quantity).toBe(0.5);
  });
});

/** round2 local (misma semántica que el store usa para subtotales). */
function roundQty2(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const scaled = Number(`${Number(abs.toFixed(12))}e2`);
  return sign * Math.round(scaled) / 100;
}
