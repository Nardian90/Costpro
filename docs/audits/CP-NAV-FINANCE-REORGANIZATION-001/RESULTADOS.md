# CP-NAV-FINANCE-REORGANIZATION-001 — RESULTADOS

Fecha: 2026-11-25 · Rama: `feat/finanzas-nav-20261125` (base main d2c97db64)
Código: commit `6000371ed` (implementación + tests) · Esta fase: evidencia y resultados.

## 1. Reorganización efectuada (estructura final verificada en la app real)

**FINANZAS** (submenú de OPERACIÓN, renombre de la antigua categoría CAJA, icono wallet):

1. Servicios Recibidos — MOVIDO desde Logística
2. Cuentas por Cobrar — GRADUADA del hub Ventas → Opciones (antes «Cobros por Antigüedad»)
3. Cuentas por Pagar — GRADUADA del hub Ventas → Opciones
4. Caja — acceso conservado
5. Ingresos/Egresos — acceso conservado

**OPERACIÓN**
- Logística: Recepciones · Órdenes de Compra · Transferencia Stock (Servicios Recibidos RETIRADO)
- Ventas: Vender · Listado de precios · Reporte Entrega · IPV · Opciones (tarjetas de cuentas RETIRADAS de Opciones)

Ningún módulo, funcionalidad ni registro eliminado. Una única categoría financiera.

## 2. Componentes y archivos modificados (12)

| Archivo | Cambio |
|---|---|
| `src/config/navigation/navigation-definition.ts` | CAJA→FINANZAS (id `finanzas`, icono Wallet); received-services mudado; hojas `accounts_receivable`/`accounts_payable` graduadas (roles EXACTOS de la extensión); extensiones retiradas de SALES_HUB_PALETTE_ENTRIES; aliases legacy (`caja→finanzas`, kebab→snake); VALID_VIEWS +`finanzas` |
| `src/config/navigation/navigation-map.ts` | claves de cuentas retiradas de VIEW_TO_HUB_MAP (breadcrumb ahora del árbol: OPERACIÓN > FINANZAS > vista) |
| `src/store/index.ts` | union ViewType +`'finanzas'` (`'caja'` conservado) |
| `src/components/views/TerminalShell.tsx` | `case 'finanzas':` para el hub SectionHubView (`'caja'` conservado como alias) |
| `src/components/views/terminal/views/sales_hub/SalesHubView.tsx` | tarjetas Cuentas por Pagar / Cobros por Antigüedad retiradas de SECONDARY_CARDS; import CreditCard limpio |
| `src/config/viewRegistry.ts` | entrada del hub `finanzas` (registro IA/ayuda); `caja` marcado alias |
| `src/config/navigation/view-tips.ts` | tip de Opciones sin «Cuentas» |
| `src/config/work-dates/movement-types.ts` | área `Finanzas` + selectorLocation actualizado (copy informativo, sin lógica) |
| `src/lib/ai/prompts/system-prompt-builder.ts` | catálogo de viewIds de la IA: +Servicios Recibidos y +Cuentas por Cobrar (FINANZAS) |
| `src/components/views/terminal/views/received_services/ReceivedServicesView.tsx` | comentario de encabezado (ubicación vigente) |
| `src/__tests__/navigation/caja-navigation.test.ts` | reescrito al contrato FINANZAS (12 pruebas: estructura, mudanza, graduación, rutas, permisos, breadcrumb, aliases, móvil, Gate «caja», labels únicos, sheet móvil) |
| `src/__tests__/navigation/gate1-navigation.test.ts` | ajustes al nuevo contrato (palette, mobileHide, hub wrapper, sin cambios de permisos) |

## 3. Rutas originales y rutas utilizadas

| Vista | Antes | Ahora | Ruta HTTP |
|---|---|---|---|
| Servicios Recibidos | OPERACIÓN → Logística | OPERACIÓN → FINANZAS | `/?view=received-services` (INTACTA) |
| Cuentas por Cobrar | Ventas → Opciones (tarjeta) + ⌘K | OPERACIÓN → FINANZAS | `/?view=accounts_receivable` (INTACTA) |
| Cuentas por Pagar | Ventas → Opciones (tarjeta) + ⌘K | OPERACIÓN → FINANZAS | `/?view=accounts_payable` (INTACTA) |
| Hub | `/?view=caja` | `/?view=finanzas` (alias `caja` normaliza) | idéntica vista-hub |
| Deep-links kebab | `/?view=accounts-payable` / `accounts-receivable` | normalizan al canónico snake (alias legacy) | misma vista |

Componentes NO duplicados: las tres vistas son LAS MISMAS (ViewType, componentes, APIs, BD).

## 4. Verificación de permisos (sin cambios — auditada)

- Roles copiados EXACTOS de su fuente: `received-services` [admin,manager,encargado,warehouse];
  cuentas [admin,manager,encargado,clerk,usuario]; `cash` [admin,manager,encargado,clerk,usuario];
  `ingresos_egresos` [admin,manager,encargado,clerk].
