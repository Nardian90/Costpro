import { useMemo } from 'react';
import { useAuthStore } from '@/store';
import { SIDEBAR_STRUCTURE, NavModule } from '@/config/navigation/sidebar.structure';

function filterModulesByRole(modules: NavModule[], role: string): NavModule[] {
  return modules
    .filter(mod => {
      // Si no tiene allowedRoles definido, acceso universal
      if (!mod.allowedRoles) return true;
      return mod.allowedRoles.includes(role);
    })
    .map(mod => {
      if (!mod.children) return mod;
      const filteredChildren = filterModulesByRole(mod.children, role);
      return { ...mod, children: filteredChildren };
    })
    // Elimina grupos/submenús que quedaron vacíos después de filtrar
    .filter(mod => {
      if (mod.type === 'item') return true;
      return (mod.children?.length ?? 0) > 0;
    });
}

export function useFilteredNavigation(): NavModule[] {
  const { user } = useAuthStore();

  return useMemo(
    () => {
      // FIX: Cuando user es null (auth aún cargando al primer acceso),
      // devolver TODOS los módulos sin filtrar. Antes hacía fallback a
      // 'usuario' que filtraba COSTOS, MULTI-TIENDA, etc. — causaba que
      // el sidebar solo mostrara "Chat con Darian" al primer acceso.
      // Mejor mostrar todo optimistamente y filtrar cuando user cargue.
      if (!user) return SIDEBAR_STRUCTURE;
      return filterModulesByRole(SIDEBAR_STRUCTURE, user.role);
    },
    [user]
  );
}
