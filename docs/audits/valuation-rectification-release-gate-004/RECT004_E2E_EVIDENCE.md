# RECT004 — EVIDENCIA E2E COMPLETA DE LA RECTIFICACIÓN FINAL
## CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004 · §12 de la misión

**Fecha:** 2026-11-15 · **Veredicto: TODO_PASS (10/10 criterios + net delta 0)**
**BD de pruebas:** CostproE2E `lguovmvrozxgssupkwpf` (AISLADA — sentinela `e2e_is_isolated_db()=true` por REST y SQL, fail-closed)
**Scripts:** `scripts/m050d-rect004-reversal-semantics.mjs` (semántica del motor, T1–T13) y
`scripts/m050e-rect004-e2e-prototipo.mjs` (prototipo de rectificación, P0–P16). Ambos con guard
`assert-not-production` (CP-INFRA-020) y `ON CONFLICT` idempotente; re-ejecutables.

---

## 1. Prototipo final m050e — RECT-1 y RECT-2 SEPARABLES (P0–P16, TODAS OK)

Réplica fiel del estado de producción (FVC defectuosa 151.300.000 con 2 líneas USD@680 · kardex 21 movimientos ·
12 asientos réplica con el COGS del MOTOR a 1 CUP/u incluidas las 2 ventas con kardex uc=0 · 6 vales con asiento
(88 CUP) · 3 vales y 2 ajustes SIN asiento — brechas documentales reales).

| Paso | Prueba exigida por la misión | Resultado |
|---|---|---|
| P0 | Preflight: sentinela REST+SQL + limpieza previa | OK (7,2 s) |
| P1 | Semilla réplica (estado defectuoso verificado) | OK (10,1 s) |
| — | Estado inicial: total 151.300.000 · líneas 2500/1000 USD@680 · salidas uc=0: 7 filas/26 u · COGS 7 · GAS_VALES 88 · ACT neto 151.299.905 · CXP 151.300.000 · 12 asientos · 34 movimientos | hash SHA-256 capturado |
| P3 | **Aplicación PARCIAL (solo RECT-1)** — interrupción simulada | OK — RECT-1 aplicado, RECT-2 NO |
| P4 | **Verificación del estado intermedio** | OK: RECT-1 presente (total 149 · capas uc=1 ×2 · ACT 54 · CXP 149) y RECT-2 AUSENTE (26 salidas uc=0 · GAS_VALES 88 · GAS_PERDIDA 0 · 13 asientos/36 movs) — **separable y consistente** |
| P5 | **Idempotencia de RECT-1** | OK: re-ejecución → 0 cambios |
| P6 | **Reanudación tras interrupción (aplicar RECT-2)** | OK |
| P7 | **Verificación final completa** | OK: total 149 · salidas uc=0: 0 · **COGS motor 7 INTACTO** · GAS_VALES 94 · GAS_PERDIDA_INV 18 · **ACT neto = 30 = valor en libros (30 u × 1)** · CXP 149 · 14 asientos/39 movimientos · **D=C en los 14 asientos** · precios de venta 2.000/1.000 INTACTOS · existencias 10/20 INTACTAS · `reversal_of` de RECT-1 → asiento original |
| P8 | **Idempotencia total (repetición de la misma solicitud)** | OK: RECT-1 + RECT-2 re-ejecutados → 0 cambios |
| P9 | **Concurrencia** (2 conexiones simultáneas sobre RECT-1) | OK: 0+0 inserciones (ya aplicado, advisory lock + ON CONFLICT), 1 fila única — sin duplicado |
| P10 | **Rollback INDIVIDUAL de RECT-2** | OK: 26 salidas vuelven a uc=0 · GAS_VALES 88 · GAS_PERDIDA 0 · 13 asientos — **RECT-1 SIGUE aplicado** (total 149, ACT 54) |
| P11 | Re-aplicar RECT-2 (reanudación inversa) | OK: vuelve al estado final completo |
| P12 | **Rollback TOTAL (RECT-2 + RECT-1)** | OK: restauración **BYTE A BYTE** — hash del estado = hash del estado inicial; 12 asientos, 34 movimientos, 0 auditoría RECT004; líneas/cabecera/capas restauradas a 2500/1000 USD@680 · 151.300.000 · uc 680.000/1.700.000 |
| P13 | **Replay completo re-aplicable** | OK: desde el estado original → estado final exacto |
| P14 | **Controles de producción y permisos NO debilitados** | OK (ver §3) |
| P15 | **Producción INTACTA** (re-verificación read-only final) | OK (ver §4) |
| P16 | **Limpieza NET DELTA 0** | OK: delta 0 en las 10 tablas tocadas |

**Veredicto (calculado por el propio script):**
```json
{"separables": true, "idempotencia": true, "interrupción_reanudación": true, "rollback_individual": true,
 "rollback_total_byte_a_byte": true, "replay": true, "concurrencia": true, "controles_intactos": true,
 "produccion_intacta": true, "net_delta_0": true, "TODO_PASS": true}
```

Si una operación falla: cada RECT es una transacción independiente con advisory lock — no deja estado ambiguo;
la re-ejecución es no-op (0 cambios) y jamás duplica el efecto (índice único + id determinista + ON CONFLICT).

---

