# VERCEL-PREVIEW-FAILURE — Diagnóstico del fallo de previews/producción en Vercel

**Misión:** revisar los logs de Vercel para establecer por qué está fallando el preview.
**Fecha:** 2026-10-06 · **Proyecto Vercel:** `costpro` (`prj_IUfWj1yqInP5ZCNLWNroUsJFog0h`) · **Framework:** Next.js 16.3.3 (Turbopack) · **Build machine:** 2 cores, 8 GB (iad1)
**Método:** API de Vercel (solo lectura) — `/v6/deployments`, `/v13/deployments/{id}`, `/v2/deployments/{id}/events` (paginado completo, 2000+ eventos) + reproducción local en el mismo commit.

---

## 1. Veredicto ejecutivo

```text
CAUSA RAÍZ (terminal, fatal):
  Error: Command "npm run build" exited with 1
  ← Running TypeScript ...
  ← src/components/views/terminal/views/stores/StoreCatalogView.tsx(695,18):
     error TS2739: Type '{ isOpen: true; onClose: ...; title: string; description: string;
     confirmLabel: string; onConfirm: () => Promise<void>; }' is missing the following
     properties from type 'DestructiveConfirmModalProps': confirmName, warningText
  ← Failed to type check.

INTRODUCIDO POR: PR #1373 (feat/ux-inventario-vitrina), commit 89ef2496f
AFECTA: 2 previews de #1373 + 1 deploy de PRODUCCIÓN (main tras merge #1373)
REPRODUCIDO LOCALMENTE: bunx tsc --noEmit en main@05cce7768 = mismo TS2739
FIX: confirmName="BULK" + warningText (+key/label) — patrón StoresManagementView:604
```

## 2. Inventario de deployments (últimos 27, API `/v6/deployments`)

