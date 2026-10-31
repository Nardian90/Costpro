# CP-OFFERS-PUERTOPADRE-001 — Auditoría y corrección del módulo Ofertas

**Fecha:** 2026-10-31 · **Rama:** `fix/ofertas-validacion-especifica-persistencia-20261031` · **Base:** `main` @ `422655eae`
**Ruta funcional auditada:** Inicio → OPERACIÓN → Ventas → Opciones → Ofertas
**Tienda de comprobación:** entorno aislado `CostproE2E` (equivalente funcional de Puertopadre — ver §6)

---

## 1. Resumen ejecutivo

| Aspecto | Estado |
|---|---|
| Causa raíz del mensaje genérico | **Identificada y corregida** (§2) |
| Persistencia real en PostgreSQL | **Verificada por evidencia directa** (§4) — ya funcionaba; no hacía falta reescritura |
| Aislamiento CostproE2E | **Demostrado** con guard fail-closed + centinela (§6) |
| Escrituras de prueba en producción | **CERO** — guard rechaza `wthkddeleylijmonclxg` sin conectar (§6) |
| Pruebas | 24 unitarias nuevas + 14 E2E nuevas, **todas en verde** (§7) |
| Regresiones | **Ninguna** — 4834 unitarias pasan; 3 fallos preexistentes en main documentados (§7.3) |
| RLS | **Fortalecida** — divergencia ruta/RLS corregida (§5) |

---

## 2. Causa raíz del error «Por favor, corrija los errores en el formulario»

### 2.1 Diagnóstico (reproducido en entorno aislado)

El mensaje proviene de **una única línea** del cliente:
`src/components/views/terminal/views/ofertas/OfertaFormPanel.tsx` → `handleSubmit` →
`toast.error('Por favor, corrija los errores en el formulario')` cuando `validate()` falla.

**Reproducción** (Playwright contra CostproE2E, usuario admin + tienda de prueba):

1. Formulario completo **sin** precio unitario → toast genérico + error inline
   «Precio debe ser > 0» en texto de **9 px**.
2. Formulario completo **con** precio → `201 Created` + persistencia correcta.

La validación fallaba de forma legítima (el negocio exige precio > 0), pero el
usuario no podía saber **qué campo** fallaba por cuatro defectos combinados:

| # | Defecto | Evidencia |
|---|---|---|
| D1 | `OfertaItemFactory.create()` inicializa `precio_unitario: 0`, y el input renderiza `value={item.precio_unitario \|\| ''}` → **el campo se ve VACÍO, no "0"** — el usuario no percibe que el valor real es 0 | `src/contracts/oferta.ts` (fábrica), `ProductRow.tsx` línea 82 |
| D2 | La etiqueta «Precio Unit.» **no lleva asterisco** (a diferencia de «Descripción *», «Número de Oferta *», «Objeto *», «Empresa *») → el campo no parece obligatorio | `ProductRow.tsx` líneas 77-78 (antes del fix) |
| D3 | El toast es **genérico**: no nombra el campo ni el producto | `OfertaFormPanel.tsx` handleSubmit (antes del fix) |
| D4 | El error inline existe pero mide **9 px** (`text-[9px]`), sin resumen de errores ni foco al campo — invisible en la práctica | render de campos (antes del fix) |

Defectos secundarios encontrados en la misma cadena:

- **D5 (backend):** las rutas `/api/ofertas*` responden `{error: 'Datos inválidos', details: zodError(...)}`, pero `zodError()` devuelve un **objeto** `{ok, error, details:[...]}` que la ruta anidaba tal cual bajo `details` → el frontend (`apiFetch`) solo leía `body.error` y **descartaba los motivos por campo**. Un rechazo del backend también se mostraba genérico.
- **D6 (UX):** el botón «Nueva Oferta» del estado vacío llamaba `onReset()` — un **no-op** en ese estado (`isCreating` ya era `false`). Nunca abría el formulario.

### 2.2 Corrección (desde el origen, sin reescritura)

