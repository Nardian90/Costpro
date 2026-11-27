# TIENDA-PUEBLO-REGULARIZATION — Regularización de las tres recepciones históricas

**Misión:** CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 · **Fecha:** 2026-11-27 · **Rama:** `fix/tp-regularization-20261127`
**Fuente de identidad:** **OWNER_CONFIRMATION** (decisión vinculante del propietario §0.3 — misión 2026-11-27)

---

## 1. Decisión del propietario (§0.3 — vinculante)

> **LAS TRES RECEPCIONES PERTENECEN AL PROVEEDOR TIENDA PUEBLO.** El propietario confirma expresamente que las tres recepciones históricas identificadas en el expediente anterior, con importe agregado de 19.435, corresponden al proveedor Tienda Pueblo. No existe documentación adicional disponible. Esta confirmación del propietario es la fuente de identificación. **No inventar** facturas, NIT, teléfonos, direcciones ni documentos externos. Autorizada la corrección de la vinculación histórica siguiendo el procedimiento controlado de la misión.

## 2. Los tres registros (§6.2) — identificadores EXACTOS verificados en producción (read-only)

| # | ID | reference_doc | Fecha | Total | Ítems | Estado PRE |
|---|---|---|---|---|---|---|
| 1 | `0b026405-d090-46cc-9d68-60ff7cca3783` | `—` | 2026-10-12 | **19,200.00** | Cemento blanco 5kg ×4 @ 4,800 | active · unpaid · supplier=`—` |
| 2 | `79ffb3a9-9aa5-4258-b845-78049e06d814` | `0000` | 2026-10-19 | **35.00** | Cemento Cola ×35 @ 1 | active · unpaid · supplier=`—` |
| 3 | `e564adca-c9b9-479b-bdbe-146033712085` | `0002` | 2026-10-22 | **200.00** | Canaleta gris ×100 @ 1 + Expansiones ×100 @ 1 | active · unpaid · supplier=`—` |

