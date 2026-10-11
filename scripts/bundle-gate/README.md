# Bundle Gate — regresión de carga inicial (W2/W3)

Control automatizado de CI que impide que las librerías pesadas de exportación
(`jspdf`, `html2canvas`, `jspdf-autotable`, `@e965/xlsx`) vuelvan a entrar en la
carga inicial del POS y del catálogo, protegiendo las optimizaciones W2/W3 del
PR #1392 contra regresión silenciosa.

- **Base**: `main` en `13c212e2e1220cec95772f45ef4dee8bf2c6e622` (post-fusión del PR #1392).
- **Comando**: `node scripts/bundle-gate/check-bundle-gate.mjs --next-dir .next`
  (o `bun run gate:bundle` tras un `next build`).
- **En CI**: step `Bundle gate (W2/W3 regression)` del job `quality` en
  `.github/workflows/ci.yml`, inmediatamente después del step `Build` — reutiliza
  los artefactos de ese build, **no compila una segunda vez** y analiza
  exactamente el commit que ejecuta el check.

## Qué protege

| Unidad protegida | Fuente | Cómo se determina su carga inicial |
|---|---|---|
| Shell (`/`) | `src/app/page.tsx` | `entryJSFiles["[project]/src/app/page"]` (cierre estático calculado por Turbopack) ∪ `rootMainFiles` ∪ `polyfillFiles` ∪ chunks de `clientModules` con `async:false` del manifiesto RSC `.next/server/app/page_client-reference-manifest.js` |
| POS | `src/components/views/terminal/views/pos/POSView.tsx` | chunks del boundary `import()` del `next/dynamic` (lo que Turbopack descarga al abrir la vista) + cierre estático a nivel módulo desde el módulo de entrada de la vista |
| Tabla de Venta (catálogo de ventas, alcance W3) | `src/components/views/terminal/views/pos/SalesCatalogView.tsx` | ídem |
| Vitrina Pública (alcance W3) | `src/components/views/terminal/views/stores/StorefrontConfigView.tsx` | ídem |

La lista de vistas y librerías se configura en `scripts/bundle-gate/bundle-gate.config.json`.
Añadir una vista protegida = añadir una entrada `protectedViews` (con su path
de fuente real). No hay presupuesto de tamaño: la regla es de **presencia**
(código de librería vigilada en la carga inicial = FAIL), lo que evita umbrales
arbitrarios y la confusión entre bytes sin comprimir y transferencia comprimida.

## Cómo funciona (mecanismo de inspección)

1. **Fingerprints multi-señal** (`lib/fingerprints.mjs`): el código compilado
   de cada librería se identifica con literales que sobreviven a la minificación
   y son específicos de la librería (p. ej. `WinAnsiEncoding` para jspdf,
   `data-html2canvas-ignore` para html2canvas). Se exige 1 señal primaria +
   `minTotal` señales: una mención textual ("errores de html2canvas" en un
   mensaje de la app) NO clasifica.
2. **Grafo de módulos Turbopack** (`lib/chunk-graph.mjs`): cada chunk registra
   sus módulos en
   `(globalThis.TURBOPACK||(...)).push([script, id, factory, ...])`. El parser
   reconstruye `módulo → chunk`, extrae las aristas estáticas `x.i(N)` y los
   boundaries de `import()` dinámica
   (`s.v(t=>Promise.all([...chunks].map(l)).then(()=>t(target)))`).
3. **Recorrido**: el BFS estático sigue solo aristas `x.i()`; los boundaries
   `import()` **no se siguen** — así la carga diferida legítima (clic de
   exportación) no es falsa regresión. `import type` y `import { type X }` se
   borran en compilación: nunca generan aristas ni registros.
4. **Anclaje de vistas** (`lib/anchors.mjs`): en producción Turbopack no
   conserva los paths de origen en los chunks cliente; cada vista se ancla a su
   chunk mediante ≥3 literales de su código fuente que aparecen en exactamente
   un chunk. Si no se puede anclar de forma fiable → BLOCKED (nunca PASS).

## Resultados y códigos de salida

| Estado | Significado | Exit code |
|---|---|---|
| `PASS` | Se inspeccionaron los artefactos y se cumplen las reglas | 0 |
| `FAIL` | Regresión confirmada: código de librería vigilada en la carga inicial del shell o de una vista protegida, o alcanzable estáticamente desde ellas | 1 |
| `BLOCKED` | Faltan artefactos, el formato cambió o el grafo no puede determinarse de forma fiable | 2 |

En CI **FAIL y BLOCKED fallan el check**. `BLOCKED` nunca se reporta como
éxito: si el gate no puede verificar, no verifica.

Los mensajes de FAIL incluyen: vista afectada, boundary, chunk con la
librería y la **cadena de módulos** `entrada → ... → culpable` con el chunk de
cada eslabón, señalando el módulo cuyo import estático arrastra la librería.

## Pruebas (`scripts/bundle-gate/bundle-gate.test.mjs`)

26 tests (vitest) con fixtures sintéticas en el mismo formato que emite el
build real de este repositorio:

1. Build válido → PASS.
2. Regresión estática controlada → FAIL (por boundary y por cierre).
3. Import dinámico legítimo de exportación → PASS (no falso positivo).
4. Imports de tipos / menciones textuales → no clasifican como dependencia.
5. Dependencia transitiva (vista → helper → lib) → FAIL con cadena reconstruida.
6. Artefactos ausentes/corruptos/bundler distinto/anclaje imposible → BLOCKED.
7. Librerías de vistas no protegidas → sin falsos positivos.

**Validación sobre artefactos reales** (evidencia de esta rama, build
`--experimental-build-mode compile` de Next 16.3.3/Turbopack sobre `13c212e2e`):

- Estado saludable: `PASS` — shell limpio (23 chunks iniciales); POS (136
  módulos / 33 chunks), Tabla de Venta (113/31) y Vitrina Pública (71/25) con
  0 librerías vigiladas en su cierre; jspdf/autotable/html2canvas/xlsx viven
  cada uno en su chunk asíncrono (`4441-*.js`, `01zea69*.js`, `3a4mlcf*.js`,
  `3fcpsct*.js`).
- Regresión real (temporaria, **no commiteada**): `import 'jspdf'` en
  `POSView.tsx` + `import 'html2canvas'` en `SalesCatalogView.tsx` →
  `FAIL` (exit 1) con las 4 violaciones esperadas (boundary + cierre por
  vista) y cadenas exactas; el shell y StorefrontConfig permanecieron limpios.
  El código se restauró (`git diff` sin cambios residuales) y el gate volvió a
  `PASS` con un rebuild.

## Si cambia el formato de los artefactos (Next.js/Turbopack)

El gate es fail-safe: cualquier cambio de formato produce `BLOCKED`, no un
PASS falso. Al migrar de versión de Next.js:

1. Ejecutar `bun run build` y mirar qué cambió en
   `.next/build-manifest.json` (`chunkLoadingGlobal`), el nombre/ruta del
   manifiesto RSC (`*.client-reference-manifest.js|json`) y el formato de
   `entryJSFiles`/`clientModules` — el gate centraliza esas expectativas en
   `lib/manifests.mjs`.
2. Si el runtime de chunks cambia, actualizar `PUSH_RE`/`PROXY_RE` en
   `lib/chunk-graph.mjs` contra un chunk real emitido.
3. Actualizar `manifestRouteKey`/`pageEntry`/`manifestBaseName` en
   `bundle-gate.config.json` si la ruta del shell cambia.
4. Los tests de fixtures documentan el formato esperado; ajústalos junto con
   el parser para que sigan siendo especificación ejecutable.

## Límites (qué NO garantiza)

- **No mide transferencia de red ni tiempos**: verifica pertenencia al grafo
  de carga inicial (determinista), no latencia ni bytes comprimidos.
- **Solo chunks cliente de la ruta `/`**: los bundles de servidor
  (`.next/server/**`, API routes) y otras rutas están fuera de alcance; una
  librería pesada usada solo en servidor no es detectada ni es objetivo.
- **Dependencias perezosas de vistas no protegidas**: una vista fuera de
  `protectedViews` puede importar estáticamente librerías vigiladas sin
  fallar el gate (decisión de alcance documentada, ver caso 7 de tests).
- **El anclaje por literales** depende de que la vista tenga ≥3 strings
  propios; una vista sin strings propios bloqueará el gate (fail-safe).
- **Fork de SheetJS**: `@e965/xlsx` se identifica por el núcleo SheetJS; si
  el proyecto añadiera otro fork de la misma familia, el gate también lo
  vigilaría dentro de la carga inicial protegida (comportamiento deseado).
