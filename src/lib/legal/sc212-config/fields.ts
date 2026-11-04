/**
 * CP-SALES-024 — Configuración de campos del documento SC-2-12 «Factura».
 * ============================================================================
 *
 * Personalización de PRESENTACIÓN del modelo SC-2-12 (Resolución 11/2007 MFP):
 * cada campo opcional del documento puede mostrarse/ocultarse, cambiar su
 * ETIQUETA o (solo en campos no oficiales) sustituir su valor de forma
 * puntual. La fuente de verdad de los DATOS sigue siendo la configuración
 * persistida de la tienda en Gestión de Tiendas (`stores.address`, `phone`,
 * `email`, `reeup`, `nit`, `bank_account`).
 *
 * Reglas de la misión (§4.2 y §4.3):
 *  - Los campos con valor OFICIAL (identificadores fiscales REEUP/NIT y
 *    cuenta bancaria) NO admiten sustitución de valor: se muestran tal cual
 *    están persistidos o no se muestran. Solo puede cambiarse su etiqueta
 *    u ocultarse.
 *  - Esta configuración es PREFERENCIA DE PRESENTACIÓN: jamás escribe en
 *    `stores` (Gestión de Tiendas), jamás toca la venta, sus importes,
 *    productos, cantidades ni precios.
 *  - Persistencia: tabla `user_preferences` (mecanismo F-02b existente),
 *    alcance por USUARIO + TIENDA (key `sc212:fields:<store_id>`): la
 *    personalización de cada tienda es independiente y sobrevive a la
 *    recarga. Un cambio aquí jamás altera la configuración oficial.
 *
 * La etiqueta «Entrega los productos» (dato 8 de la Resolución) NO es
 * configurable ni personalizable: es la leyenda genérica constante exigida
 * por CP-SALES-024 §5 (sin nombres personales).
 */

// ────────────────────────────────────────────────────────────────────────────
// Definición de campos personalizables
// ────────────────────────────────────────────────────────────────────────────

/** Campos del SC-2-12 que admiten personalización de presentación. */
export type Sc212FieldId =
  | 'proveedorDireccion'
  | 'proveedorCodigo'
  | 'proveedorNIT'
  | 'proveedorCuentaBancaria'
  | 'proveedorSucursalBancaria'
  | 'proveedorTelefono'
  | 'proveedorEmail';

export interface Sc212FieldDef {
  id: Sc212FieldId;
  /** Etiqueta oficial por defecto en el documento. */
  defaultLabel: string;
  /** Descripción corta para el panel de configuración. */
  hint: string;
  /** Campo de `stores` del que proviene el dato (solo informativo en UI). */
  source: string;
  /** true → dato fiscal/bancario oficial: NO admite valor personalizado. */
  official: boolean;
}

/**
 * Catálogo de campos. Los cinco primeros son los datos del proveedor del
 * modelo oficial (dato 2 de la Res. 11/2007); teléfono y correo son datos
 * de contacto añadidos por COSTPRO bajo la misma banda de identificación.
 */
export const SC212_FIELDS: readonly Sc212FieldDef[] = [
  {
    id: 'proveedorDireccion',
    defaultLabel: 'Dirección',
    hint: 'Domicilio de la entidad vendedora',
    source: 'stores.address',
    official: false,
  },
  {
    id: 'proveedorCodigo',
    defaultLabel: 'Código',
    hint: 'Código/REEUP de la entidad (11 dígitos)',
    source: 'stores.reeup',
    official: true,
  },
  {
    id: 'proveedorNIT',
    defaultLabel: 'NIT',
    hint: 'Número de identificación tributaria',
    source: 'stores.nit',
    official: true,
  },
  {
    id: 'proveedorCuentaBancaria',
    defaultLabel: 'Cuenta bancaria',
    hint: 'Cuenta bancaria de la entidad',
    source: 'stores.bank_account',
    official: true,
  },
  {
    id: 'proveedorSucursalBancaria',
    defaultLabel: 'Sucursal bancaria',
    hint: 'Sucursal bancaria de la entidad',
    source: '(no gestionado)',
    official: false,
  },
  {
    id: 'proveedorTelefono',
    defaultLabel: 'Teléfono',
    hint: 'Teléfono de contacto de la entidad',
    source: 'stores.phone',
    official: false,
  },
  {
    id: 'proveedorEmail',
    defaultLabel: 'Correo',
    hint: 'Correo electrónico de la entidad',
    source: 'stores.email',
    official: false,
  },
] as const;

