# WAREHOUSE_MATERIAL_REQUEST_001 — Corrección del robo de foco en Solicitud de Materiales (SC-2-07)

**Misión:** COSTPRO-WAREHOUSE-REQUEST-001 · **Prioridad:** P1 · **Fecha:** 2026-11-01
**Módulo:** Almacén → Solicitud de Materiales → Nueva Solicitud de Materiales
**Rama:** `fix/warehouse-material-request-focus` · **Estado:** resuelto, pendiente de revisión del propietario

---

## 1. Descripción y evidencia del bug original

Al abrir «Nueva Solicitud de Materiales» (formulario del modelo SC-2-07 «Solicitud de
Entrega», Res. 11/2007 MFP), escribir en **cualquier campo distinto de «Área
solicitante»** devolvía el foco continuamente a ese primer campo (`#sm-area`), con lo
cual el formulario era prácticamente inutilizable: cada pulsación en «Código del
área», «Centro de costo», «Código de entidad», la búsqueda de productos o «Notas»
expulsaba al usuario del control activo.

Evidencia de la reproducción automatizada (ANTES de la corrección):

- **E2E (navegador real, BD aislada `CostproE2E`)** — `e2e/warehouse-material-request.spec.ts`,
  caso C2 contra el código defectuoso:
  `Error: foco robado al escribir en sm-fecha — Expected "sm-fecha" Received "sm-area"`.
- **Integración (RTL + jsdom)** — `MaterialRequestFormModal-focus.test.tsx`:
  `el foco fue robado tras la 1.ª pulsación: expected 'sm-area-codigo' received 'sm-area'`
  y `expected 'sm-entidad-codigo' received 'sm-area'`.
- **Instrumentación del DOM (nodo a nodo)**: tras UNA sola pulsación, los 6 campos del
  formulario presentaban `mismoNodo=false` — cada render reemplazaba TODOS los nodos.

## 2. Causa raíz

El subcomponente de presentación `Seccion` (el `<fieldset>` de cada bloque del modelo)
estaba **definido dentro del cuerpo de `MaterialRequestFormModal`**:

```tsx
export function MaterialRequestFormModal(...) {
  ...
  const Seccion = ({ icon: Icon, titulo, children }) => (<fieldset>…</fieldset>);  // ❌ inline
  return ( ... <Seccion icon={FileText} ...>…</Seccion> ... );
}
```

Consecuencia mecánica (secuencia exacta del robo de foco):

1. Cada pulsación en un campo controlado dispara `onChange` → `setState` → re-render.
2. En cada render se crea una **función `Seccion` nueva** → para React es un **tipo de
   componente distinto** al del render anterior → reconciliación falla → React
   **desmonta y remonta las cinco secciones** (y todos sus inputs) en cada pulsación.
   Confirmado por instrumentación: `mismoNodo=false` para los 6 campos tras un cambio.
3. Los inputs nuevos se crean desde cero; el input «Área solicitante» (`#sm-area`)
   monta con el atributo **`autoFocus={!isEdit}`** (modo creación) → el navegador
   **re-aplica el foco inicial sobre él en cada remontaje** → el foco "viaja" a
   «Área solicitante» después de cada tecla en cualquier otro campo.
4. Efectos colaterales del mismo defecto: la posición del cursor se reinicia (nodo
   nuevo), el scroll interno salta y se repite trabajo de layout innecesario en cada
   pulsación (perf).

Por qué «Área solicitante» y no otro campo: es el único input con `autoFocus`; al
remontar el árbol, el navegador otorga el foco al último nodo montado con ese
atributo. El `useFocusTrap` del `BaseModal` quedó descartado como causa: su efecto de
foco inicial depende de `[isActive, onEscape]` (estables) y solo corre al abrir.

**No se aceptaron diagnósticos genéricos**: la causa es un anti-patrón concreto
(componente definido inline con `autoFocus` en un hijo) con un mecanismo verificable.

## 3. Archivos y funciones modificados

| Archivo | Cambio |
| --- | --- |
| `src/components/views/terminal/views/inventory/MaterialRequestFormModal.tsx` | `Seccion` elevada a **nivel de módulo** (identidad de componente estable). Único cambio funcional del fix; sin alterar diseño, campos, validaciones ni permisos. |
| `e2e/warehouse-material-request.spec.ts` | **Nuevo** — suite E2E de la misión (8 casos, §5). |
| `src/__tests__/components/MaterialRequestFormModal-focus.test.tsx` | **Nuevo** — regresión de integración R1–R4 (§4). |

## 4. Explicación de la solución

Al vivir `Seccion` en el ámbito de módulo, su identidad es **estable entre renders**:
React reconcilia el árbol normalmente, los inputs conservan sus nodos DOM y el foco
nunca se ve afectado por actualizaciones de estado. El `autoFocus` de «Área
solicitante» se conserva deliberadamente: ahora solo se aplica en el montaje real del
modal (apertura), que es la regla explícita de accesibilidad prevista — ya no puede
re-aplicarse porque no hay remontajes. La solución no toca validaciones, campos,
estilos ni autorización, y elimina de paso el costo de remontar todo el formulario
por pulsación.

## 5. Evidencia E2E antes y después

Suite: `e2e/warehouse-material-request.spec.ts` (proyecto `core`, workers=1, sin
reintentos), contra la **BD aislada `CostproE2E`** (ref `lguovmvrozxgssupkwpf`,
centinela `e2e_is_isolated_db() === true`), servidor PM2 en localhost:3000.

