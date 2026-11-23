'use client';

/**
 * SalesModule — módulo «Análisis de ventas» del Centro de Inteligencia
 * (misión §2/§4). Monta el contenido del antiguo tab «Dashboard» del Historial
 * de Ventas (COSTPRO-SALES-DASHBOARD-001) en la ubicación centralizada,
 * standalone: mismos filtros (período, tienda, vendedor, estado, método,
 * moneda), mismas fuentes (RPC get_sales_dashboard_analytics + detalle de
 * producto) y drill-down de alertas hacia Historial de Ventas vía
 * salesHistoryNavContext.
 *
 * Sin duplicación: el componente funcional es SalesDashboardTab (fuente
 * única); este wrapper aporta el encabezado de módulo y el contexto de tienda.
 */

import React from 'react';
import { SalesDashboardTab } from '@/components/views/terminal/views/sales/SalesDashboardTab';
import type { BiModuleProps } from '../../bi-module-registry';

export default function SalesModule({ storeName }: BiModuleProps) {
  return (
    <div className="space-y-5" data-testid="sales-module">
      <p className="text-[11px] text-muted-foreground px-1" data-testid="sales-module-note">
        Análisis comercial completo sobre documentos de venta: por defecto «Este mes» de{' '}
        <span className="font-bold text-foreground">todas tus tiendas accesibles</span>; usa los filtros
        para acotar. El ámbito real de cada consulta se muestra bajo los filtros.
      </p>
      <SalesDashboardTab />
      <p className="text-[11px] text-muted-foreground px-1">
        Tienda activa en el shell: {storeName}. El filtro «Tienda» de este módulo es independiente
        del selector global para poder comparar entre tiendas.
      </p>
    </div>
  );
}
