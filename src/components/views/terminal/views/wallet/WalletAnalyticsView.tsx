'use client';

/**
 * WalletAnalyticsView
 *
 * Wrapper que adapta las transacciones de la billetera al formato del
 * DynamicAnalyticsCenter (tabla dinámica reutilizada de multi-tienda).
 *
 * Permite al usuario hacer drag&drop de campos (banco, fecha, categoría,
 * servicio, monto) entre filas/columnas/valores/filtros y obtener agregaciones
 * (sum, avg, count, etc.) como en un Excel PivotTable.
 */

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { AnalyticsField, AnalyticsDataSet } from '@/components/analytics/types';
import { CostProLoader } from '@/components/ui/CostProLoader';

const DynamicAnalyticsCenter = dynamic(
  () => import('@/components/analytics/DynamicAnalyticsCenter').then(m => ({ default: m.DynamicAnalyticsCenter })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center p-20">
        <CostProLoader text="ANALYTICS" subtext="Cargando tabla dinámica..." showText showSubtext />
      </div>
    ),
  }
);

interface Props {
  transactions: any[];
  banks: string[];
}

export function WalletAnalyticsView({ transactions, banks }: Props) {
  // Definir campos analíticos
  const fields: AnalyticsField[] = useMemo(() => [
    { key: 'date', label: 'Fecha', type: 'date', groupable: true, aggregatable: false, format: 'date' },
    { key: 'bank', label: 'Banco', type: 'string', groupable: true, aggregatable: false },
    { key: 'operation', label: 'Operación', type: 'string', groupable: true, aggregatable: false },
    { key: 'category', label: 'Categoría', type: 'string', groupable: true, aggregatable: false },
    { key: 'service', label: 'Servicio', type: 'string', groupable: true, aggregatable: false },
    { key: 'service_type', label: 'Tipo de Servicio', type: 'string', groupable: true, aggregatable: false },
    { key: 'card', label: 'Tarjeta', type: 'string', groupable: true, aggregatable: false },
    { key: 'amount', label: 'Monto', type: 'number', groupable: false, aggregatable: true, format: 'currency', currency: 'CUP' },
    { key: 'month', label: 'Mes', type: 'string', groupable: true, aggregatable: false },
  ], []);

  // Normalizar transacciones al formato del analytics center
  const data = useMemo(() => {
    return transactions.map((tx: any) => ({
      date: tx.date,
      bank: tx.bank || 'DESCONOCIDO',
      operation: tx.operation === 'CR' ? 'Ingreso' : 'Gasto',
      category: tx.manual_category || tx.category || 'Otros',
      service: tx.service || '',
      service_type: tx.service_type || '',
      card: tx.card || '',
      amount: parseFloat(tx.amount) || 0,
      month: (tx.date || '').substring(0, 7), // YYYY-MM
    }));
  }, [transactions]);

  const dataSet: AnalyticsDataSet = useMemo(() => ({
    fields,
    data,
    totalRecords: data.length,
  }), [fields, data]);

  if (data.length === 0) {
    return (
      <Card className="rounded-2xl border-border/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">Sin transacciones para analizar.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3 w-full">
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Tabla Dinámica — {data.length} transacciones
        </h2>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          Arrastra campos entre Filas / Columnas / Valores / Filtros para crear tu análisis.
        </p>
      </div>
      <DynamicAnalyticsCenter
        dataSet={dataSet}
        module="wallet"
        title="Análisis de Billetera"
        description="Tabla dinámica de transacciones: agrupa por banco, categoría, fecha, servicio y calcula sum/avg/count."
        className="w-full"
      />
    </div>
  );
}