| Estado | N | Detalle |
|---|---|---|
| ERROR | **3** | `dpl_8FgCtXZcFgmtc85doMiC8Pd2PyxD` (**production**, main/merge #1373, 2026-10-06 22:21) · `dpl_81s2sqfMorqtzGqsVrR5YQUmCWoZ` (preview #1373/44086c177, 19:52) · `dpl_CGKebVU3mbtkzGADRWyo7UWpPBh5` (preview #1373/89ef2496f, 19:45) |
| READY | 24 | Incluye previews de #1373 de 19:20 y 19:26 (commits docs/chore) y production 16:48 (merge #1372) |

**Línea temporal del fallo:** los commits de #1373 en 19:20 y 19:26 construían READY; el error empieza exactamente con `89ef2496f` («feat(ux): tarjeta inventario limpia con menu contextual + Catalogo/Vitrina») a las 19:45, persiste en `44086c177` (19:52) y pasa a producción al mergearse #1373 (deploy de main a las 22:21 ERROR). Producción sigue sirviendo el último deploy bueno (16:48, merge #1372); cualquier preview nuevo desde main actual también falla.

## 3. Cadena de evidencia (logs Vercel, paginado completo)

1. `Running "npm run build"` → `▲ Next.js 16.3.3 (Turbopack)`.
2. `✓ Compiled successfully in 27.4s` — **la compilación NO falla**.
3. `Running TypeScript ...`
4. `src/components/views/terminal/views/stores/StoreCatalogView.tsx(695,18): error TS2739: ... missing the following properties from type 'DestructiveConfirmModalProps': confirmName, warningText`
5. `Failed to type check.`
6. `Error: Command "npm run build" exited with 1` (evento terminal, presente idéntico en los 3 deployments ERROR).
7. Turbopack reportó además `16 warnings` — **no fatales** (ver §4).

## 4. Hipótesis descartadas (con evidencia)

| Hipótesis | Veredicto | Evidencia |
|---|---|---|
| `Module not found: Can't resolve 'stripe'` (en `src/lib/billing/stripe.ts:120` vía `api/billing/webhook`) | **NO es la causa** — warning preexistente no fatal | `stripe.ts` usa `require('stripe')` dentro de try/catch opcional desde la iteración 13 (`a9c42d4fd`); sin cambios entre el build bueno de 16:48 y los fallidos; builds anteriores fueron READY con el mismo warning |
| Tracing excesivo de filesystem (16 warnings: `api/intelligence/route.ts`, `academy/generate`, `lib/ai/vercel-provider.ts`; patrón `/ROOT/` 11.120 archivos) | **NO es la causa** — warnings de rendimiento | El texto es `Warning:`; el build llegó a `✓ Compiled successfully`; el error terminal es de TypeScript, no de tamaño/tiempo |
| OOM / memoria | **NO es la causa** | Máquina 8 GB; el fallo es determinista y de tipos (`Failed to type check`), no un kill del proceso |
| Variables de entorno faltantes | **NO es la causa** | El deployment tenía el env completo (incl. `NEXT_PUBLIC_SUPABASE_URL`, `NEXTAUTH_*`, keys de IA); el error es estático de tipos |

## 5. Reproducción local (correlación 1:1)

```text
Repo: main @ 05cce7768 (merge #1373 — mismo SHA que el deploy de producción fallido)
Comando: bunx tsc --noEmit
Resultado: src/components/views/terminal/views/stores/StoreCatalogView.tsx(695,18):
           error TS2739 ... confirmName, warningText   ← idéntico al log de Vercel
Código: <DestructiveConfirmModal isOpen onClose title description confirmLabel onConfirm/>
        sin confirmName ni warningText (ambos REQUIRED en DestructiveConfirmModalProps,
        src/components/ui/DestructiveConfirmModal.tsx:33-43)
Introducido en: 89ef2496f (PR #1373) — el modal masivo nuevo omitió las props requeridas
```

## 6. Fix aplicado (este PR)

`StoreCatalogView.tsx` (bulk confirm de la vitrina/catálogo): se añadieron las props requeridas replicando el patrón ya existente para operaciones masivas en `StoresManagementView.tsx:604`:

- `confirmName="BULK"` (el usuario debe teclear BULK para habilitar el botón destructivo)
- `confirmNameLabel="Escribe BULK para confirmar"`
- `warningText={…}` (acción irreversible + nº de productos + impacto en vitrina pública)
- `key={`bulk-${op.field}-${op.value}-${selected.size}`}` — reset del input por apertura (patrón F2.5-2 recomendado en el propio componente)

Cambios fuera del archivo afectado: **ninguno**.

## 7. Verificación del fix

| Prueba | Resultado |
|---|---|
| `bunx tsc --noEmit` (reproduce el punto exacto de fallo de Vercel) | **PASS** — 0 errores |
| `bun run lint` | **PASS** — 0 errores (1317 warnings preexistentes del baseline; 0 en el archivo cambiado... 10 warnings del archivo ya presentes en main) |
| `git diff --check` | PASS |
| Vitest afectados | No existen tests para `StoreCatalogView` ni `DestructiveConfirmModal` (0 archivos) |
| Build (`next build`) local | ENVIRONMENT LIMIT documentado (OOM en contenedor, deuda previa) — **la prueba de build definitiva es el preview de Vercel de esta rama**, que ejecuta el mismo pipeline que falló |
| Preview Vercel de la rama del fix | Verificar en Vercel tras el push — debe pasar `Running TypeScript` y llegar a READY |

## 8. Riesgo residual / recomendaciones

1. **El warning `stripe` seguirá apareciendo** (opcional no instalado). Si se quiere silenciar: instalar `stripe` o añadir `/*turbopackIgnore: true*/` — decisión aparte, no bloqueante.
2. **Los 16 warnings de tracing** (`/ROOT/` = 11.120 archivos) penalizan rendimiento/size del bundle serverless; recomendar scoping estático de paths (`path.join(process.cwd(), 'data', ...)`). Backlog, no bloqueante.
3. **Gate de proceso**: el TS2739 entró a main porque el PR #1373 se mergeó con previews en ERROR (19:45/19:52). Recomendar: no mergear con preview ERROR o con `tsc --noEmit` local fallando (la política de testing ya exige TypeCheck — reforzar en el checklist de merge).
