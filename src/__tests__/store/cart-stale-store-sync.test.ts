/**
 * FASE D — REPRODUCCIÓN + REGRESIÓN del bug "carrito muestra 0".
 *
 * SÍNTOMA reportado: en Inicio → OPERACIÓN → Vender, agregar producto muestra
 * éxito pero el contador queda en 0.
 *
 * ROOT CAUSE (demostrado aquí a nivel store, el motor exacto del flujo):
 *  - RC1: `clearCartOnStoreSwitch(newStoreId)` NO sincroniza `storeId` cuando el
 *    carrito está vacío y `storeId` persistido (localStorage `pos-cart-storage`)
 *    apunta a una tienda anterior. El efecto de montaje de POSView replica esta
 *    secuencia exacta, así que `storeId` queda STALE.
 *  - Con `storeId` stale, el guard de tienda de `addItem` rechaza TODOS los adds
 *    de la tienda activa (notifica error interno) pero el caller muestra
 *    `toast.success` incondicional → "aparentemente se agrega" con contador 0.
 *  - RC2: `addItem` no reportaba si el item fue aceptado (void), impidiendo que
 *    la UI sea honesta.
 *
 * Este archivo FALLA en el código pre-fix (ver evidencia FASE D 03/04) y debe
 * pasar post-fix. Protege: sincronización mount-time + honestidad del contrato.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/store/cart';

const STORE_A = '11111111-1111-1111-1111-111111111111'; // tienda anterior (stale)
const STORE_B = '22222222-2222-2222-2222-222222222222'; // tienda activa actual
const STORE_C = '33333333-3333-3333-3333-333333333333'; // otra tienda ajena

const productOf = (storeId: string | null, over: Record<string, unknown> = {}) => ({
  id: 'prod-' + String(Math.random()).slice(2, 8),
  name: 'Producto de prueba',
  price: 100,
  stock_current: 10,
  store_id: storeId,
  ...over,
});

describe('FASE D — carrito: sincronización de storeId y contrato honesto de addItem', () => {
  beforeEach(() => {
    localStorage.clear();
    // Estado equivalente al rehidratado de localStorage con carrito vacío
    // pero storeId de una sesión/tienda anterior (estado stale documentado).
    useCartStore.setState({ items: [], storeId: STORE_A, lastUpdated: Date.now() });
  });

  it('RC1: la secuencia de montaje de POSView sincroniza storeId aunque el carrito esté vacío', () => {
    // Réplica EXACTA del useEffect de montaje de POSView (POSView.tsx:69-81)
    const cartState = useCartStore.getState();
    if (cartState.storeId !== STORE_B) {
      useCartStore.getState().clearCartOnStoreSwitch(STORE_B);
      // FIX: si el carrito no tiene storeId, setearlo
      if (!useCartStore.getState().storeId) {
        useCartStore.setState({ storeId: STORE_B, lastUpdated: Date.now() });
      }
    }
    // POST-fix: storeId === STORE_B. PRE-fix: queda STORE_A (no-op del helper).
    expect(useCartStore.getState().storeId).toBe(STORE_B);
  });

  it('SÍNTOMA: agregar producto de la tienda activa con storeId stale debe entrar al carrito', () => {
    // Montaje de POSView con estado stale
    useCartStore.getState().clearCartOnStoreSwitch(STORE_B);

    // Exactamente lo que hace onAddToCart (POSView.tsx:226-231)
    const product = productOf(STORE_B);
    const accepted = useCartStore.getState().addItem({
      product_id: product.id, variant_id: null, variant: null,
      price: product.price, cost: 0, quantity: 1, product, subtotal: product.price,
    } as never);

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1); // PRE-fix: 0 (rechazo silencioso del guard)
    expect(items[0]?.product_id).toBe(product.id);
    expect(useCartStore.getState().getItemCount()).toBe(1); // PRE-fix: 0
    expect(accepted).toBe(true); // PRE-fix: undefined (contrato no honesto)
  });

  it('RC2: addItem reporta rechazo (false) cuando el guard de tienda rechaza de verdad', () => {
    // Carrito YA sincronizado a STORE_B; producto de la tienda ajena C:
    // el guard cross-store DEBE seguir rechazando (protección intacta post-fix).
    useCartStore.setState({ storeId: STORE_B });
    const product = productOf(STORE_C);
    const accepted = useCartStore.getState().addItem({
      product_id: product.id, variant_id: null, variant: null,
      price: product.price, cost: 0, quantity: 1, product, subtotal: product.price,
    } as never);
    expect(accepted).toBe(false); // PRE-fix: undefined
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('PROTECCIÓN: carrito con items + cambio real de tienda sigue limpiando Y sincronizando', () => {
    useCartStore.setState({ storeId: STORE_A });
    const product = productOf(STORE_A);
    useCartStore.getState().addItem({
      product_id: product.id, variant_id: null, variant: null,
      price: product.price, cost: 0, quantity: 2, product, subtotal: product.price * 2,
    } as never);
    expect(useCartStore.getState().getItemCount()).toBe(2);

    useCartStore.getState().clearCartOnStoreSwitch(STORE_B);
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().storeId).toBe(STORE_B);
  });

  it('RPC con store_id null: el producto hereda la tienda activa y es aceptado', () => {
    useCartStore.setState({ storeId: STORE_B });
    const product = productOf(null);
    const accepted = useCartStore.getState().addItem({
      product_id: product.id, variant_id: null, variant: null,
      price: product.price, cost: 0, quantity: 1, product, subtotal: product.price,
    } as never);
    expect(accepted).toBe(true);
    expect(useCartStore.getState().items[0]?.product?.store_id).toBe(STORE_B);
    expect(useCartStore.getState().getItemCount()).toBe(1);
  });

  it('stock: rechazo controlado cuando quantity excede stock disponible', () => {
    useCartStore.setState({ storeId: STORE_B });
    const product = productOf(STORE_B, { stock_current: 1 });
    const accepted = useCartStore.getState().addItem({
      product_id: product.id, variant_id: null, variant: null,
      price: product.price, cost: 0, quantity: 5, product, subtotal: product.price * 5,
    } as never);
    expect(accepted).toBe(false);
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});
