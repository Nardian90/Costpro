import { useMemo, useCallback, useRef } from 'react';
import { useMotionValue, useTransform } from 'framer-motion';
import {
  BarChart3, ShoppingCart, Book, Package, Warehouse, Receipt,
  ClipboardList, FileText, History, Shield, DollarSign,
  Users, Building, Settings, HelpCircle, ArrowLeftRight, GraduationCap,
  Newspaper, Rss, TrendingUp, ShieldCheck, RefreshCcw, Scale, HeartPulse, Wallet,
  Database, Table2, Cpu, Zap, BarChart4, Wand2, FileSearch, Target, AlertCircle, ListFilter, Workflow, PackageSearch
} from 'lucide-react';
import { type UserRole } from '@/types';
import { UserContract } from '@/contracts/user';
import { hasRole } from '@/lib/roles';

export interface NavigationItem {
  id: string;
  icon: any;
  label: string;
  roles: UserRole[];
  category: 'OPERACIONES' | 'INVENTARIO' | 'GESTIÓN' | 'LEGAL' | 'IPV';
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
      { id: 'pick3-intelligence', icon: BarChart3, label: 'Pick 3 Intelligence', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'OPERACIONES' },
      { id: 'wallet', icon: Wallet, label: 'Billetera', roles: ['admin', 'manager', 'encargado', 'costo'], category: 'OPERACIONES' },
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
      { id: 'inventory_adjustments', icon: RefreshCcw, label: 'Ajustes Doc.', roles: ['manager', 'admin', 'encargado'], category: 'INVENTARIO' },

      { id: 'cost-sheets', icon: FileText, label: 'Costos', roles: ['admin', 'manager', 'encargado', 'costo'], category: 'GESTIÓN' },
      { id: 'reports', icon: FileText, label: 'Reportes', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'GESTIÓN' },
      { id: 'ipv', icon: FileText, label: 'IPV Builder', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'GESTIÓN' },
      { id: 'audit', icon: Shield, label: 'Auditoría', roles: ['manager', 'admin', 'encargado'], category: 'GESTIÓN' },
      { id: 'health', icon: HeartPulse, label: 'Salud', roles: ['admin', 'manager'], category: 'GESTIÓN' },
      { id: 'users', icon: Users, label: 'Usuarios', roles: ['admin', 'encargado', 'manager'], category: 'GESTIÓN' },
      { id: 'roles', icon: ShieldCheck, label: 'Roles', roles: ['admin'], category: 'GESTIÓN' },
      { id: 'stores', icon: Building, label: 'Tiendas', roles: ['admin', 'encargado', 'manager'], category: 'GESTIÓN' },
      { id: 'rss_management', icon: Rss, label: 'Feed RSS', roles: ['admin'], category: 'GESTIÓN' },
      { id: 'settings', icon: Settings, label: 'Configuración', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'GESTIÓN' },

      // IPV Sub-items
      { id: 'analytics', icon: TrendingUp, label: 'Dashboard Institucional', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'reports_ipv', icon: ClipboardList, label: 'Reportes', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'ingestion', icon: Database, label: 'Extracto', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'pivot', icon: FileSearch, label: 'Consolidado', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'dashboard_ipv', icon: Workflow, label: 'Panel de Control', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'transactions', icon: Table2, label: 'Transacciones', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'catalog_ipv', icon: PackageSearch, label: 'Catálogo', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'customers', icon: Users, label: 'Clientes', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'rules', icon: Cpu, label: 'Reglas', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'sim', icon: Zap, label: 'Simulación', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'intelligent-receipts', icon: Wand2, label: 'Recepciones Inteligentes', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'breakdown', icon: BarChart4, label: 'Desglose', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'audit_ipv', icon: History, label: 'Auditoría', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'movements', icon: Workflow, label: 'Trazabilidad', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'planning', icon: Target, label: 'Planeación', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'errors', icon: AlertCircle, label: 'Errores', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'mapping-rules', icon: ListFilter, label: 'Mapeo', roles: ['admin', 'manager', 'costo'], category: 'IPV' },
      { id: 'mvt', icon: FileText, label: 'Exportación', roles: ['admin', 'manager', 'costo'], category: 'IPV' },

      { id: 'legal', icon: Scale, label: 'Legal', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'LEGAL' },
      { id: 'help', icon: HelpCircle, label: 'Ayuda', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'LEGAL' },
      { id: 'wiki', icon: Book, label: 'Wiki Contable', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'LEGAL' },
      { id: 'academy', icon: GraduationCap, label: 'Academia', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado', 'costo'], category: 'LEGAL' },
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
