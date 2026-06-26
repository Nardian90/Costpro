'use client';

import { useState, useEffect } from 'react';

/**
 * P4-1: useDebounce — hook para debounce de valores (típicamente inputs de búsqueda).
 *
 * Evita re-renderizar/filtrar en cada keystroke. Espera `delay` ms sin cambios
 * antes de actualizar el valor devuelto.
 *
 * Uso:
 *   const [search, setSearch] = useState('');
 *   const debouncedSearch = useDebounce(search, 300);
 *   useEffect(() => { filtrarCon(debouncedSearch); }, [debouncedSearch]);
 *
 * Mobile-first: en dispositivos lentos, 300ms es el sweet spot entre
 * responsividad y performance.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
