> **[ RECONSTRUCTED-FROM-TRANSCRIPT — NO ES EVIDENCIA ORIGINAL ]**
> Reconstruido: 2026-08-28 · Original perdido en reinicio de sandbox (ver `../RECOVERY-20260828/68-recovery-state-report.md`)
> Original: `download/auditoria-multitienda/WAC-DATAFLOW/W6-CANONICAL-DESIGN/62-decision-register.md` (auto-titulado «W6 · 63 — Registro de decisiones (D-*)»; la deriva de numeración 62↔63 es un hecho documental del original, preservado tal cual)
> Método: verbatim desde transcripción (lectura íntegra previa a la pérdida); único añadido = este banner. SHA-256: ver `00-RECONSTRUCTION-MANIFEST.md`.

# W6 · 63 — Registro de decisiones (D-*) · ESTADO: PENDIENTE DE RATIFICACIÓN DEL DUEÑO

Nada de lo aquí propuesto entra en vigor sin ratificación. D-01 está expresamente RESERVADO al dueño (orden W6); el resto se propone para **ratificación en bloque salvo objeción** (mecánica ya usada en lotes anteriores).

| ID | Decisión | Opciones | Propuesta técnica | Estado |
|---|---|---|---|---|
| **D-01** | Significado contable oficial de `cost_average` | A) WAC operativo actual · B) promedio histórico de adquisiciones | **A**, con B conservado como métrica derivada analítica `avg_acquisition_price` (no autoritativa) | ⛔ **RESERVADO AL DUEÑO** |
| D-02 | Semántica `cost_price` | paramétrico-catálogo vs financiero | Paramétrico (`catalog_cost_reference` conceptual); prohibido en COGS/WAC/reportes; producción deja de espejarlo | PROPUESTO |
| D-03 | COGS server-side | servidor vs cliente | Servidor: units×WAC_prev, escrito idéntico en transaction_items y movement; request deprecado; UI deja de enviar costo | PROPUESTO |
| D-04 | Costo de reversión en devolución cuando no hay vínculo fiable | bloquear manual / WAC-vigente+flag / nominal 0 | WAC-vigente + `reversal_basis` flag + visibilidad en reportes | PROPUESTO |
| D-05 | Infraestructura de contra-asientos | (i) extender payment_transactions ref_type='devolution' + semántica refund · (ii) tabla doble-partida nueva financial_entries | **(i)** minimal-change compatible con CHECK amount>0 existente (hecho 59) — el monto del reembolso es positivo con dirección de flujo explícita | PROPUESTO |
| D-06 | Ajustes Δ>0 costo requerido vs default-WAC | obligatorio / default+flag | Obligatorio >0 con justificación (sin silencios) | PROPUESTO |
| D-07 | Producción: rechazo materiales a costo cero | hard error / flag administrado | Hard error por defecto + bandera admin auditada por orden | PROPUESTO |
| D-08 | Transferencia destino recalcula WAC | blend / as-is | Blend obligatorio a uc_transfer congelado | PROPUESTO |
| D-09 | Doctrina reversas | restauración byte-exacta imposible tras ventas / compensatoria apendizada con wac_before/after | Compensatoria + trazabilidad exacta de snapshots | PROPUESTO |
| D-10 | Idempotencia estandarizada | cada RPC reinventa / registry común | Registry común (`idempotency_registry`) + únicos DB como respaldo + replay-safe contract | PROPUESTO |
| D-11 | Unidades canónicas | unidades base vs presentación | Unidades BASE en WAC/kardex/movements; presentación preservada para trazabilidad | PROPUESTO |
| D-12 | Política históricos | H-OPT1 cuarentena+backfill-WAC aprobado · H-OPT2 rebuild total · H-OPT3 cosmética prohibida | Híbrido H-FINAL (doc 62): T_canon + backfill determinista WAC + utilidad pre-T etiquetada LEGACY_UNVERIFIABLE_MARGIN | PROPUESTO |

## Matriz de ratificación sugerida (para respuesta del dueño)

```
D-01 : [ ] Opción A   [ ] Opción B   [ ] Otro (definir)
D-02..D-12 (bloque) : [ ] RATIFICADO    [ ] Objeciones (numerar)
T_canon condicionada a despliegue W8 aprobado: [ ] conformidad
```

## Criterios de salida del Gate W6 → W7

1. Ratificación D-01 + bloque D-02..D-12 (o decisiones alternativas documentadas).
2. Ningún cambio de código/datos antes de eso (regla vigente).
3. W7 implementará el modelo EN EL HARNESS únicamente (`fn_recalc_wac`, RPCs v2 espejo, INV-01..14 como suite permanente), con producción READ-ONLY hasta demostración íntegra (W8 migraciones → ventana controlada).
