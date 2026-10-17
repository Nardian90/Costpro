/**
 * cart-saleDate.test.ts — MISIÓN FECHA OPERATIVA EN VENDER (2026-10-17).
 *
 * Contrato del slice `saleDate` del cart store (zustand persist `pos-cart-storage`):
 *   1. Default null (= hoy Habana implícito).
 *   2. setSaleDate guarda la fecha elegida ('YYYY-MM-DD') y lastUpdated avanza.
 *   3. clearCart() reinicia a null (tras confirmar/anular el carrito la fecha
 *      vuelve a HOY — misión §5: la fecha de una venta confirmada no se filtra
 *      al siguiente carrito).
 *   4. El toggle Venta↔Vale de Salida (setOperationType) PRESERVA la fecha
 *      (es la misma operación operativa del carrito — misión §6).
 *   5. Persistencia: saleDate viaja en partialize (sobrevive recargas mientras
 *      el carrito no se confirme — misión §3).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/store/cart';

const todayBd = '2026-10-17';

describe('cart store — slice saleDate (misión fecha operativa)', () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      discount: null,
      appliedTaxes: [],
      saleDate: null,
      operationType: 'sale',
      productionOrderId: null,
      valeNotes: '',
      productionOrderItemIds: {},
    });
  });

  it('default null = hoy implícito', () => {
    expect(useCartStore.getState().saleDate).toBeNull();
  });

  it('setSaleDate guarda la fecha elegida', () => {
    useCartStore.getState().setSaleDate('2026-10-15');
    expect(useCartStore.getState().saleDate).toBe('2026-10-15');
  });

  it('setSaleDate(null) vuelve a hoy implícito', () => {
    useCartStore.getState().setSaleDate('2026-10-15');
    useCartStore.getState().setSaleDate(null);
    expect(useCartStore.getState().saleDate).toBeNull();
  });

  it('clearCart reinicia la fecha a null (siguiente carrito = hoy)', () => {
    useCartStore.setState({ items: [
      {
        product_id: 'p1',
        variant_id: null,
        quantity: 1,
        price: 100,
        cost: 50,
        subtotal: 100,
        cash_paid: 0,
        transfer_paid: 0,
        zelle_paid: 0,
        payments: [],
      } as never,
    ] });
    useCartStore.getState().setSaleDate('2026-10-10');
    expect(useCartStore.getState().saleDate).toBe('2026-10-10');
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().saleDate).toBeNull();
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('setOperationType sale↔issue_slip PRESERVA la fecha elegida', () => {
    useCartStore.getState().setSaleDate('2026-10-12');
    useCartStore.getState().setOperationType('issue_slip');
    expect(useCartStore.getState().operationType).toBe('issue_slip');
    expect(useCartStore.getState().saleDate).toBe('2026-10-12');
    useCartStore.getState().setOperationType('sale');
    expect(useCartStore.getState().saleDate).toBe('2026-10-12');
  });

  it('clearValeState no toca la fecha (solo campos del formulario del vale)', () => {
    useCartStore.getState().setSaleDate('2026-10-12');
    useCartStore.getState().setValeNotes('consumo interno');
    useCartStore.getState().clearValeState();
    expect(useCartStore.getState().saleDate).toBe('2026-10-12');
    expect(useCartStore.getState().valeNotes).toBe('');
  });

  it('partialize incluye saleDate (persistencia durante la preparación)', () => {
    // Accedemos al persist API para validar el partialize real del store.
    const persisted = (
      useCartStore as unknown as {
        persist: { setOptions: (o: unknown) => void; getOptions: () => { partialize: (s: unknown) => Record<string, unknown> } };
      }
    ).persist;
    const options = persisted.getOptions();
    const sliced = options.partialize(useCartStore.getState());
    useCartStore.getState().setSaleDate(todayBd);
    const slicedWithDate = options.partialize(useCartStore.getState());
    expect('saleDate' in sliced).toBe(true);
    expect(slicedWithDate.saleDate).toBe(todayBd);
  });
});
