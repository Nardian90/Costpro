> **[ RECONSTRUCTED-FROM-TRANSCRIPT — NO ES EVIDENCIA ORIGINAL ]**
> Reconstruido: 2026-08-28 · Archivo original perdido en reinicio de sandbox (ver `../RECOVERY-20260828/68-recovery-state-report.md`)
> Original: `download/auditoria-multitienda/WAC-DATAFLOW/W6-CANONICAL-DESIGN/67-w6-independent-critical-review.md`
> Particularidad de custodia: este documento fue REDACTADO EN LA MISMA SESIÓN (agente Super Z, respuesta al dueño del 2026-08-27/28), por lo que la transcripción contiene su texto completo y literal de autoría — la restauración es copia exacta del propio autor, no una inferencia. Único añadido = este banner. SHA-256: ver `00-RECONSTRUCTION-MANIFEST.md`.

# W6 · 67 — REVISIÓN CRÍTICA INDEPENDIENTE DEL DISEÑO CANÓNICO

Fecha: 2026-08-27 · Modo: **SOLO LECTURA** (docs + defs de código; cero ejecución contra BD; producción intocada)
Comisión: instrucción del dueño — «leer D-01..D-12 completos y hacer una revisión crítica independiente de W6, buscando contradicciones, ambigüedades contables y casos frontera antes de conceder W7».
Base material leída íntegra: `59-design-input-facts.json`, `60-core-principles-and-fields.md`, `61-event-catalog.md`, `62-historics-policy.md`, `62-decision-register.md` (autotitulado «63»), `64-consumer-remediation-map.md`, `65-sql-invariants-draft.sql`, `66-gate-w6-verdict.md`.
Cotejo forense adicional contra W1 (defs verbatim) y hallazgos W3/W4 citados por el worklog.

---

## §1. Verificaciones de afirmaciones del diseño contra código real

| # | Afirmación del diseño | Veredicto | Evidencia |
|---|---|---|---|
| V1 | «La jerarquía de costos actual es cost_at_sale → cost_average → 0 en devoluciones» | ✅ CONFIRMADA | `create_devolution_v2` L66–78: intenta `cost_at_sale` de la TX original, luego `cost_average`; escribe `movement_type='return'` (L90) |
| V2 | «Un único motor» es necesario porque existen escritores paralelos | ✅ CONFIRMADA con agravante | No son dos sino **tres** estilos de escritura: trigger `update_product_wac` (lifetime), RPCs blend canónicos, y `reverse_receipt_v2` que hace **aritmética propia sobre totales** (`v_new_total_value := v_old_total_value - qty×uc`, L78). PR-1 debe absorber también este tercer estilo |
| V3 | La devolución exige verificación acumulativa server-side | ⚠️ CONFIRMADA COMO RIESGO ABIERTO | `create_devolution_v2` **no contiene ningún `FOR UPDATE`, `pg_advisory_lock` ni relectura protegida del acumulado devuelto**: ni siquiera existe hoy la comprobación acumulativa. El diseño la añade, pero no especifica el mecanismo anti-carrera |

---

## §2. Contradicciones detectadas (CR-W6-*)

### CR-W6-1 · [ALTO] Carrera TOCTOU en el tope de devoluciones — la exigencia del dueño queda sin mecanismo

El dueño condicionó: *«returned_qty_total ≤ sold_qty … dentro de la misma transacción que registra la devolución, no solamente en TypeScript»*. El catálogo E-D responde «[CHECK-FUNC + validación RPC]», pero:

1. Un `SELECT Σ(devuelto)` seguido de `INSERT` **sin lock del recurso compartido** es vulnerable a dos devoluciones concurrentes sobre la misma transacción original: ambas leen acumulado=0, ambas pasan el tope, INV-09 queda violado retroactivamente.
2. El diseño explicita advisory-lock solo para ventas (E-V); para devoluciones, transferencias destino (blend E-T) y producción (E-P doble pata) **no declara doctrina de bloqueo ninguna**.
3. Un «CHECK-FUNC» (trigger constraint diferido) solo es seguro si bloquea fila/predicado antes de computar el acumulado.

