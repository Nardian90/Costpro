# RECT004 — SEMÁNTICA DE `reversal_of` EN CP-FIN Y MECANISMO CORRECTIVO VALIDADO
## CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004 · §6 de la misión

**Fecha:** 2026-11-15 · **Estado:** análisis completado y DEMOSTRADO en BD E2E aislada (T1–T13, net delta 0)
**Producción:** INTACTA (este análisis es lectura de código + pruebas en la base aislada lguovmvrozxgssupkwpf).

---

## 1. Alcance y método

La propuesta RECT-1 utiliza `fin_entries.reversal_of` para corregir **parcialmente** (151.299.851 de 192.039.436 CUP)
el asiento de reconocimiento `93bb5da9-0afd-4325-baad-a275710062c5` de FAC-VITALLCONS-001. Esta sección demuestra,
con el **código real** y con **pruebas ejecutables del motor real** (script `scripts/m050d-rect004-reversal-semantics.mjs`,
evidencia `rect004-reversal-semantics.json`), el comportamiento exacto del sistema. **Ninguna conclusión se deduce del
nombre de la columna.**

Superficies auditadas (código): migración base `20261113120000_cp_fin_partida_doble_base.sql` (esquema, índices,
constraints), motor `20261113120100_cp_fin_partida_doble_motor.sql` (funciones, triggers, informes), endurecimiento
`20261113120200_cp_fin_endurecimiento_rls.sql` (RLS/GRANTS), migraciones correctivas posteriores
(`20261113120400`, `20261114120000`, `20261114140000`), y el estado **vivo** de las funciones en producción
(Management API, read-only) y en la BD aislada.

---

## 2. Hechos demostrados del código (con línea y archivo)

### 2.1 Esquema PostgreSQL (`fin_entries`)

| Elemento | Definición real | Consecuencia |
|---|---|---|
| `reversal_of` | `uuid REFERENCES public.fin_entries (id)`, nullable | **FK pura**: valida que el asiento enlazado exista; NO valida importes ni cardinalidad |
| `status` | `CHECK (status IN ('posted','reversed'))` | Dos estados; quién lo cambia: ver §2.3 |
| `uq_fin_entries_doc_event` | `UNIQUE (document_type, document_id, event, COALESCE(payment_ref, uuid-0)) WHERE document_id IS NOT NULL` | **Un asiento por tupla (tipo-doc, doc, evento, pago)**: bloquea reversiones parciales duplicadas de la MISMA tupla |
| `idx_fin_entries_reversal` | índice parcial sobre `reversal_of` | Solo optimiza consultas; no restringe |
| Triggers sobre `fin_entries`/`fin_movements` | **NINGUNO** | Ningún automatismo al insertar una reversión; el `status` del original NO se toca |

### 2.2 Motor de anulación (`fin_post_document_annulment`, motor.sql §6)

```sql
FOR e IN SELECT * FROM fin_entries
  WHERE document_type = p_doctype AND document_id = p_document_id
    AND status = 'posted' AND event IN ('reconocimiento','pago') LOOP
  IF EXISTS (SELECT 1 FROM fin_entries x WHERE x.reversal_of = e.id) THEN CONTINUE; END IF;  -- idempotencia
  INSERT INTO fin_entries (..., event='anulacion', reversal_of = e.id, ...)                    -- compensatorio ENLAZADO
  FOR m IN SELECT * FROM fin_movements WHERE entry_id = e.id LOOP
    INSERT ... sense = CASE WHEN m.sense='debito' THEN 'credito' ELSE 'debito' END, amount = m.amount  -- INVERSIÓN COMPLETA
  END LOOP;
  UPDATE fin_entries SET status = 'reversed' WHERE id = e.id;                                  -- marca el original
END LOOP;
```

* El motor **solo genera anulaciones COMPLETAS**: copia todas las filas con sentidos invertidos y el MISMO importe.
* Idempotencia: si existe CUALQUIER `reversal_of` apuntando al asiento → lo salta (y no marca `reversed`).
* `pg_advisory_xact_lock(hashtext('fin:'||doctype||':'||doc))` serializa anulaciones concurrentes del mismo documento.
* `status='reversed'` lo escribe **únicamente** esta función. Ningún trigger, ningún informe, ninguna otra vía.

### 2.3 Triggers de contabilización (motor.sql §7)

`fin_trg_receipts` (y equivalentes de ventas/devoluciones/vales/ajustes) llaman a `fin_post_document_safe` cuando el
documento pasa a su estado activo y a `fin_post_annulment_safe` cuando pasa a `voided/reversed`. La anulación de una
recepción (única vía de "nota de crédito a proveedor": tipo documental `DEVOLUCION_PROV` = "reversa de recepción")
utiliza exactamente el camino del §2.2.

### 2.4 Posting y validación de equilibrio (`fin_post_document`, motor.sql §5)