- **Agregado verificado HOY: 19,435.00 — coincide exactamente con lo informado.**
- Tienda: **ENERVIDA-VITALLCONS** (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`) · sin NIT/teléfono/code/notas/document_number · 0 pagos · 0 rectificativas · kardex trazable (verificado por `scripts/cpbra-historical-exceptions.mjs` re-ejecutable).

## 3. Registro canónico Tienda Pueblo (§6.3)

- **UN ÚNICO candidato** en el catálogo: `03988f54-028b-4bf2-a213-bb3a5b897062` · tienda ENERVIDA-VITALLCONS · name=`Tienda Pueblo` · is_active=true · creado 2026-10-26 · tax_id/phone/email/address **NULL** (nada que inventar).
- Sin duplicados ni ambigüedad → se usa ESE registro (el patrón del proveedor `TiendaPueblo` sin espacio del servicio SRV-20261026-00087 ya fue normalizado por la migración gobernada 20261126120100 con auditoría `SR_SUPPLIER_NORMALIZED`).
- El vínculo es por el campo textual `receipts.supplier` (el esquema de recepciones no tiene FK supplier_id; los reportes CxP por proveedor agregan por ese texto).

## 4. La operación (§6.4) — migración `20261127160000_cpbra_tienda_pueblo_receipts.sql`

- **Lista CERRADA de 3 IDs** + importes y referencias EXACTOS en los guards.
- **Guards fail-closed con detención automática:** G0 (lista íntegra / entorno sin la excepción → no-op replay-safe) · G1 (status/total/reference EXACTOS por ID; estado PARCIAL 1-2 de 3 → ABORT) · G2 (cero pagos) · G3 (canónico único y activo; sin candidato → abort, no inventa alta; múltiples → abort, no asociación arbitraria) · VERIFY (exactamente 3 filas o rollback atómico).
- **Cambio ÚNICO: `receipts.supplier` de `—` a `Tienda Pueblo`** (identidad). Intactos: identificadores, fechas, cantidades, importes, moneda, inventario, kardex, referencias históricas, estados, pagos. Sin borrado, sin recreación, sin pagos, sin movimientos financieros.
- **Trazabilidad (§6.5):** 3 filas en `audit_logs` con action `RECEIPT_SUPPLIER_REGULARIZED`, metadata con `source=OWNER_CONFIRMATION`, decisión citada §0.3, antes/después, id del proveedor canónico, `external_documentation: AUSENTE — sin factura/NIT/teléfono/dirección/documento; NO se inventó información complementaria`, `reversible=true` y `rollback_hint` (UPDATE inverso documentado). El trigger `trg_audit_receipt_changes` añade además su registro automático de cambio por fila.
- **Idempotencia:** re-aplicación → no-op verificado (sin duplicar auditoría). **Replay-safe:** entornos sin la excepción (replay E2E/despliegue fresco) → no-op.

## 5. Prueba funcional en CostproE2E (§6.7) — `scripts/e2e/cpbra-tp-regularization-e2e.mjs` — **8/8 PASS**

| # | Caso | Resultado |
|---|---|---|
| T1 | Migración sin excepción (entorno limpio) | sin error, sin filas tocadas (replay-safe) |
| T2 | Fixtures PRE con los MISMOS IDs cerrados | 3 recepciones «—», importes/referencias exactos |
| T3 | Aplicación | 3 recepciones → «Tienda Pueblo»; importes 19,200/35/200 y estados INTACTOS |
| T4 | Auditoría | 3 filas OWNER_CONFIRMATION con antes/después + AUSENCIA de doc externa + rollback_hint |
| T5 | Re-aplicación | no-op; auditoría sigue en 3 filas |
| T6 | Estado PARCIAL (1 de 3 en «—») | TP-GUARD-G1b DETIENE sin tocar nada |
| T7 | Pendiente + sin proveedor canónico | TP-GUARD-G3 DETIENE (no inventa alta) |
| T8 | Conciliación CxP | Tienda Pueblo = **19,435 exacto**; bucket «—» desaparece; kardex sin movimientos nuevos |

Defectos de test del run 1 corregidos: RAISE NOTICE no viaja en la respuesta HTTP (verificación estructural); G3 solo es alcanzable con trabajo pendiente. Higiene: **PASS — net delta = 0**.

## 6. Conciliación antes/después (§6.6)

- Importes: 19,200 + 35 + 200 = **19,435.00** — idénticos PRE/POST (guard G1 con totales exactos).
- Kardex: sin movimientos nuevos (la operación no toca stock; verificado en T8).
- Pagos: 0 antes, 0 después (guard G2 + VERIFY).
- Obligaciones: el importe NO cambia — solo la ATRIBUCIÓN pasa de «—» a Tienda Pueblo.
- Reportes CxP por proveedor: el bucket «—» ($19,435 pendientes) desaparece y aparece bajo «Tienda Pueblo»; consistencia por tienda preservada (toda la operación es intra-tienda).

## 7. Aplicación productiva (§6.7)

- Script gobernado `scripts/cpbra-tp-apply-prod.mjs` (patrón canónico §11g: guard `assert-not-production`, doble flag `ALLOW_PROD=read-only` + `ALLOW_PROD_WRITE=I_UNDERSTAND`, modo `--check` para PRE/POST, lista cerrada, idempotente).
- PRE en producción verificado read-only: exactamente 3 recepciones «—» con los IDs/importes esperados; proveedor canónico único; 0 pagos.
- Aplicación **UNA SOLA VEZ** + verificación POST (6/6 marcas) + NOTIFY pgrst + expediente de aplicación en PRODUCTION-APPLICATIONS.md.
- Resultado POST (producción): ver **PRODUCTION-APPLICATIONS.md** — las tres recepciones vinculadas a Tienda Pueblo con auditoría OWNER_CONFIRMATION ×3, importes íntegros, CxP 19,435 atribuido correctamente.

## 8. Riesgos residuales

1. La ausencia de documentación externa CONTINÚA reflejada (metadata de auditoría + este expediente): la identificación es por confirmación del propietario, NO validación con factura. Si el propietario obtiene documentación futura, puede enriquecer el proveedor por los canales normales (R-15 RPC) — no automáticamente.
2. El proveedor placeholder «—» del catálogo (`suppliers` con name='—') permanece intocado — bucket de excepciones futuras; su destino es decisión del propietario (fuera de alcance).
3. Guard de creación de recepción que exija proveedor real (recomendación pendiente del expediente anterior) — decisión del propietario, fuera de alcance de esta misión.
