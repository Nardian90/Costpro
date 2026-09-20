'use client';

import { useMemo, useCallback, useRef } from 'react';
import { useMotionValue, useTransform } from 'framer-motion';
import { type UserRole } from '@/types';
import { UserContract } from '@/contracts/user';
import { hasRole } from '@/lib/roles';
import {
  HOME_ITEM,
  flattenNavigation,
  type FlatNavItem,
} from '@/config/navigation/navigation-definition';

/**
 * GATE 1 — Fuente única: los ítems se DERIVAN de navigation-definition.ts.
 * Ya no existe una lista manual paralela (la lista anterior tenía 10 IDs
 * muertos que caían en "Módulo No Disponible" en el móvil). Añadir/quitar
 * una vista del menú se hace SOLO en la definición.
 */

export interface NavigationItem {
  id: string;
  icon: any;
  label: string;
  roles: UserRole[];
  category: 'INICIO' | 'OPERACIÓN' | 'ANÁLISIS' | 'SISTEMA' | 'AYUDA' | 'EN DESARROLLO';
}

/** Mapa categoría → clase para tipar el flatten. */
const VALID_CATEGORIES: NavigationItem['category'][] = [
  'OPERACIÓN', 'ANÁLISIS', 'SISTEMA', 'AYUDA', 'EN DESARROLLO',
];

function toNavigationItem(flat: FlatNavItem): NavigationItem | null {
  const category = flat.category === 'INICIO'
    ? 'INICIO'
    : VALID_CATEGORIES.includes(flat.category as NavigationItem['category'])
      ? (flat.category as NavigationItem['category'])
      : null;
  if (!category) return null;
  return {
    id: flat.id,
    icon: flat.icon,
    label: flat.label,
    roles: (flat.roles ?? []) as UserRole[],
    category,
  };
}

export function useTerminalNavigation(user: UserContract | null, sidebarSearch: string) {
  const scrollY = useMotionValue(0);
  const logoHeight = useTransform(scrollY, [0, 80], [160, 48]);
  const logoOpacity = useTransform(scrollY, [0, 50], [1, 1]);
  const logoScale = useTransform(scrollY, [0, 80], [1, 0.7]);
  const navRef = useRef<HTMLElement>(null);

  const navigationItems = useMemo(() => {
    // Inicio fijo primero (GATE 1 §1: un solo concepto Inicio → dashboard)
    const home: NavigationItem = {
      id: HOME_ITEM.id,
      icon: HOME_ITEM.icon,
      label: HOME_ITEM.label,
      roles: [] as UserRole[], // universal — guard especial en isViewAllowedForRole
      category: 'INICIO',
    };

    const derived = flattenNavigation()
      .map(toNavigationItem)
      .filter((i): i is NavigationItem => i !== null);

    const all: NavigationItem[] = [home, ...derived];

    if (!user) return all;

    // home siempre visible; el resto por jerarquía de roles (hasRole cubre
    // jerarquía admin > manager > … y roles por membership).
    const filteredByRole = all.filter(i =>
      i.category === 'INICIO' || i.roles.length === 0 || i.roles.some(r => hasRole(user, r))
    );

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
