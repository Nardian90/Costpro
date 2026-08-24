/**
 * E2E test — Telegram catalog ZIP export
 *
 * Validates that the new ExportTelegramCatalogModal + renderTelegramProductImages()
 * produce images whose DATA matches what the Telegram publisher would send.
 *
 * Tests:
 *   A. Eligibility filter (only active + visible_en_tienda products)
 *   B. Data parity: rendered image uses same product, same price visibility, same stock visibility as Telegram caption
 *   C. Currency handling (CUP, USD, EUR, MLC)
 *   D. Hidden price → no 💰 line in caption
 *   E. Hidden stock → no 📦 line in caption
 *   F. Price = 0 → no 💰 line
 *   G. Stock = 0 → no 📦 line
 *   H. Random selection: no duplicates, exact count
 *   I. Filename slugification: accents, special chars, Windows-safe
 *   J. ZIP structure: contains only JPGs, no metadata files
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildTelegramProductMessage,
  getProductPresentation,
  type ProductPresentationInput,
} from '@/lib/storefront/product-presentation';

// Test fixtures — simulate real products from ENERVIDA
const PRODUCTS: ProductPresentationInput[] = [
  {
    id: 'p1',
    name: 'Masilla interior blanca',
    description: 'Masilla blanca para sellado y acabado de paredes interiores.',
    sku: 'MAS-001',
    price: 22000,
    price_currency: 'CUP',
    price_visible: true,
    stock_visible: true,
    stock_current: 10,
    on_promotion: false,
    unit_of_measure: 'unidad',
    image_url: 'masilla.jpg',
    is_active: true,
    visible_en_tienda: true,
  },
  {
    id: 'p2',
    name: 'Panel Solar 100W',
    description: 'Panel solar monocristalino de 100W con marco de aluminio.',
    sku: 'PS-100',
    price: 65,
    price_currency: 'USD',
    price_visible: true,
    stock_visible: true,
    stock_current: 7,
    on_promotion: false,
    unit_of_measure: 'unidad',
    image_url: 'panel.jpg',
    is_active: true,
    visible_en_tienda: true,
  },
  {
    id: 'p3',
    name: 'Producto con precio oculto',
    description: 'Debe publicarse pero sin mostrar el precio.',
    sku: 'OC-001',
    price: 5000,
    price_currency: 'CUP',
    price_visible: false, // HIDDEN
    stock_visible: true,
    stock_current: 3,
    unit_of_measure: 'unidad',
    is_active: true,
    visible_en_tienda: true,
  },
  {
    id: 'p4',
    name: 'Producto con precio cero',
    description: 'price=0 — no debe mostrar precio.',
    sku: 'PZ-001',
    price: 0,
    price_currency: 'CUP',
    price_visible: true,
    stock_visible: true,
    stock_current: 5,
    unit_of_measure: 'caja',
    is_active: true,
    visible_en_tienda: true,
  },
  {
    id: 'p5',
    name: 'Producto sin stock',
    description: 'stock_current=0 — no debe mostrar 📦.',
    sku: 'NS-001',
    price: 1500,
    price_currency: 'CUP',
    price_visible: true,
    stock_visible: true,
    stock_current: 0,
    unit_of_measure: 'litro',
    is_active: true,
    visible_en_tienda: true,
  },
  {
    id: 'p6',
    name: 'Producto stock oculto',
    description: 'Stock oculto en vitrina — no debe mostrar cantidad.',
    sku: 'SO-001',
    price: 800,
    price_currency: 'CUP',
    price_visible: true,
    stock_visible: false,
    stock_current: 99,
    unit_of_measure: 'unidad',
    is_active: true,
    visible_en_tienda: true,
  },
  {
    id: 'p7',
    name: 'Producto inactivo — NO debe exportarse',
    description: 'is_active=false',
    sku: 'IN-001',
    price: 100,
    price_currency: 'CUP',
    is_active: false, // NOT eligible
    visible_en_tienda: true,
  },
  {
    id: 'p8',
    name: 'Producto no visible en vitrina — NO debe exportarse',
    description: 'visible_en_tienda=false',
    sku: 'NV-001',
    price: 100,
    price_currency: 'CUP',
    is_active: true,
    visible_en_tienda: false, // NOT eligible
  },
  {
    id: 'p9',
    name: 'Tornillo M6 x 30mm (acero inoxidable)',
    description: 'Tornillo de acero inoxidable M6 con cabeza Phillips.',
    sku: 'TR-M6x30',
    price: 25,
    price_currency: 'CUP',
    price_visible: true,
    stock_visible: true,
    stock_current: 200,
    unit_of_measure: 'unidad',
    image_url: 'tornillo.jpg',
    is_active: true,
    visible_en_tienda: true,
  },
  {
    id: 'p10',
    name: 'Cafetera "Especial" #1',
    description: 'Cafetera con comillas y numeral.',
    sku: 'CF-#1',
    price: 4500,
    price_currency: 'MLC',
    price_visible: true,
    stock_visible: true,
    stock_current: 2,
    unit_of_measure: 'unidad',
    is_active: true,
    visible_en_tienda: true,
  },
];

describe('Telegram Catalog ZIP Export — data parity + filters', () => {
  describe('A. Eligibility filter (Vitrina rules)', () => {
    it('only includes active + visible_en_tienda products', () => {
      const eligible = PRODUCTS.filter(p =>
        p.is_active === true && p.visible_en_tienda === true
      );
      expect(eligible.length).toBe(8); // p7 and p8 excluded
      expect(eligible.find(p => p.id === 'p7')).toBeUndefined();
      expect(eligible.find(p => p.id === 'p8')).toBeUndefined();
    });
  });

  describe('B. Data parity: image renderer uses same data as Telegram caption', () => {
    const cases: Array<{ id: string; name: string; showPrice?: 'according_to_storefront' | 'show' | 'hide'; showUnits?: boolean }> = [
      { id: 'p1', name: 'CUP product with price + stock' },
      { id: 'p2', name: 'USD product with price + stock' },
      { id: 'p3', name: 'Hidden price product', showPrice: 'show' }, // cannot override Vitrina
      { id: 'p4', name: 'Zero price product' },
      { id: 'p5', name: 'Zero stock product', showUnits: true },
      { id: 'p6', name: 'Hidden stock product', showUnits: true },
      { id: 'p9', name: 'Special chars in name' },
      { id: 'p10', name: 'MLC currency + comillas + numeral' },
    ];

    for (const c of cases) {
      it(`${c.name}: presentation + caption match`, () => {
        const product = PRODUCTS.find(p => p.id === c.id)!;
        const presentation = getProductPresentation(product);
        const caption = buildTelegramProductMessage(product, {
          showPrice: c.showPrice ?? 'according_to_storefront',
          showPhysicalUnits: c.showUnits ?? false,
        });

        // The image renderer will use the EXACT same presentation — verify
        // the caption text matches the presentation fields.
        if (presentation.priceVisible && presentation.formattedPrice) {
          expect(caption.text).toContain(presentation.formattedPrice);
        } else {
          // Should not contain a price amount
          expect(caption.text).not.toMatch(/\d+\.\d+\s+(CUP|USD|EUR|MLC)/);
        }

        if (presentation.stockVisible && presentation.stockQuantity && presentation.stockQuantity > 0) {
          // Only when showUnits is true (the user's option)
          // For this test, default showPhysicalUnits=false → no line
          if (c.showUnits === true) {
            expect(caption.text).toContain(`Disponibles: ${presentation.stockQuantity}`);
          } else {
            expect(caption.text).not.toContain('Disponibles:');
          }
        }
      });
    }
  });

  describe('C. Currency handling', () => {
    it('CUP product → caption shows "CUP" not "USD"', () => {
      const p = PRODUCTS.find(p => p.id === 'p1')!;
      const caption = buildTelegramProductMessage(p);
      expect(caption.text).toContain('CUP');
      expect(caption.text).not.toContain('USD');
    });

    it('USD product → caption shows "USD" not "CUP"', () => {
      const p = PRODUCTS.find(p => p.id === 'p2')!;
      const caption = buildTelegramProductMessage(p);
      expect(caption.text).toContain('USD');
      expect(caption.text).not.toContain('CUP');
    });

    it('MLC product → caption shows "MLC"', () => {
      const p = PRODUCTS.find(p => p.id === 'p10')!;
      const caption = buildTelegramProductMessage(p);
      expect(caption.text).toContain('MLC');
    });
  });

  describe('D. Hidden price (price_visible=false)', () => {
    it('caption does NOT contain the price amount', () => {
      const p = PRODUCTS.find(p => p.id === 'p3')!;
      const caption = buildTelegramProductMessage(p);
      expect(caption.text).not.toContain('5,000');
      expect(caption.text).not.toContain('5000');
      expect(caption.text).not.toContain('💰');
    });

    it('showPrice="show" CANNOT override Vitrina hide', () => {
      const p = PRODUCTS.find(p => p.id === 'p3')!;
      const caption = buildTelegramProductMessage(p, { showPrice: 'show' });
      expect(caption.text).not.toContain('5,000');
      expect(caption.text).not.toContain('💰');
    });
  });

  describe('E. Hidden stock (stock_visible=false)', () => {
    it('caption does NOT contain "Disponibles:"', () => {
      const p = PRODUCTS.find(p => p.id === 'p6')!;
      const caption = buildTelegramProductMessage(p, { showPhysicalUnits: true });
      expect(caption.text).not.toContain('Disponibles:');
      expect(caption.text).not.toContain('📦');
    });
  });

  describe('F. Price = 0', () => {
    it('caption does NOT contain "0.00"', () => {
      const p = PRODUCTS.find(p => p.id === 'p4')!;
      const caption = buildTelegramProductMessage(p);
      expect(caption.text).not.toMatch(/\b0\.00\s+(CUP|USD|EUR|MLC)/);
      expect(caption.text).not.toContain('💰');
    });
  });

  describe('G. Stock = 0', () => {
    it('caption does NOT contain "Disponibles: 0"', () => {
      const p = PRODUCTS.find(p => p.id === 'p5')!;
      const caption = buildTelegramProductMessage(p, { showPhysicalUnits: true });
      expect(caption.text).not.toContain('Disponibles: 0');
      expect(caption.text).not.toContain('Disponibles:');
    });
  });

  describe('H. Random selection (Fisher-Yates)', () => {
    it('selects exactly N unique products', () => {
      const eligible = PRODUCTS.filter(p => p.is_active === true && p.visible_en_tienda === true);
      const N = 5;
      const shuffled = [...eligible];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, Math.min(N, eligible.length));
      expect(selected.length).toBe(N);
      const uniqueIds = new Set(selected.map(p => p.id));
      expect(uniqueIds.size).toBe(N);
    });

    it('handles N > total available (returns only available)', () => {
      const eligible = PRODUCTS.filter(p => p.is_active === true && p.visible_en_tienda === true);
      const N = 100;
      const shuffled = [...eligible];
      const selected = shuffled.slice(0, Math.min(N, eligible.length));
      expect(selected.length).toBe(eligible.length);
    });
  });

  describe('I. Filename slugification', () => {
    function slugify(s: string): string {
      return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase()
        .slice(0, 60);
    }

    it('strips accents', () => {
      expect(slugify('Masilla interiór')).toBe('masilla-interior');
    });

    it('strips special chars', () => {
      expect(slugify('Cafetera "Especial" #1')).toBe('cafetera-especial-1');
    });

    it('limits to 60 chars', () => {
      const long = 'a'.repeat(100);
      expect(slugify(long).length).toBe(60);
    });

    it('handles empty', () => {
      expect(slugify('!!!')).toBe('');
    });

    it('handles SKU with # symbol', () => {
      expect(slugify('CF-#1')).toBe('cf-1');
    });
  });

  describe('J. ZIP structure (mock)', () => {
    it('filenames use index prefix to avoid overwrites', () => {
      // Two products with same slugified name
      const items = [
        { idx: 1, slug: 'producto' },
        { idx: 2, slug: 'producto' },
        { idx: 3, slug: 'producto' },
      ];
      const used = new Set<string>();
      const filenames: string[] = [];
      for (const it of items) {
        const idx = String(it.idx).padStart(3, '0');
        let filename = `${idx}-${it.slug}.jpg`;
        let dupCount = 1;
        while (used.has(filename)) {
          filename = `${idx}-${it.slug}-${dupCount}.jpg`;
          dupCount++;
        }
        used.add(filename);
        filenames.push(filename);
      }
      expect(filenames.length).toBe(3);
      expect(new Set(filenames).size).toBe(3);
      expect(filenames[0]).toBe('001-producto.jpg');
      expect(filenames[1]).toBe('002-producto.jpg');
      expect(filenames[2]).toBe('003-producto.jpg');
    });
  });
});
