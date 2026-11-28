# VERCEL-UI-VALIDATION.md — CP-BRA-POST-CERTIFICATION-VALIDATION-001

Misión: verificación visual/funcional de Recepciones en el despliegue Vercel de `main`
final. **No introduce funcionalidades ni cambios de política** — es una revisión de
despliegue. Fecha: 2026-11-28.

## 1. Despliegue verificado

| Verificación | Resultado | Evidencia |
| --- | --- | --- |
| Deployment Production de `main` | **SUCCESS** — SHA `170a9f9be6f88ff0777be0d4f9260a22504910fa` (descendiente directo de `64233a502` de la certificación) | GitHub Deployments API, deployment `8129287790`, creado 2026-11-28T12:23:40Z |
| Dominio de producción | `https://costpro4.vercel.app` (alias estable documentado en expedientes previos) | — |
| `GET /api/health` en producción | **HTTP 200** `{"status":"ok","service":"costpro-enterprise",…}` | curl 2026-11-28T13:33Z |
| Landing pública | Renderiza completa (ADNegocio — Plataforma Empresarial Integral) | captura `evidencia/vercel-01-landing.png` |
| Ruta inexistente | Página 404 de marca propia («¡Positivo!») con acceso a inicio/login | captura `evidencia/vercel-02-protegida-redirige.png` |
| `/?view=reception_list` SIN sesión | Muestra la landing pública — **ninguna UI ni dato de recepciones expuesto** (fail-closed) | captura `evidencia/vercel-03-reception-list-sin-sesion.png` |

Nota metodológica: la URL de deployment (`costpro-hip4cvu76-nardian90s-projects.vercel.app`)
está protegida por Vercel Authentication (SSO) y no es navegable sin credenciales
Vercel; la verificación read-only se ejecuta sobre el alias de producción
`costpro4.vercel.app`, que Vercel enruta al último deployment Production exitoso
(`170a9f9be`, SUCCESS). En producción SOLO se navegó y consultó (read-only): no se
crearon, confirmaron ni anularon recepciones reales, conforme a la instrucción de la
misión. El login en producción no se intentó (no existen cuentas de prueba en
producción y crearlas sería escritura).

## 2. Observación de consola en producción (read-only)

- **React #418** (hidratación: texto servidor ≠ cliente) en la **landing pública** y la
  página 404. Es un aviso preexistente del ámbito landing (público, fuera del alcance
  de R-06 y de la rama de pagos; ambas misiones no tocan `src/app/page.tsx` ni el
  not-found). No bloquea funcionalidad. **No se observa ningún error de consola en las
  vistas autenticadas** — la batería visual de la sección 3 (7/7 PASS) recolectó
  `pageerror` y `console.error` durante toda la sesión autenticada y el recuento fue 0.

## 3. Matriz funcional de autorización (interfaz real, BD aislada CostproE2E)

Las operaciones que modifican datos se ejecutaron exclusivamente contra la **BD
aislada** (`lguovmvrozxgssupkwpf`, centinela `e2e_is_isolated_db = true`), con la app
local (mismo commit `170a9f9be` que el despliegue) apuntada al proyecto aislado
mediante el swap de `.env` documentado en `docs/e2e/EJECUCION_LOCAL_AISLADA.md`.

### 3a. Batería conductual R-06 (40/40)

`e2e/creation/r06-reception-authorization.spec.ts` re-ejecutado completo:

- **40/40 PASS** (5.1 min) — matriz completa del propietario: creación por rol
  (encargado con membresía ✓ · sin membresía ✗ · almacenero ✗ · facturadora/clerk ✗ ·
  manager ✗ · admin de tienda ✗ · usuario de otra tienda ✗ · anónimo ✗ · superadmin
  global ✓), confirmación/anulación por creador (14-21), superadmin global (22-24),
  manipulación de identidad/created_by (25-26), histórico sin creador verificable (27),
  concurrencia/idempotencia (28-30) e invariantes financieras/auditoría (31-39).
- Guardrail: **`PASS — net delta = 0`**.

### 3b. Batería VISUAL de la interfaz (7/7 — nueva evidencia)

Spec nuevo `e2e/creation/r06-ui-visual-matrix.spec.ts` (evidencia reproducible,
commiteado en esta expedición). Login real por UI (`signInViaUI`), navegación real a
`/?view=reception_list`, aserciones sobre el DOM real + capturas. Resultados contra la
BD aislada:

