> **[ RECONSTRUCTED-FROM-TRANSCRIPT — NO ES EVIDENCIA ORIGINAL ]**
> Reconstruido: 2026-08-28 · Original perdido en reinicio de sandbox (ver `../RECOVERY-20260828/68-recovery-state-report.md`)
> Original: `download/auditoria-multitienda/WAC-DATAFLOW/W6-CANONICAL-DESIGN/66-gate-w6-verdict.md`
> Método: verbatim desde transcripción (lectura íntegra previa a la pérdida); único añadido = este banner. SHA-256: ver `00-RECONSTRUCTION-MANIFEST.md`.

# W6 · 66 — GATE W6: COSTING CANONICAL DESIGN / DECISION GATE — veredicto

Fecha: 2026-08-27 · Modo: solo-diseño · Código modificado: **NINGUNO** · Producción: READ-ONLY (intacta) · Harness: solo consultas de esquema (59).

## Ejecución

| Ítem de la orden del dueño | Estado | Documento |
|---|---|---|
| Definir fuente de verdad cost_price / cost_average | ✅ con decisión raíz abierta | 60 §2–3 |
| ¿Qué evento crea cada costo / modifica WAC? | ✅ catálogo completo por evento | 61 |
| COGS server-side | ✅ definido (D-03) + paridad movement/item | 61 E-V, INV-06/07 |
| Recepción · producción · venta · devolución · transferencia · ajuste | ✅ definidos con matemática y contra-asientos | 61 |
| Contra-asientos | ✅ diseño D-05(i) compatible con CHECK amount>0 real (hecho 59) | 61 E-D |
| Idempotencia | ✅ registry común + únicos DB + replay contract | 61, 63/64 mapa |
| Cantidades parciales / unidades-conversiones | ✅ acumulación ponderada; unidades base SIEMPRE | 61 |
| Política históricos corruptos | ✅ propuesta H-FINAL sin cosmética ni rebuild falso | 62 |
| Invariantes SQL para el harness | ✅ borrador ejecutable INV-01..14 | 65 |
| Decisión reservada `cost_average` A vs B | ⏸️ presentada con implicaciones completas — NO decidida por el agente | 60 §2 · 62-registro |

## Veredicto del Gate

```
W6 DESIGN ......... PASS (especificación completa y trazada a evidencia)
D-01 RATIFICACIÓN . PENDING (exclusiva del dueño)
BLOQUE D-02..D-12 . PENDING (ratificación en bloque u objeciones)
```

**El Gate queda ABIERTO EN ESPERA DE RATIFICACIÓN.** Ninguna implementación se inicia antes. Cadena posterior ratificada por el dueño: **W7 implementación en harness → W8 migración/backfill histórico con ventanas aprobadas → W9 E2E → concurrencia**, manteniendo producción READ-ONLY hasta demostración íntegra en el Audit Harness.

## Estado global tras W6

FASE 3 CLOSED · WAC-DATAFLOW NOT READY (defectos WAC-DF-01..07 OPEN) · FASE 4/5/11/12 BLOQUEADAS · P3 live-verify pendiente (principals vivos + llave FX controlada), no obstruido por W6.