## 2. Semántica del motor (m050d, T1–T13 — TODAS OK, net delta 0)

Ejecutadas contra el MOTOR REAL (funciones `fin_post_document` / `fin_post_document_annulment` / triggers
reales) en la BD aislada:

| Prueba | Resultado |
|---|---|
| T1 reversión completa vía trigger | OK — compensatorio enlazado, sentidos invertidos, mismo importe, original `reversed` |
| T2 reversión parcial (patrón RECT-1) | OK — original sigue `posted`; saldos netean (4.000/4.000) |
| T3 dos parciales sucesivas | OK — misma tupla RECHAZADA por índice único; misma id no-op |
| T4 anulación duplicada | OK — devuelve 0 (idempotente) |
| T5 reintento de solicitud ejecutada | OK — 0 cambios |
| T6 importe excesivo (9.999 sobre 2.000) | OK (evidencia) — la BD lo ACEPTA: control procedimental obligatorio; rollback → 0 residuo |
| T7 concurrencia | OK — 1 inserción, 1 fila, 2 movimientos |
| T8 rollback de transacción | OK — cero residuo |
| T9 reanudación tras interrupción | OK — estado intermedio consistente (ACT 3.000) |
| T10 historial | OK — todas las operaciones visibles con `reversal_of` |
| T11 saldos antes/después | OK — neteo exacto 3.000/3.000 |
| T12 TRAMPA (anular tras parcial) | OK (evidencia) — el residual NO se compensa automáticamente; mitigación documentada |
| T13 re-post idempotente | OK — NULL; 1 reconocimiento |
| Limpieza | OK — NET DELTA 0 (8 tablas) |

Evidencia íntegra (por pregunta de la misión, saldos, historial, hashes): `rect004-reversal-semantics.json`.

---

## 3. Controles de producción y permisos NO debilitados (P14)

| Control verificado en la BD aislada | Resultado |
|---|---|
| M021 inmutabilidad económica sin escape hatch (`UPDATE receipt_items` con `app.allow_receipt_item_edit='off'`) | **RECHAZADO** (`ERR_RECEIPT_ITEM_IMMUTABLE`) — el hatch sigue siendo obligatorio y gobernado |
| RLS sobre `fin_entries` / `fin_movements` | `rls=true` y `force=true` (FORCE ROW LEVEL SECURITY activa) |
| `fin_post_document` ejecutable por `anon` / `authenticated` | `false` / `false` (REVOKE del motor intacto) |
| `fin_entries` INSERT/SELECT para `anon` | `false` / `false` |
| Sentinela de aislamiento | `true` (REST y SQL) |

---

## 4. Producción INTACTA — re-verificación final read-only (P15)

Canal: Management API `/database/query` (exclusivamente SELECT). Corte: 2026-11-14T20:17:22Z UTC.

| Verificación | Valor |
|---|---|
| `receipts.total_cost` de la FVC | **192.039.436,00** (idéntico) |
| Líneas de recepción | **101** (idéntico) |
| Asientos de la FVC | **1** (reconocimiento — idéntico) |
| Reversiones de la FVC (`reversal_of`) | **0** (ninguna RECT aplicada en producción) |
| Kardex SKU 111/112 | **21 movimientos** (idéntico) |
| `payment_status` | **unpaid** (idéntico) |

**Conclusión: la rectificación NO se ejecutó en producción.** Toda escritura ocurrió en la BD aislada
(sentinela verificada en cada script, fail-closed), con net delta 0 al cierre.

---

## 5. Hashes de evidencia (SHA-256)

| Evidencia | Contenido | SHA-256 |
|---|---|---|
| `m050a-fase0-probe.json` | Probe de entorno (producción read-only + sentinela E2E) | ver RECT004_SHA256SUMS.txt |
| `rect004-faseDP-snapshot.json` | Snapshot DP de producción (DP-1/DP-2/DP-3 + protección + post-corte), hashes por sección | ver RECT004_SHA256SUMS.txt |
| `rect004-fase-analisis.json` | Análisis (diff 003→004, protección 75 líneas, conciliaciones) | ver RECT004_SHA256SUMS.txt |
| `rect004-reversal-semantics.json` | Semántica `reversal_of` (T1–T13 + respuestas §6) | ver RECT004_SHA256SUMS.txt |
| `rect004-e2e-prototipo.json` | Prototipo final (P0–P16, estados antes/intermedio/final/rollback, permisos, producción) | ver RECT004_SHA256SUMS.txt |

El manifiesto completo de los 10 entregables está en `RECT004_SHA256SUMS.txt` (generado al cierre del expediente).

---

## 6. Re-ejecutabilidad

* `node scripts/m050d-rect004-reversal-semantics.mjs` — re-ejecutable (limpieza previa idempotente, net delta 0).
* `node scripts/m050e-rect004-e2e-prototipo.mjs` — re-ejecutable (P0 limpia residuos previos; baseline propia).
* Requisitos: `.env` del repositorio (vars `E2E_SUPABASE_*`) y `bun install --frozen-lockfile`.
* Ambos scripts están declarados en `scripts/lib/writers.manifest.json` (isolationProtected) y protegidos con
  `assert-not-production` (CP-INFRA-020) — los gates `check-writers` y `check-destructive-guard` del CI pasan.
