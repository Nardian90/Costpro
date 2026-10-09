# Auditoría — Corte del despliegue de Vercel tras PR #1381 y estabilización

| Campo | Valor |
|---|---|
| Fecha | 2026-10-09 |
| Commit afectado (base) | `d4add964b` (merge PR #1381, rama `feat/vales-salida-profesionalizacion`) |
| Fix principal | PR #1382 (merge `107cb3ba`, rama `fix/vales-salida-ts18048-vercel-deploy`) |
| Fix E2E complementario | Este PR (rama `test/vales-salida-e2e-sync-1381-ui`) |
| Cambios de datos | **0** (ninguna escritura en ninguna tabla; verificación READ-ONLY incluida) |

## 1. Síntoma

Vercel no desplegaba `main` desde el merge de PR #1381 (`d4add964b`, 2026-10-08 22:36 UTC).
Los 4 últimos deployments (1 en `main`, 3 en la rama de origen) terminaban en estado
`ERROR` tras la fase `Running TypeScript ...` con:

```
src/components/views/terminal/views/inventory/ValeSalidaDetalleModal.tsx(303,17): error TS18048: 'movimientos' is possibly 'undefined'.
src/components/views/terminal/views/inventory/ValeSalidaDetalleModal.tsx(309,18): error TS18048: 'movimientos' is possibly 'undefined'.
Failed to type check.
```

La app local seguía funcionando porque `next dev` no ejecuta el type-check completo;
el bloqueo solo se manifestaba en el build de producción (`next build` en Vercel).

## 2. Causa raíz (fix #1382, ya mergeado)

En TanStack Query v5, `useQuery` tipa `data` como `TData | undefined`. El render del
modal usaba ternarios con `loadingMovs` / `errorMovs` (flags separados), que **no
reducen el tipo** de `movimientos`, de modo que `movimientos.length` (303) y
`movimientos.map` (309) no compilaban. El error fue introducido por PR #1381 al añadir
el hook `useMovimientosVale` sin cubrir el caso `undefined`.

Fix aplicado (1 línea efectiva, sin cambio de comportamiento en runtime):
`const { data: movimientos = [], ... } = useMovimientosVale(...)`.
Validación: `tsc --noEmit` 0 errores (antes 2), lint limpio, Vitest completo
2721/2721 OK, deployment de Vercel `READY` y producción `https://costpro4.vercel.app`
respondiendo 200 en `/` y `/api/health`.

## 3. Segunda desviación detectada: spec E2E desincronizado (este PR)

Al ejecutar la E2E focalizada del módulo (matriz HIGH de la política de pruebas),
2 de 8 casos fallaban:

```
e2e/vales-salida-view.spec.ts:160  4 · detalle expandible: items + trazabilidad
e2e/vales-salida-view.spec.ts:175  5 · crear desde la vista abre Vender con modo Vale
```

### Evidencia de causa (git, no suposición)

| Comprobación | Antes de #1381 (`d4add964b^`) | Tras #1381 (hoy) |
|---|---|---|
| `Ver items del vale` en `ValesSalidaView.tsx` | 2 coincidencias | **0** |
| `Ver items del vale` en `e2e/vales-salida-view.spec.ts` | 2 | **2 (sin actualizar)** |
| PR #1381 tocó el spec E2E | — | **No** (`git diff --stat` vacío) |

PR #1381 sustituyó las filas expandibles por el modal documental (`Ver vale X` →
`ValeSalidaDetalleModal`) y el flujo de creación dedicado (`ValeSalidaCreateModal`
en lugar de navegar al POS), pero **no actualizó los casos 4 y 5 del spec E2E**.
El job E2E de CI es *advisory* (`continue-on-error: true`), por lo que el PR mergeó
con esas 2 fallas latentes. **No son causadas por el fix #1382** (que es de tipos).

### Fix aplicado (test-only, riesgo LOW)

Se actualizaron los 2 casos a la UI vigente, sin eliminar cobertura:

- **Caso 4 → «detalle documental»**: abre `Ver vale {slip}`, aserta dialog visible
  (nombre accesible = título «Vale de Salida» + slip), `Responsable`, `Emitido`,
  sección `Productos (`, `Creado por`; cierra y repite con el vale devuelto asertando
  `Devuelto por` y el motivo de la reversión.
- **Caso 5 → «flujo dedicado»**: `Crear Vale de Salida` abre el modal de creación
  (aserta dialog, descripción y pie del modal), ya no navega a `view=pos`.

### Validación

| Prueba | Resultado |
|---|---|
| `npx playwright test e2e/vales-salida-view.spec.ts` | **8/8 passed** (antes 6/8) |
| `npx playwright test e2e/inventory.spec.ts` (regresión del módulo) | **8/8 passed** |
| `tsc --noEmit` | 0 errores (`e2e/` está excluido del tsconfig; sin impacto en build) |
| Datos de prueba E2E | Cada run usa tiendas/usuarios efímeros propios y el teardown los elimina (net zero verificado en los 4 runs) |

## 4. Nota operativa: higiene de datos E2E (preexistente, no actionada)

El guard de higiene reporta `stores=0 users=20` (contaminación residual). Verificación
READ-ONLY: los datos reales están intactos (ENERVIDA `5e6fe821-…` y Puerto Padre
presentes; products=373, stock_movements=1514, transactions=1165, issue_slips=140;
vales reales VS-000127..134 sin tocar). Los residuos son artefactos `E2E PILOT/Multi/
Reset` del 5–6 oct y 4 usuarios del run `c8ecb4` del mismo día, anteriores a esta
sesión. **No se eliminó nada** (regla de no tocar datos); la limpieza de residuos
queda como recomendación usando la herramienta propia del repo
(`e2e/scripts/data-hygiene-guard.cjs`), ejecutada por el mantenedor.

## 5. Estado final

- `main` despliega en verde en Vercel (deployment `READY`, producción 200).
- Servidor local reactivado con PM2 (root=200, health=200).
- Suite Vitest completa: 2721 passed / 24 skipped / 0 failed.
- E2E del módulo vales-salida: 8/8; E2E inventory: 8/8.
- 0 cambios de datos en toda la operación.
