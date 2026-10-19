/**
 * cart-services.test.ts — MISIÓN TIPO-DE-ARTÍCULO (2026-10-19).
 *
 * Contrato del carrito (zustand `useCartStore`) frente a los servicios
 * intangibles (products.is_service = true, sin existencias propias):
 *
 *   SERVICIO (SKU 999 «Servicio de cripiar», stock_current = 0):
 *     1. addItem lo acepta (antes: «sin existencias» → rechazo).
 *     2. Se puede subir la cantidad sin tope de stock (updateQuantity).
 *     3. Agregar más del mismo servicio (ítem existente) no rebota por stock.
 *     4. El ítem conserva precio/cantidad — la confirmación de venta la
 *        autoriza el servidor (create_sale_v2 ya exime a is_service).
 *
 *   PRODUCTO FÍSICO (controles intactos — misión §6):
 *     5. stock 0 → addItem rechaza (false).
 *     6. cantidad > stock (ítem nuevo) → rechaza.
 *     7. cantidad agregada > stock (ítem existente) → rechaza.
 *     8. updateQuantity clampa al stock máximo.
 *     9. cantidad <= 0 elimina el ítem (comportamiento preexistente).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/store/cart';
import type { Product } from '@/types';

const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const servicio = {
  id: '34f49170-6f4f-426c-a1f2-3c396c416b74',
  name: 'Servicio de cripiar',
  sku: '999',
  price: 1,
  cost_price: 0,
  stock_current: 0,
  is_service: true,
  price_currency: 'USD',
  store_id: STORE_ID,
} as unknown as Product;

const fisicoConStock = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Detergente Multiusos 1L',
  sku: 'DET-001',
  price: 120,
  cost_price: 85,
  stock_current: 5,
  is_service: false,
  price_currency: 'CUP',
  store_id: STORE_ID,
} as unknown as Product;

const fisicoSinStock = {
  id: 'a2000000-0000-4000-8000-000000000002',
  name: 'Jabón de Tocador',
  sku: 'JAB-001',
  price: 60,
  cost_price: 40,
  stock_current: 0,
  is_service: false,
  price_currency: 'CUP',
  store_id: STORE_ID,
} as unknown as Product;

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

describe('MISIÓN TIPO-DE-ARTÍCULO — cart store', () => {
  beforeEach(resetCart);

  describe('servicio intangible (stock 0) — exento de guards de stock', () => {
    it('1 · addItem acepta un servicio con stock_current = 0', () => {
      const accepted = useCartStore.getState().addItem({
        product_id: servicio.id,
        variant_id: null,
        variant: null,
        price: servicio.price,
        cost: 0,
        quantity: 1,
        product: servicio,
        subtotal: servicio.price,
      });
      expect(accepted).toBe(true);
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().items[0].quantity).toBe(1);
      expect(useCartStore.getState().items[0].price).toBe(servicio.price);
    });

    it('2 · updateQuantity sube la cantidad más allá del "stock" (sin clamp)', () => {
      useCartStore.getState().addItem({
        product_id: servicio.id, variant_id: null, variant: null,
        price: servicio.price, cost: 0, quantity: 1, product: servicio, subtotal: servicio.price,
      });
      useCartStore.getState().updateQuantity(servicio.id, null, 10);
      const item = useCartStore.getState().items.find(i => i.product_id === servicio.id);
      expect(item?.quantity).toBe(10);
    });

    it('3 · agregar unidades de un servicio ya en carrito no rebota por stock', () => {
      useCartStore.getState().addItem({
        product_id: servicio.id, variant_id: null, variant: null,
        price: servicio.price, cost: 0, quantity: 1, product: servicio, subtotal: servicio.price,
      });
      const accepted = useCartStore.getState().addItem({
        product_id: servicio.id, variant_id: null, variant: null,
        price: servicio.price, cost: 0, quantity: 3, product: servicio, subtotal: servicio.price,
      });
      expect(accepted).toBe(true);
      const item = useCartStore.getState().items.find(i => i.product_id === servicio.id);
      expect(item?.quantity).toBe(4);
    });

    it('4 · conserva precio/cantidad/subtotal del servicio (trazabilidad comercial)', () => {
      // El carrito cobra al precio de catálogo del producto (product.price
      // tiene prioridad sobre el input — precio único de verdad).
      const servicio780 = { ...servicio, price: 780 } as unknown as Product;
      useCartStore.getState().addItem({
        product_id: servicio780.id, variant_id: null, variant: null,
        price: 780, cost: 0, quantity: 2, product: servicio780, subtotal: 1560,
      });
      const item = useCartStore.getState().items[0];
      expect(item.price).toBe(780);
      expect(item.quantity).toBe(2);
      expect(item.subtotal).toBe(1560);
    });
  });

  describe('producto físico — validaciones de stock intactas', () => {
    it('5 · addItem rechaza producto físico con stock 0', () => {
      const accepted = useCartStore.getState().addItem({
        product_id: fisicoSinStock.id, variant_id: null, variant: null,
        price: fisicoSinStock.price, cost: 40, quantity: 1,
        product: fisicoSinStock, subtotal: fisicoSinStock.price,
      });
      expect(accepted).toBe(false);
      expect(useCartStore.getState().items).toHaveLength(0);
    });

    it('6 · addItem rechaza cantidad > stock (ítem nuevo)', () => {
      const accepted = useCartStore.getState().addItem({
        product_id: fisicoConStock.id, variant_id: null, variant: null,
        price: fisicoConStock.price, cost: 85, quantity: 6,
        product: fisicoConStock, subtotal: fisicoConStock.price * 6,
      });
      expect(accepted).toBe(false);
      expect(useCartStore.getState().items).toHaveLength(0);
    });

    it('7 · addItem rechaza si el agregado supera el stock (ítem existente)', () => {
      useCartStore.getState().addItem({
        product_id: fisicoConStock.id, variant_id: null, variant: null,
        price: fisicoConStock.price, cost: 85, quantity: 4,
        product: fisicoConStock, subtotal: fisicoConStock.price * 4,
      });
      const accepted = useCartStore.getState().addItem({
        product_id: fisicoConStock.id, variant_id: null, variant: null,
        price: fisicoConStock.price, cost: 85, quantity: 2,
        product: fisicoConStock, subtotal: fisicoConStock.price * 2,
      });
      // 4 + 2 > 5 → rechazo (FIX-P1-4 intacto).
      expect(accepted).toBe(false);
      const item = useCartStore.getState().items.find(i => i.product_id === fisicoConStock.id);
      expect(item?.quantity).toBe(4);
    });

    it('8 · updateQuantity clampa la cantidad al stock máximo', () => {
      useCartStore.getState().addItem({
        product_id: fisicoConStock.id, variant_id: null, variant: null,
        price: fisicoConStock.price, cost: 85, quantity: 2,
        product: fisicoConStock, subtotal: fisicoConStock.price * 2,
      });
      useCartStore.getState().updateQuantity(fisicoConStock.id, null, 99);
      const item = useCartStore.getState().items.find(i => i.product_id === fisicoConStock.id);
      expect(item?.quantity).toBe(5); // clamped a stock_current = 5
    });

    it('9 · updateQuantity con cantidad <= 0 elimina el ítem', () => {
      useCartStore.getState().addItem({
        product_id: fisicoConStock.id, variant_id: null, variant: null,
        price: fisicoConStock.price, cost: 85, quantity: 1,
        product: fisicoConStock, subtotal: fisicoConStock.price,
      });
      useCartStore.getState().updateQuantity(fisicoConStock.id, null, 0);
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });
});