| Cambio | Archivo | Qué hace |
|---|---|---|
| Validación compartida con mensajes específicos | `src/contracts/oferta.ts` | Nueva `validateOfertaForm()` — mismas reglas EXACTAS del modelo (ningún requisito inventado), mensajes que nombran campo y producto: «El precio unitario del producto 1 debe ser mayor que 0» |
| Toast específico + resumen accesible | `OfertaFormPanel.tsx` | Toast «Revisa N campos: …» (3 primeros + «y N más») + bloque `role="alert"` con la lista COMPLETA de errores |
| Foco al primer campo inválido | `OfertaFormPanel.tsx` + inputs | Atributos `data-field="<clave>"` y `focusFirstInvalidField()` → focus + scroll suave |
| Obligatoriedad visible | `ProductRow.tsx` | «Cant. *» y «Precio Unit. *» (ambos son obligatorios según Zod `positive()`) |
| Errores legibles | `OfertaFormPanel.tsx`, `ProductRow.tsx` | `text-[9px]` → `text-[11px]` en los mensajes de error |
| Anti doble envío | `OfertaFormPanel.tsx` | `submittingRef` síncrono — cubre el intervalo que `isPending` de React Query no cubre (dos clics <50 ms) |
| Detalles del backend visibles | `useOfertas.ts` (`apiFetch`) | Lee `details` (array plano o anidado legacy) y `message`; el error ahora dice: «Datos inválidos: Precio debe ser > 0 (productos.0.precio_unitario)» |
| `details` normalizado | 3 rutas `/api/ofertas*` | `details: zodError(...).details` → array plano `{path, message}` |
| Botón del estado vacío funcional | `OfertaFormPanel.tsx` + `OfertasView.tsx` | Nueva prop `onNewOferta` → abre el formulario con datos del suministrador precargados |

**Lo que NO cambió:** conservación de valores tras error (ya era correcta —
`onReset` solo se ejecuta tras éxito persistido), estados de carga del botón
(ya existían), identidad visual (solo tokens existentes `destructive`/`muted`).

---

## 3. Archivos modificados

| Archivo | Tipo de cambio |
|---|---|
| `src/contracts/oferta.ts` | + `validateOfertaForm()` (validación compartida testeable) |
| `src/components/views/terminal/views/ofertas/OfertaFormPanel.tsx` | Toast específico, resumen role=alert, foco, candado doble-envío, `onNewOferta`, data-field, text-[11px] |
| `src/components/views/terminal/views/ofertas/ProductRow.tsx` | Asteriscos de obligatorio, `data-field`, text-[11px] |
| `src/components/views/terminal/views/ofertas/OfertasView.tsx` | Pasa `onNewOferta={handleNewOferta}` |
| `src/hooks/api/useOfertas.ts` | `apiFetch` expone `details`/`message` del backend |
| `src/app/api/ofertas/route.ts` | `details` plano + autorización alineada con RLS (§5) |
| `src/app/api/ofertas/[ofertaId]/route.ts` | `details` plano + autorización de escritura alineada con RLS (§5) |
| `src/app/api/ofertas/export-pdf/route.ts` | `details` plano |
| `src/__tests__/contracts/oferta-contract.test.ts` | **NUEVO** — 24 pruebas unitarias |
| `e2e/ofertas.spec.ts` | **NUEVO** — 14 pruebas E2E |
| `scripts/provision-e2e-offers-identity.mjs`, `scripts/cleanup-e2e-offers-manual.mjs` | **NUEVOS** — tooling de reproducción/limpieza de esta auditoría (ejecutados una vez; documentación del procedimiento) |
| `docs/audits/CP_OFFERS_PUERTOPADRE_001.md` | Este informe |

**Migraciones creadas: ninguna** — el modelo vigente (`ofertas`, migración
`20260612000000`) es suficiente; la persistencia ya era real. No se crearon
tablas duplicadas ni un segundo sistema de ofertas.

---

## 4. Evidencia de persistencia en PostgreSQL

**Dónde se almacena:** tabla `public.ofertas` (Supabase PostgreSQL) — NO hay
estado local, Zustand, LocalStorage ni Dexie en este módulo (verificado por
inspección de `useOfertas.ts`: todo pasa por `/api/ofertas*` → Supabase).

