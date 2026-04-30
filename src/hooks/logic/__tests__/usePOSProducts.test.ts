import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePOSProducts } from '../usePOSProducts';
import { makeProduct } from '@/__fixtures__';

describe('usePOSProducts', () => {
  const products = [
    makeProduct({ id: '1', name: 'Leche', sku: 'L001', category: 'Lácteos', is_active: true }),
    makeProduct({ id: '2', name: 'Pan', sku: 'P001', category: 'Panadería', is_active: true }),
    makeProduct({ id: '3', name: 'Queso', sku: 'Q001', category: 'Lácteos', is_active: true }),
    makeProduct({ id: '4', name: 'Vino', sku: 'V001', category: 'Bebidas', is_active: false }),
  ];

  describe('búsqueda de productos', () => {
    it('filtra productos por nombre (case-insensitive)', () => {
      const { result } = renderHook(() => usePOSProducts(products, 'leche'));
      expect(result.current.filteredProducts).toHaveLength(1);
      expect(result.current.filteredProducts[0].name).toBe('Leche');
    });

    it('devuelve todos los productos activos cuando el query está vacío', () => {
      const { result } = renderHook(() => usePOSProducts(products, ''));
      expect(result.current.filteredProducts).toHaveLength(3);
    });
  });

  describe('categorías', () => {
    it('filtra por categoría seleccionada', () => {
      const { result } = renderHook(() => usePOSProducts(products, ''));
      act(() => {
        result.current.handleCategoryChange('Lácteos');
      });
      expect(result.current.filteredProducts).toHaveLength(2);
      expect(result.current.selectedCategory).toBe('Lácteos');
    });
  });
});