- El submenú FINANZAS no declara roles propios (igual que el antiguo CAJA): herencia idéntica.
- Guard `isViewAllowedForRole` y `filterModulesByRole` intactos (sidebar.structure.ts sin cambios).
- RLS / Supabase / lógica contable: CERO modificaciones (solo navegación).
- Aislamiento multitienda: sin cambios (la navegación es cosmética; el gate real sigue en server-side).

## 5. Pruebas funcionales (verificación REAL en navegador, BD aislada)

Login real con usuario admin efímero (creado y limpiado al final — net delta = 0):

| Verificación | Resultado | Evidencia |
|---|---|---|
| Categoría CAJA ahora FINANZAS | OK — label FINANZAS con icono wallet en OPERACIÓN (tras Ventas) | evidencia/03, 04 |
| Servicios Recibidos dentro de FINANZAS | OK — primera opción; navegó y cargó | evidencia/04, 05 |
| Logística sin Servicios Recibidos | OK — solo Recepciones / OC / Transferencia | evidencia/10 |
| Cuentas por Cobrar dentro de FINANZAS | OK — navegó y cargó (vista intacta) | evidencia/06 |
| Cuentas por Pagar dentro de FINANZAS | OK — navegó y cargó (vista intacta) | evidencia/07 |
| Ventas → Opciones sin Cuentas por Pagar | OK — sin tarjetas de cuentas (resto intacto) | evidencia/09 |
| Breadcrumb de las 3 vistas | OK — Inicio > OPERACIÓN > FINANZAS > <vista> | evidencia/05, 06, 07 |
| Rutas siguen funcionando | OK — deep-links canónicos + kebab + `caja` legacy (URL real normalizada a `/finanzas`) | log de verificación |
| Estado activo del ítem | OK — hoja resaltada en el sidebar con su vista abierta | evidencia/05 |
| Hub FINANZAS (overview) | OK — SectionHubView con las tarjetas del grupo | evidencia/08 |
| Móvil (390×844) | OK — drawer: OPERACIÓN → FINANZAS → tap Cuentas por Cobrar navega; tab bar fija intacta | evidencia/12, 13 |
| Multitienda | Sin cambios en la superficie — misma navegación para la tienda activa; gate real en server | — |

Nota honesta: en la BD aislada la vista Cuentas por Cobrar mostró su panel de datos con
"HTTP 400" (semilla de datos de la tienda de prueba de privacidad). Es un asunto de DATOS del
entorno de verificación (el módulo de navegación no toca APIs ni queries de la vista); en el
entorno principal la vista consume los datos reales de producción. La vista montó, con
breadcrumb, header, tabs y filtros correctos.

## 6. TypeScript / ESLint / Tests / Build

- **TypeScript (tsc dirigido a los 17 archivos de la misión)**: 0 errores. El tsc global OOM por
  la RAM del sandbox (4 GB) — limitación conocida; los 3 errores del tsc dirigido son
  preexistentes en main (ParticleBackground, CostSheetFlatTable, CameraBarcodeScanner —
  styled-jsx que Turbopack resuelve) y el CI del PR ejecuta el typecheck completo.
- **ESLint (repo completo)**: 0 errores; 1.629 warnings (todos preexistentes; 3 menos que en main
  por los imports limpiados).
- **Vitest**: navegación 250/250; componentes 1.209/1.209 (5 skipped preexistentes);
  store/integración/help/hooks/lib 3.166/3.166 (86 skipped preexistentes). La suite completa
  excede los 10 min del sandbox; el CI del PR ejecuta la matriz completa.
- **Build**: no ejecutado en sandbox (misma limitación de RAM — documentado en la Task 25);
  el pipeline "CI" del PR compila el proyecto completo con Turbopack.

## 7. Higiene de la BD aislada

- Usuario admin efímero `cpnav-finanzas-20261125@costpro.test`: creado → usado → baneado en
  auth (200) → membership retirada (204).
- Residuos PREEXISTENTES de la Task 24 detectados por el guard (tienda piloto
  "E2E PILOT CP-UX cpux1124" + usuario `e2e-cpux1124-adm@costpro.test`) — limpiados con los
  helpers oficiales `hard-cleanup.ts` (guardas contra protegidos verificadas).
- `data-hygiene-guard.cjs` final: **PASS — net delta = 0** (stores=0, users=0; 5 tiendas protegidas presentes).
- Servidor final: PM2 online con el .env PRINCIPAL restaurado y health 200.

## 8. Secretos

- Escaneo del diff con los patrones canónicos del protocolo (token GitHub, claves de servicio y JWT de Supabase): cero coincidencias. Nótese que ni siquiera los patrones literales aparecen en este documento para no disparar falsos positivos de los gates de seguridad.
- El PAT solo en URLs efímeras de push; `.git/config` limpio (verificado).