Modelo de datos: `ofertas` (id UUID PK, `store_id` FK→stores, `numero`, `fecha`,
`objeto`, `suministrador` JSONB, `cliente` JSONB, `productos` JSONB, `status`
CHECK 5 estados, campos financieros, `created_by` FK→auth.users, timestamps).
Los ítems de oferta son **texto libre sin FK al catálogo** (diseño vigente).

**Evidencia obtenida directamente de la base de datos** (consultas REST
service-role sobre el registro creado por el flujo UI → API → BD):

```
POST /api/ofertas → 201 {"id":"98155b44-e1ee-443e-a4be-a489b3c260fd", ...}

GET /rest/v1/ofertas?id=eq.98155b44… →
  store_id   = b5d3854e…  ✓ (coincide con la tienda de prueba)
  created_by = 3236508b…  ✓ (coincide con el usuario autenticado)
  numero     = OF-2026-001, status = draft, moneda = CUP
  productos  = [{codigo:"CEM-50", descripcion:"Cemento gris 50kg",
                 cantidad:1, precio_unitario:2500}]
  subtotal   = 2500, total = 2500 (recalculados SERVER-SIDE, no confiados al cliente)
  created_at = 2026-10-31T12:11:33Z
```

**Ciclo de vida verificado (browser + BD):**

| Paso | Resultado |
|---|---|
| Crear (UI) | `201` + registro en BD + «Oferta creada exitosamente» |
| Recargar página | La oferta sigue en la lista ✓ |
| Cerrar sesión y re-entrar | La oferta sigue disponible ✓ |
| Editar (objeto + precio) | `200` + cambios persistidos + `total` recalculado (2500→2600) ✓ |
| Cambiar estado draft→Enviada | `200` + estado persistido ✓ |
| Eliminar | `200` + **soft-delete** (`status='expired'`) + desaparece de la lista ✓ |

---

## 5. Políticas RLS verificadas — y una divergencia corregida

**RLS existente (migración `20260612000000_create_ofertas.sql`), NO modificada:**

| Política | Regla |
|---|---|
| SELECT | miembro activo de la tienda O perfil admin |
| INSERT | membresía activa con rol **admin/manager/encargado** O perfil admin |
| UPDATE | igual que INSERT |
| DELETE | perfil admin O membership manager |

**Prueba de aislamiento cross-store ejecutada** (usuario ajeno sin membresía,
directo contra Supabase REST): SELECT → 0 filas; UPDATE → 0 filas afectadas;
DELETE → 0 filas afectadas; el registro permaneció intacto (verificado).
RLS **funciona y protege**.

**Divergencia encontrada y corregida:** las rutas POST/PATCH escribían con
**service_role** (bypass de RLS) y su check de autorización solo exigía
«membresía activa de CUALQUIER rol» → un **clerk** podía crear/editar ofertas
vía API aunque la política RLS INSERT/UPDATE solo lo permite a
admin/manager/encargado. Corregido: el check de las rutas ahora exige
membresía con rol admin/manager/encargado (o nivel administrativo), con
mensaje específico: «Tu rol no permite crear ofertas en esta tienda
(requiere admin, manager o encargado)». GET sigue permitiendo lectura a
cualquier miembro (igual que RLS SELECT). **Ningún permiso global nuevo;
RLS intacta; service_role no llega al navegador.**

---

## 6. Evidencia de aislamiento de CostproE2E

**Qué es CostproE2E:** proyecto Supabase **independiente** (us-east-1),
ref `lguovmvrozxgssupkwpf`, creado 2026-10-22. NO es una rama, NO es local,
NO es un alias de producción. Verificado por Management API:

```
GET /v1/projects →
  lguovmvrozxgssupkwf… name=CostproE2E   (E2E, 2026-10-22)
  wthkddeleylijmonclxg… name=CostproBD   (PRODUCCIÓN, 2026-01-03)
```

**Barreras vigentes (CP-INFRA-011, verificadas en código y en ejecución):**

