import { useMemo, useCallback, useRef } from 'react';
import { useMotionValue, useTransform } from 'framer-motion';
import {
  BarChart3, ShoppingCart, Package, Warehouse, Receipt,
  ClipboardList, FileText, History, Shield, DollarSign,
  Users, Building, Settings, HelpCircle
} from 'lucide-react';
import { type UserRole } from '@/types';
import { UserContract } from '@/contracts/user';

export interface NavigationItem {
  id: string;
  icon: any;
  label: string;
  roles: UserRole[];
  category: 'OPERACIONES' | 'INVENTARIO' | 'GESTIÓN' | 'SOPORTE';
}

export function useTerminalNavigation(user: UserContract | null, sidebarSearch: string) {
  const scrollY = useMotionValue(0);
  const logoHeight = useTransform(scrollY, [0, 80], [160, 48]);
  const logoOpacity = useTransform(scrollY, [0, 50], [1, 1]);
  const logoScale = useTransform(scrollY, [0, 80], [1, 0.7]);
  const navRef = useRef<HTMLElement>(null);

  const navigationItems = useMemo(() => {
    if (!user) return [];
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    const all: NavigationItem[] = [
      { id: 'dashboard', icon: BarChart3, label: 'Dashboard', roles: ['admin', 'manager', 'clerk', 'encargado'], category: 'OPERACIONES' },
      { id: 'pos', icon: ShoppingCart, label: 'TPV', roles: ['clerk', 'manager', 'admin', 'encargado'], category: 'OPERACIONES' },
      { id: 'sales', icon: Receipt, label: 'Ventas', roles: ['clerk', 'manager', 'encargado'], category: 'OPERACIONES' },
      { id: 'cash', icon: DollarSign, label: 'Caja', roles: ['manager', 'admin', 'encargado'], category: 'OPERACIONES' },

      { id: 'inventory', icon: Package, label: 'Inventario', roles: ['admin', 'manager', 'warehouse', 'encargado'], category: 'INVENTARIO' },
      { id: 'recepcion', icon: Warehouse, label: 'Recepciones', roles: ['warehouse', 'manager', 'encargado'], category: 'INVENTARIO' },
      { id: 'inventory_count', icon: ClipboardList, label: 'Conteo', roles: ['clerk', 'manager', 'admin', 'encargado'], category: 'INVENTARIO' },
      { id: 'catalog', icon: Package, label: 'Catálogo', roles: ['manager', 'admin', 'encargado'], category: 'INVENTARIO' },
      { id: 'history', icon: History, label: 'Stock', roles: ['manager', 'admin', 'encargado'], category: 'INVENTARIO' },

      { id: 'cost-sheets', icon: FileText, label: 'Costos', roles: ['admin', 'manager', 'encargado'], category: 'GESTIÓN' },
      { id: 'audit', icon: Shield, label: 'Auditoría', roles: ['manager', 'admin', 'encargado'], category: 'GESTIÓN' },
      { id: 'users', icon: Users, label: 'Usuarios', roles: ['admin', 'encargado'], category: 'GESTIÓN' },
      { id: 'stores', icon: Building, label: 'Tiendas', roles: ['admin', 'encargado'], category: 'GESTIÓN' },
      { id: 'settings', icon: Settings, label: 'Config', roles: ['admin', 'manager', 'encargado'], category: 'GESTIÓN' },

      { id: 'help', icon: HelpCircle, label: 'Ayuda', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado'], category: 'SOPORTE' },
    ];

    const filteredByRole = all.filter(i => i.roles.some(r => roles.includes(r as any)));

    if (!sidebarSearch) return filteredByRole;

    const searchLower = sidebarSearch.toLowerCase();
    return filteredByRole.filter(i =>
      i.label.toLowerCase().includes(searchLower) ||
      i.category.toLowerCase().includes(searchLower)
    );
  }, [user, sidebarSearch]);

  const getActiveRolesLabel = useCallback(() => {
    if (!user) return 'Cargando...';
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    return roles.join(' / ').toUpperCase();
  }, [user]);

  const handleSidebarScroll = useCallback(() => {
    if (!navRef.current) return;
    const { scrollTop } = navRef.current;
    requestAnimationFrame(() => {
      scrollY.set(scrollTop);
    });
  }, [scrollY]);

  return {
    navigationItems,
    getActiveRolesLabel,
    handleSidebarScroll,
    navRef,
    scrollY,
    logoHeight,
    logoOpacity,
    logoScale
  };
}
