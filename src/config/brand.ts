/**
 * ADN-BRAND-REBUILD-001 — Configuración central de marca ADNegocio.
 * ============================================================================
 * ÚNICA fuente de verdad para el nombre comercial, el símbolo y el descriptor
 * de la plataforma. Los componentes DEBEN reutilizar estos valores; ninguna
 * otra cadena de marca independiente en el código (los textos duros residuales
 * que queden de COSTPRO son referencias históricas/técnicas justificadas — ver
 * docs/audits/adnegocio-brand-rebuild-001/COSTPRO_REFERENCE_MIGRATION.md).
 *
 * Identidad: símbolo compacto «ADN» + descriptor «NEGOCIO» debajo.
 * Acento controlado: verde neón solo en acciones principales, indicadores y
 * detalles de identidad — nunca en toda la superficie.
 *
 * ⚠️ Los identificadores técnicos (claves de almacenamiento `costpro:*`,
 * IDs de plantilla `costpro-reinicio`, nombres de caché, proyecto Supabase,
 * `service: 'costpro-enterprise'` en /api/health) NO forman parte de la marca
 * visible y se conservan por compatibilidad — no renombrar sin migración.
 */

export const BRAND = {
  /** Nombre oficial del producto (navegador, metadatos, comunicaciones). */
  appName: 'ADNegocio',
  /** Símbolo compacto de la marca. */
  brandSymbol: 'ADN',
  /** Descriptor tipográfico debajo del símbolo. */
  brandDescriptor: 'NEGOCIO',
  /** Denominación histórica — solo para referencias internas/documentales. */
  previousBrand: 'COSTPRO',
  /** Nota explicativa para manuales/contextos históricos. */
  historyNote: 'ADNegocio, anteriormente COSTPRO',
} as const;

export type BrandConfig = typeof BRAND;

/**
 * Tokens centrales del sistema visual ADNegocio.
 * - El landing (superficie aislada `#landing-root`) los consume vía
 *   `src/styles/landing-shield.css`.
 * - La aplicación interna conserva sus variables shadcn/Tailwind; estos
 *   valores son la referencia de identidad, no un reemplazo del tema.
 */
export const BRAND_TOKENS = {
  /** Verde neón ADN — acción principal, indicadores, acento de identidad. */
  'brand-primary': '#22C55E',
  /** Variante de acento para detalles y gradientes sutiles. */
  'brand-accent': '#4ADE80',
  /** Negro profundo — fondo base de la identidad. */
  'brand-background': '#05070A',
  /** Superficie elevada sobre el fondo. */
  'brand-surface': '#0B1117',
  /** Borde sutil sobre superficies oscuras. */
  'brand-border': 'rgba(255, 255, 255, 0.08)',
  /** Texto principal sobre superficies oscuras. */
  'brand-text': '#F2F6F4',
  /** Texto secundario/atenuado. */
  'brand-muted': '#8A97A3',
  /** Tinta de identidad sobre superficies claras. */
  'brand-ink': '#0A0E12',
  /** Estados. */
  'brand-success': '#22C55E',
  'brand-warning': '#F59E0B',
  'brand-error': '#EF4444',
} as const;

export type BrandTokenName = keyof typeof BRAND_TOKENS;