| # | Caso (decisión del propietario) | Resultado UI observado | Captura |
| --- | --- | --- | --- |
| 1 | Encargado con membresía activa | Botón **«+ NUEVA»** (`aria-label="Crear nueva recepción"`) VISIBLE; sin chip de candado; SU recepción pendiente muestra **Confirmar** y **Anular** | `01-encargado-creador-escritorio-documentos.png` · pestaña Productos: `02` |
| 2 | Otro encargado de la tienda (NO creador) | Botón NUEVA visible (puede crear) pero **SIN acciones** sobre la recepción ajena (0 botones Confirmar/Anular en la fila) | `03-otro-encargado-sin-acciones-ajena.png` |
| 3 | Almacenero | Ve la lista (rol de vista warehouse) con chip **«🔒 CREAR RECEPCIONES: SOLO ENCARGADO»** (title con el mensaje completo de autorización); fila ajena solo con «ver» | `04-almacenero-gate.png` |
| 4 | Facturadora/clerk | **«ACCESO DENEGADO»** (gate de navegación `reception_list` = admin/manager/encargado/warehouse por perfil): no ve la vista ni puede llegar al botón — bloqueo más fuerte que el span | `05-clerk-acceso-denegado.png` |
| 5 | Manager sin encargado · Admin de tienda sin encargado | Ve la lista con el chip «🔒 CREAR RECEPCIONES: SOLO ENCARGADO» y **sin botón de crear**; sin acciones sobre recepciones ajenas | `06-manager-gate.png` · `07-admin-tienda-gate.png` |
| 6 | Superadministrador | NUEVA visible + banda «Superadministrador: interviniendo en la tienda activa (acceso global de autorización, sujeta a estados y guards financieros)» + **acciones globales sobre recepción ajena** | `08-superadmin-global.png` |
| 7 | Responsive móvil 390 px (encargado) | Layout móvil correcto: NUEVA accesible, banner de pendientes, pestañas Documentos/Productos, navegación inferior | `09-movil-encargado-tarjetas.png` |

Consistencias verificadas por el spec:

- **Visibilidad de botones**: exactamente la matriz §0 (crear = encargado con
  membresía activa o superadmin; gestionar = creador con membresía activa, o superadmin
  global — `canManageOwnReception` por fila).
- **Estados deshabilitados/mensajes**: el chip de creación inactiva lleva
  `role="note"` y el `title` «Solo un encargado con membresía activa en esta tienda (o
  el superadministrador) puede crear recepciones» (mensaje de autorización visible al
  hover; verificado por aserción de atributo).
- **Vista tarjetas y tabla**: pestañas Documentos/Productos renderizan sin errores;
  tabla en escritorio y layout compacto en móvil (capturas 01/02/09).
- **Diseño responsive**: escritorio 1440×900 y móvil 390×844 sin solapamientos
  (capturas 01 y 09).
- **Errores de consola**: `pageerror` + `console.error` recolectados en las 7 sesiones:
  **0 errores** en vistas autenticadas (el aviso React #418 es de la landing pública,
  fuera de estas sesiones — sección 2).
- **Consistencia interfaz ↔ servidor**: la UI NO ofrece acción alguna que el servidor
  rechace, y el servidor rechaza todo lo que la UI no ofrece — contrastado con la
  batería RPC 40/40 (misma BD, mismos actores): creación denegada server-side para
  almacenero/clerk/manager/admin/otros-tiendas incluso si se fuerza la llamada; UI
  nunca muestra el botón a quien el servidor denegaría.
- Guardrail final: **`PASS — net delta = 0`** (`e2e/scripts/data-hygiene-guard.cjs`:
  residuos stores=0 users=0; 5 tiendas protegidas intactas).

## 4. Restauración del entorno (protocolo §5/§7)

- `.env` restaurado al PRINCIPAL (producción `wthkddeleylijmonclxg`) tras las pruebas:
  hash SHA-256 del `.env` final **idéntico** al de la réplica `download/costpro-env.txt`.
- PM2 online, `GET /api/health` → 200.
- BD aislada sin residuos (net zero); usuarios/tiendas del run eliminados por teardown.

## 5. Veredicto visual de Recepciones

**CONFORME** — la interfaz desplegada en `170a9f9be` aplica exactamente la matriz de
autorización certificada en CP-BRA-R06-FINAL-CERTIFICATION-001 (§0.1 creación,
§0.2 propiedad del creador, §0.3 superadmin global), con mensajes de autorización
correctos, estados coherentes entre UI y servidor, sin errores de consola en las
vistas autenticadas y sin regresión visual en escritorio ni móvil.