1. Guard centralizado `e2e/fixtures/assert-isolated-db.ts` — fail-closed:
   - **Caso A:** cualquier URL que contenga el ref de producción se rechaza
     **sin conectar**. El `.env` de la app apunta a producción para el uso
     normal del dueño — las pruebas E2E **nunca** usaron ese destino.
   - **Caso B (remoto):** exige `E2E_TARGET_KIND=project` +
     `E2E_ALLOWED_REMOTE_REF` == ref de la URL (igualdad EXACTA) + centinela.
   - **Caso D:** RPC `public.e2e_is_isolated_db()` debe devolver `true`
     (verificado en ejecución: `true`).
2. La corrida E2E de esta misión usó un `.env` con el proyecto CostproE2E
   (guard verificado antes de cada operación); el servidor sobre
   `localhost:3000` apuntó a CostproE2E durante las pruebas y fue restaurado
   a su configuración original al terminar.
3. Fixtures de identidad por corrida (`e2e/fixtures/run-env.ts`): usuarios,
   tenant, tiendas piloto y productos **propios del run** — nunca datos de
   Puertopadre/ENVERVIDA/CENTRAL.
4. Cleanup por **id exacto** (nunca TRUNCATE/DELETE global); teardown
   verificado: `[global-teardown] Guardrail PASS — net delta = 0`.

**Hallazgo de infraestructura corregido en el entorno E2E:** la base
CostproE2E estaba desactualizada respecto al manifiesto de migraciones —
las funciones `e2e_hard_delete_user`/`e2e_hard_delete_store` (migraciones
`20261005120000/01`, incluidas en el manifiesto) NO existían en la base, por
lo que cada corrida E2E dejaba 4 usuarios residuales (91 perfiles acumulados
al iniciar la misión; el guardrail de higiene fallaba). Se aplicaron ambas
migraciones del propio repo (idempotentes, verbatim) a CostproE2E y se
limpiaron los residuos con el RPC del repo (solo emails `e2e-*`/`@costpro.test`;
los usuarios protegidos del config quedan fuera del patrón). Estado final:
**residuos 0/0, guardrail PASS net delta = 0**. Producción: **intacta**.

---

## 7. Pruebas ejecutadas y resultados

### 7.1 Unitarias (Vitest) — 24 nuevas, todas en verde

`src/__tests__/contracts/oferta-contract.test.ts`:
- Mensajes específicos por campo (numero/objeto/empresas/productos×3 reglas).
- Numeración correcta de productos en errores («producto 2»).
- **Paridad form↔backend:** toda invalidez del formulario rebota también en
  `ofertaCreateSchema` (8 casos) y la oferta válida del form pasa Zod.
- Defaults de fábrica documentados (precio 0 = el escenario del defecto).
- Cálculos financieros de regresión (subtotal, descuento, impuesto inclusivo).

### 7.2 E2E (Playwright, proyecto CostproE2E) — 14 nuevas, todas en verde

`e2e/ofertas.spec.ts` — **API (8):** 401 sin sesión; 400 con `details` por
campo (precio 0, numero vacío, sin productos); 201 + verificación directa en
PostgreSQL (store_id, created_by, productos, subtotal/total recalculados);
403 tienda ajena; 403 rol clerk (alineado con RLS); PATCH 200 + recálculo
persistido; PATCH clerk 403; DELETE 200 + `status=expired` en BD + fuera de
la lista. **UI (6):** escenario del defecto (precio vacío → toast específico
+ resumen role=alert + foco en el campo + **cero POST** + datos conservados);
formulario completo sin falso rechazo + persistencia tras recarga; doble clic
→ **un solo POST, un solo registro**; error de red → datos conservados.

**Casos de la matriz de la misión que NO aplican al modelo vigente**
(detectados por auditoría; no se inventaron funcionalidades):

| Caso de la misión | Por qué no aplica |
|---|---|
| «Fecha final anterior a inicial» | El modelo NO tiene fecha de vencimiento: solo `fecha` (única) + `validez` (texto libre «30 días»). No existe par de fechas que validar. |
| «Descuento fuera de rango» | Zod exige `descuento >= 0` sin tope superior (regla vigente); el acotado 0-100 es del **impuesto** (probado en unitarias vía schema). |
| «Producto inexistente» | Los ítems de oferta son texto libre (JSONB sin FK al catálogo) — no existe referencia que validar. |
| «Oferta vencida/desactivada no se aplica en ventas» | Las ofertas son documentos comerciales **independientes del POS**: ninguna referencia en el código de ventas (verificado). No aplican descuentos en el carrito — coherente con el copy del hub («Cotizaciones: la conversión a venta NO está implementada»). «Activar/desactivar» equivale al ciclo de estados draft→sent→accepted/rejected y soft-delete (expired), que SÍ está probado. |

