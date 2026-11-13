'use client';

/**
 * SELECTOR DE TRABAJADORES PARA NÓMINAS — búsqueda dinámica.
 *
 * MISMA experiencia que el selector de productos de COSTPRO al agregar
 * productos a una venta/entrada/documento (patrones de POSAutocomplete y
 * ValeSalidaCreateModal):
 *   · Escribo el nombre → aparecen resultados coincidentes mientras escribo.
 *   · Debounce (200ms) — el filtrado es LOCAL sobre los trabajadores ya
 *     cargados de la tienda (cero requests al servidor por tecla; la fuente
 *     única sigue siendo GET /api/workers?include_rate=1).
 *   · Insensible a mayúsculas y ACENTOS (normalización NFD): «josé» encuentra
 *     a «José», «PEREZ» encuentra a «Pérez», «exp 0042» por expediente, CI.
 *   · Cada resultado identifica al trabajador COMPLETO: nombre y apellidos,
 *     CI, expediente, cargo, categoría, área, estado y tarifa vigente con
 *     su unidad (horaria/diaria) — nunca solo un nombre (hay duplicados
 *     reales de nombre en producción, p. ej. los 7 «Dup Test»).
 *   · Los trabajadores NO elegibles no se ocultan: aparecen deshabilitados
 *     con la explicación (sin tarifa / tarifa no vigente para el período /
 *     inactivo / ya agregado).
 *   · Teclado (↑/↓/Enter/Esc) y táctil (targets ≥44px, lista bajo el campo —
 *     sin dropdown absoluto que se corte en móvil).
 *   · Tras seleccionar, el campo se limpia y conserva el foco para agregar
 *     otro trabajador sin reabrir nada.
 *
 * La elegibilidad de tarifa usa el MISMO criterio del motor servidor
 * (fn_payroll_validate_items): tarifa vigente al período de la nómina. El
 * servidor revalida SIEMPRE al guardar — esto es UX, no trust boundary.
 */

import { useId, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Ban, Coins, Search, UserRound, X } from 'lucide-react';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { cn } from '@/lib/utils';

export interface SelectableWorker {
  worker_id: string;
  first_name: string;
  last_name: string;
  ci?: string | null;
  status?: string | null;
  expediente_laboral?: string | null;
  categoria_ocupacional?: string | null;
  cargo?: string | null;
  area_trabajo?: string | null;
  rate_type?: string | null;
  rate_amount?: number | null;
  rate_currency?: string | null;
  rate_valid_from?: string | null;
  rate_valid_to?: string | null;
  has_any_rate?: boolean | null;
}

export type WorkerIneligibilityReason =
  | 'ya_agregado'
  | 'inactivo'
  | 'sin_tarifa'
  | 'tarifa_no_vigente';

export interface WorkerEligibility {
  eligible: boolean;
  reason: WorkerIneligibilityReason | null;
  label: string;
}

/**
 * Evalúa la elegibilidad de un trabajador para la nómina del período dado.
 * Misma semántica que fn_payroll_validate_items (worker activo de la tienda +
 * tarifa vigente al período) + duplicado en el documento (UNIQUE payroll+worker).
 */