export const DEFAULT_SC212_FIELD_LABELS: Record<Sc212FieldId, string> = SC212_FIELDS.reduce(
  (acc, f) => {
    acc[f.id] = f.defaultLabel;
    return acc;
  },
  {} as Record<Sc212FieldId, string>,
);

// ────────────────────────────────────────────────────────────────────────────
// Estructura de la preferencia
// ────────────────────────────────────────────────────────────────────────────

/**
 * Estado de UN campo. Todo es opcional: lo ausente = valor por defecto
 * (visible, etiqueta oficial, valor de la tienda). Así la preferencia
 * migrada desde versiones futuras/pasadas no rompe el documento.
 */
export interface Sc212FieldPref {
  /** false → el campo no se dibuja (sin dejar hueco). */
  visible?: boolean;
  /** Etiqueta personalizada (presentación). No altera el dato fuente. */
  label?: string;
  /**
   * Sustitución puntual del VALOR — SOLO en campos no oficiales
   * (dirección, teléfono, correo). Los oficiales lo ignoran.
   */
  value?: string;
}

export type Sc212FieldsPrefs = Partial<Record<Sc212FieldId, Sc212FieldPref>>;

/** Preferencia por defecto: todo visible, etiquetas oficiales, sin sustituciones. */
export const DEFAULT_SC212_FIELDS_PREFS: Sc212FieldsPrefs = {};

/** Key de user_preferences — alcance USUARIO + TIENDA (independiente por tienda). */
export function sc212PrefsKey(storeId: string): string {
  return `sc212:fields:${storeId}`;
}

/**
 * Normaliza una preferencia leída de user_preferences/localStorage:
 * descarta claves desconocidas, etiquetas vacías y valores personalizados
 * en campos oficiales (defensa en profundidad: aunque la UI no lo permita,
 * un JSON editado a mano no puede falsear el NIT ni la cuenta bancaria).
 */
export function normalizeSc212Prefs(raw: unknown): Sc212FieldsPrefs {
  const out: Sc212FieldsPrefs = {};
  if (!raw || typeof raw !== 'object') return out;
  const defs = new Map(SC212_FIELDS.map((f) => [f.id, f]));
  for (const [key, prefRaw] of Object.entries(raw as Record<string, unknown>)) {
    const def = defs.get(key as Sc212FieldId);
    if (!def || !prefRaw || typeof prefRaw !== 'object') continue;
    const pref = prefRaw as Record<string, unknown>;
    const clean: Sc212FieldPref = {};
    if (pref.visible === false) clean.visible = false;
    if (typeof pref.label === 'string' && pref.label.trim()) {
      clean.label = pref.label.trim().slice(0, 40);
    }
    if (!def.official && typeof pref.value === 'string' && pref.value.trim()) {
      clean.value = pref.value.trim().slice(0, 120);
    }
    if (Object.keys(clean).length > 0) {
      out[key as Sc212FieldId] = clean;
    }
  }
  return out;
}

/**
 * Resuelve la presentación efectiva de un campo: visibilidad, etiqueta y
 * valor a dibujar. Orden de precedencia del VALOR: sustitución permitida →
 * valor de la tienda → cadena vacía (nunca `undefined`; nunca inventado).
 */
export function resolveSc212Field(
  prefs: Sc212FieldsPrefs,
  field: Sc212FieldDef,
  storeValue: string,
): { visible: boolean; label: string; value: string } {
  const pref = prefs[field.id] || {};
  const visible = pref.visible !== false;
  const label = pref.label && pref.label.trim() ? pref.label.trim() : field.defaultLabel;
  // Valor: solo los campos NO oficiales admiten sustitución (normalize ya lo
  // garantiza; el check aquí es defensa si alguien llama con prefs crudas).
  const override = !field.official && typeof pref.value === 'string' && pref.value.trim()
    ? pref.value.trim()
    : '';
  const value = override || (storeValue ?? '');
  return { visible, label, value };
}
