import { MatchingRule } from '@/lib/dexie';

export function getDefaultIPVRulesConfig(): MatchingRule[] {
  return [
    {
      id: "1",
      tipo: "STOCK_LIMIT",
      prioridad: 1,
      activo: true,
      meta: { allow_negative: false },
      descripcion: "Límites de Stock (No permitir Stock Negativo)"
    },
    {
      id: "2",
      tipo: "HARD_REF",
      prioridad: 2,
      activo: true,
      descripcion: "Referencia Exacta"
    },
    {
      id: "3",
      tipo: "EXACT_SUM",
      prioridad: 3,
      activo: true,
      meta: { depth: 1200, timeout: 200000 },
      descripcion: "Suma Exacta (Combinatoria)"
    },
    {
      id: "4",
      tipo: "CASH_FILL",
      prioridad: 4,
      activo: true,
      meta: { daily_limit: 50000 },
      descripcion: "Inyección de Efectivo"
    },
    {
      id: "5",
      tipo: "WILDCARDS",
      prioridad: 5,
      activo: true,
      descripcion: "Comodines"
    },
    {
      id: "6",
      tipo: "TOLERANCE",
      prioridad: 6,
      activo: false,
      meta: { tolerance_cents: 100 },
      descripcion: "Tolerancia de Cuadre"
    },
    {
      id: "7",
      tipo: "PRICE_FLEX",
      prioridad: 7,
      activo: false,
      meta: { range: 0.1 },
      descripcion: "Flexibilidad de Precio"
    }
  ];
}

export function mergeWithDefaults(existing: MatchingRule[], defaults: MatchingRule[]): MatchingRule[] {
  return defaults.map(def => {
    const found = existing.find(r => r.tipo === def.tipo);

    if (!found) return def;

    return {
      ...def,
      ...found, // User's preference for active/priority
      meta: {
        ...def.meta,
        ...(found.meta || {}) // Merge parameters, user overrides default
      }
    };
  });
}