**Corrección requerida (documento, no código):** extender R-4 a una matriz de bloqueo por evento: devolución ⇒ advisory lock por `original_transaction_id` (o lock filas de `transaction_items` originales) ANTES de leer el acumulado; transferencia/producción ⇒ lock por (tienda, producto) igual que venta. Declararlo condición de aceptación de W7.

### CR-W6-2 · [MEDIO] INV-06 (`cost_at_sale > 0` estricto post-T) contradice dos excepciones sancionadas por el propio diseño

INV-06 cuenta como violación toda venta física post-T con `COALESCE(cost_at_sale,0) <= 0`. Pero:

- **D-07** admite legitimamente PT a costo cero vía bandera admin `approve_zero_cost_material=true` (p. ej. TODOS los materiales aprobados a cero) ⇒ sus ventas tendrían COGS=0 y dispararían INV-06 sin ser defecto.
- **H-FINAL (62 §3)** permite «SKU sin entradas reconstruibles ⇒ queda 0-documentado» ⇒ las ventas de esos SKU post-T producen COGS=0 estructural.

Si INV-06 se aplica literal tras el despliegue, falsos positivos recurrentes desacreditan la suite permanente.

**Corrección requerida:** INV-06 debe excluir ventas cuyo producto esté marcado `documented_zero_wac` o cuya orden de origen tenga la bandera admin registrada (probes leen el flag); o bien prohibir la venta de SKU flaggeados sin confirmación explícita. Elección entre ambas = decisión, no detalle cosmético.

### CR-W6-3 · [MEDIO] La reversión neutra A1 desplaza la identidad PR-5 e INV-08 sin especificar cómo se materializa la varianza

Demostración numérica (estado post-Caso C+compra): stock 180 @ WAC 200 tras compra posterior; se devuelve qty=20 vendida cuando WAC era 150 ⇒ `c_rev=150` congelado.

```text
Valor antes          = S_prev × WAC_prev
Valor físico entrado = 20 × 150 = 3 000
Aumento teórico A1   = 20 × 200 = 4 000   (stock×WAC sube eso)
Varianza             = −1 000               (c_rev ≠ WAC_vigente)
```

Consecuencias no resueltas: kardex acredita `devolution_in` uc=c_rev (+3 000 al balance_total_value) mientras `stock_current × cost_average` crece 4 000 ⇒ **INV-08 queda en rojo permanente hasta el próximo evento blend, y aun blend no reconcilia la asimetría kardex↔cache salvo regla explícita**. El catálogo nombra «línea varianza por base de reversión [transparente]» pero no define su materialización física (¿columna? ¿fila contable aparte? ¿tolerancia en INV-08?).

**Corrección requerida:** O cualquiera de: (a) INV-08 ignora ventanas marcadas con basis-mismatch; (b) el kardex publica devolution_in en DOS patas (units×WAC_vigente + fila varianza firmada); (c) se exige absorción inmediata mediante evento interno documentado. Además: la propuesta del dueño de una matriz formal de conservación de valor NO tiene aún probe SQL (ver CR-W6-5).

### CR-W6-4 · [BAJO] Superficie de migración de D-05(i) subestimada y ENUM-CANDIDATE prometido pero ausente