### 7.3 Regresión — suite completa

`bunx vitest run` → **4834 pasan** / 3 fallan / 66 saltan. Los 3 fallos son
**preexistentes en main** (verificado con `git stash` sobre main en el mismo
entorno): `cash-report-view.test.tsx §2` y dos tests de integración live-DB
de `db-integration.test.ts` que esperan la tienda de producción
`43a4dabc…` (Puerto Padre VITALLCONS) y por tanto fallan al apuntar al
proyecto aislado. **Cero regresiones introducidas.**

TypeScript (`tsc --noEmit`): **0 errores**. ESLint: **0 errores**
(1419 warnings preexistentes en el repo). Build: ejecutado localmente
finaliza OOM-killed por el límite de 4 GB del sandbox de auditoría
(signal SIGKILL del OOM-killer, no error de compilación) — validado por CI.

---

## 8. Riesgos pendientes / decisiones para el propietario

1. **Clerk/usuario ven la vista Ofertas pero no pueden crear/editar** (comportamiento ahora alineado con RLS). Si el negocio quiere que cajeros emitan ofertas, es una decisión de producto: cambiar la política RLS + el check de ruta en el mismo PR (no hecho — no se amplían permisos sin orden).
2. **`numero` no tiene unicidad** por tienda (ningún índice único en el modelo). Duplicar el número es posible por diseño; si se quiere exigir unicidad `(store_id, numero)`, requiere migración + decisión de negocio.
3. **Los ítems de oferta no enlazan al catálogo** (texto libre). Trazabilidad producto-oferta↔inventario inexistente por diseño vigente.
4. **La base CostproE2E está desfasada del manifiesto** (113 migraciones incluidas; algunas funciones posteriores a la preparación del 2026-10-22 no estaban aplicadas — se aplicaron 2 in-band para la higiene). Recomendado: re-ejecutar el replay oficial (`docs/e2e/E2E_AISLADO.md` §6) desde el entorno del propietario cuando lo estime.
5. **Fallo preexistente** `cash-report-view.test.tsx §2` (intervalo Desde>Hasta) — fuera del alcance de esta misión; conviene tarea aparte.

---

## 9. Commit / PR / Despliegue

- **Rama:** `fix/ofertas-validacion-especifica-persistencia-20261031` (desde main `422655eae`)
- **PR:** ver enlace en la conversación de entrega (se publica con este informe; merge a criterio del propietario)
- **Despliegue:** **NO desplegado** — el PR queda abierto con CI. Ninguna
  operación contra producción fue ejecutada por esta misión (guard fail-closed).
- **Servidor local:** restaurado a su `.env` original (producción) y reactivo
  bajo PM2 al finalizar las pruebas.

---

## 10. Verificación final de aceptación (checklist de la misión)

| # | Criterio | Estado |
|---|---|---|
| 1 | Causa raíz del mensaje genérico | ✓ §2.1 (D1-D6) |
| 2 | Corrección de la causa | ✓ §2.2, verificada en browser |
| 3 | Oferta persistida realmente en PostgreSQL | ✓ §4 (evidencia por id) |
| 4 | Consulta tras recargar | ✓ §4 tabla (y E2E) |
| 5 | Edición / activación / desactivación | ✓ §4 (editar, estados, soft-delete) |
| 6 | Comportamiento en ventas | ✓ Documentado: independiente del POS por diseño (§7.2) |
| 7 | Aislamiento efectivo de CostproE2E | ✓ §6 (guard + centinela + ref exacto) |
| 8 | Ausencia de escrituras de prueba en producción | ✓ §6 (producción rechazada sin conectar; cero escrituras) |
| 9 | Resultados de pruebas unit/integración/E2E | ✓ §7 (24 + 14, verde; suite completa sin regresiones) |
| 10 | Ausencia de regresiones en módulos relacionados | ✓ §7.3 |
