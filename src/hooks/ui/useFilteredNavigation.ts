import { useMemo } from 'react';
import { useAuthStore } from '@/store';
import { SIDEBAR_STRUCTURE, NavModule } from '@/config/navigation/sidebar.structure';

function filterModulesByRole(modules: NavModule[], role: string): NavModule[] {
  return modules
    .filter(mod => {
      // Si no tiene allowedRoles definido, acceso universal
      if (!mod.allowedRoles) return true;
      return mod.allowedRoles.map(r => r.toLowerCase()).includes(role.toLowerCase());
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
  const role = user?.role ?? 'usuario';

  return useMemo(
    () => filterModulesByRole(SIDEBAR_STRUCTURE, role),
    [role]
  );
}
