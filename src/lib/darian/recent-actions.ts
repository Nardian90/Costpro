/**
 * Darian Recent Actions — log ligero user-scoped (localStorage).
 *
 * AI COMMAND CENTER (GATE 5): "Acciones recientes" representa actividad útil
 * originada por Darian — NO un historial de navegación ni un dashboard.
 *
 * Prioridad cubierta (GATE 5):
 *   1. acciones ejecutadas por Darian (navigation, form_fill/submit, export…)
 *   2. acciones iniciadas desde Darian (queries del usuario en conversación)
 *
 * Prioridad 3 (operaciones del usuario fuera de Darian) NO se cubre: no existe
 * registro client-side reutilizable (GATE 0) y crear una segunda BD de
 * actividad viola GATE 18. Documentado en el informe final.
 *
 * Seguridad (GATE 17):
 *   - Claves user-scoped, mismo patrón que las conversaciones de Darian
 *     (`darian_chat_conversations_${userId}` — ChatBot.tsx:57-64). Un clerk no
 *     puede leer el log de un admin en el mismo navegador.
 *   - Cada entrada registra el storeId activo al momento; el panel filtra por
 *     la tienda activa (defensa en profundidad — el contexto de tienda del
 *     MOTOR ya valida RBAC server-side, GATE 7).
 *   - Cap 20 entradas (GATE 6: recordar y reanudar, no archivar todo).
 */

export type DarianActionKind =
  | 'query'        // consulta iniciada desde Darian (prompt del usuario)
  | 'navigation'   // Darian navegó a una vista
  | 'form_fill'    // Darian completó un formulario
  | 'form_submit'  // Darian envió un formulario
  | 'export'       // Darian generó un archivo
  | 'ui_mode'      // Darian cambió modo UI
  | 'system_check' // health check del sistema
  | 'unknown';     // acción no clasificada (default del handler)

export interface RecentDarianAction {
  id: string;
  kind: DarianActionKind;
  /** Título corto de la acción ("Navegó a Vender", "Consulta: ¿qué vendimos hoy?"). */
  title: string;
  /** Info mínima útil (nombre de producto, formulario, tienda…). */
  detail?: string;
  /** ViewType destino para reabrir el contexto (navigation). */
  viewId?: string;
  /** Conversación donde ocurrió (reabrir → chat con esa conversación). */
  conversationId?: string;
  /** Tienda activa al momento de la acción (GATE 17). */
  storeId?: string;
  timestamp: number;
}

const MAX_ENTRIES = 20;
/** Ventana de deduplicación: la misma acción repetida en <60s no crea entradas. */
const DEDUPE_WINDOW_MS = 60_000;
/** Longitud máxima del título derivado de prompts del usuario. */
const MAX_TITLE_LEN = 72;

export const DARIAN_ACTIONS_EVENT = 'darian:actions-updated';

function storageKey(userId?: string | null): string {
  return userId ? `darian_recent_actions_${userId}` : 'darian_recent_actions_guest';
}

function safeParse(raw: string | null): RecentDarianAction[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentDarianAction =>
        e && typeof e.id === 'string' && typeof e.kind === 'string' && typeof e.timestamp === 'number'
    );
  } catch {
    return [];
  }
}

function sanitizeTitle(title: string): string {
  // Texto plano, sin saltos (la renderización es React-safe por defecto;
  // esto solo evita títulos absurdos por prompts multilínea).
  const flat = String(title).replace(/\s+/g, ' ').trim();
  return flat.length > MAX_TITLE_LEN ? flat.slice(0, MAX_TITLE_LEN - 1) + '…' : flat;
}

/** Registra una acción de Darian. Idempotente por dedupe de 60s. */
export function recordDarianAction(
  entry: Omit<RecentDarianAction, 'id' | 'timestamp'>,
  userId?: string | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = storageKey(userId);
    const existing = safeParse(localStorage.getItem(key));
    const now = Date.now();

    // Dedupe: misma kind+title dentro de la ventana → refresca timestamp y sale.
    const dupeIndex = existing.findIndex(
      (e) => e.kind === entry.kind && e.title === entry.title && now - e.timestamp < DEDUPE_WINDOW_MS
    );
    if (dupeIndex >= 0) {
      existing[dupeIndex] = { ...existing[dupeIndex], timestamp: now };
      localStorage.setItem(key, JSON.stringify(existing));
      window.dispatchEvent(new CustomEvent(DARIAN_ACTIONS_EVENT));
      return;
    }

    const record: RecentDarianAction = {
      ...entry,
      title: sanitizeTitle(entry.title),
      id: crypto.randomUUID(),
      timestamp: now,
    };

    const next = [record, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(DARIAN_ACTIONS_EVENT));
  } catch {
    // localStorage lleno/deshabilitado — el log es best-effort, nunca bloquea el chat.
  }
}

export function getDarianActions(userId?: string | null): RecentDarianAction[] {
  if (typeof window === 'undefined') return [];
  return safeParse(localStorage.getItem(storageKey(userId)));
}

export function clearDarianActions(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId));
    window.dispatchEvent(new CustomEvent(DARIAN_ACTIONS_EVENT));
  } catch {
    /* best-effort */
  }
}

/** "Hace 5 min" / "Hace 2 h" / "Hace 3 d" — tiempo relativo compacto. */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diffMs = now - timestamp;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'Ahora mismo';
  if (min === 1) return 'Hace 1 min';
  if (min < 60) return `Hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours === 1) return 'Hace 1 h';
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} d`;
  return new Date(timestamp).toLocaleDateString();
}

/** Metadatos de presentación por tipo de acción (icono + etiqueta). */
export const ACTION_KIND_META: Record<DarianActionKind, { label: string; icon: string }> = {
  query: { label: 'Consulta', icon: '💬' },
  navigation: { label: 'Navegación', icon: '🧭' },
  form_fill: { label: 'Formulario completado', icon: '📝' },
  form_submit: { label: 'Formulario enviado', icon: '📤' },
  export: { label: 'Exportación', icon: '📄' },
  ui_mode: { label: 'Modo de interfaz', icon: '🎨' },
  system_check: { label: 'Chequeo del sistema', icon: '🩺' },
  unknown: { label: 'Acción', icon: '⚡' },
};