* Idempotencia por tupla `(doctype, doc, event, payment_ref)` → `RETURN NULL` si ya existe.
* `IF p_event NOT IN ('apertura','ajuste_manual') AND abs(v_debit-v_credit)>0.01 THEN RAISE` —
  **`ajuste_manual` está EXENTO del chequeo D=C del motor**: la rectificación debe verificar su propio equilibrio
  (el prototipo m049/m050e lo verifica por asiento).
* No existe ninguna función del motor que genere `ajuste_manual`: los crea el procedimiento gobernado (con ids
  deterministas + `ON CONFLICT DO NOTHING`).

### 2.5 Informes y cálculo de saldos (motor.sql §§9-10)

`fin_get_balance_sheet`, `fin_get_income_statement`, `fin_get_dashboard`, `fin_get_category_detail` calculan
**sumas puras de `fin_movements` SIN filtrar `status` y sin lógica especial de `reversal_of`**. Una reversión
(completa o parcial) contribuye sus movimientos y netea aritméticamente contra el original. El "completamente
revertido" NO es un concepto de los reportes: la verdad contable es la suma de movimientos.

### 2.6 Defecto histórico corregido (verificación de supervivencia)

La versión original del motor computaba el total de recepciones con `ri.unit_cost_cup`, columna INEXISTENTE
(corregido por `20261113120400`: hoy usa `ri.unit_cost * coalesce(nullif(ri.tasa_cambio_recepcion,0),1)`).
Verificado el estado VIVO en producción y en la BD aislada: ambas tienen la versión corregida. Sin acción.

---

## 3. Respuestas a las 8 preguntas de la misión (evidencia ejecutable)

| # | Pregunta | Respuesta demostrada | Evidencia |
|---|---|---|---|
| 1 | ¿Permite el sistema reversiones parciales? | **La BD sí** (FK sin constraint de importe/cardinalidad; inserción de parcial 3.000 sobre original 5.000 aceptada). **El motor de anulación no las genera** (solo completas). El patrón válido es un asiento `ajuste_manual` compensatorio enlazado (RECT-1) | T2 (m050d) |
| 2 | ¿`reversal_of` es solo para anulaciones completas? | **Sí por diseño del motor** (comentario de tabla: "anulacion = asiento compensatorio enlazado vía reversal_of (nunca UPDATE)"); la anulación copia el 100% de los movimientos invertidos | T1 + motor.sql §6 |
| 3 | ¿Restricción contra múltiples reversiones parciales del mismo asiento? | **NO existe constraint de cardinalidad**. Protección efectiva: (a) índice único por tupla — segunda parcial con misma tupla RECHAZADA (`duplicate key ... uq_fin_entries_doc_event`); (b) ids deterministas + `ON CONFLICT (id)`; (c) verificación de importe pendiente del runbook. Con evento/texto diferente la BD NO protege → control procedimental obligatorio | T3 |
| 4 | ¿Cómo determina el sistema que un asiento está completamente revertido? | **`status='reversed'`, escrito solo por la función de anulación** tras crear la compensatoria completa. Los parciales NO lo tocan (original queda `posted` — correcto: aún queda deuda viva). Los reportes usan aritmética de movimientos, no status | T1/T2/T11 |
| 5 | ¿Una reversión parcial marcaría incorrectamente el original como anulado? | **No marca** (status queda `posted`), PERO **BLOQUEA la anulación completa futura**: al anular el documento tras un parcial, el `EXISTS(reversal_of)` del motor salta el asiento original — el residual NO se compensa automáticamente. **TRAMPA CONFIRMADA Y DEMOSTRADA** | T12 |
| 6 | ¿Cómo se presentan ambas operaciones en historial y estados financieros? | Historial (`SELECT ... WHERE document_id`): TODOS los asientos visibles con su `reversal_of`. Estados financieros: sumas de movimientos — la completa netea a 0; la parcial aporta su importe. Sin duplicación ni ocultamiento | T10/T11 |
| 7 | ¿Cómo se impide revertir dos veces el mismo importe? | Motor: `EXISTS(reversal_of)` + advisory lock (anulación repetida → 0 asientos). Procedimiento: índice único de tupla + id determinista + `ON CONFLICT` + verificación pre-flight del importe pendiente dentro de la MISMA transacción | T4/T5/T3/P8-P9 (m050e) |
| 8 | ¿Y si otra operación modifica el saldo entre dry-run y ejecución? | La reversión es **compensatoria por importes fijos** (no recalcula del saldo): los montos no cambian. La ventana TOCTOU se cierra con: transacción única + advisory lock + **pre-flight dentro de la transacción** (verificar deuda pendiente/uc intactos ANTES de escribir, mismo bloqueo). Estados intermedios: consistentes y consultables | T9 + runbook §pre-flight |

---

## 4. Pruebas del motor real (BD aislada, T1–T13 — TODAS PASS, net delta 0)