| Corrida | Código | Resultado |
| --- | --- | --- |
| Reproducción (pre-fix) | defectuoso (main `ed31a78`) | C2 **FALLA**: `foco robado al escribir en sm-fecha → "sm-area"`; C3–C8 bloqueados (serial) |
| **Corrida final (post-fix)** | corregido | **8/8 passed (2.7 m)** — C1–C8 en verde, guardrail net-zero PASS |

Contenido de los casos: C1 apertura SC-2-07; C2 escritura en todos los campos con
foco estable y valores intactos; C3 cambio continuo entre campos; C4 cursor en medio
del texto (inserción/borrado con `selectionStart` verificado); C5 Tab/Shift+Tab en
orden lógico del DOM; C6 validación en vivo sin robo de foco (contrato actual: botón
deshabilitado + `role=alert`, sin traslado de foco); C7 guardado real (RPC
`create_material_request`) + persistencia verificada en PostgreSQL (§6); C8
aislamiento RLS multitienda (§identidad del entorno).

## 6. Resultados de persistencia

Caso C7, contra el proyecto aislado (service-role **solo verificación**):

- Fila en `material_requests`: exactamente 1 por `store_id + area_nombre` (sin
  duplicados), `status='draft'`, `request_number` con formato `SM-NNNNNN-YYYY`,
  `store_id` de la tienda sintética Puertopadre, `created_by` = usuario del run,
  `area_codigo`/`centro_costo`/`almacen_nombre` tal como se capturaron.
- Filas en `material_request_items`: 2 líneas, cantidades `10.0000` y `3.5000`,
  snapshots de `sku` correctos (el servidor resuelve descripción/código/UM).
- Recuperación: recarga de la vista muestra la solicitud por su número.

## 7. Identidad del entorno de pruebas (sin secretos)

- **Proyecto Supabase:** `CostproE2E` — ref `lguovmvrozxgssupkwpf` (NUNCA producción
  `wthkddeleylijmonclxg`). Guard `e2e/fixtures/assert-isolated-db.ts` fail-closed:
  `check-e2e-config --target project` OK y `verify-remote-e2e` → «Base aislada
  PREPARADA» antes de la corrida.
- **Tienda sintética equivalente a Puertopadre:** `E2E80 <runId> PUERTOPADRE <suf>`
  creada vía API real (`POST /api/stores`) dentro del tenant efímero del run
  (la tienda real Puertopadre de producción **no fue tocada**). Almacén sintético
  `Almacén Central PUERTOPADRE <suf>` + 2 productos sintéticos (`SM-<suf>-CEM`,
  `SM-<suf>-CLA`).
- **Identidad por corrida** (`E2E_ISOLATION=1`): usuarios/tenant propios del run;
  teardown con **guardrail net-zero PASS** (0 tiendas, 0 usuarios residuales).
- Variables E2E lógicas en `.env` local (fuera del repo); secretos jamás impresos.

## 8. Resultados de regresión

- **Unitarios del módulo SC-2-07 (existentes):** `res11-sc207-solicitud-materiales-migration.test.ts`
  (22) + `solicitud-materiales-navigation.test.ts` (9) → **31/31 passed**.
- **Integración nueva:** `MaterialRequestFormModal-focus.test.tsx` → **4/4 passed**
  (R1 foco estable, R2 sin remontaje de nodos, R3 conservación de valores, R4
  validación sin robo de foco).
- **ESLint** sobre los ficheros tocados: 0 errores (2 warnings preexistentes del PR
  original #1534 sobre `<button>` crudo, fuera del alcance de esta misión).
- **E2E de humo del proyecto (mismo filtro del workflow `e2e-isolated.yml`)**:
  health-api + centinela de aislamiento + auth + pos-checkout + inventory +
  inventory-integrity → **45/45 passed (3.0 m)**, guardrail net-zero PASS —
  sin fallos nuevos atribuibles al cambio.

## 9. SHA del commit

Commit de la corrección: **`3d61e48`** — `fix(warehouse): elimina el robo de foco
en el formulario SC-2-07 de Solicitud de Materiales` (rama
`fix/warehouse-material-request-focus`). El informe y las pruebas viajan en el
commit inmediatamente posterior de la misma rama.

## 10. Enlace al PR

PR: **https://github.com/Nardian90/Costpro/pull/1538** — no se fusiona
automáticamente; el propietario revisa antes.

## 11. Limitaciones y riesgos residuales

1. **Contrato de validación**: el traslado de foco al primer campo inválido al
   intentar enviar NO existe hoy (el botón se deshabilita y los errores se anuncian
   en `role=alert`). C6 fija ese contrato; si el propietario quiere además el foco al
   primer inválido tras submit, es un cambio separado (accesibilidad, no defecto).
2. **Patrón anti-regresión**: otros formularios del repo podrían definir componentes
   inline con `autoFocus` (mismo anti-patrón latente). Esta misión no los audita;
   queda como recomendación de back-log una pasada por los modales de
   `views/inventory` y afines.
3. **`autoFocus` inicial**: el foco inicial del modal puede ser capturado por el
   `useFocusTrap`/Radix (comportamiento preexistente, inalterado). Si se desea
   garantizar «Área solicitante» al abrir, marcarla con `data-autofocus` (soportado
   por el trap) en una misión de UX aparte.
4. El spec E2E espera el estado final del catálogo de almacenes (select vs rama
   textual) dentro de `abrirFormulario`; si en el futuro el dato 3 cambia de
   estructura, actualizar `camposEditables` y el orden esperado de C5.