export function evaluateWorkerEligibility(
  worker: SelectableWorker,
  addedWorkerIds: ReadonlySet<string>,
  periodStart: string,
  periodEnd: string,
): WorkerEligibility {
  if (worker.status && worker.status !== 'active') {
    return { eligible: false, reason: 'inactivo', label: 'Trabajador inactivo' };
  }
  if (addedWorkerIds.has(worker.worker_id)) {
    return { eligible: false, reason: 'ya_agregado', label: 'Ya agregado a esta nómina' };
  }
  if (worker.rate_amount == null || !worker.rate_type) {
    // La tarifa del listado ya viene evaluada contra el período; distinguir
    // «sin tarifa salarial configurada» de «tarifa no vigente para el período».
    if (worker.has_any_rate) {
      return {
        eligible: false,
        reason: 'tarifa_no_vigente',
        label: periodStart
          ? 'Tarifa no vigente para el período seleccionado'
          : 'Sin tarifa salarial vigente',
      };
    }
    return { eligible: false, reason: 'sin_tarifa', label: 'Trabajador sin tarifa salarial configurada' };
  }
  return { eligible: true, reason: null, label: '' };
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const MAX_RESULTS = 12;

export function WorkerSearchSelect({
  workers,
  addedWorkerIds,
  periodStart,
  periodEnd,
  onSelect,
  inputId,
  disabled = false,
  inputClassName,
}: {
  /** Trabajadores de la tienda activa (todos los estados — los no elegibles se muestran con explicación). */
  workers: SelectableWorker[];
  /** worker_id ya incorporados a la nómina (evita duplicados en el documento). */
  addedWorkerIds: ReadonlySet<string>;
  /** Período de la nómina (YYYY-MM-DD o vacío antes de elegirlo). */
  periodStart: string;
  periodEnd: string;
  /** Invocado al seleccionar un trabajador ELEGIBLE. */
  onSelect: (worker: SelectableWorker) => void;
  inputId?: string;
  disabled?: boolean;
  inputClassName?: string;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const debouncedSearch = useDebounce(searchTerm, 200);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const addedSet = useMemo(
    () => (addedWorkerIds instanceof Set ? addedWorkerIds : new Set(addedWorkerIds)),
    [addedWorkerIds],
  );

  const results = useMemo(() => {
    const needle = normalize(debouncedSearch);
    const tokens = needle ? needle.split(/\s+/).filter(Boolean) : [];
    const scored = workers
      .map((w) => {
        const fullName = `${w.first_name ?? ''} ${w.last_name ?? ''}`.trim();
        const hay = normalize(
          `${fullName} ${w.ci ?? ''} ${w.expediente_laboral ?? ''} ${w.cargo ?? ''} ${w.categoria_ocupacional ?? ''} ${w.area_trabajo ?? ''}`,
        );
        const matches = tokens.length === 0 || tokens.every((t) => hay.includes(t));
        if (!matches) return null;
        // Orden: elegibles primero, luego por nombre (estable).
        const elig = evaluateWorkerEligibility(w, addedSet, periodStart, periodEnd);
        return { worker: w, elig, fullName };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    scored.sort((a, b) => {
      if (a.elig.eligible !== b.elig.eligible) return a.elig.eligible ? -1 : 1;
      return a.fullName.localeCompare(b.fullName, 'es');
    });
    return scored.slice(0, MAX_RESULTS);
  }, [workers, debouncedSearch, addedSet, periodStart, periodEnd]);

  const eligibleCount = results.filter((r) => r.elig.eligible).length;
  const query = debouncedSearch.trim();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[focusedIndex];
      if (hit && hit.elig.eligible) {
        select(hit.worker);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchTerm('');
      setFocusedIndex(0);
    }
  };

  const select = (worker: SelectableWorker) => {
    onSelect(worker);
    setSearchTerm('');
    setFocusedIndex(0);
    // Conservar el foco para permitir agregar otro trabajador sin reabrir.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const rateLabel = (w: SelectableWorker) => {
    if (w.rate_amount == null || !w.rate_type) return null;
    const unit = w.rate_type === 'daily' ? 'día' : 'hora';
    const amount = new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(w.rate_amount);
    return `${amount} ${w.rate_currency ?? 'CUP'}/${unit}`;
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={searchTerm}
          disabled={disabled}
          onChange={(e) => { setSearchTerm(e.target.value); setFocusedIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar trabajador por nombre, apellido o expediente…"
          className={cn(
            'w-full h-11 pl-9 pr-9 rounded-lg border border-border bg-background text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50',
            inputClassName,
          )}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => { setSearchTerm(''); setFocusedIndex(0); inputRef.current?.focus(); }}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Estados del selector */}
      {workers.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Sin trabajadores en la tienda activa.
        </p>
      ) : results.length === 0 && query ? (
        <p className="text-xs text-muted-foreground italic">
          Sin resultados para «{query}». Prueba con el nombre, apellido, CI o expediente.
        </p>
      ) : results.length === 0 && !query ? (
        <p className="text-xs text-muted-foreground">
          Escribe para buscar entre {workers.length} trabajador{workers.length === 1 ? '' : 'es'} de la tienda.
        </p>
      ) : (
        <ul
          id={listId}
          role="listbox"
          aria-label="Resultados de trabajadores"
          className="rounded-lg border border-border divide-y divide-border/50 overflow-hidden max-h-64 overflow-y-auto"
        >
          {results.map(({ worker: w, elig, fullName }, idx) => {
            const rate = rateLabel(w);
            return (
              <li key={w.worker_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  aria-disabled={!elig.eligible}
                  disabled={!elig.eligible || disabled}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  onClick={() => elig.eligible && select(w)}
                  className={cn(
                    'w-full flex items-start gap-2.5 px-3 py-2.5 min-h-[44px] text-left transition-colors',
                    elig.eligible
                      ? 'hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none'
                      : 'opacity-60 cursor-not-allowed bg-muted/20',
                    idx === focusedIndex && elig.eligible && 'bg-muted/40',
                  )}
                >
                  <span className="mt-0.5 shrink-0" aria-hidden="true">
                    {elig.eligible
                      ? <UserRound className="w-4 h-4 text-primary" />
                      : <Ban className="w-4 h-4 text-muted-foreground" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs font-bold truncate">{fullName || '(sin nombre)'}</span>
                      {w.ci && (
                        <span className="font-mono text-[10px] text-muted-foreground">CI {w.ci}</span>
                      )}
                      {w.expediente_laboral && (
                        <span className="font-mono text-[10px] text-muted-foreground">Exp. {w.expediente_laboral}</span>
                      )}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      {w.cargo && <span>{w.cargo}</span>}
                      {w.categoria_ocupacional && <span>· {w.categoria_ocupacional}</span>}
                      {w.area_trabajo && <span>· {w.area_trabajo}</span>}
                      {rate ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-success">
                          <Coins className="w-3 h-3" aria-hidden="true" /> {rate}
                          <span title={`Vigente desde ${w.rate_valid_from ?? '—'}${w.rate_valid_to ? ` hasta ${w.rate_valid_to}` : ''}`}>
                            <BadgeCheck className="w-3 h-3" aria-hidden="true" />
                          </span>
                        </span>
                      ) : (
                        <span className="font-semibold text-destructive">{elig.label}</span>
                      )}
                    </span>
                    {!elig.eligible && rate && (
                      <span className="mt-0.5 block text-[10px] font-semibold text-destructive">{elig.label}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {results.length >= MAX_RESULTS && (
            <li className="px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/30">
              Mostrando {MAX_RESULTS} de más coincidencias — afina la búsqueda.
            </li>
          )}
        </ul>
      )}
      {results.length > 0 && eligibleCount === 0 && query && (
        <p className="text-[11px] text-muted-foreground">
          Ningún resultado es elegible: revisa tarifa salarial, período y estado.
          Fija la tarifa desde la pestaña «Trabajadores» (botón Tarifa).
        </p>
      )}
      {periodStart && results.length > 0 && eligibleCount > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Elegibilidad evaluada para el período {periodStart} → {periodEnd} (el servidor
          revalida al guardar).
        </p>
      )}
    </div>
  );
}
