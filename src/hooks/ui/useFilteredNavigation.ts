import { useMemo } from 'react';
import { useAuthStore } from '@/store';
import {
  SIDEBAR_STRUCTURE,
  filterModulesByRole,
  NavModule,
} from '@/config/navigation/sidebar.structure';

/**
 * Filtra el árbol por rol a CADA nivel (la visibilidad de un grupo depende
 * de su propio allowedRoles; las entradas heredan el más cercano).
 * Vive en sidebar.structure.ts (módulo puro, sin dependencia del store) y se
 * re-exporta aquí para los consumidores del hook — los tests de reorganización
 * (fix/navigation-orphaned-development) validan el MISMO filtro que produce
 * el sidebar sin montar React ni el store.
 */
export { filterModulesByRole };

export function useFilteredNavigation(): NavModule[] {
  const { user } = useAuthStore();

  return useMemo(
    () => {
      // FIX: Cuando user es null o user.role es undefined/falsy (auth cargando),
      // devolver TODOS los módulos sin filtrar (optimistic UI).
      // Antes hacía fallback a 'usuario' que filtraba COSTOS, MULTI-TIENDA, etc.
      // — causaba que el sidebar solo mostrara "Chat con Darian" al primer acceso.
      if (!user || !user.role) return SIDEBAR_STRUCTURE;
      return filterModulesByRole(SIDEBAR_STRUCTURE, user.role);
    },
    [user]
  );
}