| Prueba | Escenario | Resultado |
|---|---|---|
| T1 | Reversión completa vía trigger real (`UPDATE receipts SET status='voided'`) | Asiento `anulacion` con `reversal_of`→original; sentidos invertidos 1:1; **mismo importe**; original `reversed`; idempotente |
| T2 | Reversión parcial (patrón RECT-1, 60%) | Aceptada; original **sigue `posted`**; saldos netean exacto (D=C del parcial verificado) |
| T3 | Dos parciales sucesivas del mismo asiento | Misma tupla → **rechazada por `uq_fin_entries_doc_event`**; misma id → no-op; evento diferente → BD permite (documentado) |
| T4 | Anulación duplicada (re-llamada del motor) | Devuelve 0 — idempotencia del motor |
| T5 | Reintento de solicitud ya ejecutada | 0 cambios; asientos del documento = 2 (original + parcial) |
| T6 | Reversión superior al original (9.999 sobre 2.000) | **BD LA ACEPTA** (no hay constraint de importe) → ROLLBACK → 0 residuo. El control es del procedimiento (pre-flight) |
| T7 | Concurrencia (2 conexiones, misma reversión) | 1 inserción, 1 fila, 2 movimientos — sin duplicación (advisory lock + id determinista + unique) |
| T8 | Rollback de transacción | BEGIN→INSERT→ROLLBACK: cero residuo |
| T9 | Reanudación tras interrupción | Estado intermedio consistente (original posted, parcial enlazado, saldas correctas) — la reanudación decide aplicar/revertir el resto |
| T10 | Consulta del historial | Todas las operaciones visibles con vínculos `reversal_of` |
| T11 | Saldos antes/después | Neteo exacto por movimientos: A 0 + B 2.000 + C 1.000 = 3.000/3.000 |
| T12 | **LA TRAMPA**: anular el documento tras parcial | **El motor NO compensa el residual** (salta por EXISTS). Mitigación documentada (runbook) |
| T13 | Re-post idempotente | `fin_post_document` repetido → NULL; 1 reconocimiento |

Evidencia completa: `docs/audits/valuation-rectification-release-gate-004/rect004-reversal-semantics.json`
(hashes por sección, evidencia por pregunta, saldos antes/después, net delta 0).

---

## 5. Mecanismo correctivo validado (diseño confirmado)

**RECT-1 NO fuerza `reversal_of` contra su diseño ni elude restricciones**: la relación es una FK válida cuyo
propósito declarado es enlazar asientos compensatorios ("nunca UPDATE del histórico") — exactamente lo que RECT-1
hace. Lo que RECT-1 NO usa es la FUNCIÓN de anulación (que solo hace completas); usa un asiento `ajuste_manual`
gobernado con:

1. **Vínculo inequívoco**: `reversal_of = 93bb5da9` (asiento original) + `document_id = fd9d6c88` (recepción) +
   `document_number = 'FAC-VITALLCONS-001-RECT'` + descripción con misión/motivo/importe.
2. **Idempotencia de motor**: la tupla `(RECEPCION, fd9d6c88, ajuste_manual, payment_ref-0)` es ÚNICA por índice
   — una segunda RECT-1 idéntica es imposible a nivel BD; además id determinista + `ON CONFLICT DO NOTHING`.
3. **Equilibrio auto-verificado** (el motor exime `ajuste_manual` del chequeo D=C): el procedimiento verifica D=C
   por asiento tras aplicar.
4. **Reversibilidad**: rollback demostrado byte a byte (m050e P12) + alternativa canónica no destructiva (asiento
   compensatorio inverso) documentada en el runbook.
5. **Controles de importe**: pre-flight dentro de la transacción (deuda pendiente ≥ importe; uc intactos;
   inexistencia de RECT previa) — porque la BD no valida importes (T6).

**Cambio de diseño financiero: NINGUNO.** El diseño RECT-1/RECT-2 de la misión 003 se conserva íntegro; esta
misión añade las verificaciones que la semántica real exige (pre-flight, mitigación de la trampa T12, equilibrio
auto-verificado) y las demuestra en E2E.

---

## 6. Mitigación de la trampa T12 (obligatoria en producción)

Con RECT-1 aplicado, si alguien anulara FAC-VITALLCONS-001 (`status='voided'`):

* El motor saltaría la compensación del asiento `93bb5da9` (EXISTE `reversal_of` → CONTINUE).
* El residual de 40.739.585 CUP **no se compensaría automáticamente**.
* **Regla del runbook**: la anulación de un documento rectificado parcialmente exige un asiento manual del
  residual, verificando que la deuda pendiente del proveedor siga siendo la esperada. Queda documentado como
  criterio de aborto y como control post-aplicación permanente.

---

## 7. Conclusión

`reversal_of` **admite de forma segura** la rectificación parcial de RECT-1 bajo el procedimiento gobernado
propuesto: la arquitectura de partida doble del sistema (sumas de movimientos, compensatorios enlazados, índice
único por tupla) netea los importes correctamente, preserva el historial y es idempotente. Los riesgos residuales
(cardinalidad no limitada por la BD, ausencia de validación de importes, bloqueo de anulaciones futuras) están
cubiertos por controles procedimentales verificados y por la evidencia T1–T13. **No se fuerza el mecanismo ni se
debilita ningún control del motor.**