- D-05(i) justifica compatibilidad por el hecho 59 (`CHECK amount>0`), pero omite que `payment_transactions_ref_type_check` es un ARRAY cerrado sin `'devolution'`: insertar ese ref_type exige ALTER CONSTRAINT + validación nueva tipo `sale_ref_check` análoga (`ref_type<>'devolution' OR ref_id=devolution_id`). Es scope de W8 correcto, pero el registro de decisiones debe reflejarlo para que la ratificación sea informada.
- Doc 61 promete «cambios de enum marcados [ENUM-CANDIDATE]» y no marca ninguno, aunque su texto usa tipos inexistentes (`devolution_in` ya vive en comentarios de código pero el enum lo confirma 59… el hueco real: **no existen `transfer_reverse`, `return_reverse`, `adjustment_reverse`**, y sí existen RPCs `reverse_devolution`/`reverse_adjustment` activas hoy escribiendo tipos del enum residual ('void'/'return'). ER cubre «venta/recepción/cierre» solo nominalmente.
- Asimismo: D-05(i) no define el tratamiento de reembolsos vía `store_credit` (permitido por `devolutions_payment_method_check`) respecto de payment_transactions y de INV-10 (ver CR-W6-7).

### CR-W6-5 · [MEDIO] La matriz de conservación de valor exigida por el dueño no está redactada como artefacto ni como probe

El dueño pidió expresamente, como condición previa a W7:

```text
Valor antes + entradas − salidas ± reversión = Valor después
Σ transaction_items.COGS == Σ stock_movements.unit_cost × quantity   (mismo evento)
COGS_revertido == COGS_original_de_la_cantidad_devuelta  (no WAC_actual salvo decisión)
```

Estado en los documentos: la segunda ecuación existe como INV-07; la tercera como política E-D/D-04; **la primera (conservación de valor global por producto/tienda/ventana) no aparece ni como definición analítica ni como INV-15 SQL**. INV-01 conserva cantidades, no valores.

**Corrección requerida:** redactar **INV-15 VALUE-CONSERVATION**: por (store, product, ventana):

```text
Δ(stock×ca) ≈ Σ(entradas value) − Σ(salidas value) ± Σ(varianza de base marcada)
```

con tolerancia declarada y columna/varianza etiquetada según resolución de CR-W6-3. Es la pieza que convierte la formulación del dueño en criterio automatizado.

### CR-W6-6 · [MEDIO] Backfill determinista ≠ backfill fiel: no se define el tratamiento de entradas pre-T con costo ausente

Doc 62 demuestra correctamente que el PMP canónico es reconstruible sin los costos de venta venenados. Pero la reconstrucción por replay cronológico ingiere TODA entrada «que altera valor»; si dentro de la serie histórica existen entradas con `unit_cost NULL/0` (ajustes+ heredados, `transfer_in` pre-remediación, semillas `initial` — tipos presentes en el enum 59 aunque W4 observó 0 movimientos reversionales en prod actual), el replay es determinista pero reproduce basura con apariencia de dato limpio.

**Corrección requerida:** regla explícita para input pre-T con costo nulo/cero durante el replay: (i) excluirlo del numerador con marca `recon_gap` por SKU, o (ii) abortar ese SKU como 0-documentado; nunca incluir silenciosamente un cero como costo válido. Añadir al job un control tipo Puerto Padre (tienda íntegra como muestra de calibración donde MATCH hoy).

### CR-W6-7 · [BAJO] INV-10 vs reembolsos `store_credit`

`devolutions_payment_method_check` admite `store_credit`. Si el reembolso vía crédito en tienda no genera fila espejo en `payment_transactions`, INV-10 marca falsas violaciones post-T para devoluciones legales. Definir: (a) exigir fila espejo refund también para store_credit (recomendado — mantiene caja cuadrada), o (b) exención explícita en el probe.

### CR-W6-8 · [BAJO] Desalineación de numeración entre las expectativas del dueño y el registro D-*

El dueño enumeró: D-04 = WAC/eventos que lo modifican · D-08 = ajustes · etc. El registro material usa: D-04 = costo de reversión · D-06 = ajustes · D-08 = transferencia blend. La matriz de ratificación debe incorporar una **tabla de mapeo** (expectativa dueño ↔ ID registro ↔ doc de sustento) para evitar una ratificación cruzada errónea.

### CR-W6-9 · [INFO] Semántica stock-cero no definida

Ningún documento resuelve: tras agotar existencias (stock=0), ¿el WAC retenido persiste como memoria para la siguiente entrada, o la siguiente recepción re-siembra WAC=costo nuevo? La fórmula blend produce ambos resultados según se decida conservar o reiniciar `ca` en el evento que deja stock=0. El dueño listó «stock cero» entre los deberes de demostración de W7; el diseño debiera fijarlo AHORA porque afecta valoración inmediatamente posterior (y afecta a casos E y F del harness). Recomendación técnica: **conservar WAC** (sin reinicio implícito) — evita ventas a costo-cero accidentales tras re-siembra.

### CR-W6-10 · [BAJO] Granularidad del join en INV-07

`sm.quantity_change = -ti.quantity` ambigua cuando una misma transacción contiene dos líneas del mismo producto (mismo producto vendido en dos renglones). Para lectura de gate en producción conviene vincular por referencia explícita item↔movement o agregar por (txn, product) sumando ambos lados. No bloqueante para harness; sí para reportes de certificación.

### CR-W6-11 · [BAJO] Idempotencia: coexistencia de únicos globales vs por-tienda

Hecho 59 muestra SIMULTÁNEAMENTE `transactions_idempotency_key_key UNIQUE(idempotency_key)` global y el parcial `(key, store_id)`. Si la doctrina multi-tienda del registry común no armoniza esto, un retry legítimo con misma clave desde otra tienda colisiona contra el único global. Decidir: clave globalmente única (simple, segura) o compuesta — pero una sola.

---

## §3. Casos frontera verificados y cobertos adecuadamente (créditos)

| Cobertura | Evaluación |
|---|---|
| Venta congela COGS y no retro-recalcula WAC (exigencia textual del dueño) | ✅ E-V «WAC_post = WAC_prev», paridad item/movement, cliente ignorado |
| Prohibición backfill cosmético / COGS retrospectivo ficticio | ✅ H-OPT3 PROHIBIDA; LEGACY_UNVERIFIABLE_MARGIN defendible ante la evidencia 83–100% veneno |
| Separación WAC operativo ≠ promedio histórico de adquisiciones | ✅ Núcleo conceptual correcto; B como métrica derivada no autoritativa |
| Recepción con B4 costo>0 + variantes→unidades base | ✅ Coherente con PR-7/D-11 |
| Ajuste Δ>0 sin default silencioso; Δ<0 retiro a WAC_prev sin piso | ✅ Cierra DF-11/GREATEST |
| Producción: acumulación ponderada de parciales y rechazo costo-cero | ✅ Corrige sobrescritura actual (WF06); única salvedad = interacción con INV-06 (CR-W6-2) |

## §4. Integridad documental de la cadena (higiene previa a ratificación)

1. **Deriva de numeración**: archivo `62-decision-register.md` autotitulado «W6 · 63»; mapa deremediación archivado como `64-…` pero citado como «doc 63» en 60/61; no existe ningún archivo 63. Las decisiones se referencian por número ⇒ **renumerar antes de someter a ratificación**, so pena de ratificar contra documento equivocado.
2. Los tres documentos clave citan mutuamente («registro 62», «doc 62/63») sin hashes; sugerencia mínima: anexo SHA256 de 60–65 en la versión final sometida (mismo estándar del freeze manifest).

## §5. Veredicto

```text
W6 COMO ESPECIFICACIÓN ......... SÓLIDA (núcleo contable correcto; trazabilidad real a evidencia)
W6 COMO RATIFICACIÓN CONTABLE .. NO LISTO EN ESTE ESTADO
   Bloqueantes de enmienda:  CR-W6-1 (lock doctrine devoluciones/multi-evento)
                             CR-W6-2 (INV-06 vs excepciones sancionadas)
                             CR-W6-3 (materialización varianza A1 / reconciliación INV-08)
                             CR-W6-5 (matriz de conservación de valor como INV-15)
   Menores [w6.1-patch]:     CR-W6-4, 6, 7, 8, 9, 10, 11 + higiene §4
D-01 = A ....................... RECOMENDACIÓN TÉCNICA MANTENIDA SIN CAMBIOS
                                  (la revisión no encuentra contradicción interna en la opción;
                                   sus efectos frontera quedan en W7/wac-cases, como exige el dueño)
W7 ............................ SIGUE BLOQUEADO
```

Ruta propuesta (documento puro, sin código ni BD): **mini-ronda W6.1** — parchear 60/61/65 con las cuatro correcciones bloqueantes + tabla de mapeo D-* + renumeración; re-emisión 60b/61b/65b con diff explícito; entonces sí la matriz de ratificación queda apta para decisión del dueño. Ninguna palabra de este informe autoriza ejecución.
