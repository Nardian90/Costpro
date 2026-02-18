import { useMemo, useCallback, useRef } from 'react';
import { useMotionValue, useTransform } from 'framer-motion';
import {
  BarChart3, ShoppingCart, Package, Warehouse, Receipt,
  ClipboardList, FileText, History, Shield, DollarSign,
  Users, Building, Settings, HelpCircle, ArrowLeftRight, GraduationCap,
  Newspaper, Rss, TrendingUp, ShieldCheck
} from 'lucide-react';
import { type UserRole } from '@/types';
import { UserContract } from '@/contracts/user';
import { hasRole } from '@/lib/roles';

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
    const all: NavigationItem[] = [
      { id: 'dashboard', icon: TrendingUp, label: 'KPI', roles: ['admin', 'manager', 'clerk', 'encargado'], category: 'OPERACIONES' },
      { id: 'news', icon: Newspaper, label: 'Noticias', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado'], category: 'OPERACIONES' },
      { id: 'pos', icon: ShoppingCart, label: 'Vender', roles: ['clerk', 'manager', 'admin', 'encargado'], category: 'OPERACIONES' },
      { id: 'sales', icon: Receipt, label: 'Ventas', roles: ['clerk', 'manager', 'encargado'], category: 'OPERACIONES' },
      { id: 'cash', icon: DollarSign, label: 'Caja', roles: ['manager', 'admin', 'encargado'], category: 'OPERACIONES' },

      { id: 'inventory', icon: Package, label: 'Inventario', roles: ['admin', 'manager', 'warehouse', 'encargado'], category: 'INVENTARIO' },
      { id: 'recepcion', icon: Warehouse, label: 'Recepcionar', roles: ['warehouse', 'manager', 'encargado'], category: 'INVENTARIO' },
      { id: 'reception_list', icon: History, label: 'Recepciones', roles: ['warehouse', 'manager', 'encargado', 'admin'], category: 'INVENTARIO' },
      { id: 'transferencias', icon: ArrowLeftRight, label: 'Transferencias', roles: ['warehouse', 'manager', 'encargado', 'admin'], category: 'INVENTARIO' },
      { id: 'inventory_count', icon: ClipboardList, label: 'Conteo', roles: ['clerk', 'manager', 'admin', 'encargado'], category: 'INVENTARIO' },
      { id: 'catalog', icon: Package, label: 'Catálogo', roles: ['manager', 'admin', 'encargado'], category: 'INVENTARIO' },
      { id: 'history', icon: History, label: 'Movimientos', roles: ['manager', 'admin', 'encargado'], category: 'INVENTARIO' },

      { id: 'cost-sheets', icon: FileText, label: 'Costos', roles: ['admin', 'manager', 'encargado', 'costo'], category: 'GESTIÓN' },
      { id: 'reports', icon: FileText, label: 'Reportes', roles: ['admin', 'manager', 'encargado'], category: 'GESTIÓN' },
      { id: 'ipv', icon: FileText, label: 'IPV', roles: ['admin', 'manager', 'encargado'], category: 'GESTIÓN' },
      { id: 'audit', icon: Shield, label: 'Auditoría', roles: ['manager', 'admin', 'encargado'], category: 'GESTIÓN' },
      { id: 'users', icon: Users, label: 'Usuarios', roles: ['admin', 'encargado', 'manager'], category: 'GESTIÓN' },
      { id: 'roles', icon: ShieldCheck, label: 'Roles', roles: ['admin'], category: 'GESTIÓN' },
      { id: 'stores', icon: Building, label: 'Tiendas', roles: ['admin', 'encargado', 'manager'], category: 'GESTIÓN' },
      { id: 'rss_management', icon: Rss, label: 'Feed RSS', roles: ['admin'], category: 'GESTIÓN' },
      { id: 'settings', icon: Settings, label: 'Configuración', roles: ['admin', 'manager', 'encargado'], category: 'GESTIÓN' },

      { id: 'support_doc', icon: FileText, label: 'Manual', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'SOPORTE' },
      { id: 'help', icon: HelpCircle, label: 'Ayuda', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'SOPORTE' },
      { id: 'academy', icon: GraduationCap, label: 'Academia', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'SOPORTE' },
    ];

    const filteredByRole = all.filter(i => i.roles.some(r => hasRole(user, r)));

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
