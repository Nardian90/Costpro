# SECCIÓN RECURSOS HUMANOS EN EL MENÚ LATERAL — 2026-11-13

**Misión**: análisis y traslado de la vista «Trabajadores y Comisiones» a una
sección propia «RECURSOS HUMANOS» del menú lateral, con acceso directo desde
el sidebar (encargo del propietario; decisión final delegada al agente).

**Rama**: `feat/recursos-humanos-20261113` · **Base**: main @ `1b0157579` (PR #1607 fusionado).

## 1. Análisis (decisión final: SÍ crear la sección)

**Contexto**: la misión NÓMINAS SC-4-06 (PR #1607, 2026-11-12) añadió la
pestaña «Nóminas» (Res. 13/2007 MFP: confección/vista previa, PDF A4,
ciclo Borrador → Confirmada → Pagada → Contabilizada) al módulo
«Trabajadores y Comisiones». El módulo pasó de "CRUD + comisiones" a un
dominio de RRHH completo: trabajadores + reglas de comisión + pagos + nóminas.

**Argumentos de la decisión**:

| # | Argumento | Evidencia |
|---|-----------|-----------|
| 1 | El alcance declarado de OPERACIÓN («vender, mover stock, recibir mercancía y gestionar el ciclo comercial») ya no describe el módulo | `navigation-definition.ts` §operacion |
| 2 | OPERACIÓN sobrecargada: 13 hijos (6 hubs) — el traslado la aligera | mismo archivo |
| 3 | Patrón de traslados sancionado por GATE: Auditoría, Servicios Recibidos, Tablón, Dashboard — se MUEVE, no se duplica (mismo ViewType/roles/deep-links) | `audit-evidence/GATE1.4*` |
| 4 | Precedente de sección con un único ítem: AYUDA → Centro de Ayuda | `navigation-definition.ts` §ayuda |
| 5 | El legacy `recursos` disuelto en GATE 0.1 era «MÁS RECURSOS» (vertedero de ayuda → AYUDA), NO recursos humanos — sin colisión con `recursos-humanos` | `GATE0.1-ux-architecture.md` §2.2 |
| 6 | GATE 0.1 destinó `workers` a «OPERACIÓN (directo)» cuando el módulo era solo CRUD+comisiones (2026-10); el módulo creció desde entonces | `GATE0.1-ux-architecture.md` §2.1 |

**Estructura final**:

```
INICIO (ítem fijo — dashboard)
OPERACIÓN          → Dashboard · Ventas · Caja · Almacén · Logística · Costo ·
                    Control operativo · Gestión de Tiendas · Clientes y
                    Proveedores · Auditoría · Redes
RECURSOS HUMANOS   → Trabajadores y Comisiones   ← MOVIDA (mismo ViewType 'workers')
ANÁLISIS           → (sin cambios)
SISTEMA / AYUDA / EN DESARROLLO → (sin cambios)
```

Roles de la sección: `['admin', 'manager', 'encargado']` (la hoja conserva su
roles explícito — visibilidad efectiva EXACTA previa, mismo patrón que el
traslado de Auditoría DASHBOARD V3). Icono sección: `UsersRound`.

## 2. Cambios (fuente única → derivados automáticos)

| Archivo | Cambio |
|---|---|
| `src/config/navigation/navigation-definition.ts` | Nueva sección `recursos-humanos` entre OPERACIÓN y ANÁLISIS; hoja `workers` movida (descripción + keywords ampliadas: nóminas/salario/payroll/rrhh/sc-4-06); `VALID_VIEWS` + id; header doc actualizado |
| `src/store/index.ts` | `ViewType` += `'recursos-humanos'` |
| `src/components/views/TerminalShell.tsx` | `case 'recursos-humanos'` → GroupHubView (breadcrumb clicable) |
| `src/components/views/terminal/Sidebar.tsx` | `MODULE_DEFAULT_VIEW['recursos-humanos'] = 'workers'` (patrón AYUDA → help) |
| `src/components/views/terminal/views/workers/WorkersView.tsx` | Comentario doc de ruta actualizado |
| `src/__tests__/navigation/gate1-navigation.test.ts` | Baseline de secciones + `isSectionOrHub` actualizados |
| `knowledge/help/02-como-hacer/13-como-pagar-comisiones.md`, `knowledge/help/01-empezar/{introduccion,primeros-pasos}.md` | Rutas documentadas (Inicio → RECURSOS HUMANOS → Trabajadores y Comisiones) |
| `e2e/rrhh-seccion-navegacion.spec.ts` | Spec E2E R1-R3 (nuevo) |

El sidebar, móvil («Más»), breadcrumb, paleta de comandos y guard de roles se
derivan del árbol — sin listas paralelas (GATE 1).

## 3. Evidencia de verificación

**Unitarias (vitest)**: 249/249 verde tras el cambio —
`src/__tests__/navigation/` (11 archivos: gate1 109, superadmin 27,
mobile-parity 28, viewid-contract 20, url-sync 13, caja/vales/solicitud/
ipv-ventas/workers-return) + `sidebar-hover-expand` (15).

**E2E aislado (BD CostproE2E, ref `lguovmvrozxgssupkwpf`)**:

- Validación previa (solo lectura): `check-e2e-config --target project` OK ·
  `build-migrations-replay --check` MATCH (`8940801efe52e6be…`) ·
  `verify-remote-e2e` → «Base aislada PREPARADA».
- `bunx playwright test --project=core --retries=0 e2e/rrhh-seccion-navegacion.spec.ts`
  → **3/3 passed (2.0m)**:
  - R1 sección visible + hoja ausente en focus mode de OPERACIÓN;
  - R2 hoja bajo RECURSOS HUMANOS → `?view=workers` + breadcrumb
    «Inicio > RECURSOS HUMANOS > Trabajadores y Comisiones» + pestaña «Nóminas» intacta;
  - R3 deep-link `/?view=workers` auto-enfoca la sección.
- Capturas: `audit-evidence/20261113-recursos-humanos/`
  (R1-operacion-focus-sin-workers, R2-rrhh-focus-con-hoja,
  R2-vista-workers-breadcrumb, R3-deeplink-autofocus-rrhh).
- **Guardrail net-zero**: `data-hygiene-guard.cjs` → `PASS — net delta = 0`
  (stores=0 users=0; teardown HARD-delete del run aplicado).

**Typecheck**: `bunx tsc --noEmit` no es ejecutable en este sandbox (OOM con
4GB de RAM; el CI de GitHub lo corre en cada PR). Los cambios de tipos se
limitan al union `ViewType`, un case del switch y un literal de record
verificados por tests de compilación de vitest.

## 4. Notas de seguridad

- Sin cambios de permisos efectivos (mismo guard, mismos roles).
- Sin migraciones de BD; sin cambios de API.
- `.env*` no versionado (regla `.env*` del `.gitignore` verificada).
- Diff escaneado por secretos: cero coincidencias de tokens de GitHub,
  claves de servicio/ank de Supabase y JWT literales.

## 5. Entrega

- Push/PR: bloqueado en esta sesión — el PAT del prompt de inicio devuelve
  `401 Bad credentials` (probado con 3 formatos de autenticación; rotado o
  revocado). El trabajo está commiteado en la rama local
  `feat/recursos-humanos-20261113`; al rotar el PAT, `git push` + PR por API
  según el protocolo §8.
